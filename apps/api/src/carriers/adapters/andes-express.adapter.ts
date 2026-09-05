import { z } from 'zod';
import type { CarrierAdapter, ExtractionResult } from '../carrier.types';
import { fail, isPlainObject, normalizeCity } from './shared';

/**
 * Andes Express — JSON plano, ISO-8601 con `Z`.
 *
 * ```json
 * { "guia": "AC-4471", "evento": "EN_TRANSITO", "ts": "2026-08-30T14:22:10Z", "ciudad": "Cúcuta" }
 * ```
 */

// Zod descarta las claves que no estan aqui: eso ES la frase 06 del cliente,
// "si viene un campo raro, ignorenlo y sigan", sin una linea de codigo extra.
const payloadSchema = z.object({
  guia: z.string().trim().min(1),
  evento: z.string().trim().min(1),
  ts: z.string().trim().min(1),
  ciudad: z.string().optional(),
});

export const andesExpressAdapter: CarrierAdapter = {
  carrierId: 'andes-express',
  displayName: 'Andes Express',

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
        trackingNumber: parsed.data.guia,
        rawStatus: parsed.data.evento,
        // Declara la clase de instante, no una fecha ya resuelta. Aqui viene con
        // `Z`, asi que no necesita el desfase del transportista.
        instant: { kind: 'iso8601Utc', value: parsed.data.ts },
        city: normalizeCity(parsed.data.ciudad),
        country: null, // Andes no manda pais y no se inventa
      },
    };
  },
};
