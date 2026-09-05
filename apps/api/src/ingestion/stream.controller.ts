import { Controller, Sse, type MessageEvent } from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';
import { HEARTBEAT_INTERVAL_MS, type IngestionSignal } from '@andina/contracts';

import { IngestionEvents } from './ingestion-events.service';

@Controller('stream')
export class StreamController {
  constructor(private readonly events: IngestionEvents) {}

  /**
   * `GET /stream` — flujo de avisos en vivo (Server-Sent Events).
   *
   * Por que SSE y no WebSocket: el trafico va en una sola direccion. El servidor
   * avisa, el panel escucha, y el panel nunca necesita mandar nada por aqui. Un
   * WebSocket daria una via de vuelta que no se usa a cambio de un protocolo
   * mas, otra libreria y su propia reconexion. SSE es HTTP de toda la vida, lo
   * reconecta el navegador solo, y atraviesa proxies e intermediarios sin
   * negociar nada.
   *
   * Lo que sale por aqui son avisos, no datos. Ver `stream.ts` en el contrato.
   */
  @Sse()
  stream(): Observable<MessageEvent> {
    const avisos = this.events.stream$;

    // El latido mantiene viva la conexion a traves de proxies que cortan las
    // conexiones ociosas, y le da al panel una forma de notar que se ha quedado
    // sordo: si dejan de llegar latidos, algo pasa.
    const latido = interval(HEARTBEAT_INTERVAL_MS).pipe(
      map((): IngestionSignal => ({ kind: 'heartbeat', at: new Date().toISOString() })),
    );

    return merge(avisos, latido).pipe(map((data): MessageEvent => ({ data })));
  }
}
