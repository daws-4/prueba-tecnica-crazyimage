import { z } from 'zod';

/**
 * Los cinco estados canonicos de Andina Cargo.
 *
 * Los VALORES estan en espanol a proposito: no son nombres de codigo, son el
 * vocabulario del negocio, el mismo que usa Camila. Traducirlos a ingles para
 * volver a traducirlos en pantalla anadiria una capa de mapeo que no resuelve
 * nada. Los IDENTIFICADORES, en cambio, van en ingles como el resto del codigo.
 *
 * Este conjunto SI es cerrado y SI viaja en el contrato: el panel dibuja cinco
 * estados y solo cinco. Lo que no es cerrado es la lista de transportistas
 * (ver `carrierIdSchema` en `event.ts`).
 */
export const SHIPMENT_STATUSES = [
  'recogido',
  'en_transito',
  'en_reparto',
  'incidencia',
  'entregado',
] as const;

export const shipmentStatusSchema = z.enum(SHIPMENT_STATUSES);

export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>;

/** Etiqueta legible para la pantalla. Vive en el contrato para que API y panel no diverjan. */
export const SHIPMENT_STATUS_LABELS: Readonly<Record<ShipmentStatus, string>> = {
  recogido: 'Recogido',
  en_transito: 'En tránsito',
  en_reparto: 'En reparto',
  incidencia: 'Incidencia',
  entregado: 'Entregado',
};
