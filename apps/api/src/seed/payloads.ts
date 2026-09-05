/**
 * Constructores de payloads en los tres formatos de entrada.
 *
 * Reproducen la forma exacta de los ejemplos del enunciado. Las fechas se
 * generan relativas al momento de sembrar en vez de fijarlas en agosto de 2026:
 * si estuvieran fijas, los datos de ejemplo caducarian a los noventa dias y el
 * proyecto se veria vacio para quien lo abriera meses despues.
 */

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** Andes Express: JSON plano, ISO-8601 con Z. */
export const andesPayload = (input: {
  trackingNumber: string;
  status: string;
  at: Date;
  city: string;
}): Record<string, unknown> => ({
  guia: input.trackingNumber,
  evento: input.status,
  ts: input.at.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  ciudad: input.city,
});

/** TransBolívar: JSON anidado, estado por codigo numerico, epoch en segundos. */
export const transbolivarPayload = (input: {
  trackingNumber: string;
  statusCode: number;
  statusLabel: string;
  at: Date;
  city: string;
  country: string;
}): Record<string, unknown> => ({
  tracking_number: input.trackingNumber,
  status: { code: input.statusCode, label: input.statusLabel },
  occurred_at: Math.floor(input.at.getTime() / 1000),
  location: { city: input.city, country: input.country },
});

/**
 * RutaSur: campos planos, `DD/MM/YYYY HH:mm` **sin zona horaria**.
 *
 * El constructor recibe el instante real en UTC y lo escribe en el reloj de
 * RutaSur, UTC-4, que es lo que haria el sistema del transportista. Asi los
 * datos de ejemplo reproducen la trampa completa: la misma hora del mundo
 * escrita cuatro horas antes, sin decirlo, y perdiendo los segundos.
 */
export const rutasurPayload = (input: {
  trackingNumber: string;
  status: string;
  at: Date;
  place: string;
  offsetMinutes?: number;
}): Record<string, unknown> => {
  const offset = input.offsetMinutes ?? -240;
  const local = new Date(input.at.getTime() + offset * 60_000);
  const fecha =
    `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()} ` +
    `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;

  return {
    guia: input.trackingNumber,
    estado: input.status,
    fecha,
    lugar: input.place,
  };
};
