import type { Filter } from 'mongodb';
import type { ShipmentDocument } from '../mongo/documents';

/**
 * Que evento manda cuando dos compiten por decidir el estado de un envio.
 *
 * El cliente lo describio asi: *"el estado actual lo guardan en un campo y lo
 * actualizan cada vez que llega un evento nuevo"*. Eso es justo lo que produce
 * respuestas equivocadas, porque **el ultimo en llegar no es el mas reciente**:
 * los lotes llegan tarde y desordenados, y un evento de esta manana puede
 * entrar despues de uno de esta tarde.
 *
 * El orden, de mayor a menor peso:
 *
 * 1. `occurredAt` — cuando ocurrio de verdad. Es el criterio real.
 * 2. `receivedAt` — a igualdad de instante, gana el que llego despues. Truncar
 *    al minuto hace que los empates existan de verdad (RutaSur no manda
 *    segundos), asi que hace falta una regla y no el azar. A falta de mejor
 *    informacion, el reporte mas reciente es el conocimiento mas actual.
 * 3. `dedupKey` — desempate final, alfabetico. No tiene significado de negocio:
 *    esta para que el resultado sea **reproducible**. Dos eventos del mismo
 *    lote comparten `receivedAt`, y sin este tercer criterio el estado
 *    dependeria del orden en que Mongo devolviera los documentos.
 */
export interface Rankable {
  readonly occurredAt: Date;
  readonly receivedAt: Date;
  readonly dedupKey: string;
}

/** `true` si `candidate` debe sustituir a `current`. */
export const beats = (candidate: Rankable, current: Rankable): boolean => {
  const byOccurred = candidate.occurredAt.getTime() - current.occurredAt.getTime();
  if (byOccurred !== 0) return byOccurred > 0;

  const byReceived = candidate.receivedAt.getTime() - current.receivedAt.getTime();
  if (byReceived !== 0) return byReceived > 0;

  return candidate.dedupKey > current.dedupKey;
};

/**
 * La misma regla, escrita como filtro de Mongo.
 *
 * Es la traduccion literal de `beats` y las dos tienen que cambiar juntas. Se
 * escribe como filtro para que la actualizacion del envio sea una **comparacion
 * y escritura atomica sobre un solo documento**: dos lotes que entren a la vez
 * no pueden hacer que el estado retroceda, y no hace falta ninguna transaccion.
 */
export const beatsFilter = (candidate: Rankable): Filter<ShipmentDocument> => ({
  $or: [
    { lastEventAt: { $lt: candidate.occurredAt } },
    {
      lastEventAt: candidate.occurredAt,
      lastEventReceivedAt: { $lt: candidate.receivedAt },
    },
    {
      lastEventAt: candidate.occurredAt,
      lastEventReceivedAt: candidate.receivedAt,
      lastEventDedupKey: { $lt: candidate.dedupKey },
    },
  ],
});
