/**
 * El reloj del panel.
 *
 * **Todas las horas de la pantalla se dibujan en una zona horaria fija, y esa
 * zona esta declarada aqui, en un solo sitio.**
 *
 * Hasta ahora cada componente llamaba a `toLocaleString` sin decir en que huso,
 * y eso significa "el huso del proceso que formatea". El panel se renderiza en
 * el servidor, asi que el huso que mandaba era el del contenedor —UTC— y no el
 * de quien miraba la pantalla: un evento de las 16:05 en Caracas salia como
 * "16:05" pero era la hora de Greenwich, no la de nadie de la oficina.
 *
 * Se fija en el codigo y no en una variable de entorno a proposito. Una parte
 * de estas horas las pinta el servidor y otra el navegador (`AutoRefresh`), y
 * una variable de entorno solo llega a la primera: el panel acabaria mostrando
 * dos relojes distintos en la misma pantalla. Ademas, que Camila y sus
 * companeros lean todos la misma hora al hablar por telefono es una decision de
 * producto, no de despliegue. Cambiarla es cambiar esta linea.
 *
 * Andina opera Colombia y Venezuela. Si el equipo decide que la referencia es
 * Bogota, aqui se pone `America/Bogota` y `Bogotá (UTC−5)`, y toda la pantalla
 * cambia con ello.
 */
export const ZONA_HORARIA = 'America/Caracas';

/** Se muestra en pantalla: una hora sin huso es una hora que se puede malinterpretar. */
export const ETIQUETA_ZONA = 'Caracas (UTC−4)';

// Los formateadores se construyen una vez y no en cada llamada: crear un
// `Intl.DateTimeFormat` es caro, y el listado lo llamaria cincuenta veces por
// renderizado.
const LARGA = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_HORARIA,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const CORTA = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_HORARIA,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_HORARIA,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Fecha completa: la que encabeza cada punto de la linea de tiempo. */
export const fechaLarga = (instante: string | Date): string => LARGA.format(new Date(instante));

/** Dia y hora sin ano: cabe en una celda de la tabla del listado. */
export const instanteCorto = (instante: string | Date): string => CORTA.format(new Date(instante));

/**
 * Hora con segundos.
 *
 * Los segundos importan aqui y solo aqui: es la hora a la que un evento **entro
 * en nuestro sistema**, y dos lotes del mismo dia pueden entrar con segundos de
 * diferencia. No confundir con la hora a la que el evento ocurrio, que RutaSur
 * informa solo al minuto.
 */
export const horaConSegundos = (instante: string | Date): string => HORA.format(new Date(instante));
