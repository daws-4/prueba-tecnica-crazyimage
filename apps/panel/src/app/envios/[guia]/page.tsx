import Link from 'next/link';
import { SHIPMENT_STATUS_LABELS, type TimelineEvent } from '@andina/contracts';

import { SearchBox } from '@/components/search-box';
import { StatusBadge } from '@/components/status-badge';
import { findShipment } from '@/lib/api';

/**
 * El detalle de un envio: estado actual y linea de tiempo completa.
 *
 * Es la frase 01 del cliente, entera: buscar por numero de guia y ver toda la
 * historia en una sola pantalla, sin importar quien la este transportando.
 *
 * Dos cosas que esta pantalla ensena a proposito, porque si no parecerian fallos:
 *
 * 1. **Se marca el evento que decide el estado actual.** No es siempre el
 *    ultimo de la lista ni el ultimo en llegar: es el que ocurrio mas tarde. Sin
 *    senalarlo, un envio "entregado" cuyo ultimo aviso recibido dice "en
 *    reparto" pareceria un error de la aplicacion.
 * 2. **Dos transportistas informando lo mismo salen como dos lineas.** No es una
 *    duplicacion: son dos fuentes independientes coincidiendo, y eso es una
 *    confirmacion. Se agrupan visualmente, pero no se fusionan.
 */

const fechaLarga = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Con segundos: dos lotes del mismo dia pueden entrar con segundos de diferencia. */
const horaCorta = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * El evento que llego el ultimo.
 *
 * Se calcula solo para poder marcarlo en pantalla **junto al que decide el
 * estado**. Cuando son distintos —y lo son en cuanto llega un lote atrasado— la
 * trampa de la frase 05 se ve de un vistazo: el ultimo aviso recibido dice una
 * cosa y el envio esta en otra, y eso es correcto.
 */
const ultimoEnLlegar = (timeline: readonly TimelineEvent[]): TimelineEvent | undefined =>
  timeline.reduce<TimelineEvent | undefined>((mejor, evento) => {
    if (mejor === undefined) return evento;
    const diferencia = Date.parse(evento.receivedAt) - Date.parse(mejor.receivedAt);
    if (diferencia > 0) return evento;
    if (diferencia < 0) return mejor;
    return evento.id > mejor.id ? evento : mejor;
  }, undefined);

/** Agrupa los eventos que caen en el mismo minuto: son los empates de verdad. */
const agruparPorInstante = (timeline: readonly TimelineEvent[]): (readonly TimelineEvent[])[] => {
  const grupos: TimelineEvent[][] = [];
  for (const evento of timeline) {
    const ultimo = grupos.at(-1);
    if (ultimo !== undefined && ultimo[0]?.occurredAt === evento.occurredAt) {
      ultimo.push(evento);
    } else {
      grupos.push([evento]);
    }
  }
  return grupos;
};

export default async function Page({
  params,
}: {
  params: Promise<{ guia: string }>;
}): Promise<React.JSX.Element> {
  const { guia } = await params;
  const trackingNumber = decodeURIComponent(guia);
  const envio = await findShipment(trackingNumber);

  if (envio === null) {
    return (
      <>
        <SearchBox defaultValue={trackingNumber} />
        <div className="card vacio">
          No hay ningún envío con la guía <code>{trackingNumber}</code>.
          <p className="meta" style={{ marginBottom: 0 }}>
            Puede que el transportista aún no lo haya reportado, o que su evento esté en cuarentena
            por no ser interpretable.
          </p>
        </div>
      </>
    );
  }

  const grupos = agruparPorInstante(envio.timeline);
  const ultimoAviso = ultimoEnLlegar(envio.timeline);
  // Si el ultimo aviso que nos llego no es el que manda, este envio es un
  // ejemplo vivo de por que el estado no puede sobreescribirse con cada evento.
  const llegoDesordenado = ultimoAviso !== undefined && ultimoAviso.id !== envio.currentStatusEventId;

  return (
    <>
      <SearchBox defaultValue={envio.trackingNumber} />

      <div className="card" style={{ marginTop: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1>
            <code>{envio.trackingNumber}</code>
          </h1>
          <StatusBadge status={envio.currentStatus} />
          <span className="meta">desde el {fechaLarga(envio.lastEventAt)}</span>
        </div>
        <p className="meta" style={{ margin: '0.6rem 0 0' }}>
          {envio.eventCount} evento{envio.eventCount === 1 ? '' : 's'} · reportado por{' '}
          {envio.carrierIds.length} transportista{envio.carrierIds.length === 1 ? '' : 's'}
          {envio.lastLocation !== null ? ` · último punto: ${envio.lastLocation.city}` : ''}
        </p>
      </div>

      <h2>Línea de tiempo</h2>

      {llegoDesordenado ? (
        <p className="nota">
          Este envío llegó desordenado: el último aviso que recibimos dice{' '}
          <strong>«{SHIPMENT_STATUS_LABELS[ultimoAviso.status].toLowerCase()}»</strong>, pero ocurrió{' '}
          <em>antes</em> que otro que ya teníamos. El estado actual lo decide el evento más reciente,
          no el último en llegar.
        </p>
      ) : null}

      <ol className="timeline">
        {grupos.map((grupo) => {
          const primero = grupo[0];
          if (primero === undefined) return null;
          const decide = grupo.some((evento) => evento.id === envio.currentStatusEventId);

          return (
            <li key={primero.occurredAt} data-decide={decide}>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong>{fechaLarga(primero.occurredAt)}</strong>
                {grupo.map((evento) => (
                  <StatusBadge key={evento.id} status={evento.status} />
                ))}
                {decide ? <span className="meta">← decide el estado actual</span> : null}
              </div>

              {grupo.map((evento) => (
                <div key={evento.id} className="meta" style={{ marginTop: '0.25rem' }}>
                  {evento.carrierName}
                  {evento.location !== null ? ` · ${evento.location.city}` : ''}
                  {evento.location?.country != null ? ` (${evento.location.country})` : ''}
                  {' · '}
                  {/* Se dice cuando nos enteramos, no solo cuando ocurrio. Es lo
                      que explica por que el estado actual no es el ultimo aviso
                      recibido. */}
                  nos llegó a las {horaCorta(evento.receivedAt)}
                  {evento.id === ultimoAviso?.id ? (
                    <strong> · último aviso recibido</strong>
                  ) : null}
                  {evento.precision === 'minute' ? ' · informa al minuto' : ''}
                  {evento.timesReceived > 1 ? ` · recibido ${evento.timesReceived} veces` : ''}
                </div>
              ))}

              {grupo.length > 1 ? (
                <div className="meta" style={{ marginTop: '0.3rem', fontStyle: 'italic' }}>
                  {grupo.length} transportistas informan de este mismo momento. No se fusionan: que
                  dos fuentes independientes coincidan es una confirmación.
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="nota">
        El estado actual sale del evento que <strong>ocurrió</strong> más tarde, no del que llegó el
        último. Los transportistas mandan por lotes tres veces al día y a veces nos enteramos tarde de
        algo que pasó antes; si mandara el último aviso recibido, un paquete ya entregado volvería a
        aparecer «en camino».
      </p>

      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/">← Volver al listado</Link>
      </p>
    </>
  );
}
