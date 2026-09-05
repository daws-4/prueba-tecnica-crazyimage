'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Mantiene la pantalla al dia sin recargarla.
 *
 * Frase 08 del cliente: *"Camila va a tener el panel abierto toda la jornada,
 * tiene que estar siempre al dia"*.
 *
 * La pieza clave es `router.refresh()`: vuelve a ejecutar el renderizado en el
 * servidor y sustituye el contenido sin perder el estado del navegador —el
 * cursor sigue en el buscador, la pagina no salta—. Y sobre todo, **no duplica
 * la logica de datos**: sigue habiendo un solo sitio que habla con el API, el
 * del servidor. Si esto se hubiera resuelto pidiendo los datos desde el
 * navegador, habria dos caminos distintos para traer lo mismo y dos formas de
 * que se rompan.
 *
 * El intervalo es deliberadamente tranquilo: los lotes entran tres veces al dia,
 * asi que preguntar cada pocos segundos seria gastar por gusto. Se refresca
 * ademas al volver a la pestana, que es cuando de verdad importa: Camila atiende
 * una llamada, vuelve, y lo que ve ya esta actualizado.
 */

const INTERVALO_MS = 30_000;

const horaCorta = (instante: Date): string =>
  instante.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function AutoRefresh(): React.JSX.Element {
  const router = useRouter();
  const [ultima, setUltima] = useState<Date | null>(null);

  useEffect(() => {
    const refrescar = (): void => {
      router.refresh();
      setUltima(new Date());
    };

    const temporizador = setInterval(refrescar, INTERVALO_MS);
    window.addEventListener('focus', refrescar);

    return () => {
      clearInterval(temporizador);
      window.removeEventListener('focus', refrescar);
    };
  }, [router]);

  return (
    <span className="meta">
      {/* Se dice cuando fue la ultima vez. Un panel que se actualiza solo y no lo
          cuenta obliga a desconfiar de el, y desconfiar es justo lo que Camila
          hacia con los tres portales. */}
      {ultima === null ? 'Se actualiza solo cada 30 s' : `Actualizado a las ${horaCorta(ultima)}`}
    </span>
  );
}
