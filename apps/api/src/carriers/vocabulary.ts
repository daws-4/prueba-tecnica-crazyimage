import type { ShipmentStatus } from '@andina/contracts';

/**
 * El VOCABULARIO de un transportista: la parte que es dato, no codigo.
 *
 * Decision A+ (ver docs/planeacion_ia.md §1.6): la gramatica es codigo y el
 * vocabulario es dato. Todo lo que hay aqui esta pensado para editarse desde el
 * panel, sin despliegue, porque cambia varias veces al ano y quien sabe hacerlo
 * bien es atencion al cliente, no un programador.
 *
 * OJO, estado actual: esa pantalla NO existe todavia. Hoy el vocabulario se lee
 * de la semilla de mas abajo y cambiarlo exige desplegar. Lo que si esta hecho
 * es la separacion: el vocabulario no vive dentro del adaptador, viaja como
 * parametro al normalizador. Para pasarlo a una tabla, el unico punto que hay
 * que tocar es `IngestionService.vocabularyFor()`.
 */
export interface CarrierVocabulary {
  readonly carrierId: string;
  readonly displayName: string;

  /**
   * Desfase del reloj del transportista respecto a UTC, en minutos.
   *
   * Solo se usa si su adaptador entrega instantes `localNaive`. Es el reloj
   * **del transportista**, no el de la ciudad del evento: RutaSur sella en hora
   * de Venezuela un evento ocurrido en Cucuta, que esta en Colombia (§3.2).
   *
   * Al ser un desfase fijo y no una zona horaria, no hace falta base de datos de
   * husos ni existen horas ambiguas: ni Colombia ni Venezuela aplican horario de
   * verano. Limite conocido: un transportista futuro en un pais que si lo aplique
   * obligaria a cambiar esto por una zona con nombre.
   */
  readonly utcOffsetMinutes: number;

  /**
   * Traduccion de su valor de estado al canonico de Andina.
   *
   * Un valor que no este aqui **no se adivina**: el evento va a cuarentena con
   * el motivo `unknown_status`, que es exactamente el aviso que necesita
   * atencion al cliente para anadir la traduccion que falta y reprocesar.
   */
  readonly statusMap: Readonly<Record<string, ShipmentStatus>>;

  /** Umbral de cordura hacia el futuro (§3.6). */
  readonly futureToleranceMinutes: number;
  /** Umbral de cordura hacia el pasado (§3.6). */
  readonly pastToleranceDays: number;
}

/** Valores por defecto de los umbrales. Se pueden ajustar por transportista. */
const DEFAULT_FUTURE_TOLERANCE_MINUTES = 15;
const DEFAULT_PAST_TOLERANCE_DAYS = 90;

/**
 * Vocabulario inicial de los tres transportistas. Esta pensado como la SEMILLA
 * de una tabla editable, pero mientras esa tabla no exista es la fuente de
 * verdad en ejecucion: lo que se cambie aqui solo se aplica al desplegar.
 *
 * Aviso honesto: de los tres formatos el enunciado solo documenta un valor de
 * estado de cada uno (`EN_TRANSITO`, el codigo `3`, `EnRuta`). El resto son
 * suposiciones razonables. Y eso no es un problema del diseno, es justo el caso
 * para el que esta pensado: si una suposicion esta mal, el evento no se traduce
 * mal en silencio, cae en cuarentena con su motivo y se corrige desde el panel.
 */
export const DEFAULT_VOCABULARIES: readonly CarrierVocabulary[] = [
  {
    carrierId: 'andes-express',
    displayName: 'Andes Express',
    utcOffsetMinutes: 0, // manda ISO con Z; el desfase no se usa
    statusMap: {
      RECOGIDO: 'recogido',
      EN_TRANSITO: 'en_transito',
      EN_REPARTO: 'en_reparto',
      INCIDENCIA: 'incidencia',
      ENTREGADO: 'entregado',
    },
    futureToleranceMinutes: DEFAULT_FUTURE_TOLERANCE_MINUTES,
    pastToleranceDays: DEFAULT_PAST_TOLERANCE_DAYS,
  },
  {
    carrierId: 'transbolivar',
    displayName: 'TransBolívar',
    utcOffsetMinutes: 0, // manda epoch; el epoch ya es UTC
    // Se traduce por CODIGO y no por `label`: el codigo es el identificador
    // estable, la etiqueta es texto para humanos y puede cambiar de redaccion
    // sin cambiar de significado.
    statusMap: {
      '1': 'recogido',
      '3': 'en_transito',
      '4': 'en_reparto',
      '5': 'entregado',
      '9': 'incidencia',
    },
    futureToleranceMinutes: DEFAULT_FUTURE_TOLERANCE_MINUTES,
    pastToleranceDays: DEFAULT_PAST_TOLERANCE_DAYS,
  },
  {
    carrierId: 'rutasur',
    displayName: 'RutaSur',
    // UTC-4, el reloj de Venezuela. Es la asuncion de §3.2 y es una inferencia
    // sobre UNA sola muestra del enunciado: `10:22` cuadra con las `14:22:10Z`
    // de Andes para el mismo envio en la misma ciudad. Por eso vive aqui, en un
    // solo sitio y a la vista, y no incrustada en el adaptador: el dia que la
    // muestra demuestre que es otro huso, se corrige aqui y solo aqui.
    utcOffsetMinutes: -240,
    statusMap: {
      Recogido: 'recogido',
      EnRuta: 'en_transito',
      EnReparto: 'en_reparto',
      Incidencia: 'incidencia',
      Entregado: 'entregado',
    },
    futureToleranceMinutes: DEFAULT_FUTURE_TOLERANCE_MINUTES,
    pastToleranceDays: DEFAULT_PAST_TOLERANCE_DAYS,
  },
];
