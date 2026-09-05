import { andesPayload, rutasurPayload, transbolivarPayload } from '../seed/payloads';

/**
 * Escenarios de demostracion, uno por caso.
 *
 * El enunciado dice que con cuatro casos bien elegidos se dice mas que con
 * cuarenta. Las pruebas unitarias cubren la normalizacion en memoria; esto es
 * lo otro: seis situaciones que un evaluador puede **cargar de una en una** y
 * ver el efecto en el panel, con datos entrando por el mismo endpoint que
 * usarian los transportistas.
 *
 * El reparto es deliberado: un caso corriente que sirve de referencia, tres
 * casos limite —que son las tres trampas del enunciado— y dos con los tres
 * transportistas metidos en el mismo envio, que es donde el sistema tiene que
 * demostrar que de verdad los ha unificado.
 *
 * No hay escenarios con un cuarto transportista: hoy no existe adaptador para
 * ninguno, asi que un caso asi solo demostraria que el API devuelve 404. Cuando
 * llegue en enero, su escenario se anade aqui igual que su adaptador.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Un lote tal y como lo mandaria un transportista. */
export interface Lote {
  readonly carrierId: string;
  /** Que hace este lote, para narrarlo mientras se ejecuta. */
  readonly narra: string;
  readonly eventos: readonly unknown[];
}

export interface Escenario {
  readonly nombre: string;
  readonly grupo: 'tipico' | 'limite' | 'tres-transportistas';
  readonly titulo: string;
  /** Que hay que mirar despues de ejecutarlo. */
  readonly queDemuestra: string;
  readonly guia: string;
  readonly construir: (ahora: number) => readonly Lote[];
}

export const ESCENARIOS: readonly Escenario[] = [
  // ---------------------------------------------------------------- tipico --
  {
    nombre: 'tipico',
    grupo: 'tipico',
    titulo: 'Un envio corriente, sin sorpresas',
    queDemuestra:
      'La referencia contra la que comparar todo lo demas: eventos en orden, un solo transportista, estado final entregado.',
    guia: 'AC-9101',
    construir: (ahora) => [
      {
        carrierId: 'andes-express',
        narra: 'Andes recoge, mueve y entrega. Todo en orden y a su hora.',
        eventos: [
          andesPayload({ trackingNumber: 'AC-9101', status: 'RECOGIDO', at: new Date(ahora - 2 * DAY), city: 'Bogota' }),
          andesPayload({ trackingNumber: 'AC-9101', status: 'EN_TRANSITO', at: new Date(ahora - 30 * HOUR), city: 'Bucaramanga' }),
          andesPayload({ trackingNumber: 'AC-9101', status: 'EN_REPARTO', at: new Date(ahora - 6 * HOUR), city: 'Cucuta' }),
          andesPayload({ trackingNumber: 'AC-9101', status: 'ENTREGADO', at: new Date(ahora - 4 * HOUR), city: 'Cucuta' }),
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- limite --
  {
    nombre: 'desorden',
    grupo: 'limite',
    titulo: 'Un lote atrasado no puede hacer retroceder el estado',
    queDemuestra:
      'El ultimo aviso recibido dice en reparto y el envio sigue ENTREGADO. Los dos van marcados en la linea de tiempo. Es la frase 05 del cliente.',
    guia: 'AC-9102',
    construir: (ahora) => [
      {
        carrierId: 'andes-express',
        narra: 'Andes reporta la recogida y, mas tarde, la entrega.',
        eventos: [
          andesPayload({ trackingNumber: 'AC-9102', status: 'RECOGIDO', at: new Date(ahora - 2 * DAY), city: 'Bogota' }),
          andesPayload({ trackingNumber: 'AC-9102', status: 'ENTREGADO', at: new Date(ahora - 3 * HOUR), city: 'Maracaibo' }),
        ],
      },
      {
        carrierId: 'rutasur',
        narra: 'RutaSur llega AHORA con un en-reparto que ocurrio ANTES de la entrega: es el ultimo en llegar y no es el mas reciente.',
        eventos: [
          rutasurPayload({ trackingNumber: 'AC-9102', status: 'EnReparto', at: new Date(ahora - 5 * HOUR), place: 'Maracaibo' }),
        ],
      },
    ],
  },
  {
    nombre: 'reenvio',
    grupo: 'limite',
    titulo: 'El mismo lote dos veces, y un campo que no conocemos',
    queDemuestra:
      'La segunda vez: 0 nuevos y 2 reenvios. La cuenta de eventos del envio no se mueve y cada evento marca recibido 2 veces. El campo desconocido se ignora sin ruido.',
    guia: 'AC-9103',
    construir: (ahora) => {
      const lote = [
        andesPayload({ trackingNumber: 'AC-9103', status: 'RECOGIDO', at: new Date(ahora - 20 * HOUR), city: 'Bogota' }),
        andesPayload({ trackingNumber: 'AC-9103', status: 'EN_TRANSITO', at: new Date(ahora - 8 * HOUR), city: 'Cucuta' }),
      ];
      return [
        { carrierId: 'andes-express', narra: 'Primer envio del lote.', eventos: lote },
        {
          carrierId: 'andes-express',
          narra: 'El MISMO lote otra vez, con un campo nuevo que nadie nos anuncio.',
          eventos: lote.map((evento) => ({ ...evento, id_interno_v2: 'X-99', reintento: true })),
        },
      ];
    },
  },
  {
    nombre: 'fechas',
    grupo: 'limite',
    titulo: 'Fechas imposibles y estados que no conocemos',
    queDemuestra:
      'Un evento bueno entra y cuatro malos van a cuarentena, cada uno con su motivo. El lote no se pierde entero por culpa de uno: exito parcial.',
    guia: 'AC-9104',
    construir: (ahora) => [
      {
        carrierId: 'andes-express',
        narra: 'Un evento valido y dos imposibles en el mismo lote.',
        eventos: [
          andesPayload({ trackingNumber: 'AC-9104', status: 'RECOGIDO', at: new Date(ahora - 10 * HOUR), city: 'Bogota' }),
          // Fechado manana: clavaria el estado del envio para siempre.
          andesPayload({ trackingNumber: 'AC-9104', status: 'ENTREGADO', at: new Date(ahora + DAY), city: 'Cucuta' }),
          // Estado que el vocabulario no conoce: no se adivina.
          andesPayload({ trackingNumber: 'AC-9104', status: 'DEVUELTO_AL_REMITENTE', at: new Date(ahora - 5 * HOUR), city: 'Cucuta' }),
        ],
      },
      {
        carrierId: 'transbolivar',
        narra: 'El ejemplo literal del enunciado: su epoch cae en 2025, un ano antes que el resto.',
        eventos: [
          {
            tracking_number: 'AC-9104',
            status: { code: 3, label: 'in transit' },
            occurred_at: 1_756_563_730,
            location: { city: 'Cucuta', country: 'CO' },
          },
        ],
      },
      {
        carrierId: 'rutasur',
        narra: 'Una fecha que no existe en el calendario.',
        eventos: [{ guia: 'AC-9104', estado: 'EnRuta', fecha: '31/02/2026 10:22', lugar: 'Cucuta' }],
      },
    ],
  },

  // --------------------------------------------------- tres transportistas --
  {
    nombre: 'tres-coinciden',
    grupo: 'tres-transportistas',
    titulo: 'Los tres informan del mismo momento',
    queDemuestra:
      'Tres eventos, no uno. Mismo envio, mismo minuto, mismo estado, y aun asi no se fusionan: dos fuentes independientes coincidiendo son una confirmacion, no ruido.',
    guia: 'AC-9105',
    construir: (ahora) => {
      // El MISMO instante real, escrito en los tres formatos y en dos relojes.
      const instante = new Date(Math.floor((ahora - 7 * HOUR) / MINUTE) * MINUTE);
      return [
        {
          carrierId: 'andes-express',
          narra: 'Andes lo escribe en ISO-8601 con Z.',
          eventos: [andesPayload({ trackingNumber: 'AC-9105', status: 'EN_TRANSITO', at: instante, city: 'Cucuta' })],
        },
        {
          carrierId: 'transbolivar',
          narra: 'TransBolivar, el mismo instante en epoch y con el estado por codigo.',
          eventos: [
            transbolivarPayload({
              trackingNumber: 'AC-9105',
              statusCode: 3,
              statusLabel: 'in transit',
              at: instante,
              city: 'Cucuta',
              country: 'CO',
            }),
          ],
        },
        {
          carrierId: 'rutasur',
          narra: 'RutaSur, el mismo instante en su reloj de Venezuela: cuatro horas antes y sin decirlo.',
          eventos: [rutasurPayload({ trackingNumber: 'AC-9105', status: 'EnRuta', at: instante, place: 'Cucuta' })],
        },
      ];
    },
  },
  {
    nombre: 'tres-relevo',
    grupo: 'tres-transportistas',
    titulo: 'Un envio que cambia de manos y cruza la frontera',
    queDemuestra:
      'Tres formatos y dos husos horarios en una sola linea de tiempo coherente y ordenada. Es el corazon del ejercicio: el tipo de un evento no depende de quien lo mando.',
    guia: 'AC-9106',
    construir: (ahora) => [
      {
        carrierId: 'rutasur',
        narra: 'RutaSur recoge en Venezuela y sella en su hora local, UTC-4, sin declararlo.',
        eventos: [
          rutasurPayload({ trackingNumber: 'AC-9106', status: 'Recogido', at: new Date(ahora - 3 * DAY), place: 'Maracaibo' }),
          rutasurPayload({ trackingNumber: 'AC-9106', status: 'EnRuta', at: new Date(ahora - 2 * DAY), place: 'San Cristobal' }),
        ],
      },
      {
        carrierId: 'andes-express',
        narra: 'Andes lo recoge en la frontera y lo mueve por Colombia, en UTC.',
        eventos: [
          andesPayload({ trackingNumber: 'AC-9106', status: 'EN_TRANSITO', at: new Date(ahora - 40 * HOUR), city: 'Cucuta' }),
          andesPayload({ trackingNumber: 'AC-9106', status: 'EN_REPARTO', at: new Date(ahora - 9 * HOUR), city: 'Bucaramanga' }),
        ],
      },
      {
        carrierId: 'transbolivar',
        narra: 'TransBolivar cierra la entrega, en epoch y con codigo numerico.',
        eventos: [
          transbolivarPayload({
            trackingNumber: 'AC-9106',
            statusCode: 5,
            statusLabel: 'delivered',
            at: new Date(ahora - 5 * HOUR),
            city: 'Bucaramanga',
            country: 'CO',
          }),
        ],
      },
    ],
  },
];

export const buscarEscenario = (nombre: string): Escenario | undefined =>
  ESCENARIOS.find((e) => e.nombre === nombre);
