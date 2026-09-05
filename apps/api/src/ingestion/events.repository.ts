import { Injectable } from '@nestjs/common';
import { MongoBulkWriteError, type AnyBulkWriteOperation } from 'mongodb';

import type { EventDocument } from '../mongo/documents';
import { MongoService } from '../mongo/mongo.service';
import type { NormalizedEvent } from '../normalization/normalizer';

export interface IncomingEvent {
  readonly event: NormalizedEvent;
  readonly raw: unknown;
}

export interface WriteEventsResult {
  /** Eventos nuevos: no existian. */
  readonly inserted: number;
  /** Reenvios: ya existian con la misma identidad. Se conto la repeticion. */
  readonly duplicates: number;
  /** Cuantos eventos NUEVOS ha ganado cada envio. Solo los nuevos cuentan. */
  readonly insertedByShipment: ReadonlyMap<string, number>;
}

@Injectable()
export class EventsRepository {
  constructor(private readonly mongo: MongoService) {}

  /**
   * Escribe un lote deduplicando e idempotente.
   *
   * Tres cosas que NO se hacen aqui, y el cliente las pidio las tres:
   *
   * - No hay un bucle con una escritura por evento. Cinco mil viajes a la base
   *   de datos por lote es lo que convierte una ingesta en un problema.
   * - No hay una transaccion unica gigante. Un evento malo no puede tumbar los
   *   otros cuatro mil novecientos noventa y nueve.
   * - No se descarta el reenvio en silencio: se cuenta.
   *
   * La deduplicacion y el contador salen de la **misma** escritura: `upsert`
   * inserta si no existe e incrementa si existe. Del resultado salen los
   * numeros del informe sin una consulta mas.
   */
  async write(
    incoming: readonly IncomingEvent[],
    batchId: string,
    chunkSize: number,
  ): Promise<WriteEventsResult> {
    // Primero se deduplica DENTRO del lote. Si un transportista manda el mismo
    // evento dos veces en el mismo envio, dos escrituras concurrentes sobre un
    // documento que aun no existe chocarian contra el indice unico. Agruparlo
    // en memoria es mas barato que gestionar esa colision.
    const byKey = new Map<string, { readonly item: IncomingEvent; count: number }>();
    for (const item of incoming) {
      const existing = byKey.get(item.event.dedupKey);
      if (existing === undefined) {
        byKey.set(item.event.dedupKey, { item, count: 1 });
      } else {
        existing.count += 1;
      }
    }

    const entries = [...byKey.values()];
    let inserted = 0;
    let duplicates = incoming.length - entries.length; // los repetidos dentro del propio lote
    const insertedByShipment = new Map<string, number>();

    for (let offset = 0; offset < entries.length; offset += chunkSize) {
      const chunk = entries.slice(offset, offset + chunkSize);
      const operations = chunk.map(({ item, count }) => this.upsertOperation(item, count, batchId));

      const { upsertedIndexes, modified, conflicts } = await this.runChunk(operations);

      inserted += upsertedIndexes.length;
      duplicates += modified + conflicts;

      for (const index of upsertedIndexes) {
        const entry = chunk[index];
        if (entry === undefined) continue;
        const guia = entry.item.event.trackingNumber;
        insertedByShipment.set(guia, (insertedByShipment.get(guia) ?? 0) + 1);
      }
    }

    return { inserted, duplicates, insertedByShipment };
  }

  private upsertOperation(
    { event, raw }: IncomingEvent,
    timesInThisBatch: number,
    batchId: string,
  ): AnyBulkWriteOperation<EventDocument> {
    return {
      updateOne: {
        // El filtro lleva los dos campos del indice unico para poder usarlo:
        // `dedupKey` a secas no es prefijo del indice y forzaria un recorrido.
        filter: { trackingNumber: event.trackingNumber, dedupKey: event.dedupKey },
        update: {
          $setOnInsert: {
            carrierId: event.carrierId,
            status: event.status,
            occurredAt: event.occurredAt,
            occurredAtExact: event.occurredAtExact,
            precision: event.precision,
            sourceOffsetMinutes: event.sourceOffsetMinutes,
            receivedAt: event.receivedAt,
            city: event.city,
            country: event.country,
            raw,
            batchId,
          },
          $inc: { timesReceived: timesInThisBatch },
          $set: { lastReceivedAt: event.receivedAt },
        },
        upsert: true,
      },
    };
  }

  private async runChunk(
    operations: readonly AnyBulkWriteOperation<EventDocument>[],
  ): Promise<{ upsertedIndexes: number[]; modified: number; conflicts: number }> {
    try {
      // `ordered: false` es la pieza clave: sigue con el resto aunque una
      // operacion falle, y devuelve los fallos uno a uno con su indice.
      const result = await this.mongo.events.bulkWrite([...operations], { ordered: false });
      return {
        upsertedIndexes: Object.keys(result.upsertedIds).map(Number),
        modified: result.modifiedCount,
        conflicts: 0,
      };
    } catch (error) {
      if (!(error instanceof MongoBulkWriteError)) throw error;

      // Carrera conocida: dos lotes con el mismo evento entrando a la vez, los
      // dos ven que no existe y los dos intentan insertarlo. El indice unico
      // deja pasar a uno y el otro recibe 11000. Eso no es un fallo: es la
      // deduplicacion haciendo su trabajo, y el evento se cuenta como reenvio.
      const writeErrors = Array.isArray(error.writeErrors) ? error.writeErrors : [error.writeErrors];
      const unexpected = writeErrors.filter((e) => e !== undefined && e.code !== 11000);
      if (unexpected.length > 0) throw error;

      const result = error.result;
      return {
        upsertedIndexes: Object.keys(result.upsertedIds).map(Number),
        modified: result.modifiedCount,
        conflicts: writeErrors.length,
      };
    }
  }
}
