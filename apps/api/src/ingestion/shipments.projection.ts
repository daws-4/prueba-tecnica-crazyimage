import { Injectable } from '@nestjs/common';
import type { AnyBulkWriteOperation } from 'mongodb';

import type { ShipmentDocument } from '../mongo/documents';
import { MongoService } from '../mongo/mongo.service';
import type { NormalizedEvent } from '../normalization/normalizer';
import { beats, beatsFilter } from './event-order';

@Injectable()
export class ShipmentsProjection {
  constructor(private readonly mongo: MongoService) {}

  /**
   * Actualiza la proyeccion de envios con los eventos de un lote.
   *
   * Es la respuesta a la trampa de la frase 05. El estado actual **no** se
   * sobreescribe con el ultimo evento que entra: se compara y solo gana el que
   * de verdad es posterior. Un lote atrasado que llega esta tarde con eventos
   * de esta manana no puede hacer retroceder un envio ya entregado.
   *
   * Se hace en dos escrituras por lote, no dos por evento:
   *
   * 1. Asegurar que el envio existe, sumar los transportistas que lo reportan y
   *    contar los eventos nuevos.
   * 2. Mover el estado actual, **solo si** el candidato gana.
   *
   * Van separadas porque en un `bulkWrite` sin orden las operaciones sobre un
   * mismo documento no tienen orden garantizado, y la segunda necesita que la
   * primera haya ocurrido. Cada una por su lado es un viaje; dos viajes por
   * lote es gratis.
   */
  async apply(
    events: readonly NormalizedEvent[],
    insertedByShipment: ReadonlyMap<string, number>,
    batchReceivedAt: Date,
  ): Promise<void> {
    if (events.length === 0) return;

    // Un solo candidato por envio: el que gana dentro de este lote. Enviar los
    // cinco mil a la base de datos para que decida seria pagar cinco mil
    // escrituras por una comparacion que aqui cuesta un recorrido.
    const winners = new Map<string, NormalizedEvent>();
    for (const event of events) {
      const current = winners.get(event.trackingNumber);
      if (current === undefined || beats(event, current)) {
        winners.set(event.trackingNumber, event);
      }
    }

    const carriersByShipment = new Map<string, Set<string>>();
    for (const event of events) {
      const set = carriersByShipment.get(event.trackingNumber) ?? new Set<string>();
      set.add(event.carrierId);
      carriersByShipment.set(event.trackingNumber, set);
    }

    await this.ensureShipments(winners, carriersByShipment, insertedByShipment, batchReceivedAt);
    await this.moveCurrentStatus(winners);
  }

  /**
   * Crea el envio si no existe y acumula lo que es aditivo.
   *
   * En la creacion se escribe tambien el estado, para que no exista ni un
   * instante en el que un envio este en la coleccion sin saber en que punto
   * esta. Si el envio ya existia, esta escritura no toca el estado: de eso se
   * encarga la siguiente, que sabe comparar.
   */
  private async ensureShipments(
    winners: ReadonlyMap<string, NormalizedEvent>,
    carriersByShipment: ReadonlyMap<string, ReadonlySet<string>>,
    insertedByShipment: ReadonlyMap<string, number>,
    batchReceivedAt: Date,
  ): Promise<void> {
    const operations: AnyBulkWriteOperation<ShipmentDocument>[] = [];

    for (const [trackingNumber, winner] of winners) {
      const carriers = [...(carriersByShipment.get(trackingNumber) ?? new Set<string>())];
      // Solo suman los eventos NUEVOS: reenviar el mismo lote no infla la
      // cuenta. Es la idempotencia llegando hasta el ultimo numero visible.
      const newEvents = insertedByShipment.get(trackingNumber) ?? 0;

      operations.push({
        updateOne: {
          filter: { _id: trackingNumber },
          update: {
            $setOnInsert: {
              firstSeenAt: batchReceivedAt,
              currentStatus: winner.status,
              lastEventAt: winner.occurredAt,
              lastEventReceivedAt: winner.receivedAt,
              lastEventDedupKey: winner.dedupKey,
              lastCity: winner.city,
              lastCountry: winner.country,
            },
            $addToSet: { carrierIds: { $each: carriers } },
            $inc: { eventCount: newEvents },
          },
          upsert: true,
        },
      });
    }

    if (operations.length > 0) {
      await this.mongo.shipments.bulkWrite(operations, { ordered: false });
    }
  }

  /**
   * Mueve el estado actual solo si el candidato gana.
   *
   * El filtro lleva la condicion, asi que la comparacion y la escritura son una
   * sola operacion atomica sobre un documento. Dos lotes concurrentes no pueden
   * dejar el envio en un estado intermedio ni hacerlo retroceder, y no hace
   * falta ninguna transaccion. Esa es, en concreto, la razon por la que este
   * sistema no necesita dos motores de base de datos.
   */
  private async moveCurrentStatus(winners: ReadonlyMap<string, NormalizedEvent>): Promise<void> {
    const operations: AnyBulkWriteOperation<ShipmentDocument>[] = [];

    for (const [trackingNumber, winner] of winners) {
      operations.push({
        updateOne: {
          filter: { _id: trackingNumber, ...beatsFilter(winner) },
          update: {
            $set: {
              currentStatus: winner.status,
              lastEventAt: winner.occurredAt,
              lastEventReceivedAt: winner.receivedAt,
              lastEventDedupKey: winner.dedupKey,
              lastCity: winner.city,
              lastCountry: winner.country,
            },
          },
          // Sin `upsert`: si el filtro no encuentra nada es porque el envio ya
          // tiene un evento mejor, y eso es exactamente lo que se busca.
        },
      });
    }

    if (operations.length > 0) {
      await this.mongo.shipments.bulkWrite(operations, { ordered: false });
    }
  }
}
