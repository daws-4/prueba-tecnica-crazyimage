/**
 * Cursor de paginacion.
 *
 * Cursor y no desplazamiento: saltarse cincuenta mil filas para pintar la
 * pagina mil cuesta cada vez mas, y ademas un lote que entra entre dos
 * peticiones descoloca las paginas y hace que un envio aparezca dos veces o
 * ninguna. El cursor apunta a una posicion concreta, asi que eso no pasa.
 *
 * Se codifica en base64 no para esconderlo, sino para que sea evidente que es
 * opaco: el panel lo devuelve tal cual y nadie se ve tentado de construirlo a
 * mano.
 */
export interface ListCursor {
  readonly lastEventAt: Date;
  readonly trackingNumber: string;
}

export const encodeCursor = (cursor: ListCursor): string =>
  Buffer.from(`${cursor.lastEventAt.toISOString()}|${cursor.trackingNumber}`, 'utf8').toString('base64url');

/** `null` si el cursor no se puede leer: se ignora y se empieza por el principio. */
export const decodeCursor = (raw: string | undefined): ListCursor | null => {
  if (raw === undefined) return null;
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const separator = decoded.indexOf('|');
    if (separator === -1) return null;

    const instant = new Date(decoded.slice(0, separator));
    const trackingNumber = decoded.slice(separator + 1);
    if (Number.isNaN(instant.getTime()) || trackingNumber.length === 0) return null;

    return { lastEventAt: instant, trackingNumber };
  } catch {
    return null;
  }
};
