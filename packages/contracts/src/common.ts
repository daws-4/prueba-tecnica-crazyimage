import { z } from 'zod';

/**
 * Todo instante que cruza el cable es ISO-8601 **en UTC**, con `Z` obligatoria.
 *
 * No es un detalle de formato: es la decision P03 escrita en el contrato. Los
 * transportistas mandan la hora en tres husos distintos y uno de ellos ni
 * siquiera lo dice; a partir del borde del API eso ya no existe. Si algun dia
 * un instante sale de aqui con desfase propio, el esquema lo rechaza antes de
 * que llegue al panel.
 */
export const utcInstantSchema = z.iso.datetime();

/** Numero de guia. Identifica el ENVIO, nunca el evento (ver P03). */
export const trackingNumberSchema = z
  .string()
  .trim()
  .min(1, 'El numero de guia no puede estar vacio')
  .max(64);

/**
 * Identificador del transportista.
 *
 * Deliberadamente `string` y no una union cerrada. El conjunto de
 * transportistas con adaptador escrito es cerrado en el API (donde viven los
 * adaptadores), pero el panel no necesita conocerlo: recibe el identificador y
 * su nombre para mostrar como datos. Asi, dar de alta el cuarto transportista
 * en enero no obliga a volver a desplegar el panel.
 */
export const carrierIdSchema = z.string().trim().min(1).max(64);

/**
 * Lugar del evento. `country` es nullable porque solo TransBolivar lo manda;
 * los otros dos no, y no se inventa.
 */
export const locationSchema = z.object({
  city: z.string().trim().min(1),
  country: z.string().trim().length(2).nullable(),
});

export type Location = z.infer<typeof locationSchema>;

/**
 * Pagina de resultados con cursor.
 *
 * Cursor y no desplazamiento: con dos millones de eventos, saltarse 50 000
 * filas para pintar la pagina 1000 cuesta cada vez mas, y ademas un lote que
 * entra entre dos peticiones descoloca las paginas. El cursor es opaco a
 * proposito: el panel lo devuelve tal cual, sin interpretarlo.
 */
export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}
