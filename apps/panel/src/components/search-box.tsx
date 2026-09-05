import { redirect } from 'next/navigation';

/**
 * Buscador por numero de guia.
 *
 * Es un formulario del servidor, sin JavaScript de por medio: busca, navega a
 * `/envios/AC-4471` y ya esta. Que el resultado tenga URL propia no es un
 * detalle tecnico, es una funcionalidad — Camila puede pegarle el enlace a un
 * companero, guardarlo, o usar el boton de atras del navegador. Un buscador que
 * deja la URL quieta obliga a repetir la busqueda cada vez.
 */
async function buscar(formData: FormData): Promise<void> {
  'use server';
  const guia = String(formData.get('guia') ?? '').trim();
  if (guia.length === 0) redirect('/');
  redirect(`/envios/${encodeURIComponent(guia)}`);
}

export function SearchBox({ defaultValue = '' }: { defaultValue?: string }): React.JSX.Element {
  return (
    <form className="search" action={buscar}>
      <input
        type="search"
        name="guia"
        defaultValue={defaultValue}
        placeholder="Numero de guia, por ejemplo AC-4471"
        aria-label="Numero de guia"
      />
      <button type="submit">Buscar</button>
    </form>
  );
}
