import { z } from 'zod';
import { carrierIdSchema, paginatedSchema } from './common';
import { shipmentStatusSchema } from './status';
import { shipmentSummarySchema } from './shipment';

/**
 * Parametros del listado de envios.
 *
 * `z.coerce` porque esto llega como cadena en la URL: el borde del API es quien
 * convierte, no el controlador a mano.
 */
export const listShipmentsQuerySchema = z.object({
  /** Filtro por estado actual. El mas obvio y el que menos ayuda por si solo. */
  status: shipmentStatusSchema.optional(),

  carrierId: carrierIdSchema.optional(),

  /**
   * **El filtro util para Camila.**
   *
   * "Envios sin novedades desde hace N horas": los que llevan demasiado tiempo
   * quietos y sin haber llegado a `entregado`. Filtrar por estado dice en que
   * punto esta cada envio; esto dice cuales van a generar una llamada. Es la
   * diferencia entre una lista que se consulta y una lista sobre la que se
   * trabaja.
   */
  stalledForHours: z.coerce.number().int().min(1).max(24 * 30).optional(),

  /** Cursor opaco devuelto por la pagina anterior. */
  cursor: z.string().optional(),

  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListShipmentsQuery = z.infer<typeof listShipmentsQuerySchema>;

export const shipmentListResponseSchema = paginatedSchema(shipmentSummarySchema);
export type ShipmentListResponse = z.infer<typeof shipmentListResponseSchema>;
