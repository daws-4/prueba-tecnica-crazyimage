/**
 * `@andina/contracts` — el contrato compartido entre el API y el panel.
 *
 * Frase 10 del cliente: "que el panel y el API compartan los tipos, ya nos paso
 * de romper la pantalla al cambiar algo por detras".
 *
 * La respuesta a eso no es copiar interfaces de un lado a otro, ni generarlas a
 * partir de la documentacion. Aqui la fuente de verdad es un esquema de Zod y
 * el tipo de TypeScript se **deriva** de el con `z.infer`. Dos consecuencias:
 *
 *  1. No pueden divergir. No hay dos definiciones que mantener sincronizadas,
 *     hay una sola de la que sale la otra.
 *  2. El contrato se comprueba **en ejecucion**, no solo al compilar. Un tipo
 *     de TypeScript se evapora en `tsc`; un esquema sigue ahi cuando el API
 *     devuelve algo que no toca, y falla en el borde en vez de dos capas mas
 *     adelante con un `undefined` en mitad de la pantalla de Camila.
 */

export * from './common';
export * from './status';
export * from './event';
export * from './shipment';
export * from './query';
export * from './ingest';
