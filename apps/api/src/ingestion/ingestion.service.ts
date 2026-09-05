import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import type { BatchIngestReport, QuarantineReason } from '@andina/contracts';

import { findAdapter } from '../carriers/carrier.registry';
import { DEFAULT_VOCABULARIES, type CarrierVocabulary } from '../carriers/vocabulary';
import { ENV, type Env } from '../config/env';
import type { QuarantineDocument } from '../mongo/documents';
import { MongoService } from '../mongo/mongo.service';
import { normalizeEvent } from '../normalization/normalizer';
import { EventsRepository, type IncomingEvent } from './events.repository';
import { IngestionEvents } from './ingestion-events.service';
import { ShipmentsProjection } from './shipments.projection';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly mongo: MongoService,
    private readonly events: EventsRepository,
    private readonly projection: ShipmentsProjection,
    private readonly signals: IngestionEvents,
  ) {}

  /**
   * Procesa un lote de un transportista y devuelve el informe.
   *
   * La respuesta es sincrona a proposito: a los transportistas no se les puede
   * pedir nada, no hay pull ni forma de provocar un reintento, asi que **el
   * unico momento garantizado en que vamos a tener su atencion es mientras nos
   * estan hablando**. Un 202 aplazaria el desglose de descartes a un endpoint
   * de estado que estos tres no van a consultar.
   *
   * Es seguro porque la identidad del evento ya esta resuelta: si su cliente
   * corta por tiempo de espera y reenvia el lote entero, el reenvio no duplica
   * nada. Las dos decisiones se sostienen la una a la otra.
   */
  async ingest(carrierId: string, rawEvents: readonly unknown[]): Promise<BatchIngestReport> {
    const adapter = findAdapter(carrierId);
    if (adapter === undefined) {
      // 404 y no 400: la peticion esta bien formada, lo que no existe es el
      // transportista. Es la respuesta que necesita el cuarto transportista en
      // enero si intenta mandar antes de que su adaptador este desplegado.
      throw new NotFoundException(`No hay adaptador para el transportista "${carrierId}"`);
    }

    if (rawEvents.length > this.env.MAX_BATCH_SIZE) {
      // El tiempo de respuesta se acota por diseno, no por confianza.
      throw new PayloadTooLargeException(
        `El lote trae ${rawEvents.length} eventos y el maximo es ${this.env.MAX_BATCH_SIZE}`,
      );
    }

    const vocabulary = this.vocabularyFor(carrierId);
    const receivedAt = new Date();
    const batchId = randomUUID();

    const accepted: IncomingEvent[] = [];
    const quarantined: QuarantineDocument[] = [];
    const quarantinedByReason: Partial<Record<QuarantineReason, number>> = {};

    for (const raw of rawEvents) {
      const result = normalizeEvent({ adapter, vocabulary, payload: raw, receivedAt });
      if (result.ok) {
        accepted.push({ event: result.event, raw });
        continue;
      }
      quarantined.push({
        batchId,
        carrierId,
        receivedAt,
        reason: result.reason,
        detail: result.detail,
        raw,
      });
      quarantinedByReason[result.reason] = (quarantinedByReason[result.reason] ?? 0) + 1;
    }

    // La cuarentena se escribe SIEMPRE, y antes que nada. Un evento que no se
    // entiende no se pierde: queda con su payload intacto y su motivo, listo
    // para reprocesarse en cuanto la causa este corregida.
    if (quarantined.length > 0) {
      await this.mongo.quarantine.insertMany(quarantined, { ordered: false });
    }

    const written = await this.events.write(accepted, batchId, this.env.WRITE_CHUNK_SIZE);

    await this.projection.apply(
      accepted.map((item) => item.event),
      written.insertedByShipment,
      receivedAt,
    );

    const report: BatchIngestReport = {
      batchId,
      carrierId,
      receivedAt: receivedAt.toISOString(),
      received: rawEvents.length,
      accepted: written.inserted,
      duplicates: written.duplicates,
      quarantined: quarantined.length,
      quarantinedByReason,
    };

    this.logger.log(
      `Lote ${batchId} de ${carrierId}: ${report.received} recibidos, ${report.accepted} nuevos, ` +
        `${report.duplicates} reenvios, ${report.quarantined} en cuarentena`,
    );

    // Se avisa DESPUES de que todo este escrito y consultable. Al reves, un
    // panel podria pedir los datos antes de que existan y quedarse ensenando lo
    // de antes hasta el siguiente aviso.
    this.signals.publish({
      kind: 'batch-ingested',
      batchId,
      carrierId,
      at: receivedAt.toISOString(),
      accepted: report.accepted,
      duplicates: report.duplicates,
      quarantined: report.quarantined,
    });

    return report;
  }

  /**
   * Vocabulario del transportista.
   *
   * Hoy sale de la semilla en codigo. El sitio donde vive es una decision
   * cerrada —una tabla editable desde el panel, sin despliegue— y esta funcion
   * es el unico punto que habria que cambiar para leerlo de ahi: nada mas en el
   * sistema sabe de donde viene.
   */
  private vocabularyFor(carrierId: string): CarrierVocabulary {
    const found = DEFAULT_VOCABULARIES.find((v) => v.carrierId === carrierId);
    if (found === undefined) {
      throw new NotFoundException(`No hay vocabulario configurado para "${carrierId}"`);
    }
    return found;
  }
}
