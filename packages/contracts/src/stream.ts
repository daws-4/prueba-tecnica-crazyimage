import { z } from 'zod';
import { carrierIdSchema, utcInstantSchema } from './common';

/**
 * Los mensajes del flujo de eventos en vivo (SSE).
 *
 * Decision de diseno importante: **el flujo lleva un aviso, no los datos**.
 *
 * Un mensaje no dice "aqui tienes el evento nuevo", dice "acaba de entrar un
 * lote". El panel reacciona volviendo a pedir el renderizado del servidor, que
 * es el unico sitio que habla con el API. Si el flujo transportara los eventos
 * habria dos caminos distintos para que un dato llegue a la pantalla —el
 * renderizado y el flujo— y dos formas de que se contradigan.
 *
 * Lo que se gana con eso: SSE sustituye al temporizador, no a la capa de datos.
 * Si manana se apaga, el panel sigue funcionando exactamente igual, solo que
 * mas lento en enterarse.
 */

const batchIngestedSchema = z.object({
  kind: z.literal('batch-ingested'),
  batchId: z.string(),
  carrierId: carrierIdSchema,
  at: utcInstantSchema,
  accepted: z.number().int().min(0),
  duplicates: z.number().int().min(0),
  quarantined: z.number().int().min(0),
});

/**
 * Latido periodico.
 *
 * Sin el, una conexion que se ha quedado medio abierta —un proxy que la corto
 * sin avisar— parece viva desde el navegador y el panel se queda mudo para
 * siempre. Con el, la ausencia de latidos es medible y el cliente puede
 * reaccionar.
 */
const heartbeatSchema = z.object({
  kind: z.literal('heartbeat'),
  at: utcInstantSchema,
});

export const ingestionSignalSchema = z.discriminatedUnion('kind', [
  batchIngestedSchema,
  heartbeatSchema,
]);

export type IngestionSignal = z.infer<typeof ingestionSignalSchema>;
export type BatchIngestedSignal = z.infer<typeof batchIngestedSchema>;

/** Cada cuanto late el servidor. El cliente usa este numero para dimensionar su vigilancia. */
export const HEARTBEAT_INTERVAL_MS = 20_000;
