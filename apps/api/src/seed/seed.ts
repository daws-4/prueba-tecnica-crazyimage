import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { IngestionService } from '../ingestion/ingestion.service';
import { MongoService } from '../mongo/mongo.service';
import { andesPayload, rutasurPayload, transbolivarPayload } from './payloads';

/**
 * Datos de ejemplo con los tres formatos.
 *
 * No es un volcado de filas: entra por el **mismo endpoint** que usarian los
 * transportistas, con sus formatos reales. Si el seeder funciona, la ingesta
 * funciona; y si alguien rompe la normalizacion, el seeder deja de sembrar.
 *
 * Esta construido para que se vean, con datos en pantalla, las cuatro cosas que
 * el enunciado esconde a proposito:
 *
 * 1. Los tres formatos convergen (AC-4471, reportado por los tres).
 * 2. Un lote atrasado NO hace retroceder el estado (frase 05).
 * 3. Reenviar un lote entero no duplica nada (frase 04).
 * 4. Lo que no se entiende queda en cuarentena con su motivo, no se pierde.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const CITIES = [
  { city: 'Cúcuta', country: 'CO' },
  { city: 'Bucaramanga', country: 'CO' },
  { city: 'San Cristóbal', country: 'VE' },
  { city: 'Maracaibo', country: 'VE' },
  { city: 'Bogotá', country: 'CO' },
  { city: 'Valencia', country: 'VE' },
] as const;

/**
 * El seeder es un script, no parte de la aplicacion: escribe en la salida
 * estandar y no en el registro de Nest, que aqui esta silenciado para que los
 * mensajes de cada lote no tapen el resumen.
 */
const report = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

/** Generador determinista: sembrar dos veces produce los mismos datos. */
const makeRandom = (seed: number) => {
  let state = seed;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const ingestion = app.get(IngestionService);
  const mongo = app.get(MongoService);

  // Sembrar no pisa datos existentes salvo que se pida expresamente.
  //
  // Esto es lo que permite que `docker compose up` sea de verdad UN comando: el
  // sembrado corre al levantar, llena la base la primera vez y se aparta las
  // siguientes. Si se ejecutara siempre, reiniciar el entorno borraria lo que
  // alguien estuviera probando.
  const forzar = process.argv.includes('--force');
  const yaHayDatos = (await mongo.shipments.estimatedDocumentCount()) > 0;
  if (yaHayDatos && !forzar) {
    report('La base ya tiene datos: no se siembra. Usa --force para reemplazarlos.');
    await app.close();
    return;
  }

  // Sembrar es reemplazar: si no, ejecutarlo dos veces daria numeros de
  // duplicados que despistan mas de lo que ensenan.
  await Promise.all([
    mongo.events.deleteMany({}),
    mongo.shipments.deleteMany({}),
    mongo.quarantine.deleteMany({}),
  ]);

  const now = Date.now();
  const random = makeRandom(4471);

  // --- 1. El envio del enunciado, reportado por los tres transportistas ------
  // Mismo envio, misma ciudad, mismo instante real. Andes lo escribe en UTC,
  // TransBolivar en epoch y RutaSur en su hora local sin decirlo.
  const showcase = 'AC-4471';
  const pickedUpAt = new Date(now - 3 * DAY);
  const inTransitAt = new Date(now - 2 * DAY - 6 * HOUR);
  const outForDeliveryAt = new Date(now - 26 * HOUR);
  const deliveredAt = new Date(now - 25 * HOUR);

  const andesFirst = [
    andesPayload({ trackingNumber: showcase, status: 'RECOGIDO', at: pickedUpAt, city: 'Bogotá' }),
    andesPayload({ trackingNumber: showcase, status: 'EN_TRANSITO', at: inTransitAt, city: 'Cúcuta' }),
  ];

  const transbolivarFirst = [
    transbolivarPayload({
      trackingNumber: showcase,
      statusCode: 3,
      statusLabel: 'in transit',
      at: inTransitAt,
      city: 'Cúcuta',
      country: 'CO',
    }),
  ];

  await ingestion.ingest('andes-express', andesFirst);
  await ingestion.ingest('transbolivar', transbolivarFirst);

  // El envio se entrega y Andes lo reporta.
  await ingestion.ingest('andes-express', [
    andesPayload({ trackingNumber: showcase, status: 'ENTREGADO', at: deliveredAt, city: 'San Cristóbal' }),
  ]);

  // --- 2. El lote atrasado que NO debe hacer retroceder el estado -----------
  // RutaSur manda ahora un evento de "en reparto" ocurrido ANTES de la entrega.
  // Es el ultimo en llegar y NO es el mas reciente: el envio tiene que seguir
  // apareciendo como entregado.
  await ingestion.ingest('rutasur', [
    rutasurPayload({ trackingNumber: showcase, status: 'EnReparto', at: outForDeliveryAt, place: 'San Cristóbal' }),
  ]);

  // --- 3. El reenvio completo, que no debe duplicar nada --------------------
  const resend = await ingestion.ingest('andes-express', andesFirst);
  report(
    `Reenvio del primer lote de Andes: ${resend.received} recibidos, ` +
      `${resend.accepted} nuevos, ${resend.duplicates} reenvios`,
  );

  // --- 4. Volumen para el listado y el filtro de envios parados -------------
  const andesBatch: Record<string, unknown>[] = [];
  const transbolivarBatch: Record<string, unknown>[] = [];
  const rutasurBatch: Record<string, unknown>[] = [];

  for (let i = 1; i <= 40; i += 1) {
    const trackingNumber = `AC-${4500 + i}`;
    const origin = CITIES[Math.floor(random() * CITIES.length)] ?? CITIES[0];
    const destination = CITIES[Math.floor(random() * CITIES.length)] ?? CITIES[0];

    // Uno de cada cinco lleva parado varios dias: son los que buscara Camila.
    const stalled = i % 5 === 0;
    // El envio arranca al menos catorce horas atras para que el ultimo evento
    // de su cadena (recogida + 12 h) siga cayendo en el pasado. Sin ese margen,
    // el propio seeder genera eventos fechados en el futuro y el umbral de
    // cordura los manda a cuarentena — que es lo correcto, pero deja los datos
    // de ejemplo a medias.
    const startedAt = now - (stalled ? 4 * DAY + random() * 3 * DAY : 14 * HOUR + random() * 2 * DAY);

    andesBatch.push(
      andesPayload({
        trackingNumber,
        status: 'RECOGIDO',
        at: new Date(startedAt),
        city: origin.city,
      }),
    );

    if (!stalled) {
      transbolivarBatch.push(
        transbolivarPayload({
          trackingNumber,
          statusCode: 3,
          statusLabel: 'in transit',
          at: new Date(startedAt + 5 * HOUR),
          city: destination.city,
          country: destination.country,
        }),
      );

      // Uno de cada tres termina entregado; el resto se queda en reparto.
      if (i % 3 === 0) {
        rutasurBatch.push(
          rutasurPayload({
            trackingNumber,
            status: 'Entregado',
            at: new Date(startedAt + 12 * HOUR),
            place: destination.city,
          }),
        );
      } else {
        rutasurBatch.push(
          rutasurPayload({
            trackingNumber,
            status: 'EnReparto',
            at: new Date(startedAt + 10 * HOUR),
            place: destination.city,
          }),
        );
      }
    }
  }

  // Una incidencia, para que el filtro por estado tenga algo que ensenar.
  andesBatch.push(
    andesPayload({
      trackingNumber: 'AC-4507',
      status: 'INCIDENCIA',
      at: new Date(now - 8 * HOUR),
      city: 'Cúcuta',
    }),
  );

  await ingestion.ingest('andes-express', andesBatch);
  await ingestion.ingest('transbolivar', transbolivarBatch);
  await ingestion.ingest('rutasur', rutasurBatch);

  // --- 5. Cuarentena: los cuatro motivos, uno a uno ------------------------
  const quarantineReport = await ingestion.ingest('rutasur', [
    // Estado que el vocabulario no conoce: no se adivina.
    rutasurPayload({ trackingNumber: 'AC-4560', status: 'DevueltoAlRemitente', at: new Date(now - HOUR), place: 'Cúcuta' }),
    // Fecha que no existe.
    { guia: 'AC-4561', estado: 'EnRuta', fecha: '31/02/2026 10:22', lugar: 'Cúcuta' },
    // Falta un campo obligatorio.
    { estado: 'EnRuta', fecha: '01/09/2026 10:22', lugar: 'Cúcuta' },
    // Ni siquiera es un objeto.
    'esto no es un evento',
  ]);

  // El ejemplo literal de TransBolivar del enunciado: su epoch cae en 2025, un
  // ano antes que los otros dos ejemplos del mismo envio. Casi seguro es un
  // descuido de quien escribio el enunciado, pero en produccion seria un
  // transportista con el reloj mal puesto — y asi se ve, en cuarentena y con su
  // motivo, en vez de aparecer como un evento fantasma un ano atras en la linea
  // de tiempo de un envio real.
  const outOfBounds = await ingestion.ingest('transbolivar', [
    {
      tracking_number: 'AC-4471',
      status: { code: 3, label: 'in transit' },
      occurred_at: 1_756_563_730,
      location: { city: 'Cúcuta', country: 'CO' },
    },
  ]);

  const shipments = await mongo.shipments.countDocuments();
  const events = await mongo.events.countDocuments();
  const quarantined = await mongo.quarantine.countDocuments();

  report(`Sembrado: ${shipments} envios, ${events} eventos, ${quarantined} en cuarentena`);
  report(`Motivos de cuarentena: ${JSON.stringify(quarantineReport.quarantinedByReason)}`);
  report(`Ejemplo del enunciado con el ano de 2025: ${JSON.stringify(outOfBounds.quarantinedByReason)}`);
  report(`Guia para la demostracion: ${showcase}`);

  await app.close();
}

void main();
