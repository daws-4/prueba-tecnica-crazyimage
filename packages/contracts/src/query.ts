import { z } from 'zod';
import { carrierIdSchema, paginatedSchema } from './common';
import { shipmentStatusSchema } from './status';
import { shipmentSummarySchema } from './shipment';

/**
 * Tamanos de pagina que ofrece el panel.
 *
 * Viven en el contrato y no en el panel porque son parte de lo que las dos
 * capas acuerdan: el panel dibuja estas tres opciones y el API las acepta.
 * El limite del esquema sigue siendo mas amplio (1..100) a proposito, porque un
 * transportista o un script que consulte el API directamente no tiene por que
 * ceñirse a las tres opciones que resultan comodas en una pantalla.
 */
export const SHIPMENT_PAGE_SIZES = [10, 20, 50] as const;

export type ShipmentPageSize = (typeof SHIPMENT_PAGE_SIZES)[number];

/** El que se usa si nadie pide otro. Tiene que ser uno de los de arriba, o el
 * selector de la pantalla aparecería sin ninguna opción marcada. */
export const DEFAULT_PAGE_SIZE: ShipmentPageSize = 20;

export const isShipmentPageSize = (valor: number): valor is ShipmentPageSize =>
  (SHIPMENT_PAGE_SIZES as readonly number[]).includes(valor);

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

  /**
   * Cursores opacos, uno por sentido. Se usan de uno en uno.
   *
   * Se llaman `after` y `before` y no `cursor` a secas porque la paginacion es
   * bidireccional: un solo nombre obligaria a adivinar hacia donde apunta.
   */
  after: z.string().optional(),
  before: z.string().optional(),

  limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
});

export type ListShipmentsQuery = z.infer<typeof listShipmentsQuerySchema>;

export const shipmentListResponseSchema = paginatedSchema(shipmentSummarySchema);
export type ShipmentListResponse = z.infer<typeof shipmentListResponseSchema>;
