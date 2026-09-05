import { z } from 'zod';
import { carrierIdSchema, utcInstantSchema } from './common';

/**
 * Por que un evento no llego a entrar.
 *
 * Conjunto cerrado y a proposito: "se descartaron 34" no sirve de nada, "se
 * descartaron 34 y 31 fueron por estado desconocido" dice exactamente que
 * traduccion falta anadir. Cada motivo tiene una accion distinta detras.
 *
 * Ninguno de estos significa "se perdio": el payload en crudo queda guardado
 * siempre, en cuarentena, y se reprocesa cuando la causa esta corregida.
 */
export const QUARANTINE_REASONS = [
  /** El payload no es ni siquiera interpretable como evento de este transportista. */
  'unparseable_payload',
  /** Falta un campo obligatorio: guia, estado o fecha. */
  'missing_required_field',
  /** Campo conocido con un valor que no sabemos traducir (estado nuevo del transportista). */
  'unknown_status',
  /** La fecha no encaja con el formato declarado del transportista. */
  'invalid_date',
  /** La fecha encaja pero no es creible: futuro, o demasiado atras (ver umbrales de cordura). */
  'date_out_of_bounds',
] as const;

export const quarantineReasonSchema = z.enum(QUARANTINE_REASONS);
export type QuarantineReason = z.infer<typeof quarantineReasonSchema>;

export const QUARANTINE_REASON_LABELS: Readonly<Record<QuarantineReason, string>> = {
  unparseable_payload: 'Payload no interpretable',
  missing_required_field: 'Falta un campo obligatorio',
  unknown_status: 'Estado desconocido',
  invalid_date: 'Fecha con formato invalido',
  date_out_of_bounds: 'Fecha fuera de los limites creibles',
};

/**
 * Lo que devuelve la ingesta de un lote.
 *
 * Nota de alcance: el CUERPO de la peticion de ingesta no vive en este paquete.
 * Este contrato es el que comparten el panel y el API; el payload que manda un
 * transportista es otro contrato distinto, propio de cada uno, y lo valida su
 * adaptador. Mezclarlos obligaria al panel a conocer los formatos de entrada,
 * que es justo lo que este proyecto existe para ocultar.
 */
export const batchIngestReportSchema = z.object({
  batchId: z.string(),
  carrierId: carrierIdSchema,
  receivedAt: utcInstantSchema,

  /** Cuantos eventos traia el lote. */
  received: z.number().int().min(0),
  /** Nuevos: no existian. */
  accepted: z.number().int().min(0),
  /** Ya existian con la misma identidad: se conto el reenvio, no se duplico. */
  duplicates: z.number().int().min(0),
  /** No interpretables: guardados en crudo, fuera de la linea de tiempo. */
  quarantined: z.number().int().min(0),

  /** Desglose del `quarantined` por causa. Solo aparecen los motivos con al menos uno. */
  quarantinedByReason: z.partialRecord(quarantineReasonSchema, z.number().int().min(1)),
});

export type BatchIngestReport = z.infer<typeof batchIngestReportSchema>;
