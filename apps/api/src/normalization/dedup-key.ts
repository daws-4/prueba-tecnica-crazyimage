import type { ShipmentStatus } from '@andina/contracts';

/**
 * La identidad de un evento.
 *
 * Ninguno de los tres transportistas manda un identificador de evento: solo el
 * numero de guia, que identifica el ENVIO. Asi que la identidad hay que
 * fabricarla del contenido, y el criterio es:
 *
 *   > solo entran en la identidad los campos cuya normalizacion es
 *   > determinista y de conjunto cerrado.
 *
 * | Campo | Entra | Por que |
 * |---|---|---|
 * | `carrierId` | si | Que Andes y RutaSur informen el mismo hecho NO es un duplicado: son dos fuentes coincidiendo, y la procedencia es informacion. Fusionarlas permitiria que un fallo de reloj en uno silenciara el evento real del otro, sin vuelta atras. |
 * | `trackingNumber` | si | Identificador. |
 * | `occurredAt` truncado | si | Tras normalizar es un numero. |
 * | `status` canonico | si | Conjunto cerrado de cinco valores. |
 * | `location` | **no** | Texto libre y abierto: `Cúcuta`, `CUCUTA`, `Cucuta, Norte de Santander`. Una identidad solo es tan estable como el campo menos normalizable que contiene. |
 * | payload crudo | **no** | El cliente avisa de que mandaran campos que no conocemos; un campo nuevo cambiaria el hash y meteria un duplicado. |
 *
 * La clave se guarda como cadena legible en vez de como hash: quien depure esto
 * dentro de un ano va a leerla en la base de datos, y `andes-express|AC-4471|...`
 * dice lo que pasa. Un hash ahorraria unos bytes y costaria media hora cada vez.
 */
export const buildDedupKey = (parts: {
  readonly carrierId: string;
  readonly trackingNumber: string;
  /** Ya truncado al minuto. */
  readonly occurredAt: Date;
  readonly status: ShipmentStatus;
}): string =>
  [parts.carrierId, parts.trackingNumber, parts.occurredAt.toISOString(), parts.status].join('|');
