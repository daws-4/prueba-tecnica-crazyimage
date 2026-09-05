const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Puente entre el flujo del API y el navegador.
 *
 * Existe para no romper una propiedad que costo poco y vale mucho: **el
 * navegador nunca habla con el API**. Todo pasa por el servidor del panel, asi
 * que no hay CORS que configurar, no se expone la direccion interna del API y el
 * panel funciona igual aunque el API viva en una red que el navegador de Camila
 * no ve. En Docker el API responde en `http://api:3001`, un nombre que solo
 * existe dentro de la red de contenedores.
 *
 * Sin este puente habria que publicar la direccion del API al navegador, y con
 * ella todo lo que eso arrastra.
 *
 * No se transforma nada: el cuerpo de la respuesta del API se reenvia tal cual.
 * Este fichero no entiende de eventos ni de envios, solo de tuberias.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const upstream = await fetch(`${API_URL}/stream`, {
    headers: { Accept: 'text/event-stream' },
    cache: 'no-store',
    // Si el navegador cierra la pestana, se corta tambien la conexion con el
    // API. Sin esto quedarian conexiones colgadas por cada pestana que se cierra.
    signal: request.signal,
  });

  if (upstream.body === null) {
    return new Response('El API no devolvio un flujo', { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Le dice a los proxies que no acumulen la respuesta antes de enviarla:
      // sin esto, un intermediario puede retener los avisos hasta llenar su
      // memoria intermedia y el "en vivo" deja de serlo.
      'X-Accel-Buffering': 'no',
    },
  });
}
