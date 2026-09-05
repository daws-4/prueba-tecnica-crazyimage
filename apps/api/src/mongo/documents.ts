import type { QuarantineReason, ShipmentStatus, TimePrecision } from '@andina/contracts';

/**
 * Las formas que se guardan en Mongo.
 *
 * Son distintas del contrato con el panel a proposito: aqui viven cosas que el
 * panel no debe conocer (el payload crudo, el desfase con el que se calculo la
 * fecha, la clave de deduplicacion). Mezclarlas obligaria al panel a saber como
 * se guardan los datos, y ese acoplamiento es el que hace que cambiar el
 * almacenamiento rompa la pantalla.
 */

/** Un evento normalizado. Coleccion `events`. */
export interface EventDocument {
  /** Identidad calculada del contenido. Ver `normalization/dedup-key.ts`. */
  readonly dedupKey: string;

  readonly carrierId: string;
  readonly trackingNumber: string;
  readonly status: ShipmentStatus;

  /** Truncado al minuto, UTC. Ordena, indexa y forma parte de la identidad. */
  readonly occurredAt: Date;
  /** Sin truncar, tal y como llego. Informativo. */
  readonly occurredAtExact: Date;
  readonly precision: TimePrecision;

  /**
   * Desfase usado al convertir, o `null` si la fuente ya venia en UTC.
   *
   * La asuncion viaja con el dato. El dia que el huso de RutaSur resulte estar
   * mal, esto es lo que permite migrar solo los eventos afectados en vez de
   * adivinar cual se calculo con que regla.
   */
  readonly sourceOffsetMinutes: number | null;

  /** Primera vez que llego. */
  readonly receivedAt: Date;
  /** Ultima vez que llego. Distinto de `receivedAt` solo si lo han reenviado. */
  readonly lastReceivedAt: Date;
  /** Cuantas veces ha llegado. Sale gratis de la misma escritura que deduplica. */
  readonly timesReceived: number;

  readonly city: string | null;
  readonly country: string | null;

  /**
   * El payload tal y como llego, sin tocar.
   *
   * No es un lujo: los transportistas empujan y no hay forma de pedirles nada,
   * asi que si el adaptador tenia un fallo, esto es lo unico que permite
   * recuperar el dato. Sin esto, un error de normalizacion es una perdida
   * definitiva.
   */
  readonly raw: unknown;

  readonly batchId: string;
}

/**
 * Un envio. Coleccion `shipments`, con `_id` = numero de guia.
 *
 * **No es una tabla maestra: es una proyeccion derivada de `events`**,
 * reconstruible entera en cualquier momento. Existe para que el LISTADO pueda
 * filtrar por estado actual, cosa carisima desde la coleccion de eventos. El
 * detalle de una guia no la necesita.
 *
 * Que sea derivada es lo que desactiva la objecion de que Mongo no tiene
 * integridad referencial: no hay una relacion que mantener, hay una vista que
 * se regenera.
 */
export interface ShipmentDocument {
  /** El numero de guia es la clave natural: no hace falta un identificador inventado. */
  readonly _id: string;

  readonly currentStatus: ShipmentStatus;
  /** `occurredAt` del evento que decide el estado. NO es "cuando lo guardamos". */
  readonly lastEventAt: Date;
  /** Desempate: a igualdad de `lastEventAt`, gano el que llego despues. */
  readonly lastEventReceivedAt: Date;
  /** Segundo desempate, para que el resultado sea reproducible y no dependa del azar. */
  readonly lastEventDedupKey: string;

  readonly lastCity: string | null;
  readonly lastCountry: string | null;

  /** Todos los transportistas que han reportado este envio. Puede ser mas de uno. */
  readonly carrierIds: string[];
  readonly eventCount: number;

  readonly firstSeenAt: Date;
}

/**
 * Un evento que no se pudo interpretar. Coleccion `quarantine`.
 *
 * Cuarentena no es papelera. El crudo se guarda igual, con el motivo, para que
 * en cuanto la causa este corregida —una traduccion que faltaba, un adaptador
 * arreglado— se reprocese sin haber perdido un solo evento.
 */
export interface QuarantineDocument {
  readonly batchId: string;
  readonly carrierId: string;
  readonly receivedAt: Date;
  readonly reason: QuarantineReason;
  readonly detail: string;
  readonly raw: unknown;
}

export const COLLECTIONS = {
  events: 'events',
  shipments: 'shipments',
  quarantine: 'quarantine',
} as const;
