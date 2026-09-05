import type { QuarantineReason } from '@andina/contracts';

/**
 * Un instante **tal y como lo describe la fuente**, antes de resolverlo a UTC.
 *
 * Esta es la pieza que hace que la trampa del huso horario no se pueda olvidar.
 * Un adaptador no puede devolver una fecha ya resuelta: tiene que declarar de
 * que clase es su instante. Y `localNaive` es, por definicion, un instante que
 * **no se puede resolver sin un dato externo** (el desfase del transportista).
 * El compilador obliga a proporcionarlo.
 *
 * RutaSur manda `30/08/2026 10:22` sin zona. Si el tipo fuese `Date` a secas,
 * ese `10:22` se habria convertido en algun sitio usando la zona del servidor y
 * nadie se habria enterado hasta que Camila diera una respuesta equivocada.
 */
export type RawInstant =
  /** ISO-8601 con `Z`. Ya viene en UTC. Andes Express. */
  | { readonly kind: 'iso8601Utc'; readonly value: string }
  /** Segundos desde epoch. El epoch es UTC por definicion. TransBolivar. */
  | { readonly kind: 'epochSeconds'; readonly value: number }
  /** Hora local sin zona. NO se puede resolver sin el desfase del transportista. RutaSur. */
  | { readonly kind: 'localNaive'; readonly value: string; readonly layout: 'DD/MM/YYYY HH:mm' };

/**
 * Lo que un adaptador saca del payload: los campos en bruto, **sin traducir**.
 *
 * El adaptador conoce la GRAMATICA (donde estan los campos, que forma tiene la
 * fecha). No conoce el VOCABULARIO (que significa el estado, en que huso vive
 * el transportista): eso es dato editable y lo aplica el normalizador, que es
 * comun a todos.
 *
 * Esa frontera es lo que hace que dar de alta el cuarto transportista en enero
 * sea escribir un fichero nuevo y no tocar nada de lo que ya funciona.
 */
export interface ExtractedEvent {
  readonly trackingNumber: string;
  /**
   * El valor del estado tal y como lo manda el transportista, ya como cadena.
   * `EN_TRANSITO`, `3`, `EnRuta`... El adaptador no lo interpreta.
   */
  readonly rawStatus: string;
  readonly instant: RawInstant;
  readonly city: string | null;
  /** Solo TransBolivar lo manda. Los otros dos devuelven `null`; no se inventa. */
  readonly country: string | null;
}

export type ExtractionResult =
  | { readonly ok: true; readonly event: ExtractedEvent }
  | { readonly ok: false; readonly reason: QuarantineReason; readonly detail: string };

/**
 * Un transportista con adaptador escrito.
 *
 * Añadir el cuarto es: un fichero nuevo que implemente esto, una linea en el
 * registro y su vocabulario inicial. Cero cambios en el normalizador, en la
 * ingesta y en el panel.
 */
export interface CarrierAdapter {
  readonly carrierId: string;
  readonly displayName: string;
  /**
   * Lee un evento del payload del transportista.
   *
   * Contrato de esta funcion: **nunca lanza**. Un payload imposible devuelve
   * `ok: false` con el motivo, porque un evento malo dentro de un lote de cinco
   * mil no puede tumbar los otros cuatro mil novecientos noventa y nueve.
   */
  extract(payload: unknown): ExtractionResult;
}
