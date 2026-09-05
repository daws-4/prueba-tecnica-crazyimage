import { batchIngestReportSchema, QUARANTINE_REASON_LABELS } from '@andina/contracts';

import { buscarEscenario, ESCENARIOS, type Escenario } from './catalog';

/**
 * Lanzador de escenarios.
 *
 * Manda los lotes **por HTTP**, contra el API que este corriendo, y no llamando
 * a los servicios por dentro. Es a proposito: asi se ejercita el camino
 * completo —validacion del borde, adaptador, normalizacion, escritura, aviso en
 * vivo— y lo que ve el evaluador es exactamente lo que veria un transportista.
 *
 * Uso:
 *   node dist/scenarios/run.js            lista los escenarios
 *   node dist/scenarios/run.js desorden   ejecuta uno
 *   node dist/scenarios/run.js todos      ejecuta los seis
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const PANEL_URL = process.env.PANEL_URL ?? 'http://localhost:3000';

const escribir = (linea = ''): void => {
  process.stdout.write(`${linea}\n`);
};

const GRUPOS: Record<Escenario['grupo'], string> = {
  tipico: 'Caso tipico',
  limite: 'Casos limite',
  'tres-transportistas': 'Con los tres transportistas',
};

const listar = (): void => {
  escribir();
  escribir('Escenarios disponibles. Cada uno carga datos nuevos y dice donde mirarlos.');
  escribir();
  for (const grupo of Object.keys(GRUPOS) as Escenario['grupo'][]) {
    escribir(`  ${GRUPOS[grupo].toUpperCase()}`);
    for (const escenario of ESCENARIOS.filter((e) => e.grupo === grupo)) {
      escribir(`    ${escenario.nombre.padEnd(16)} ${escenario.titulo}`);
    }
    escribir();
  }
  escribir('  Ejecutar uno:   npm run escenario -w @andina/api -- desorden');
  escribir('  Ejecutar todos: npm run escenario -w @andina/api -- todos');
  escribir();
};

const ejecutar = async (escenario: Escenario): Promise<void> => {
  escribir();
  escribir('='.repeat(78));
  escribir(`  ${escenario.titulo}`);
  escribir(`  Guia: ${escenario.guia}`);
  escribir('='.repeat(78));

  const lotes = escenario.construir(Date.now());

  for (const [indice, lote] of lotes.entries()) {
    escribir();
    escribir(`  Lote ${indice + 1}/${lotes.length} -> ${lote.carrierId}`);
    escribir(`  ${lote.narra}`);

    const respuesta = await fetch(`${API_URL}/ingest/${lote.carrierId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lote.eventos),
    });

    if (!respuesta.ok) {
      escribir(`  ERROR ${respuesta.status}: ${await respuesta.text()}`);
      continue;
    }

    // La respuesta se valida contra el mismo contrato que el panel: si el API
    // cambiara de forma, este script se entera aqui y no mas adelante.
    const informe = batchIngestReportSchema.parse(await respuesta.json());

    escribir(
      `    recibidos ${informe.received} · nuevos ${informe.accepted} · ` +
        `reenvios ${informe.duplicates} · cuarentena ${informe.quarantined}`,
    );

    for (const [motivo, cuantos] of Object.entries(informe.quarantinedByReason)) {
      const etiqueta = QUARANTINE_REASON_LABELS[motivo as keyof typeof QUARANTINE_REASON_LABELS];
      escribir(`      ${cuantos} x ${etiqueta}`);
    }
  }

  escribir();
  escribir(`  QUE DEMUESTRA: ${escenario.queDemuestra}`);
  escribir(`  MIRALO EN:     ${PANEL_URL}/envios/${escenario.guia}`);
  escribir();
};

async function main(): Promise<void> {
  const pedido = process.argv[2];

  if (pedido === undefined) {
    listar();
    return;
  }

  // Comprobacion previa: un mensaje claro vale mas que un fallo de red crudo.
  try {
    const salud = await fetch(`${API_URL}/shipments?limit=1`);
    if (!salud.ok) throw new Error(String(salud.status));
  } catch {
    escribir();
    escribir(`  No hay ningun API escuchando en ${API_URL}.`);
    escribir('  Levanta el entorno con "docker compose up" y vuelve a intentarlo.');
    escribir();
    process.exitCode = 1;
    return;
  }

  if (pedido === 'todos') {
    for (const escenario of ESCENARIOS) await ejecutar(escenario);
    escribir(`  Listado completo en ${PANEL_URL}`);
    escribir();
    return;
  }

  const escenario = buscarEscenario(pedido);
  if (escenario === undefined) {
    escribir();
    escribir(`  No existe el escenario "${pedido}".`);
    listar();
    process.exitCode = 1;
    return;
  }

  await ejecutar(escenario);
}

void main();
