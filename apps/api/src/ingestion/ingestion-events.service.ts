import { Injectable } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';
import type { BatchIngestedSignal } from '@andina/contracts';

/**
 * El canal por el que la ingesta avisa de que acaba de entrar un lote.
 *
 * Es deliberadamente tonto: un `Subject` en memoria. No guarda historial, no
 * reintenta, no garantiza entrega. Y esta bien que sea asi, porque **el aviso
 * no es el dato**: si un panel se pierde un aviso, el peor caso es que tarde en
 * enterarse lo que tarde su vigilancia en saltar. Nada se pierde, solo se
 * retrasa.
 *
 * Limite conocido, y hay que decirlo: esto vive **dentro de un proceso**. Con
 * dos instancias del API detras de un balanceador, un panel conectado a la
 * instancia A no oiria los lotes que entran por la B. Para eso haria falta un
 * canal compartido —Redis, o los flujos de cambios de Mongo, que ademas
 * quitarian el acoplamiento con la ingesta—. Con una instancia, que es el
 * alcance de esta entrega, sobra.
 */
@Injectable()
export class IngestionEvents {
  private readonly subject = new Subject<BatchIngestedSignal>();

  /** Solo lectura para quien escucha: nadie fuera de la ingesta puede publicar. */
  readonly stream$: Observable<BatchIngestedSignal> = this.subject.asObservable();

  publish(signal: BatchIngestedSignal): void {
    this.subject.next(signal);
  }
}
