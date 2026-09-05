import {
  DEFAULT_PAGE_SIZE,
  shipmentDetailSchema,
  shipmentListResponseSchema,
  type ListShipmentsQuery,
  type ShipmentDetail,
  type ShipmentListResponse,
} from '@andina/contracts';
import type { ZodType } from 'zod';

/**
 * El unico sitio del panel que habla con el API.
 *
 * Aqui se cobra la decision del contrato compartido. La respuesta no se cree a
 * ciegas: se **valida en ejecucion** contra el mismo esquema del que salen los
 * tipos de TypeScript. Si alguien cambia el API y se olvida del panel, el fallo
 * aparece aqui, con el nombre del campo, en vez de tres componentes mas
 * adelante en forma de `undefined` delante de Camila.
 *
 * Eso es exactamente lo que el cliente pidio con "ya nos paso de romper la
 * pantalla al cambiar algo por detras": un tipo de TypeScript se evapora al
 * compilar y no habria detectado nada.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const request = async <T>(path: string, schema: ZodType<T>): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    // Sin cache. Camila tiene esto abierto toda la jornada y los lotes entran
    // tres veces al dia sin avisar: una respuesta guardada es una respuesta que
    // puede estar mintiendo, y evitar eso es el proyecto entero.
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(`El API respondio ${response.status} en ${path}`, response.status);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    // No se intenta seguir con datos que no encajan: fallar aqui es barato,
    // fallar en pantalla no.
    throw new Error(
      `La respuesta de ${path} no cumple el contrato -> ` +
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  return parsed.data;
};

export const listShipments = async (
  query: Partial<
    Pick<ListShipmentsQuery, 'status' | 'carrierId' | 'stalledForHours' | 'after' | 'before'>
  > & { limit?: number },
): Promise<ShipmentListResponse> => {
  const params = new URLSearchParams();
  if (query.status !== undefined) params.set('status', query.status);
  if (query.carrierId !== undefined) params.set('carrierId', query.carrierId);
  if (query.stalledForHours !== undefined) params.set('stalledForHours', String(query.stalledForHours));
  if (query.after !== undefined) params.set('after', query.after);
  if (query.before !== undefined) params.set('before', query.before);
  params.set('limit', String(query.limit ?? DEFAULT_PAGE_SIZE));

  return request(`/shipments?${params.toString()}`, shipmentListResponseSchema);
};

/** `null` si la guia no existe, que es un resultado normal de una busqueda, no un error. */
export const findShipment = async (trackingNumber: string): Promise<ShipmentDetail | null> => {
  try {
    return await request(`/shipments/${encodeURIComponent(trackingNumber)}`, shipmentDetailSchema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};
