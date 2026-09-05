import type { QuarantineReason, ShipmentStatus, TimePrecision } from '@andina/contracts';
import type { CarrierAdapter } from '../carriers/carrier.types';
import type { CarrierVocabulary } from '../carriers/vocabulary';
import { buildDedupKey } from './dedup-key';
import { resolveInstant } from './instant';

/**
 * Un evento normalizado, listo para guardar.
 *
 * Regla de oro del encargo: **el tipo de un evento normalizado no depende de
 * quien lo mando**. Aqui no hay ni un campo condicionado al transportista;
 * `carrierId` es un dato del evento, no una variante del tipo.
 */
export interface NormalizedEvent {
  readonly carrierId: string;
  readonly trackingNumber: string;
  readonly status: ShipmentStatus;
  readonly occurredAt: Date;
  readonly occurredAtExact: Date;
  readonly precision: TimePrecision;
  readonly sourceOffsetMinutes: number | null;
  readonly receivedAt: Date;
  readonly city: string | null;
  readonly country: string | null;
  readonly dedupKey: string;
}

export type NormalizationResult =
  | { readonly ok: true; readonly event: NormalizedEvent }
  | { readonly ok: false; readonly reason: QuarantineReason; readonly detail: string };

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * Umbrales de cordura: hasta donde es creible una fecha.
 *
 * **Futuro, apretado.** Un evento no puede haber ocurrido despues de que nos lo
 * cuenten; los minutos de margen son para relojes desincronizados y latencia
 * del lote. El umbral es corto a proposito porque el dano es el peor de todos:
 * un evento fechado en el futuro deja el estado del envio clavado para siempre,
 * ya que ningun evento posterior podra superarlo nunca. El paquete se entrega y
 * la pantalla sigue diciendo lo que dijo el evento roto.
 *
 * **Pasado, generoso.** Un evento viejo no secuestra el estado actual, solo
 * ensucia la linea de tiempo. Noventa dias cubren de sobra un envio atascado en
 * aduana o un transportista reenviando su atraso, y aun asi atrapan el fallo
 * del ano (el epoch de TransBolivar del enunciado esta a 365 dias).
 *
 * Se miden contra el `receivedAt` **del lote**, no contra el reloj de ahora: si
 * algun dia se reprocesa un lote de hace seis meses, medirlo contra hoy lo
 * mandaria entero a cuarentena.
 */
export const isWithinSanityBounds = (
  occurredAt: Date,
  receivedAt: Date,
  vocabulary: Pick<CarrierVocabulary, 'futureToleranceMinutes' | 'pastToleranceDays'>,
): boolean => {
  const delta = occurredAt.getTime() - receivedAt.getTime();
  if (delta > vocabulary.futureToleranceMinutes * MINUTE_MS) return false;
  if (-delta > vocabulary.pastToleranceDays * DAY_MS) return false;
  return true;
};

/**
 * Convierte un evento crudo de un transportista en un evento canonico.
 *
 * Reparto de responsabilidades, y es lo que hace barato el cuarto transportista:
 * el ADAPTADOR sabe donde estan los campos y que forma tiene la fecha; el
 * NORMALIZADOR —este fichero, comun a todos— sabe las reglas: como se traduce un
 * estado, que huso se asume, que fecha es creible y como se calcula la
 * identidad. Un transportista nuevo trae adaptador y vocabulario; estas reglas
 * no se tocan.
 *
 * Nunca lanza. Un evento imposible dentro de un lote de cinco mil devuelve su
 * motivo y deja pasar a los demas.
 */
export const normalizeEvent = (input: {
  readonly adapter: CarrierAdapter;
  readonly vocabulary: CarrierVocabulary;
  readonly payload: unknown;
  readonly receivedAt: Date;
}): NormalizationResult => {
  const { adapter, vocabulary, payload, receivedAt } = input;

  const extracted = adapter.extract(payload);
  if (!extracted.ok) {
    return { ok: false, reason: extracted.reason, detail: extracted.detail };
  }

  const resolved = resolveInstant(extracted.event.instant, vocabulary.utcOffsetMinutes);
  if (!resolved.ok) {
    return { ok: false, reason: 'invalid_date', detail: resolved.detail };
  }

  if (!isWithinSanityBounds(resolved.instant.occurredAt, receivedAt, vocabulary)) {
    return {
      ok: false,
      reason: 'date_out_of_bounds',
      detail: `${resolved.instant.occurredAt.toISOString()} no es creible frente a un lote recibido el ${receivedAt.toISOString()}`,
    };
  }

  // `noUncheckedIndexedAccess` obliga a mirar este caso, que es justo el que
  // importa: un estado que el vocabulario no conoce NO se adivina. Va a
  // cuarentena con su motivo, que es el aviso que necesita atencion al cliente
  // para anadir la traduccion y reprocesar. Ignorar un campo extra y no saber
  // leer un valor conocido no son lo mismo.
  const status = vocabulary.statusMap[extracted.event.rawStatus];
  if (status === undefined) {
    return {
      ok: false,
      reason: 'unknown_status',
      detail: `"${extracted.event.rawStatus}" no esta en el vocabulario de ${vocabulary.carrierId}`,
    };
  }

  return {
    ok: true,
    event: {
      carrierId: adapter.carrierId,
      trackingNumber: extracted.event.trackingNumber,
      status,
      occurredAt: resolved.instant.occurredAt,
      occurredAtExact: resolved.instant.occurredAtExact,
      precision: resolved.instant.precision,
      sourceOffsetMinutes: resolved.instant.sourceOffsetMinutes,
      receivedAt,
      city: extracted.event.city,
      country: extracted.event.country,
      dedupKey: buildDedupKey({
        carrierId: adapter.carrierId,
        trackingNumber: extracted.event.trackingNumber,
        occurredAt: resolved.instant.occurredAt,
        status,
      }),
    },
  };
};
