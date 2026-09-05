import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  // Se valida la configuracion antes de levantar nada: si falta algo, el
  // proceso no arranca. Un fallo de configuracion tiene que doler en el
  // despliegue, no en la primera peticion.
  const env = loadEnv();

  const app = await NestFactory.create(AppModule);
  // El panel vive dentro de la red de Andina y no hay autenticacion (el
  // enunciado la descarta expresamente), asi que CORS abierto es coherente con
  // el alcance. En una red publica esto seria lo primero que habria que cerrar.
  app.enableCors();

  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`API escuchando en el puerto ${env.PORT}`);
}

void bootstrap();
