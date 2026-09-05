import { z } from 'zod';
import { carrierIdSchema, locationSchema, trackingNumberSchema, utcInstantSchema } from './common';
import { timelineEventSchema } from './event';
import { shipmentStatusSchema } from './status';

/**
 * Un envio, en la forma que necesita el LISTADO.
 *
 * `currentStatus` es un valor **derivado**, no un campo que se sobreescriba con
 * cada evento que entra. El cliente lo describio como "lo actualizan cada vez
 * que llega un evento nuevo" y eso es justo lo que produce respuestas
 * equivocadas: los lotes llegan tarde y desordenados, asi que el ultimo en
 * llegar no es el mas reciente. El estado sale del evento con mayor
 * `occurredAt`; a igualdad de instante, del que llego despues.
 */
export const shipmentSummarySchema = z.object({
  trackingNumber: trackingNumberSchema,

  currentStatus: shipmentStatusSchema,

  /** `occurredAt` del evento que decide el estado actual. No es "cuando lo guardamos". */
  lastEventAt: utcInstantSchema,

  lastLocation: locationSchema.nullable(),

  /** Todos los transportistas que han reportado este envio. Puede ser mas de uno. */
  carrierIds: z.array(carrierIdSchema),

  eventCount: z.number().int().min(0),
});

export type ShipmentSummary = z.infer<typeof shipmentSummarySchema>;

/**
 * Un envio con su historia completa: lo que pide la frase 01 del cliente,
 * "buscar por numero de guia y ver toda la historia en una sola pantalla".
 */
export const shipmentDetailSchema = shipmentSummarySchema.extend({
  /** Ordenada por `occurredAt`; a igualdad de instante, primero el que llego antes. */
  timeline: z.array(timelineEventSchema),

  /**
   * Identificador del evento del que sale `currentStatus`.
   *
   * Existe para que la pantalla pueda senalarlo: sin esto, un evento que llego
   * el ultimo pero ocurrio antes parece un error de la aplicacion en vez de la
   * decision deliberada que es.
   */
  currentStatusEventId: z.string(),
});

export type ShipmentDetail = z.infer<typeof shipmentDetailSchema>;
