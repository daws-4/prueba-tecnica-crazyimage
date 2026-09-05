import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { MongoClient, type Collection, type Db } from 'mongodb';

import { ENV, type Env } from '../config/env';
import { COLLECTIONS, type EventDocument, type QuarantineDocument, type ShipmentDocument } from './documents';

@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private readonly client: MongoClient;
  private readonly db: Db;

  constructor(@Inject(ENV) env: Env) {
    this.client = new MongoClient(env.MONGODB_URI);
    this.db = this.client.db(env.MONGODB_DB);
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    await this.ensureIndexes();
    this.logger.log('Conectado a MongoDB e indices asegurados');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  get events(): Collection<EventDocument> {
    return this.db.collection<EventDocument>(COLLECTIONS.events);
  }

  get shipments(): Collection<ShipmentDocument> {
    return this.db.collection<ShipmentDocument>(COLLECTIONS.shipments);
  }

  get quarantine(): Collection<QuarantineDocument> {
    return this.db.collection<QuarantineDocument>(COLLECTIONS.quarantine);
  }

  /**
   * Los indices, con el porque de cada uno.
   *
   * Se crean al arrancar y no en una migracion aparte porque son pocos y
   * declararlos junto al codigo que los usa evita el clasico "en produccion
   * falta un indice y nadie sabe por que". `createIndex` es idempotente.
   */
  private async ensureIndexes(): Promise<void> {
    await this.events.createIndex(
      { trackingNumber: 1, dedupKey: 1 },
      { unique: true, name: 'uniq_tracking_dedup' },
    );
    // Por que compuesto y por que en este orden: la unicidad es lo que sostiene
    // toda la idempotencia, y el numero de guia va primero porque es la clave
    // natural de reparto si algun dia hiciera falta repartir en varias
    // maquinas. Un indice unico solo se puede garantizar en un cluster
    // repartido si empieza por la clave de reparto, asi que dejarlo asi hoy
    // evita rehacerlo el dia que haga falta. Las escrituras filtran por los dos
    // campos para poder usarlo.

    await this.events.createIndex(
      { trackingNumber: 1, occurredAt: -1 },
      { name: 'timeline' },
    );
    // El indice que sostiene la pantalla: sirve la linea de tiempo ordenada y,
    // con un limite de 1, el evento que decide el estado actual. Su coste no
    // depende del tamano de la coleccion, asi que buscar una guia cuesta lo
    // mismo con veinte mil eventos que con dos millones.

    await this.shipments.createIndex(
      { currentStatus: 1, lastEventAt: -1 },
      { name: 'list_by_status' },
    );
    await this.shipments.createIndex({ lastEventAt: -1 }, { name: 'list_by_recency' });
    // Dos indices para el listado: uno cuando Camila filtra por estado y otro
    // cuando pregunta por los envios parados sin importar en que punto estan.

    await this.quarantine.createIndex({ batchId: 1 }, { name: 'by_batch' });
    await this.quarantine.createIndex(
      { carrierId: 1, receivedAt: -1 },
      { name: 'by_carrier' },
    );
  }
}
