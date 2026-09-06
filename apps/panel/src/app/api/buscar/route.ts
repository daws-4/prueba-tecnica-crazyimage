import { MIN_SEARCH_LENGTH, SEARCH_SUGGESTION_LIMIT } from '@andina/contracts';

import { listShipments } from '@/lib/api';

/**
 * Las sugerencias del buscador, para el navegador.
 *
 * Existe por la misma razon que `/api/stream`: **el navegador nunca habla con el
 * API**. El buscador necesita preguntar en cada tecla, y esa pregunta la hace el
 * servidor del panel. Asi no hay CORS que configurar, no se publica la direccion
 * interna del API —en Docker es `http://api:3001`, un nombre que solo existe
 * dentro de la red de contenedores— y el panel sigue funcionando aunque el API
 * viva donde el navegador de Camila no llega.
 *
 * No inventa una forma de respuesta propia: devuelve la misma pagina de envios
 * que devuelve el listado, validada contra el mismo esquema. Una respuesta
 * distinta aqui seria un segundo contrato que mantener por nada.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VACIO = { items: [], nextCursor: null, prevCursor: null } as const;

export async function GET(request: Request): Promise<Response> {
  const consulta = new URL(request.url).searchParams.get('q')?.trim() ?? '';

  // El minimo se comprueba aqui ademas de en el navegador. El cliente decide
  // cuando merece la pena preguntar; el servidor no da por hecho que le hayan
  // hecho caso.
  if (consulta.length < MIN_SEARCH_LENGTH) {
    return Response.json(VACIO);
  }

  try {
    return Response.json(await listShipments({ q: consulta, limit: SEARCH_SUGGESTION_LIMIT }));
  } catch {
    // Un buscador que no responde no puede tumbar la pantalla: el detalle del
    // fallo ya esta en el registro del servidor, y quien escribe solo necesita
    // saber que ahora mismo no hay sugerencias. El formulario sigue funcionando:
    // se escribe la guia entera y se pulsa Buscar.
    return new Response('No se pudo consultar el API', { status: 502 });
  }
}
