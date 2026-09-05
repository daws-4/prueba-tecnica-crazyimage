import { z } from 'zod';
import type { CarrierAdapter, ExtractionResult } from '../carrier.types';
import { fail, isPlainObject, normalizeCity } from './shared';

/**
 * RutaSur — campos planos, fecha `DD/MM/YYYY HH:mm` **sin zona horaria**.
 *
 * ```json
 * { "guia": "AC-4471", "estado": "EnRuta", "fecha": "30/08/2026 10:22", "lugar": "Cúcuta" }
 * ```
 *
 * Es el adaptador con las dos trampas del ejercicio: la fecha no dice en que
 * huso esta y pierde los segundos. Ninguna de las dos se resuelve aqui — este
 * fichero solo sabe **donde** estan los campos y **que forma** tiene la fecha.
 * Que `10:22` sea UTC-4 es vocabulario, es dato, y lo aplica el normalizador.
 */

const payloadSchema = z.object({
  guia: z.string().trim().min(1),
  estado: z.string().trim().min(1),
  fecha: z.string().trim().min(1),
  lugar: z.string().optional(),
});

export const rutasurAdapter: CarrierAdapter = {
  carrierId: 'rutasur',
  displayName: 'RutaSur',

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
        rawStatus: parsed.data.estado,
        // `localNaive` es el tipo que obliga a que alguien aporte el desfase.
        // Si aqui se devolviera un `Date`, la conversion habria ocurrido con la
        // zona del servidor y el fallo seria invisible: la aplicacion
        // funcionaria y mentiria, que es el peor de los fallos posibles (§1.4).
        instant: { kind: 'localNaive', value: parsed.data.fecha, layout: 'DD/MM/YYYY HH:mm' },
        city: normalizeCity(parsed.data.lugar),
        country: null, // RutaSur no manda pais
      },
    };
  },
};
