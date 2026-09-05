import Link from 'next/link';
import { SHIPMENT_STATUSES, type ShipmentStatus } from '@andina/contracts';

import { SearchBox } from '@/components/search-box';
import { StatusBadge } from '@/components/status-badge';
import { listShipments } from '@/lib/api';

/**
 * Pantalla principal: buscador y listado de envios.
 *
 * Se renderiza en el servidor y sin cache. La razon esta en el contrato del
 * proyecto: los lotes entran tres veces al dia sin avisar, asi que una respuesta
 * guardada es una respuesta que puede estar mintiendo — y evitar exactamente eso
 * es el proyecto entero. Lo que mantiene la pantalla al dia sin recargarla es
 * `AutoRefresh`, que vuelve a pedir este mismo renderizado.
 *
 * Los filtros viven en la URL y no en el estado del componente. Asi una vista
 * concreta ("los parados de mas de 48 horas") es un enlace que se puede guardar
 * o mandar por chat, y el boton de atras del navegador funciona.
 */

const HORAS_PARADO = 48;

const instante = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const esEstado = (valor: string | undefined): valor is ShipmentStatus =>
  valor !== undefined && (SHIPMENT_STATUSES as readonly string[]).includes(valor);

interface SearchParams {
  readonly status?: string;
  readonly parados?: string;
  readonly cursor?: string;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const status = esEstado(params.status) ? params.status : undefined;
  const parados = params.parados === '1';

  const { items, nextCursor } = await listShipments({
    ...(status !== undefined ? { status } : {}),
    ...(parados ? { stalledForHours: HORAS_PARADO } : {}),
    ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
    limit: 25,
  });

  const enlace = (extra: Record<string, string>): string => {
    const query = new URLSearchParams();
    if (status !== undefined) query.set('status', status);
    if (parados) query.set('parados', '1');
    for (const [clave, valor] of Object.entries(extra)) query.set(clave, valor);
    const cadena = query.toString();
    return cadena.length === 0 ? '/' : `/?${cadena}`;
  };

  return (
    <>
      <SearchBox />

      <div className="filtros">
        <Link href="/" data-activo={status === undefined && !parados}>
          Todos
        </Link>

        {/* El filtro que de verdad cambia el dia de Camila. Los otros dicen en
            que punto esta cada envio; este dice cuales van a generar una
            llamada. */}
        <Link href={parados ? enlaceSin('parados', status) : '/?parados=1'} data-activo={parados}>
          Parados más de {HORAS_PARADO} h
        </Link>

        {SHIPMENT_STATUSES.map((valor) => (
          <Link
            key={valor}
            href={status === valor ? enlaceSin('status', undefined, parados) : buildHref(valor, parados)}
            data-activo={status === valor}
          >
            <StatusBadge status={valor} />
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card vacio">No hay envíos que cumplan este filtro.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Guía</th>
              <th>Estado actual</th>
              <th>Último evento</th>
              <th>Transportistas</th>
              <th>Eventos</th>
            </tr>
          </thead>
          <tbody>
            {items.map((envio) => (
              <tr key={envio.trackingNumber}>
                <td>
                  <Link href={`/envios/${encodeURIComponent(envio.trackingNumber)}`}>
                    <code>{envio.trackingNumber}</code>
                  </Link>
                </td>
                <td>
                  <StatusBadge status={envio.currentStatus} />
                </td>
                <td>
                  {instante(envio.lastEventAt)}
                  {envio.lastLocation !== null ? (
                    <span className="meta"> · {envio.lastLocation.city}</span>
                  ) : null}
                </td>
                <td className="meta">{envio.carrierIds.length}</td>
                <td className="meta">{envio.eventCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {nextCursor !== null ? (
        <p style={{ marginTop: '1rem' }}>
          <Link href={enlace({ cursor: nextCursor })}>Ver más envíos →</Link>
        </p>
      ) : null}

      <p className="nota">
        La paginación va por cursor y no por número de página: con dos millones de eventos, saltarse
        cincuenta mil filas cuesta cada vez más, y un lote que entra entre dos peticiones descolocaría
        las páginas.
      </p>
    </>
  );
}

const buildHref = (status: ShipmentStatus, parados: boolean): string => {
  const query = new URLSearchParams({ status });
  if (parados) query.set('parados', '1');
  return `/?${query.toString()}`;
};

const enlaceSin = (quitar: 'status' | 'parados', status?: ShipmentStatus, parados = false): string => {
  const query = new URLSearchParams();
  if (quitar !== 'status' && status !== undefined) query.set('status', status);
  if (quitar !== 'parados' && parados) query.set('parados', '1');
  const cadena = query.toString();
  return cadena.length === 0 ? '/' : `/?${cadena}`;
};
