import type { CarrierAdapter } from './carrier.types';
import { andesExpressAdapter } from './adapters/andes-express.adapter';
import { transbolivarAdapter } from './adapters/transbolivar.adapter';
import { rutasurAdapter } from './adapters/rutasur.adapter';

/**
 * El registro de transportistas con adaptador escrito.
 *
 * **Esta lista es el unico sitio que hay que tocar en enero.** Dar de alta el
 * cuarto transportista es: un fichero nuevo en `adapters/`, una linea aqui y su
 * vocabulario inicial. Ni el normalizador, ni la ingesta, ni el panel se
 * enteran — el panel ni siquiera conoce esta lista, recibe los transportistas
 * como datos (ver `carrierIdSchema` en el contrato).
 *
 * Que sea una lista y no un `switch` repartido por el codigo no es estetica: un
 * `switch` obliga a buscar todos los sitios donde se decide algo por
 * transportista, y siempre queda uno.
 */
const ADAPTERS: readonly CarrierAdapter[] = [
  andesExpressAdapter,
  transbolivarAdapter,
  rutasurAdapter,
];

const BY_ID: ReadonlyMap<string, CarrierAdapter> = new Map(
  ADAPTERS.map((adapter) => [adapter.carrierId, adapter]),
);

/** `undefined` si nadie ha escrito adaptador para ese identificador. */
export const findAdapter = (carrierId: string): CarrierAdapter | undefined => BY_ID.get(carrierId);

export const listAdapters = (): readonly CarrierAdapter[] => ADAPTERS;
