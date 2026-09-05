import Link from 'next/link';
import {
  DEFAULT_PAGE_SIZE,
  isShipmentPageSize,
  SHIPMENT_PAGE_SIZES,
  SHIPMENT_STATUSES,
  type ShipmentPageSize,
  type ShipmentStatus,
} from '@andina/contracts';

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
 * **Todo el estado de la vista vive en la URL**: filtros, tamano de pagina y
 * posicion. Asi una vista concreta ("los parados de mas de 48 horas, de cincuenta
 * en cincuenta") es un enlace que se puede guardar o mandar por chat, el boton de
 * atras del navegador funciona, y no hace falta ni una linea de JavaScript en el
 * cliente para que todo esto ande.
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

/** El tamano de pagina de la URL, si es uno de los que ofrecemos. */
const leerTamano = (valor: string | undefined): ShipmentPageSize => {
  const numero = Number(valor);
  return Number.isInteger(numero) && isShipmentPageSize(numero) ? numero : DEFAULT_PAGE_SIZE;
};

interface Vista {
  readonly status?: ShipmentStatus | undefined;
  readonly parados: boolean;
  readonly limit: ShipmentPageSize;
  readonly cursor?: string | undefined;
}

/**
 * Un unico constructor de enlaces, en vez de uno por control.
 *
 * Cada enlace de la pantalla es "la vista de ahora, con esto cambiado". Antes
 * habia tres funciones que armaban la URL a trozos y cada control nuevo obligaba
 * a tocar las tres; con un solo sitio, anadir un parametro es anadirlo aqui.
 *
 * Cambiar de filtro o de tamano **vuelve a la primera pagina**: el cursor apunta
 * a una posicion dentro de un listado concreto y no significa lo mismo cuando el
 * listado cambia.
 */
const enlace = (vista: Vista, cambios: Partial<Vista> & { readonly cursor?: string }): string => {
  const siguiente: Vista = { ...vista, cursor: undefined, ...cambios };
  const query = new URLSearchParams();

  if (siguiente.status !== undefined) query.set('status', siguiente.status);
  if (siguiente.parados) query.set('parados', '1');
  if (siguiente.limit !== DEFAULT_PAGE_SIZE) query.set('limit', String(siguiente.limit));
  if (siguiente.cursor !== undefined) query.set('cursor', siguiente.cursor);

  const cadena = query.toString();
  return cadena.length === 0 ? '/' : `/?${cadena}`;
};

interface SearchParams {
  readonly status?: string;
  readonly parados?: string;
  readonly limit?: string;
  readonly cursor?: string;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;

  const vista: Vista = {
    status: esEstado(params.status) ? params.status : undefined,
    parados: params.parados === '1',
    limit: leerTamano(params.limit),
    cursor: params.cursor,
  };

  const { items, nextCursor } = await listShipments({
    ...(vista.status !== undefined ? { status: vista.status } : {}),
    ...(vista.parados ? { stalledForHours: HORAS_PARADO } : {}),
    ...(vista.cursor !== undefined ? { cursor: vista.cursor } : {}),
    limit: vista.limit,
  });

  return (
    <>
      <SearchBox />

      <div className="filtros">
        <Link href={enlace(vista, { status: undefined, parados: false })} data-activo={vista.status === undefined && !vista.parados}>
          Todos
        </Link>

        {/* El filtro que de verdad cambia el dia de Camila. Los otros dicen en
            que punto esta cada envio; este dice cuales van a generar una
            llamada. */}
        <Link href={enlace(vista, { parados: !vista.parados })} data-activo={vista.parados}>
          Parados más de {HORAS_PARADO} h
        </Link>

        {SHIPMENT_STATUSES.map((valor) => (
          <Link
            key={valor}
            href={enlace(vista, { status: vista.status === valor ? undefined : valor })}
            data-activo={vista.status === valor}
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

      <div className="paginacion">
        <span className="meta tamanos">
          Mostrar
          {SHIPMENT_PAGE_SIZES.map((tamano) => (
            <Link
              key={tamano}
              href={enlace(vista, { limit: tamano })}
              data-activo={vista.limit === tamano}
              aria-current={vista.limit === tamano ? 'page' : undefined}
            >
              {tamano}
            </Link>
          ))}
          por página
        </span>

        {/* Cursor y no numero de pagina: con dos millones de eventos, saltarse
            cincuenta mil filas cuesta cada vez mas, y un lote que entra entre dos
            peticiones descolocaria las paginas. El precio es que no hay "pagina
            anterior" sin guardar los cursores ya vistos, y no compensa. */}
        {nextCursor !== null ? (
          <Link href={enlace(vista, { cursor: nextCursor })}>Ver más envíos →</Link>
        ) : (
          <span className="meta">No hay más envíos</span>
        )}
      </div>
    </>
  );
}
