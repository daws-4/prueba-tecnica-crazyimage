import type { QuarantineReason } from '@andina/contracts';
import type { ExtractionResult } from '../carrier.types';

/**
 * Utilidades comunes a los tres adaptadores.
 *
 * Se generalizan aqui porque las necesitan los tres. La regla del proyecto
 * (§1.4) es no generalizar porque un transportista lo pida, sino cuando lo pide
 * el tercero; estas ya cumplen.
 */

export const fail = (reason: QuarantineReason, detail: string): ExtractionResult => ({
  ok: false,
  reason,
  detail,
});

/**
 * Distingue los dos fallos que el cliente trata como uno solo.
 *
 * Frase 06: *"si viene algun campo raro que no conocemos, ignorenlo y sigan"*.
 * Ignorar un campo extra y no saber leer un evento **no son lo mismo**, y
 * mezclarlos es como se pierden datos en silencio. Aqui:
 *
 * - el payload no es ni siquiera un objeto  -> `unparseable_payload`
 * - es un objeto, pero le falta algo obligatorio -> `missing_required_field`
 * - tiene campos de mas -> se ignoran, sin ruido (Zod los descarta por defecto)
 */
export const isPlainObject = (payload: unknown): payload is Record<string, unknown> =>
  typeof payload === 'object' && payload !== null && !Array.isArray(payload);

/**
 * Codigo de pais de dos letras, o `null`.
 *
 * Solo TransBolivar manda pais. Si llega en otra forma (`"Colombia"`) se
 * devuelve `null` en vez de recortarlo a `"CO"`: adivinar un dato decorativo no
 * merece el riesgo de acertar mal.
 */
export const normalizeCountry = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
};

export const normalizeCity = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};
