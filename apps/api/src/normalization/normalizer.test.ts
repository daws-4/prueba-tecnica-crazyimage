import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { andesExpressAdapter } from '../carriers/adapters/andes-express.adapter';
import { rutasurAdapter } from '../carriers/adapters/rutasur.adapter';
import { transbolivarAdapter } from '../carriers/adapters/transbolivar.adapter';
import { DEFAULT_VOCABULARIES, type CarrierVocabulary } from '../carriers/vocabulary';
import { normalizeEvent, type NormalizationResult } from './normalizer';

/**
 * Pruebas de la normalizacion.
 *
 * Es la pieza mas fragil del sistema: donde tres formatos ajenos, que cambian
 * cuando quieren, se convierten en un tipo unico. Un fallo aqui no revienta,
 * miente — y el sistema entero existe para que Camila deje de dar respuestas
 * equivocadas.
 *
 * No se busca cobertura: son los casos borde que aparecieron al leer los datos.
 */

const vocabularyOf = (carrierId: string): CarrierVocabulary => {
  const found = DEFAULT_VOCABULARIES.find((v) => v.carrierId === carrierId);
  assert.ok(found, `falta el vocabulario de ${carrierId}`);
  return found;
};

/** El lote llega poco despues del evento, que es el caso realista. */
const RECEIVED_AT = new Date('2026-08-30T15:00:00Z');

const expectOk = (result: NormalizationResult) => {
  assert.equal(result.ok, true, `se esperaba exito: ${result.ok ? '' : result.detail}`);
  assert.ok(result.ok);
  return result.event;
};

const expectQuarantine = (result: NormalizationResult) => {
  assert.equal(result.ok, false, 'se esperaba cuarentena');
  assert.ok(!result.ok);
  return result;
};

// Los tres ejemplos del enunciado: el mismo envio, la misma ciudad.
const ANDES_SAMPLE = {
  guia: 'AC-4471',
  evento: 'EN_TRANSITO',
  ts: '2026-08-30T14:22:10Z',
  ciudad: 'Cúcuta',
};

const RUTASUR_SAMPLE = {
  guia: 'AC-4471',
  estado: 'EnRuta',
  fecha: '30/08/2026 10:22',
  lugar: 'Cúcuta',
};

const TRANSBOLIVAR_SAMPLE = {
  tracking_number: 'AC-4471',
  status: { code: 3, label: 'in transit' },
  occurred_at: 1756563730,
  location: { city: 'Cúcuta', country: 'CO' },
};

describe('los tres formatos convergen', () => {
  it('Andes y RutaSur describen el mismo instante una vez aplicado el huso', () => {
    const andes = expectOk(
      normalizeEvent({
        adapter: andesExpressAdapter,
        vocabulary: vocabularyOf('andes-express'),
        payload: ANDES_SAMPLE,
        receivedAt: RECEIVED_AT,
      }),
    );
    const rutasur = expectOk(
      normalizeEvent({
        adapter: rutasurAdapter,
        vocabulary: vocabularyOf('rutasur'),
        payload: RUTASUR_SAMPLE,
        receivedAt: RECEIVED_AT,
      }),
    );

    // Esta es LA prueba de la asuncion del huso: `10:22` de RutaSur y
    // `14:22:10Z` de Andes son el mismo minuto si y solo si RutaSur es UTC-4.
    assert.equal(andes.occurredAt.toISOString(), '2026-08-30T14:22:00.000Z');
    assert.equal(rutasur.occurredAt.toISOString(), '2026-08-30T14:22:00.000Z');

    // Y el resto del evento tampoco depende de quien lo mando.
    assert.equal(andes.trackingNumber, rutasur.trackingNumber);
    assert.equal(andes.status, rutasur.status);
    assert.equal(andes.status, 'en_transito');
    assert.equal(andes.city, rutasur.city);
  });

  it('truncar al minuto no tira el segundo, solo deja de usarlo para ordenar', () => {
    const andes = expectOk(
      normalizeEvent({
        adapter: andesExpressAdapter,
        vocabulary: vocabularyOf('andes-express'),
        payload: ANDES_SAMPLE,
        receivedAt: RECEIVED_AT,
      }),
    );
    assert.equal(andes.occurredAt.toISOString(), '2026-08-30T14:22:00.000Z');
    assert.equal(andes.occurredAtExact.toISOString(), '2026-08-30T14:22:10.000Z');
    assert.equal(andes.precision, 'second');
  });

  it('la precision de RutaSur es el minuto, y queda declarada', () => {
    const rutasur = expectOk(
      normalizeEvent({
        adapter: rutasurAdapter,
        vocabulary: vocabularyOf('rutasur'),
        payload: RUTASUR_SAMPLE,
        receivedAt: RECEIVED_AT,
      }),
    );
    assert.equal(rutasur.precision, 'minute');
    assert.equal(rutasur.sourceOffsetMinutes, -240);
  });
});

describe('el huso es una asuncion, y se nota', () => {
  /** Suponer que RutaSur informa en hora de Colombia (UTC-5) en vez de Venezuela. */
  const asColombia: CarrierVocabulary = { ...vocabularyOf('rutasur'), utcOffsetMinutes: -300 };

  it('cambiar el desfase mueve el evento una hora entera', () => {
    const shifted = expectOk(
      normalizeEvent({
        adapter: rutasurAdapter,
        vocabulary: asColombia,
        payload: RUTASUR_SAMPLE,
        // Lote que llega horas despues, que es lo normal con tres envios al dia:
        // asi el umbral de cordura no interfiere y se ve solo el efecto del huso.
        receivedAt: new Date('2026-08-30T22:00:00Z'),
      }),
    );
    // Una hora basta para que un evento viejo adelante a uno nuevo y el panel
    // diga "en reparto" de un paquete que ya se entrego.
    assert.equal(shifted.occurredAt.toISOString(), '2026-08-30T15:22:00.000Z');
  });

  it('si el lote llega pronto, el umbral del futuro delata el huso mal puesto', () => {
    // Hallazgo al escribir la prueba anterior: con el desfase equivocado el
    // evento aterriza 22 minutos DESPUES de que el transportista nos lo contara,
    // y eso es imposible. El umbral de cordura no se diseno para esto, pero
    // atrapa la configuracion mal puesta siempre que el lote llegue fresco.
    // No es una red completa —un lote de la tarde ya no lo detectaria— pero
    // convierte un fallo silencioso en uno visible sin coste ninguno.
    const result = expectQuarantine(
      normalizeEvent({
        adapter: rutasurAdapter,
        vocabulary: asColombia,
        payload: RUTASUR_SAMPLE,
        receivedAt: RECEIVED_AT,
      }),
    );
    assert.equal(result.reason, 'date_out_of_bounds');
  });
});

describe('identidad del evento', () => {
  it('el mismo evento reenviado con un campo desconocido es el mismo evento', () => {
    const primero = expectOk(
      normalizeEvent({
        adapter: andesExpressAdapter,
        vocabulary: vocabularyOf('andes-express'),
        payload: ANDES_SAMPLE,
        receivedAt: RECEIVED_AT,
      }),
    );
    const reenvio = expectOk(
      normalizeEvent({
        adapter: andesExpressAdapter,
        vocabulary: vocabularyOf('andes-express'),
        // Frase 06 del cliente: campo raro -> se ignora y se sigue.
        payload: { ...ANDES_SAMPLE, id_interno_nuevo: 'X-99', reintento: true },
        receivedAt: new Date('2026-08-30T20:00:00Z'),
      }),
    );
    // Si la identidad fuera un hash del payload, esto habria entrado dos veces.
    assert.equal(primero.dedupKey, reenvio.dedupKey);
  });

  it('dos transportistas informando lo mismo NO se fusionan', () => {
    const andes = expectOk(
      normalizeEvent({
        adapter: andesExpressAdapter,
        vocabulary: vocabularyOf('andes-express'),
        payload: ANDES_SAMPLE,
        receivedAt: RECEIVED_AT,
      }),
    );
    const rutasur = expectOk(
      normalizeEvent({
        adapter: rutasurAdapter,
        vocabulary: vocabularyOf('rutasur'),
        payload: RUTASUR_SAMPLE,
        receivedAt: RECEIVED_AT,
      }),
    );
    // Mismo envio, mismo minuto, mismo estado... y aun asi son dos eventos: son
    // dos fuentes independientes coincidiendo, y eso es una confirmacion, no
    // ruido. Fusionarlas no tiene vuelta atras.
    assert.notEqual(andes.dedupKey, rutasur.dedupKey);
  });
});

describe('lo que no se puede interpretar va a cuarentena, con su motivo', () => {
  it('un estado que el vocabulario no conoce no se adivina', () => {
    const result = expectQuarantine(
      normalizeEvent({
        adapter: rutasurAdapter,
        vocabulary: vocabularyOf('rutasur'),
        payload: { ...RUTASUR_SAMPLE, estado: 'DevueltoAlRemitente' },
        receivedAt: RECEIVED_AT,
      }),
    );
    assert.equal(result.reason, 'unknown_status');
  });

  it('una fecha que no existe se rechaza en vez de correrse al mes siguiente', () => {
    const result = expectQuarantine(
      normalizeEvent({
        adapter: rutasurAdapter,
        vocabulary: vocabularyOf('rutasur'),
        payload: { ...RUTASUR_SAMPLE, fecha: '31/02/2026 10:22' },
        receivedAt: RECEIVED_AT,
      }),
    );
    assert.equal(result.reason, 'invalid_date');
  });

  it('falta un campo obligatorio', () => {
    const { guia: _omitido, ...sinGuia } = RUTASUR_SAMPLE;
    const result = expectQuarantine(
      normalizeEvent({
        adapter: rutasurAdapter,
        vocabulary: vocabularyOf('rutasur'),
        payload: sinGuia,
        receivedAt: RECEIVED_AT,
      }),
    );
    assert.equal(result.reason, 'missing_required_field');
  });

  it('un evento fechado en el futuro no puede clavar el estado del envio', () => {
    const result = expectQuarantine(
      normalizeEvent({
        adapter: andesExpressAdapter,
        vocabulary: vocabularyOf('andes-express'),
        payload: { ...ANDES_SAMPLE, ts: '2027-01-01T00:00:00Z' },
        receivedAt: RECEIVED_AT,
      }),
    );
    assert.equal(result.reason, 'date_out_of_bounds');
  });

  it('el epoch de TransBolivar del enunciado cae en 2025 y lo atrapa el umbral', () => {
    // 1756563730 es 2025-08-30T14:22:10Z: misma hora del dia, un ano antes que
    // los otros dos ejemplos. Casi seguro es un descuido del enunciado, pero en
    // produccion seria un transportista con el reloj mal puesto, y asi se ve.
    const result = expectQuarantine(
      normalizeEvent({
        adapter: transbolivarAdapter,
        vocabulary: vocabularyOf('transbolivar'),
        payload: TRANSBOLIVAR_SAMPLE,
        receivedAt: RECEIVED_AT,
      }),
    );
    assert.equal(result.reason, 'date_out_of_bounds');
  });

  it('corregido el ano, TransBolivar converge con los otros dos', () => {
    const corregido = { ...TRANSBOLIVAR_SAMPLE, occurred_at: 1756563730 + 365 * 86_400 };
    const event = expectOk(
      normalizeEvent({
        adapter: transbolivarAdapter,
        vocabulary: vocabularyOf('transbolivar'),
        payload: corregido,
        receivedAt: RECEIVED_AT,
      }),
    );
    assert.equal(event.occurredAt.toISOString(), '2026-08-30T14:22:00.000Z');
    assert.equal(event.status, 'en_transito');
    assert.equal(event.country, 'CO'); // el unico de los tres que lo manda
  });
});
