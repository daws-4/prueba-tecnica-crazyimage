import type { TimePrecision } from '@andina/contracts';
import type { RawInstant } from '../carriers/carrier.types';

/** Un minuto en milisegundos. La unidad canonica de tiempo de este sistema. */
const MINUTE_MS = 60_000;

export interface ResolvedInstant {
  /**
   * El instante canonico: UTC y **truncado al minuto**.
   *
   * Es el que ordena, el que se indexa y el que forma parte de la identidad del
   * evento. Se trunca para medir a los tres transportistas con la misma regla:
   * RutaSur no manda segundos, y dejarlo competir contra los que si los mandan
   * le hacia perder empates por un artefacto de su granularidad, no porque el
   * evento hubiera ocurrido antes.
   *
   * Truncar no hace desaparecer los empates: los hace **explicitos**, para que
   * los resuelva una regla escrita en vez del azar. La regla esta en la
   * proyeccion del envio: a igualdad de instante, gana el que llego despues.
   */
  readonly occurredAt: Date;

  /** El instante exacto tal y como llego. Informativo: truncar define la regla de medida, no tira el dato. */
  readonly occurredAtExact: Date;

  readonly precision: TimePrecision;

  /**
   * El desfase que se uso para convertir, en minutos, o `null` si la fuente ya
   * venia en UTC.
   *
   * Se guarda con cada evento a proposito. La asuncion sobre el huso de RutaSur
   * esta apoyada en una sola muestra; el dia que resulte estar mal, esto es lo
   * que permite que la migracion ataque solo a los eventos afectados en vez de
   * adivinar cuales se calcularon con que regla.
   */
  readonly sourceOffsetMinutes: number | null;
}

export type InstantResult =
  | { readonly ok: true; readonly instant: ResolvedInstant }
  | { readonly ok: false; readonly detail: string };

const truncateToMinute = (ms: number): Date => new Date(Math.floor(ms / MINUTE_MS) * MINUTE_MS);

const build = (exactMs: number, precision: TimePrecision, sourceOffsetMinutes: number | null): InstantResult => ({
  ok: true,
  instant: {
    occurredAt: truncateToMinute(exactMs),
    occurredAtExact: new Date(exactMs),
    precision,
    sourceOffsetMinutes,
  },
});

const invalid = (detail: string): InstantResult => ({ ok: false, detail });

/**
 * ISO-8601 en UTC. Estricto a proposito: `Z` obligatoria y nada de desfases.
 *
 * Si algun dia Andes empezara a mandar `+00:00` o una hora local, esto falla en
 * vez de interpretarlo. Es lo que se quiere: un cambio de formato del
 * transportista tiene que verse en la cuarentena el mismo dia, no notarse tres
 * semanas despues en la linea de tiempo.
 */
const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;

/** `DD/MM/YYYY HH:mm`. Dia primero, sin excepciones. */
const LOCAL_NAIVE = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;

/**
 * Construye un instante UTC comprobando que la fecha existe de verdad.
 *
 * El viaje de ida y vuelta descarta `31/02/2026`, que `Date.UTC` aceptaria
 * corriendo al 3 de marzo sin decir nada. Un dato que se corrige solo es peor
 * que uno que falla.
 */
const utcFromParts = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number | null => {
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(ms);
  const sameDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second;
  return sameDate ? ms : null;
};

/**
 * Resuelve a UTC un instante descrito por un adaptador.
 *
 * `utcOffsetMinutes` solo se usa para los instantes `localNaive`; los otros dos
 * tipos ya vienen en UTC y pasarles un desfase seria un error.
 *
 * No se usa `new Date(cadena)` en ningun caso. `new Date("30/08/2026 10:22")`
 * devuelve fecha invalida, y `new Date("05/08/2026")` devuelve el 8 de mayo en
 * vez del 5 de agosto: falla en silencio y con el dia cambiado.
 */
export const resolveInstant = (raw: RawInstant, utcOffsetMinutes: number): InstantResult => {
  switch (raw.kind) {
    case 'iso8601Utc': {
      const match = ISO_UTC.exec(raw.value);
      if (match === null) {
        return invalid(`"${raw.value}" no es ISO-8601 en UTC con Z`);
      }
      const ms = utcFromParts(
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
      );
      return ms === null ? invalid(`"${raw.value}" no es una fecha real`) : build(ms, 'second', null);
    }

    case 'epochSeconds': {
      if (!Number.isSafeInteger(raw.value)) {
        return invalid(`${raw.value} no es un entero de segundos valido`);
      }
      const ms = raw.value * 1000;
      // El epoch es UTC por definicion: aqui no hay huso que asumir.
      return Number.isFinite(ms) ? build(ms, 'second', null) : invalid(`${raw.value} fuera de rango`);
    }

    case 'localNaive': {
      const match = LOCAL_NAIVE.exec(raw.value);
      if (match === null) {
        return invalid(`"${raw.value}" no encaja con el formato ${raw.layout}`);
      }
      const localMs = utcFromParts(
        Number(match[3]),
        Number(match[2]),
        Number(match[1]),
        Number(match[4]),
        Number(match[5]),
        0, // el formato no trae segundos: de ahi la precision 'minute'
      );
      if (localMs === null) {
        return invalid(`"${raw.value}" no es una fecha real`);
      }
      // Si el reloj del transportista va UTC-4, su "10:22" son las 14:22 UTC:
      // restar un desfase negativo suma. El desfase se guarda con el evento.
      return build(localMs - utcOffsetMinutes * MINUTE_MS, 'minute', utcOffsetMinutes);
    }
  }
};
