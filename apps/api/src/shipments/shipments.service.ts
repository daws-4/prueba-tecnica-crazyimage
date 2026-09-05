import { Injectable, NotFoundException } from '@nestjs/common';
import type { Filter } from 'mongodb';
import type {
  ListShipmentsQuery,
  ShipmentDetail,
  ShipmentListResponse,
  ShipmentSummary,
  TimelineEvent,
} from '@andina/contracts';

import { DEFAULT_VOCABULARIES } from '../carriers/vocabulary';
import type { EventDocument, ShipmentDocument } from '../mongo/documents';
import { MongoService } from '../mongo/mongo.service';
import { decodeCursor, encodeCursor } from './cursor';

/** Nombre para mostrar de cada transportista. El panel no conoce la lista: la recibe como dato. */
const DISPLAY_NAMES = new Map(DEFAULT_VOCABULARIES.map((v) => [v.carrierId, v.displayName]));

const HOUR_MS = 3_600_000;

@Injectable()
export class ShipmentsService {
  constructor(private readonly mongo: MongoService) {}

  /**
   * Un envio con su historia completa. La frase 01 del cliente, entera.
   *
   * El estado actual **no** se recalcula aqui recorriendo los eventos: se lee
   * de la proyeccion, que ya lo tiene resuelto. Y se devuelve ademas cual es el
   * evento que lo decide, para que la pantalla pueda senalarlo: sin eso, un
   * evento que llego el ultimo pero ocurrio antes parece un fallo de la
   * aplicacion en vez de la decision deliberada que es.
   */
  async findByTrackingNumber(trackingNumber: string): Promise<ShipmentDetail> {
    const shipment = await this.mongo.shipments.findOne({ _id: trackingNumber });
    if (shipment === null) {
      throw new NotFoundException(`No hay ningun envio con la guia "${trackingNumber}"`);
    }

    // Ordenado por instante y, en los empates, por el mismo criterio que decide
    // el estado actual: primero el que llego antes. Truncar al minuto hace que
    // los empates existan de verdad, asi que el orden tiene que ser explicito o
    // la pantalla cambiaria de un refresco a otro.
    const events = await this.mongo.events
      .find({ trackingNumber })
      .sort({ occurredAt: 1, receivedAt: 1, dedupKey: 1 })
      .toArray();

    return {
      ...this.toSummary(shipment),
      timeline: events.map((event) => this.toTimelineEvent(event)),
      currentStatusEventId: shipment.lastEventDedupKey,
    };
  }

  /**
   * Listado paginado con los filtros que necesita atencion al cliente.
   *
   * El filtro por estado es el evidente. El que de verdad cambia el dia de
   * Camila es `stalledForHours`: los envios que llevan demasiado tiempo quietos
   * y sin llegar a entregado. Filtrar por estado dice en que punto esta cada
   * envio; esto dice **cuales van a generar una llamada**. Es la diferencia
   * entre una lista que se consulta y una lista sobre la que se trabaja.
   */
  async list(query: ListShipmentsQuery): Promise<ShipmentListResponse> {
    const filter = this.buildFilter(query);

    // Se pide uno de mas para saber si hay pagina siguiente sin contar el total,
    // que en una coleccion grande es una consulta cara y que nadie mira.
    const documents = await this.mongo.shipments
      .find(filter)
      .sort({ lastEventAt: -1, _id: -1 })
      .limit(query.limit + 1)
      .toArray();

    const hasMore = documents.length > query.limit;
    const page = hasMore ? documents.slice(0, query.limit) : documents;
    const last = page.at(-1);

    return {
      items: page.map((doc) => this.toSummary(doc)),
      nextCursor:
        hasMore && last !== undefined
          ? encodeCursor({ lastEventAt: last.lastEventAt, trackingNumber: last._id })
          : null,
    };
  }

  private buildFilter(query: ListShipmentsQuery): Filter<ShipmentDocument> {
    const conditions: Filter<ShipmentDocument>[] = [];

    if (query.status !== undefined) {
      conditions.push({ currentStatus: query.status });
    }

    if (query.carrierId !== undefined) {
      conditions.push({ carrierIds: query.carrierId });
    }

    if (query.stalledForHours !== undefined) {
      const threshold = new Date(Date.now() - query.stalledForHours * HOUR_MS);
      // Un envio entregado no esta parado: esta terminado. Sin esta condicion,
      // la lista se llenaria de envios cerrados hace semanas y seria inutil.
      conditions.push({ lastEventAt: { $lt: threshold }, currentStatus: { $ne: 'entregado' } });
    }

    const cursor = decodeCursor(query.cursor);
    if (cursor !== null) {
      // El desempate por `_id` es lo que evita que un envio se repita o se
      // salte cuando varios comparten el mismo `lastEventAt`.
      conditions.push({
        $or: [
          { lastEventAt: { $lt: cursor.lastEventAt } },
          { lastEventAt: cursor.lastEventAt, _id: { $lt: cursor.trackingNumber } },
        ],
      });
    }

    return conditions.length === 0 ? {} : { $and: conditions };
  }

  private toSummary(doc: ShipmentDocument): ShipmentSummary {
    return {
      trackingNumber: doc._id,
      currentStatus: doc.currentStatus,
      lastEventAt: doc.lastEventAt.toISOString(),
      lastLocation: doc.lastCity === null ? null : { city: doc.lastCity, country: doc.lastCountry },
      carrierIds: doc.carrierIds,
      eventCount: doc.eventCount,
    };
  }

  private toTimelineEvent(doc: EventDocument): TimelineEvent {
    return {
      // La clave de deduplicacion hace de identificador publico: es estable,
      // legible y ya identifica al evento de forma unica. Inventar otro seria
      // tener dos identidades para la misma cosa.
      id: doc.dedupKey,
      carrierId: doc.carrierId,
      carrierName: DISPLAY_NAMES.get(doc.carrierId) ?? doc.carrierId,
      trackingNumber: doc.trackingNumber,
      status: doc.status,
      occurredAt: doc.occurredAt.toISOString(),
      occurredAtExact: doc.occurredAtExact.toISOString(),
      precision: doc.precision,
      receivedAt: doc.receivedAt.toISOString(),
      location: doc.city === null ? null : { city: doc.city, country: doc.country },
      timesReceived: doc.timesReceived,
      // El payload crudo NO viaja: se guarda siempre, pero mandarlo en cada
      // linea de tiempo multiplicaria la respuesta por un dato que nadie mira
      // en esta pantalla.
    };
  }
}
