'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import {
  MIN_SEARCH_LENGTH,
  shipmentListResponseSchema,
  type ShipmentSummary,
} from '@andina/contracts';

import { instanteCorto } from '@/lib/tiempo';
import { buscar } from './search-action';
import { StatusBadge } from './status-badge';

/**
 * Buscador por numero de guia, con sugerencias segun se escribe.
 *
 * Antes esto era un formulario sin JavaScript: se escribia la guia entera, se
 * pulsaba Buscar y se navegaba. Funcionaba, pero solo servia si Camila ya sabia
 * la guia exacta — y al telefono casi nunca la sabe entera: se la leen a trozos,
 * la apunta mal, o quiere ver cual de los envios parecidos es el suyo. Una letra
 * de mas devolvia «no hay ningun envio» sin ninguna pista de por que.
 *
 * Ahora consulta mientras se escribe y ofrece las coincidencias con su estado y
 * su ultimo movimiento, de modo que el envio se elige **viendolo**, no
 * adivinandolo.
 *
 * Tres cosas hacen que esto no maltrate al servidor ni a quien escribe:
 *
 * 1. **No se pregunta en cada tecla.** Se espera a que la escritura pare. Quien
 *    teclea «AC-4471» de corrido genera una consulta, no siete.
 * 2. **La consulta anterior se cancela.** Sin esto, una respuesta lenta de
 *    «AC-4» puede llegar despues de la de «AC-4471» y pisar las sugerencias
 *    buenas con las viejas. Es el fallo clasico de los buscadores en vivo y no
 *    se ve hasta que la red va mal.
 * 3. **La respuesta se valida contra el contrato** antes de pintarla, igual que
 *    en el resto del panel.
 *
 * Y una que importa mas de lo que parece: **el formulario sigue siendo un
 * formulario**. La accion de servidor sigue debajo, asi que si el JavaScript no
 * ha cargado todavia, la busqueda funciona igual. Lo que aporta el cliente es la
 * sugerencia, no la capacidad de buscar.
 *
 * Se conserva lo que ya se habia decidido: cada envio tiene URL propia
 * (`/envios/AC-4471`), asi que se puede pegar en un chat, guardar en marcadores
 * y volver con el boton de atras.
 */

/** Lo que se espera a que pare la escritura antes de preguntar. */
const ESPERA_MS = 180;

/** Ninguna sugerencia resaltada. Con teclado se empieza siempre asi. */
const NINGUNA = -1;

export function SearchBox({ defaultValue = '' }: { defaultValue?: string }): React.JSX.Element {
  const router = useRouter();
  const idLista = useId();
  const caja = useRef<HTMLDivElement>(null);

  const [consulta, setConsulta] = useState(defaultValue);
  const [sugerencias, setSugerencias] = useState<readonly ShipmentSummary[]>([]);
  const [resaltada, setResaltada] = useState(NINGUNA);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);

  // Al navegar a otro envio, la caja pasa a mostrar la guia que se esta viendo.
  // El componente no se desmonta al cambiar de pagina, asi que hay que decirselo.
  useEffect(() => {
    setConsulta(defaultValue);
    setAbierto(false);
  }, [defaultValue]);

  useEffect(() => {
    const texto = consulta.trim();
    if (texto.length < MIN_SEARCH_LENGTH) {
      setSugerencias([]);
      setCargando(false);
      return;
    }

    const control = new AbortController();
    const temporizador = setTimeout(() => {
      setCargando(true);
      void (async () => {
        try {
          const respuesta = await fetch(`/api/buscar?q=${encodeURIComponent(texto)}`, {
            signal: control.signal,
          });
          if (!respuesta.ok) throw new Error(`El buscador respondio ${respuesta.status}`);

          const parsed = shipmentListResponseSchema.safeParse(await respuesta.json());
          setSugerencias(parsed.success ? parsed.data.items : []);
          setResaltada(NINGUNA);
        } catch {
          // Una busqueda que falla deja la lista vacia y nada mas. El formulario
          // sigue sirviendo para ir a la guia entera.
          if (!control.signal.aborted) setSugerencias([]);
        } finally {
          if (!control.signal.aborted) setCargando(false);
        }
      })();
    }, ESPERA_MS);

    // Limpiar cancela las dos cosas: la consulta que aun no ha salido y la que
    // ya esta en vuelo. Esto es lo que evita que una respuesta vieja pise a una
    // nueva.
    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [consulta]);

  // Pinchar fuera cierra la lista. Se escucha `pointerdown` y no `blur` porque
  // `blur` se dispara antes del clic sobre la propia sugerencia y la cerraria
  // justo antes de poder elegirla.
  useEffect(() => {
    const alPinchar = (evento: PointerEvent): void => {
      const dentro = caja.current?.contains(evento.target as Node) ?? false;
      if (!dentro) setAbierto(false);
    };
    document.addEventListener('pointerdown', alPinchar);
    return () => document.removeEventListener('pointerdown', alPinchar);
  }, []);

  const abrir = (trackingNumber: string): void => {
    setConsulta(trackingNumber);
    setAbierto(false);
    setResaltada(NINGUNA);
    router.push(`/envios/${encodeURIComponent(trackingNumber)}`);
  };

  const alEnviar = (evento: React.FormEvent<HTMLFormElement>): void => {
    // Con JavaScript vivo se navega en el cliente; la accion de servidor se
    // queda como respaldo para cuando no lo esta.
    evento.preventDefault();
    const elegida = resaltada === NINGUNA ? undefined : sugerencias[resaltada];
    const destino = elegida?.trackingNumber ?? consulta.trim();
    if (destino.length > 0) abrir(destino);
  };

  const alTeclear = (evento: React.KeyboardEvent<HTMLInputElement>): void => {
    if (evento.key === 'Escape') {
      setAbierto(false);
      setResaltada(NINGUNA);
      return;
    }
    if (sugerencias.length === 0) return;

    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setAbierto(true);
      setResaltada((actual) => (actual + 1) % sugerencias.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setAbierto(true);
      setResaltada((actual) => (actual <= 0 ? sugerencias.length - 1 : actual - 1));
    }
  };

  const texto = consulta.trim();
  const desplegado = abierto && texto.length >= MIN_SEARCH_LENGTH;

  return (
    <div className="buscador" ref={caja}>
      <form className="search" action={buscar} onSubmit={alEnviar}>
        <input
          type="search"
          name="guia"
          value={consulta}
          onChange={(evento) => {
            setConsulta(evento.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={alTeclear}
          placeholder="Número de guía, por ejemplo AC-44"
          aria-label="Número de guía"
          autoComplete="off"
          role="combobox"
          aria-expanded={desplegado}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={resaltada === NINGUNA ? undefined : `${idLista}-${resaltada}`}
        />
        <button type="submit">Buscar</button>
      </form>

      {desplegado ? (
        <ul className="sugerencias" id={idLista} role="listbox" aria-label="Envíos que coinciden">
          {sugerencias.map((envio, indice) => (
            <li
              key={envio.trackingNumber}
              id={`${idLista}-${indice}`}
              role="option"
              aria-selected={indice === resaltada}
              data-resaltada={indice === resaltada}
            >
              <button
                type="button"
                onMouseEnter={() => setResaltada(indice)}
                onClick={() => abrir(envio.trackingNumber)}
              >
                <code>{envio.trackingNumber}</code>
                <StatusBadge status={envio.currentStatus} />
                <span className="meta">
                  {instanteCorto(envio.lastEventAt)}
                  {envio.lastLocation !== null ? ` · ${envio.lastLocation.city}` : ''}
                </span>
              </button>
            </li>
          ))}

          {sugerencias.length === 0 ? (
            <li className="meta vacia" aria-live="polite">
              {cargando
                ? 'Buscando…'
                : `Ninguna guía empieza por «${texto}». Se busca por el principio del número, no por un trozo suelto.`}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
