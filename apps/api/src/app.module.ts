import { Module } from '@nestjs/common';

import { ENV, loadEnv } from './config/env';
import { IngestionController } from './ingestion/ingestion.controller';
import { IngestionService } from './ingestion/ingestion.service';
import { EventsRepository } from './ingestion/events.repository';
import { ShipmentsProjection } from './ingestion/shipments.projection';
import { IngestionEvents } from './ingestion/ingestion-events.service';
import { StreamController } from './ingestion/stream.controller';
import { MongoService } from './mongo/mongo.service';
import { ShipmentsController } from './shipments/shipments.controller';
import { ShipmentsService } from './shipments/shipments.service';

/**
 * Un solo modulo.
 *
 * Con dos controladores y cinco servicios, repartirlos en modulos por carpeta
 * anadiria ficheros de conexion sin separar nada de verdad. La separacion que
 * importa aqui es otra y ya esta hecha: la que hay entre lo que sabe de cada
 * transportista (`carriers/`) y lo que no sabe de ninguno (todo lo demas).
 */
@Module({
  controllers: [IngestionController, StreamController, ShipmentsController],
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    MongoService,
    EventsRepository,
    ShipmentsProjection,
    IngestionEvents,
    IngestionService,
    ShipmentsService,
  ],
})
export class AppModule {}
