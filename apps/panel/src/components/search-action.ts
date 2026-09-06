'use server';

import { redirect } from 'next/navigation';

/**
 * La busqueda sin JavaScript.
 *
 * El buscador de la pantalla es un componente de cliente: sugiere segun se
 * escribe y navega sin recargar. Esta accion es lo que queda debajo si ese
 * JavaScript no ha cargado todavia o ha fallado — el formulario se envia al
 * servidor y la pagina navega igual.
 *
 * No es adorno: la primera pulsacion de Camila puede ocurrir antes de que el
 * navegador termine de hidratar la pagina, y un buscador que se traga esa
 * primera busqueda es un buscador roto para quien lo usa a diario.
 */
export async function buscar(formData: FormData): Promise<void> {
  const guia = String(formData.get('guia') ?? '').trim();
  if (guia.length === 0) redirect('/');
  redirect(`/envios/${encodeURIComponent(guia)}`);
}
