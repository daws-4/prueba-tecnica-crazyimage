'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { HEARTBEAT_INTERVAL_MS, ingestionSignalSchema } from '@andina/contracts';

/**
 * Mantiene la pantalla al dia sin recargarla.
 *
 * Frase 08 del cliente: *"Camila va a tener el panel abierto toda la jornada,
 * tiene que estar siempre al dia"*.
 *
 * El API abre un flujo de avisos (SSE) y esto escucha. Cuando entra un lote, el
 * aviso llega en el momento y la pantalla se rehace. Antes esto era un
 * temporizador cada treinta segundos; el temporizador funcionaba, pero dejaba
 * una ventana en la que la pantalla podia estar mintiendo, y esa ventana es
 * justo lo que este proyecto existe para cerrar.
 *
 * **Lo que NO cambio al meter SSE, y es lo importante:** el aviso no trae datos.
 * Dice "acaba de entrar un lote" y esto llama a `router.refresh()`, que vuelve a
 * ejecutar el renderizado del servidor — el mismo camino de siempre, el unico
 * que habla con el API. SSE sustituyo al temporizador, no a la capa de datos. Si
 * el flujo se cae, el panel sigue funcionando exactamente igual, solo que se
 * entera mas tarde.
 *
 * Tres cosas que hacen que esto aguante fuera del laboratorio:
 *
 * 1. `EventSource` reconecta solo cuando la conexion se corta de forma limpia.
 * 2. El servidor late cada veinte segundos, asi que una conexion que se ha
 *    quedado medio abierta —viva para el navegador, muerta de verdad— se puede
 *    detectar: dejan de llegar latidos.
 * 3. Una vigilancia refresca igualmente si no llega nada en el plazo de tres
 *    latidos. Es la red de seguridad: prefiero una peticion de mas cada minuto
 *    que una pantalla muda toda la tarde.
 */

/** Tres latidos sin noticias y damos por sorda la conexion. */
const VIGILANCIA_MS = HEARTBEAT_INTERVAL_MS * 3;

type Estado = 'conectando' | 'en-vivo' | 'reconectando';

const horaCorta = (instante: Date): string =>
  instante.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function AutoRefresh(): React.JSX.Element {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('conectando');
  const [ultimoLote, setUltimoLote] = useState<Date | null>(null);
  const ultimaSenal = useRef<number>(Date.now());

  useEffect(() => {
    const source = new EventSource('/api/stream');

    source.onopen = (): void => {
      setEstado('en-vivo');
      ultimaSenal.current = Date.now();
    };

    source.onmessage = (evento: MessageEvent<string>): void => {
      ultimaSenal.current = Date.now();
      setEstado('en-vivo');

      // El mensaje se valida contra el mismo contrato que usa el API para
      // emitirlo. Un aviso con otra forma se ignora en vez de romper la
      // pantalla: es el tercer sitio donde el contrato se comprueba en
      // ejecucion, despues del borde del API y de la respuesta de consulta.
      const parsed = ingestionSignalSchema.safeParse(JSON.parse(evento.data));
      if (!parsed.success) return;

      // El latido solo sirve para saber que seguimos vivos: no hay nada nuevo
      // que mirar, asi que no se molesta al servidor.
      if (parsed.data.kind === 'heartbeat') return;

      router.refresh();
      setUltimoLote(new Date());
    };

    source.onerror = (): void => {
      // EventSource reintenta solo; aqui solo se refleja en pantalla, porque un
      // panel que se ha quedado sordo y no lo dice es peor que uno lento.
      setEstado('reconectando');
    };

    // La vigilancia: si el flujo se queda mudo, se refresca igual.
    const vigilancia = setInterval(() => {
      if (Date.now() - ultimaSenal.current < VIGILANCIA_MS) return;
      setEstado('reconectando');
      router.refresh();
      setUltimoLote(new Date());
      ultimaSenal.current = Date.now();
    }, HEARTBEAT_INTERVAL_MS);

    // Al volver a la pestana se refresca sin esperar. Camila atiende una
    // llamada, vuelve, y lo que ve ya esta al dia.
    const alVolver = (): void => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      clearInterval(vigilancia);
      document.removeEventListener('visibilitychange', alVolver);
      source.close();
    };
  }, [router]);

  const etiqueta =
    estado === 'en-vivo' ? 'En vivo' : estado === 'conectando' ? 'Conectando…' : 'Reconectando…';

  return (
    <span className="meta conexion" data-estado={estado}>
      <span className="punto" aria-hidden="true" />
      {etiqueta}
      {ultimoLote !== null ? ` · último lote a las ${horaCorta(ultimoLote)}` : ''}
    </span>
  );
}
