import { z } from 'zod';
import { carrierIdSchema, locationSchema, trackingNumberSchema, utcInstantSchema } from './common';
import { shipmentStatusSchema } from './status';

/**
 * Resolucion con la que la fuente informo el instante.
 *
 * Andes y TransBolivar llegan al segundo; RutaSur solo al minuto. El dato se
 * conserva porque explica en pantalla por que dos eventos empatan, y porque el
 * dia que se revise la regla de desempate hace falta saber quien traia cuanta
 * precision.
 */
export const timePrecisionSchema = z.enum(['second', 'minute']);
export type TimePrecision = z.infer<typeof timePrecisionSchema>;

/**
 * Un evento normalizado, tal y como lo ve el panel.
 *
 * Regla de oro del encargo: **el tipo de un evento normalizado no depende de
 * quien lo mando**. Aqui no hay ni un campo condicionado al transportista.
 *
 * Lo que NO viaja: el payload `raw`. Se guarda siempre en la base de datos
 * porque es lo unico que permite reprocesar (los transportistas empujan y no
 * hay forma de volver a pedirles nada), pero mandarlo en cada linea de tiempo
 * multiplicaria el tamano de la respuesta para un dato que Camila no mira. Se
 * consulta aparte, por evento.
 */
export const timelineEventSchema = z.object({
  id: z.string(),

  carrierId: carrierIdSchema,
  /** Nombre para mostrar. Viaja como dato: el panel no conoce la lista de transportistas. */
  carrierName: z.string(),

  trackingNumber: trackingNumberSchema,
  status: shipmentStatusSchema,

  /**
   * Instante canonico, **truncado al minuto** y en UTC.
   *
   * Es el campo que ordena, el que se indexa y el que forma parte de la
   * identidad del evento. Se trunca para medir a los tres transportistas con la
   * misma regla: RutaSur no manda segundos, y dejarlo competir con los que si
   * los mandan le hacia perder empates por un artefacto de su granularidad, no
   * porque el evento ocurriera antes.
   */
  occurredAt: utcInstantSchema,

  /**
   * Instante exacto tal y como llego, sin truncar. Informativo.
   * Truncar define la regla de medida; no tira el dato.
   */
  occurredAtExact: utcInstantSchema,

  precision: timePrecisionSchema,

  /** Cuando nos enteramos. Dos relojes por evento, no uno: los lotes llegan tarde y desordenados. */
  receivedAt: utcInstantSchema,

  location: locationSchema.nullable(),

  /**
   * Cuantas veces ha llegado este mismo evento.
   *
   * El cliente pregunto si reenviar eventos "no pasa nada". Pasa, y en vez de
   * tragarselo en silencio se cuenta: sale gratis de la misma escritura que
   * deduplica, y de paso dice como se porta cada transportista.
   */
  timesReceived: z.number().int().min(1),
});

export type TimelineEvent = z.infer<typeof timelineEventSchema>;
