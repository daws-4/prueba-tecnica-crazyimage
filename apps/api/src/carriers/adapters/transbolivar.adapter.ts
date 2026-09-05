import { z } from 'zod';
import type { CarrierAdapter, ExtractionResult } from '../carrier.types';
import { fail, isPlainObject, normalizeCity, normalizeCountry } from './shared';

/**
 * TransBolívar — JSON anidado, estado por codigo numerico, epoch en segundos.
 *
 * ```json
 * { "tracking_number": "AC-4471", "status": { "code": 3, "label": "in transit" },
 *   "occurred_at": 1756563730, "location": { "city": "Cúcuta", "country": "CO" } }
 * ```
 */

const payloadSchema = z.object({
  tracking_number: z.string().trim().min(1),
  status: z.object({
    code: z.number().int(),
    label: z.string().optional(),
  }),
  occurred_at: z.number().int(),
  location: z
    .object({
      city: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

export const transbolivarAdapter: CarrierAdapter = {
  carrierId: 'transbolivar',
  displayName: 'TransBolívar',

  extract(payload: unknown): ExtractionResult {
    if (!isPlainObject(payload)) {
      return fail('unparseable_payload', 'El evento no es un objeto JSON');
    }

    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) {
      return fail('missing_required_field', parsed.error.issues.map((i) => i.path.join('.')).join(', '));
    }

    return {
      ok: true,
      event: {
        trackingNumber: parsed.data.tracking_number,
        // Se usa el CODIGO, no la etiqueta. El codigo es el identificador
        // estable; `label` es texto para humanos y puede pasar de "in transit"
        // a "In Transit" sin que nadie avise, y llevarse por delante la
        // traduccion. Se convierte a cadena para que el vocabulario sea una
        // tabla de cadenas igual para los tres transportistas.
        rawStatus: String(parsed.data.status.code),
        // El epoch es UTC por definicion: no necesita el desfase.
        instant: { kind: 'epochSeconds', value: parsed.data.occurred_at },
        city: normalizeCity(parsed.data.location?.city),
        // El unico de los tres que manda pais.
        country: normalizeCountry(parsed.data.location?.country),
      },
    };
  },
};
