# Planeación asistida — registro de debates

Documento de trabajo. Aquí se van respondiendo, una por una, las preguntas que plantea
el desarrollo. Complementa a `planeacion.md`, que son notas personales del autor y **no
se modifica desde aquí**.

Convención: cada bloque `P0X` es una pregunta debatida. Al final de cada bloque queda
marcado si cierra alguno de los *puntos abiertos* del encuadre interno o si solo aporta
contexto.

---

## Índice

| # | Pregunta | Estado |
|---|---|---|
| P01 | Los tres formatos de entrada y cómo entra el cuarto transportista | **Cerrada — decisión: A+** |
| P02 | Dónde vive el histórico: Postgres, Mongo o las dos | **Cerrada — MongoDB sola** |
| P03 | Qué es «el mismo evento» y en qué instante ocurrió | **Cerrada — clave natural de 4 campos, UTC−4, truncado al minuto** |
| P04 | Cómo comparten los tipos el panel y el API | **Cerrada — paquete interno con Zod, tipo derivado** |
| P05 | Espacio de trabajo y entorno de ejecución | **Cerrada — npm workspaces + compose de dos servicios** |
| P06 | Semántica del endpoint de ingesta | **Cerrada — síncrono, 200 con informe** |
| P07 | Lo que apareció al escribir las pruebas de normalización | Notas, no decisión |

---

## Resumen de lo decidido

Para releer dentro de dos semanas sin tener que recorrer el debate entero. Cada punto
enlaza con la sección que lo argumenta.

### La decisión

**A+ — un adaptador en código por transportista, con el vocabulario como dato editable
desde el panel.** (§1.6)

> **La gramática es código. El vocabulario es dato.**

| | Qué incluye | Dónde vive | Quién lo cambia |
|---|---|---|---|
| **Gramática** | estructura del payload, rutas de los campos, formato de la fecha | un adaptador `.ts` por transportista, en el repositorio | programador, con despliegue |
| **Vocabulario** | valores de estado y su traducción, zona horaria, nombre, activo | una tabla, editable en el panel | atención al cliente, al momento |

### Por qué, en orden de peso

1. **Frecuencia.** Una tarea que haces dos veces al año es una tarea que nunca aprendes.
   Dar de alta un transportista pasa 1–2 veces al año → va donde hay manos entrenadas, que
   es el repositorio. Traducir un estado nuevo pasa varias veces al año y lo sabe hacer
   mejor atención al cliente → va al panel. (§1.6)
2. **Responsabilidad.** Configurar un huso horario mal produce respuestas erróneas al
   cliente. Esa decisión no se traslada a quien no puede evaluar el riesgo ni deshacerlo.
3. **El equipo existe.** El encargo dice que dos personas mantendrán esto. Un despliegue al
   año no es un problema para un equipo que existe; sí lo sería heredar un motor genérico
   que no escribieron.
4. **Presupuesto.** ~2 h frente a ~4 h (opción C) y >15 h (mapeador visual), sobre un total
   de ~9 h. Las horas liberadas van a lo que más puntúa: robustez de ingesta y
   `DECISIONS.md`.

### Qué se sacrifica, dicho sin maquillar

**El cuarto transportista cuesta un día de desarrollo y un despliegue.** No hay formulario
que lo evite. Lo que sí se garantiza es que su llegada no rompa nada de lo que ya
funcionaba, que lo que no se entienda quede visible en cuarentena en vez de perderse, y que
el crudo esté guardado para reprocesar en cuanto el adaptador esté listo.

### Alternativas descartadas y su motivo en una línea

| Alternativa | Motivo del rechazo |
|---|---|
| **A puro** (todo en código, sin vocabulario editable) | El incidente frecuente —estado desconocido— exigiría un despliegue, y eso vuelve a bloquear a atención al cliente esperando a desarrollo. |
| **B** (perfil declarativo en base de datos) | Promete que todos los transportistas futuros entran por formulario, y es una promesa que no se puede sostener. Su techo obliga a tocar el motor compartido por los cuatro. (§1.4) |
| **C** (híbrido declarativo + puerta de escape) | Buena, pero su ventaja —cero despliegue en enero— solo vale si no hay programador disponible, y el encargo dice que sí lo habrá. Cuesta el doble y es la más difícil de heredar. (§1.4, §1.5) |
| **Mapeador visual** (niveles 1–3) | Herramienta potente para una tarea que se hace dos veces al año; >15 h de trabajo; empeora la herencia. Archivado como *"qué haría con una semana más"*. (§1.7) |
| **Código escrito por el usuario en el panel** | Ejecución de código arbitrario, y ese código no tendría control de versiones, revisión, pruebas ni vuelta atrás. (§1.7) |

### Decisiones menores que ya están tomadas

- **El evento canónico** lleva `precision: 'second' | 'minute'` porque RutaSur informa al
  minuto, y `raw` siempre, porque es lo que permite reprocesar. (§1.3)
- **La zona horaria pertenece al reloj del transportista, no a la ciudad del evento.**
  Verificado con el dato del enunciado: RutaSur sella en hora venezolana un evento ocurrido
  en Colombia. (§1.1)
- **Tres casos distintos de "dato que no encaja"**, con tres respuestas: campo extra → se
  ignora; campo obligatorio ausente → cuarentena; valor desconocido de campo conocido →
  cuarentena. Ignorar no es lo mismo que perder. (§1.4)
- **El fallo peligroso no es el que falla, es el que funciona y miente** (una fecha `MM/DD`
  leída como `DD/MM`). De ahí la vista previa antes de guardar y el rechazo a cualquier
  análisis "inteligente" de fechas. (§1.4)
- **El objetivo de diseño no es cubrir el futuro, es abaratar el fallo.** El espacio de
  formatos posibles es infinito y lo inventan terceros; lo que se puede controlar es que la
  sorpresa sea acotada, visible y barata de arreglar. (§1.4)
- **Regla de tres para hacer crecer el código compartido:** una utilidad no se generaliza
  porque un transportista la necesite, sino cuando la necesita el tercero. (§1.4)

---

## P01 · Los tres formatos que llegan

### 1.1 Qué diverge exactamente

No son tres formatos: son **siete ejes de divergencia** que casualmente hoy tienen tres combinaciones. Verlo así es lo que permite que el cuarto transportista no duela.

| Eje | Andes Express | TransBolívar | RutaSur |
|---|---|---|---|
| Nombre de la guía | `guia` | `tracking_number` | `guia` |
| Forma del objeto | plano | anidado (`status.code`, `location.city`) | plano |
| Estado: tipo | string MAYÚSCULAS | código numérico (+ etiqueta en inglés) | string PascalCase |
| Fecha: representación | ISO-8601 con `Z` | epoch en segundos | `DD/MM/YYYY HH:mm` |
| Fecha: zona horaria | explícita (UTC) | implícita (epoch = UTC) | **ausente** |
| Granularidad temporal | segundos | segundos | **minutos** |
| Ubicación | `ciudad` | `location.city` + `location.country` | `lugar` |

Un cuarto transportista en enero no traerá un eje nuevo con alta probabilidad: traerá
**otra combinación de estos mismos ejes** (por ejemplo: estado por código alfanumérico
`IT`/`DL`, fecha `MM-DD-YYYY` con desfase explícito `-05:00`, ciudad y país en un único
campo `"Cúcuta, CO"`). La pregunta de diseño real es: *¿esa combinación nueva es código o
es dato?*

Ese es el eje sobre el que se separan las tres opciones.

**Nota sobre el corredor CO/VE.** La operación cruza la frontera Cúcuta–San Cristóbal, que
se pasa a pie y separa dos husos: Colombia es UTC−5 y Venezuela UTC−4. Eso obliga a fijar
una regla antes de escribir una línea de código:

> La zona horaria pertenece **al reloj del transportista**, no a la ciudad del evento.

El dato del enunciado lo confirma: RutaSur informa `10:22` para un evento en Cúcuta cuyo
instante real es `14:22 UTC`. En hora local de Cúcuta eso serían las `09:22`; las `10:22`
solo cuadran con UTC−4, es decir, con el huso venezolano. RutaSur sella con su propio reloj
aunque el paquete esté del lado colombiano.

Consecuencia de diseño: la zona horaria es **un campo del perfil del transportista**, no una búsqueda derivada de la ciudad. Deducirla del `lugar` habría dado una hora equivocada en este mismo ejemplo, y el error sería de una hora — suficiente para desordenar la línea de tiempo cuando dos transportistas reportan el mismo paquete en el mismo cruce, y demasiado pequeño para que nadie lo note hasta que Camila dé una respuesta mal.

### 1.2 Qué NO se decide en esta pregunta

Para no mezclar debates, estos puntos quedan explícitamente fuera y se tratan aparte:

- Clave de deduplicación / identidad del evento.
- Semántica del endpoint de ingesta (síncrono vs. `202 Accepted`).
- Qué motor de base de datos guarda qué.
- Qué se hace con el evento que no se puede interpretar (aquí solo se apunta *dónde* cae).

Lo que sí queda condicionado por esta decisión: **la zona horaria asumida para RutaSur** deja de ser una constante en el código y pasa a ser un campo del perfil del transportista en las opciones B y C. Eso cambia la naturaleza de esa decisión: de "asunción enterrada" a "asunción visible y editable por quien opera".

### 1.3 El destino común: el evento canónico

Las tres opciones producen exactamente lo mismo. Esto no se negocia: es la frase 02 del cliente y el requisito *"que el tipo de un evento normalizado no dependa de quién lo mandó"*.

```ts
type ShipmentEvent = {
  trackingNumber: string;      // "AC-4471"
  status: CanonicalStatus;     // 'picked_up' | 'in_transit' | 'out_for_delivery' | 'incident' | 'delivered'
  occurredAt: Date;            // siempre UTC, siempre absoluto
  precision: 'second' | 'minute';  // RutaSur pierde los segundos: hay que saberlo
  city: string | null;
  country: string | null;      // solo TransBolívar lo aporta hoy
  carrierId: string;
  raw: unknown;                // el payload original, intacto (ver planeacion.md, punto 1)
};
```

Dos campos son decisiones ya tomadas dentro de este tipo:

- **`precision`**: RutaSur informa al minuto. Guardar `10:22:00` y tratarlo como si fuera
  igual de fiable que `14:22:10` es mentir en el ordenamiento de la línea de tiempo. El
  campo permite desempatar y, más adelante, explicar en el panel por qué dos eventos del
  mismo minuto aparecen en cierto orden.
- **`raw`**: el crudo se guarda siempre. Es lo que permite reprocesar cuando se corrige un
  mapeo, y es la red de seguridad del punto 1 de las notas personales.

### 1.4 Las opciones consideradas

#### Glosario previo: "declarativo" y "manejador propio"

Los dos términos aparecen constantemente a partir de aquí. Son dos respuestas a la misma
pregunta —*¿cómo se convierte el JSON de este transportista en un `ShipmentEvent`?*— y se
diferencian en **dónde vive esa respuesta**: en una fila de la base de datos, o en un
archivo `.ts`.

**Declarativo = la conversión es un dato.** Describe *qué* hay, no *cómo* obtenerlo. Para
RutaSur la respuesta completa cabe en un objeto:

```jsonc
{
  "id": "ruta-sur",
  "fieldMap": { "trackingNumber": "guia", "status": "estado",
                "occurredAt": "fecha", "city": "lugar" },
  "dateStrategy": { "kind": "pattern", "pattern": "DD/MM/YYYY HH:mm",
                    "timezone": "America/Caracas" },
  "statusMap": { "Recogido": "picked_up", "EnRuta": "in_transit",
                 "Entregado": "delivered" }
}
```

Ahí no hay instrucciones, solo hechos: *la guía está en `guia`, la fecha viene con este
patrón y en este huso, `EnRuta` significa `in_transit`*. Nadie dice cómo partir la cadena
de la fecha ni cómo recorrer el objeto.

El *cómo* existe, pero está escrito **una sola vez** en un motor genérico que no sabe nada
de RutaSur:

```ts
function normalize(raw: unknown, profile: DeclarativeProfile): Result<ShipmentEvent, ParseError> {
  const rawStatus  = getPath(raw, profile.fieldMap.status);        // "EnRuta"
  const status     = profile.statusMap[String(rawStatus)];         // "in_transit"
  const occurredAt = parseDate(getPath(raw, profile.fieldMap.occurredAt), profile.dateStrategy);
  // ...
}
```

Ese motor sirve para los tres transportistas de hoy y para el cuarto de enero; lo único que
cambia entre ellos es la fila de configuración. Por eso el alta cabe en un formulario del
panel. **Declarativo no significa "sin código"**: significa que el código es genérico y lo
que varía por transportista es dato.

**Manejador propio = la conversión es código.** Una función escrita a mano para ese
transportista y solo para ese:

```ts
export const rutaSurHandler: CarrierAdapter = {
  carrierId: 'ruta-sur',
  parse(raw) {
    const input = rutaSurSchema.parse(raw);
    const [d, m, y] = input.fecha.split(' ')[0].split('/');
    // ...lo que haga falta, sin límite de expresividad
    return ok({ trackingNumber: input.guia, /* ... */ });
  },
};
```

Aquí no hay configuración que interpretar: hay instrucciones. Puede hacer cualquier cosa,
porque es un programa normal. El precio es que vive en el repositorio, y cambiarlo exige
editar, revisar y desplegar.

**La analogía:** un mando universal frente a un mando de fábrica. Al universal le tecleas
el código de tu televisor —eso es el perfil declarativo— y funciona sin abrirlo, pero solo
con aparatos que hablen alguno de los protocolos que ya conoce. Si compras uno con un
protocolo raro, no hay código que teclear: hace falta un mando hecho para él.

**Cuándo se rompe el declarativo.** Esto es lo que justifica que exista la segunda vía. El
perfil solo sabe hacer *"coge el valor de esta ruta y tradúcelo con esta tabla"*. Casos que
no caben:

- **Estado repartido en dos campos.** `{ "tipo": "ENTREGA", "resultado": "FALLIDA" }` es
  `incidencia`, pero ningún campo por sí solo lo dice. `statusMap` traduce un valor, no
  combina dos.
- **Un envoltorio con varios eventos dentro.** `{ "guia": "AC-4471", "historia": [ … ] }`
  produce N eventos; el motor asume uno por objeto.
- **Fechas relativas.** `"hace 2 horas"` depende del momento de recepción, no es un patrón.
- **Datos que hay que limpiar.** `"AC 4471"` con espacio en vez de guion, o `"Cúcuta, CO"`
  en un único campo que hay que partir en ciudad y país.

El último enseña el peligro real: *podrías* añadir al perfil una regla de "partir por
coma". Y luego una de "quitar espacios". Y una de "si está vacío, mira este otro campo".
Cada una es razonable por separado, y juntas convierten la configuración en un lenguaje de
programación mal diseñado, editado desde un formulario, sin depurador ni control de
versiones. **La puerta de escape existe para no tener que decir que sí a esa pendiente.**

Regla que lo mantiene sano: si el transportista encaja en el perfil, perfil. Si para que
encaje hay que añadir una capacidad nueva al motor, manejador propio. Salvo que esa
capacidad la vayan a usar tres transportistas — entonces sí merece entrar en el motor.

#### Qué significa "un dato que no encaja": tres casos, no uno

"Llegó algo raro" no es una categoría. Son tres situaciones con tres respuestas distintas,
y confundirlas es la forma más fácil de perder eventos en silencio. Esta taxonomía es la
respuesta al requisito *"decidir y dejar escrito qué hace el código cuando un evento del
lote no se puede interpretar"*.

| Caso | Ejemplo | Qué se hace | Por qué |
|---|---|---|---|
| **Campo extra que no necesitamos** | llega `peso_kg`, `conductor`, `ruta_id` | se ignora y se sigue | Es literalmente la frase 06 del cliente. No afecta a nada de lo que el evento significa. |
| **Campo obligatorio ausente o ilegible** | no viene `fecha`, o viene `"ayer"` | **cuarentena** | Sin instante no hay línea de tiempo ni estado actual. El evento no es interpretable. |
| **Valor desconocido de un campo conocido** | `status.code: 7`, nunca visto | **cuarentena** | El campo lleva ahí desde el principio; lo que falta es la traducción. No se puede clasificar el envío. |

El tercero es el que más se subestima. **No es un campo nuevo**, así que la intuición
tiende a archivarlo bajo "cosa nueva, no aplica, se ignora" — y es justo al revés: es el
caso **más frecuente en producción**, mucho más que el alta de un transportista, y afecta
directamente a la respuesta que Camila le da al cliente. Es también el que separa las
opciones: con perfil declarativo se arregla en el panel en treinta segundos; con
adaptadores en código, con un despliegue.

**Ignorar no es lo mismo que perder.** Un campo que sobra se ignora. Un evento que no se
entiende **nunca se descarta en silencio**: se guarda su `raw`, se anota el motivo y queda
a la vista.

#### Las dos caras del fallo, y cuál es la peligrosa

- **Falla ruidosamente.** No se puede interpretar → cuarentena → aparece en el panel con su
  motivo. Molesto, pero sano: el sistema sabe lo que no sabe.
- **Funciona y miente.** El transportista manda `03/04/2026` queriendo decir *4 de marzo*
  (`MM/DD`) y el perfil está configurado como `DD/MM`. Se interpreta sin error, sin
  cuarentena, sin aviso — y el evento queda **un mes desplazado** en la línea de tiempo.
  Nadie se entera hasta que alguien da una respuesta absurda.

La segunda es la que hace perder la confianza en el panel entero, y no la detecta ninguna
validación de esquema: el dato es válido, solo que significa otra cosa. De ahí salen tres
decisiones que no son adorno:

1. El **"probar mapeo"** con payload de ejemplo antes de guardar un perfil: la única forma
   de ver la interpretación con ojos humanos antes de que entre el primer lote.
2. La **zona horaria como campo visible** en la ficha, no como constante enterrada.
3. **Nada de análisis "inteligente" de fechas.** Un analizador que acepta cualquier cosa
   también acepta lo ambiguo y elige por ti sin decírtelo. Ante la ambigüedad, fallar.

#### El objetivo de diseño: no cubrir el futuro, abaratar el fallo

Tentación natural: hacer el motor declarativo cada vez más capaz hasta que ningún
transportista se le escape. No funciona, y conviene tenerlo escrito: **el espacio de
formatos posibles lo inventan terceros que no controlamos, y es infinito**. Cualquier
catálogo de transformaciones, por grande que sea, lo desborda alguien el año que viene.
Cada capacidad que se añade al motor, además, se añade a la pieza compartida por todos los
transportistas: aumenta la cobertura y aumenta el radio de daño a la vez.

El objetivo correcto no es *que el cuarto transportista funcione el primer día* —eso no es
alcanzable y prometerlo es el error—, sino que **su llegada sea un suceso acotado, visible
y de bajo riesgo**: que no rompa nada de lo que ya funcionaba, que el fallo se vea en el
panel en vez de esconderse, que el crudo esté guardado, y que arreglarlo sea un formulario
o un archivo aislado.

**Regla de tres para hacer crecer el motor.** Una capacidad nueva no entra en el motor
porque un transportista la necesite: ese primero se resuelve con manejador propio. Si un
segundo la necesita, se anota. Al tercero, se promueve al motor y se migran los tres. Así
el motor crece por **evidencia observada** y no por especulación.

Y la traducción al lenguaje del cliente, que resuelve la tensión con la frase 09 sin
prometer de más: *"no volverá a pagar por lo mismo — y para lo que de verdad sea distinto,
es razonable que cueste, pero no romperá nada de lo que ya tiene."*

---

#### Opción A — Un adaptador en código por transportista (registro de estrategias)

Cada transportista es un módulo TypeScript que implementa un contrato:

```ts
interface CarrierAdapter {
  readonly carrierId: string;
  parse(raw: unknown): Result<ShipmentEvent, ParseError>;
}
```

Un `CarrierRegistry` los indexa por `carrierId`. La ingesta recibe
`POST /ingest/:carrierId`, pide el adaptador al registro y le pasa cada elemento del lote.
Cada adaptador valida su propio formato con su propio esquema (Zod) y hace sus propias
conversiones de fecha.

**Cómo entra el cuarto en enero:** se escribe `ruta-andina.adapter.ts`, se registra, se
despliega. Ningún archivo existente se modifica → cumple la frase 09 al pie de la letra.

**Se gana:**
- Tipado fuerte extremo a extremo: cada formato tiene su tipo de entrada real, no un
  `Record<string, unknown>`.
- Sin límite de expresividad: si el cuarto manda un array anidado, un estado derivado de
  dos campos o una fecha relativa, se programa y ya.
- Errores precisos y baratos de diagnosticar: el fallo apunta a una línea.
- Es la opción con menos código total y la más rápida de escribir bien.

**Se paga:**
- **El panel de transportistas queda cojo.** Solo puede gestionar metadatos (nombre,
  activo/inactivo, zona horaria, contacto). El mapeo — lo que de verdad cambia — sigue
  siendo código. Si mañana TransBolívar añade el código `7`, hay que desplegar.
- El cuarto transportista de enero cuesta un ciclo de desarrollo, no un formulario.
- Riesgo de copiar-pegar entre adaptadores: tres implementaciones del "parsea fecha" que
  divergen con el tiempo.

**A escala 100×:** irrelevante, el coste es de compilación, no de ejecución. El adaptador
es una función pura sobre un objeto; 2M de eventos no lo notan.

---

#### Opción B — Perfil declarativo guardado en base de datos (dirigido por datos)

No hay código por transportista. Hay **un solo motor de normalización** que interpreta una
"receta" almacenada:

```ts
type CarrierProfile = {
  id: string;
  name: string;
  active: boolean;
  fieldMap: {
    trackingNumber: string;   // "tracking_number" | "guia"
    status: string;           // "status.code" | "evento" | "estado"
    occurredAt: string;       // "occurred_at" | "ts" | "fecha"
    city: string | null;      // "location.city" | "ciudad" | "lugar"
    country: string | null;
  };
  dateStrategy:
    | { kind: 'iso8601' }
    | { kind: 'epoch_seconds' }
    | { kind: 'pattern'; pattern: 'DD/MM/YYYY HH:mm'; timezone: 'America/Caracas' };
  statusMap: Record<string, CanonicalStatus>;  // { "3": "in_transit", "EN_TRANSITO": "in_transit", "EnRuta": "in_transit" }
  onUnknownStatus: 'quarantine' | 'ignore';
};
```

Las rutas de campo se resuelven con notación de punto (`location.city`), lo que cubre el
anidamiento de TransBolívar sin código específico.

**Cómo entra el cuarto en enero:** Camila —o quien opere— entra al panel, rellena un
formulario, pega un payload de ejemplo, ve la vista previa normalizada, guarda. **Cero
despliegue.** Esto es literalmente la frase 09 ("no quiero volver a pagar por lo mismo")
llevada a su conclusión: no se paga porque no hay trabajo de desarrollo.

**Se gana:**
- El apartado de gestión de transportistas del panel tiene sentido real: gestiona lo que
  importa, no una etiqueta.
- El diccionario de estados es dato. El "apareció un código 7" se resuelve en 30 segundos
  desde el panel, y esa es la incidencia que más veces va a ocurrir en producción.
- La zona horaria de RutaSur deja de ser una asunción escondida: es un campo visible que
  alguien puede corregir el día que se descubra que estaba mal.
- Cierra el bucle con la cuarentena (ver §1.7).

**Se paga:**
- **Se está construyendo un mini-lenguaje.** Todo lenguaje tiene un techo: el día que un
  transportista mande el estado en dos campos combinados, o una lista de eventos anidada,
  o una fecha relativa ("hace 2 h"), el motor no llega y hay que ampliar el motor —
  precisamente lo que la frase 09 pedía evitar.
- El tipado se debilita en el borde: la receta se valida **en ejecución** (Zod), no al
  compilar. Un perfil mal escrito no lo detecta el compilador; lo detecta la ingesta.
- Un humano con permisos puede romper la ingesta de un transportista entero rellenando mal
  un formulario. Obliga a construir el "probar con payload de ejemplo" **como parte del
  mínimo**, no como adorno.
- Más código y más superficie de prueba que la opción A, para el mismo resultado visible.

**A escala 100×:** el perfil se lee una vez por lote y se cachea en memoria; el coste por
evento es una resolución de rutas de punto, comparable a A. Sin problema de rendimiento.
El riesgo real a escala es de **versionado**: si alguien edita un perfil, los 2M de eventos
ya normalizados quedaron con el mapeo viejo. Hay que guardar `profileVersion` en cada
evento para poder responder "¿con qué reglas se normalizó esto?" y para reprocesar solo lo
afectado.

---

#### Opción C — Híbrido: perfil declarativo con puerta de escape a código

Es la opción B, más una válvula. El perfil añade un discriminador:

```ts
type CarrierProfile =
  | { strategy: 'declarative'; /* ...todo lo de la opción B... */ }
  | { strategy: 'custom'; handlerRef: string };   // "ruta-andina-v1", resuelto en el registro de la opción A
```

El motor de ingesta hace una sola pregunta: *¿este transportista es declarativo o tiene
manejador propio?* Y delega. El registro de manejadores en código es exactamente el de la
opción A, pero se usa solo cuando hace falta.

Regla operativa que acompaña a la decisión: **todo transportista nuevo se intenta primero
como declarativo. Solo si su formato no cabe en la receta se escribe un manejador.** Hoy,
los tres caben; se entregan los tres como perfiles declarativos y el registro de código
queda demostrado con uno de ejemplo, para que el equipo que hereda vea el camino abierto.

**Cómo entra el cuarto en enero:** formulario si es normal (el caso probable), archivo
nuevo + registro si es raro (el caso que la opción B no sabe atender). En ninguno de los
dos casos se toca la lógica que ya funciona.

**Se gana:** lo de B sin su techo. Y una respuesta honesta para el cliente en lenguaje de
negocio: *"los transportistas parecidos a los que ya tienen se dan de alta desde la
pantalla, gratis y en el momento. Los raros siguen costando un día de trabajo, pero no
rompen nada de lo que ya funciona."*

**Se paga:**
- Dos caminos que mantener y dos caminos que documentar. El equipo de dos personas que
  hereda tiene que entender cuándo usar cuál — se resuelve con la regla operativa de
  arriba escrita en el README, pero es una regla más.
- Es la opción más cara en horas. En un presupuesto de ~9 h, es la que más aprieta.
- Riesgo de que el camino `custom` se convierta en el atajo por defecto y el motor
  declarativo se pudra sin uso.

**A escala 100×:** igual que B, más el mismo requisito de `profileVersion`.

---

#### B frente a C: en qué se diferencian de verdad

Con los tres transportistas de hoy, B y C producen **exactamente los mismos datos y la
misma pantalla**. La diferencia no se ve hasta que llega un formato que no encaja. Merece
detalle porque es la elección menos obvia de las tres.

**1 · En el código, la diferencia es una sola línea.**

```ts
// B — un solo tipo de perfil
type CarrierProfile = { id; name; active; fieldMap; dateStrategy; statusMap; … };

// C — el mismo tipo, convertido en unión discriminada
type CarrierProfile =
  | { strategy: 'declarative'; id; name; active; fieldMap; dateStrategy; statusMap; … }
  | { strategy: 'custom';      id; name; active; handlerRef: string };
```

Y en el motor, una bifurcación de tres líneas:

```ts
const event = profile.strategy === 'declarative'
  ? normalize(raw, profile)                       // el motor genérico
  : registry.get(profile.handlerRef).parse(raw);  // la función escrita a mano
```

Todo lo que viene después —validación, deduplicación, persistencia, cuarentena, línea de
tiempo— es **compartido e idéntico**. C no son dos sistemas: es un sistema con una
bifurcación de un nivel de profundidad en un solo punto del recorrido. Esto acota lo que
cuesta de verdad, que suele sobreestimarse.

**2 · La diferencia importante no es "qué puede", es "qué hay que tocar".**

Este es el punto que decide. Llega en enero un transportista que manda el estado en dos
campos combinados. Qué pasa en cada opción:

- **En B** no existe la respuesta "no se puede". Existe la respuesta *"hay que ampliar el
  motor"*: añadir al `statusMap` la capacidad de leer dos rutas y combinarlas. Y ese motor
  es **el mismo que normaliza a Andes Express, TransBolívar y RutaSur**. Un fallo ahí no
  rompe al transportista nuevo: los rompe a los cuatro. Hay que volver a probar los tres
  que ya funcionaban.
- **En C** se escribe un archivo que solo usa ese transportista. Si está mal, está mal solo
  para él. Los otros tres ni se enteran.

Dicho de otra forma: **B y C tienen el mismo coste de desarrollo para el caso raro; lo que
cambia es el radio de daño.** B concentra todos los cambios futuros en la pieza más crítica
y más compartida del sistema. C los aparta a un rincón aislado.

Y ahí está la ironía que hay que saber contar: **B es la opción que más veces obliga a
tocar lógica que ya funcionaba**, que es literalmente lo que prohíbe la frase 09. Cumple la
frase para el transportista fácil y la incumple justo para el difícil.

**3 · En lo que se le puede prometer al cliente.**

- B promete *"todos los transportistas futuros entran por formulario"*. Es una promesa que
  no se puede sostener, y el día que se rompa será en enero, con el cliente delante.
- C promete *"los normales por formulario y en el momento; los raros con desarrollo, pero
  sin tocar lo que ya funciona"*. Es más modesta y se cumple siempre.

**4 · En el panel.** Con C, la ficha de un transportista `custom` no muestra el formulario
de mapeo: muestra un aviso — *"este transportista usa el manejador `ruta-andina-v1`; su
mapeo vive en el código y no se edita desde aquí"* — y deja editables solo el nombre y el
activo/inactivo. Es una pantalla más que diseñar, pero también es honestidad: el panel no
finge poder editar algo que no puede.

**5 · Lo que C cuesta de más, sin adornos.**

- La unión discriminada, el registro, la resolución del `handlerRef` y su manejo de error
  ("el perfil apunta a un manejador que no existe").
- Un manejador de ejemplo, porque un camino que no se ejerce no se sabe si funciona.
- Documentar **cuándo usar cuál**. El equipo de dos personas que hereda necesita esa regla
  escrita o improvisará, y probablemente improvisará mal.
- En horas reales sobre un presupuesto de ~9 h: entre una y dos. No es despreciable.

**6 · El riesgo propio de C, que B no tiene.** Para un programador es más cómodo escribir
una función que rellenar un perfil. Si nadie vigila, el camino `custom` se vuelve el atajo
por defecto, el motor declarativo se pudre sin uso y acabas pagando el coste de B sin
recibir su beneficio. Se mitiga con dos cosas: que la vía declarativa sea genuinamente
agradable (el "probar mapeo" del panel), y guardar en el perfil **por qué** hizo falta un
manejador propio, para que la excepción tenga que justificarse.

**7 · El orden de construcción, que hace la decisión menos grave de lo que parece.**

Se puede empezar por B y llegar a C más tarde **casi gratis, siempre que el discriminador
esté en el tipo desde el primer día**. Añadir `strategy: 'declarative'` a los perfiles
ahora no cuesta nada; añadirlo dentro de seis meses obliga a migrar filas y a tocar todo lo
que lee un perfil. Lo caro no es la segunda vía, es no haber dejado el hueco.

Ese es el recorte honesto si el tiempo aprieta: **la forma de datos de C con la
implementación de B**, y una línea en `DECISIONS.md` diciendo que la vía `custom` está
prevista en el modelo y no implementada.

**Resumen de cuándo elegir cada una:**

| Elige **B** si… | Elige **C** si… |
|---|---|
| El tiempo manda y prefieres una cosa terminada a dos a medias | Puedes permitirte 1–2 h más |
| Aceptas que el transportista raro obligue a tocar el motor compartido | Quieres que el caso raro no roce lo que ya funciona |
| Prefieres una sola vía que el equipo que hereda no pueda confundir | Puedes escribir y defender la regla de cuándo usar cada vía |
| No te ves defendiendo en el vídeo por qué mantienes dos caminos | Sí te ves: es el mejor material de `DECISIONS.md` de los tres |

La última fila no es un chiste. C solo gana si se sabe explicar; sin explicación se lee como
sobreingeniería o como indecisión, y entonces puntúa peor que una B bien contada.

---

#### Opción A+ — Adaptadores en código con el vocabulario como dato · **LA ELEGIDA**

Es la opción A con una corrección que lo cambia todo: **el vocabulario de cada
transportista sale del código y se guarda como dato editable desde el panel.**

> **La gramática es código. El vocabulario es dato.**

- **Gramática = código.** La estructura del payload, las rutas de los campos, la forma de
  la fecha y el tipo de cada valor viven en un adaptador TypeScript por transportista, con
  su esquema Zod y su tipo de entrada real.
- **Vocabulario = dato.** Los valores de estado que manda cada transportista y su
  traducción a los cinco estados canónicos, la zona horaria de su reloj, su nombre y si
  está activo, viven en una tabla y se editan desde el panel sin desplegar.

```ts
// GRAMÁTICA — código, uno por transportista, en el repositorio
interface CarrierAdapter {
  readonly carrierId: string;
  parse(raw: unknown, vocab: CarrierVocabulary): Result<ShipmentEvent, ParseError>;
}

// VOCABULARIO — dato, editable desde el panel, sin desplegar
type CarrierVocabulary = {
  carrierId: string;
  name: string;
  active: boolean;
  timezone: string;                            // "America/Caracas" — el reloj del transportista
  statusMap: Record<string, CanonicalStatus>;  // { "3": "in_transit", "EnRuta": "in_transit" }
  onUnknownStatus: 'quarantine' | 'ignore';
  notes: string;                               // dónde se justifica la asunción de zona horaria
};
```

El adaptador sabe **dónde** está el estado y **cómo** leerlo. La tabla dice **qué
significa**. Son dos conocimientos distintos, que además viven en dos cabezas distintas:
el programador sabe leer un JSON anidado; Camila sabe que `ENTREGA_FALLIDA` es una
incidencia porque lleva dos años leyéndolo en el portal del transportista.

**El criterio que separa las dos mitades.** No es "técnico vs. no técnico", es esto:

| Tarea | Frecuencia | Riesgo si sale mal | Quién sabe hacerla | Dónde vive |
|---|---|---|---|---|
| Mapear campos, estructura, formato de fecha | 1–2 veces al año | alto y **silencioso** | programador | **código** |
| Elegir la zona horaria de un transportista | 1 vez, al darlo de alta | alto y silencioso | programador (con dato del transportista) | dato, pero **visible y con nota** |
| Añadir `código 7 → incidencia` | varias veces al año | bajo y reversible | **atención al cliente** | **panel** |

La primera fila es rara, arriesgada y técnica: va al repositorio, donde hay revisión,
pruebas y vuelta atrás. La tercera es frecuente, barata y semántica: va al panel, donde
está quien lo sabe.

**Cómo entra el cuarto en enero:** un programador escribe
`llanos-express.adapter.ts`, lo registra y despliega — un día de trabajo, aislado, sin
tocar los otros tres. Al darlo de alta, quien opera rellena su vocabulario desde el panel.

**Se gana:**
- El coste de construcción más bajo de todas las opciones, con diferencia. Las horas que
  libera van a lo que de verdad pesa en la nota: robustez de ingesta, deduplicación, estado
  derivado, cuarentena y `DECISIONS.md`.
- Tipado fuerte extremo a extremo: cada formato tiene su tipo de entrada real.
- **Es lo más fácil de heredar**, y eso es dato de diseño explícito del encargo. Tres
  adaptadores pequeños se leen en diez minutos cada uno. Un motor genérico con catálogo de
  transformaciones es un sistema que hay que estudiar.
- Resuelve el incidente **frecuente** —el estado desconocido— sin desplegar, que es donde
  atención al cliente pierde tiempo de verdad.
- La zona horaria de RutaSur sigue siendo un campo visible con su nota de asunción, no una
  constante enterrada. La ventaja principal de B/C se conserva sin pagar B/C.

**Se paga, y hay que decirlo sin maquillar:**
- **El cuarto transportista cuesta un día de desarrollo y un despliegue.** No hay
  formulario que lo evite. Esto es lo que se sacrifica y no se disimula.
- El panel de transportistas gestiona vocabulario, no mapeo. Es una pantalla más modesta
  que la de B/C, aunque sigue siendo una pantalla viva y no un CRUD muerto.
- Riesgo de código repetido entre adaptadores (tres formas de parsear fechas que divergen).
  Se mitiga con utilidades compartidas de fecha, no con un motor genérico.

**A escala 100×:** irrelevante. El adaptador es una función pura sobre un objeto; 2M de
eventos no lo notan. El vocabulario se lee una vez por lote y se cachea. Sí hace falta
`vocabularyVersion` en cada evento, por el mismo motivo que en B/C: si alguien edita una
traducción, hay que poder responder "¿con qué reglas se clasificó este evento?".

---

### 1.5 Comparativa

| | A+ · **elegida** | A · código puro | B · declarativo | C · híbrido |
|---|---|---|---|---|
| Cuarto transportista | despliegue aislado | despliegue aislado | formulario | formulario |
| Cuarto transportista raro | despliegue aislado | despliegue aislado | **no se puede** | despliegue aislado |
| Estado nuevo (código 7) | **formulario** | despliegue | formulario | formulario |
| Zona horaria de un transportista | **dato visible** | constante en código | dato visible | dato visible |
| Panel de transportistas | vocabulario (vivo) | metadatos (muerto) | mapeo completo | mapeo completo |
| Fuerza del tipado | máxima | máxima | en ejecución | mixta |
| Coste de construir | **el más bajo** | el más bajo | medio | alto |
| Facilidad de heredar | **la mayor** | la mayor | media | la menor |
| Riesgo de romper por error humano | bajo | bajo | alto | alto |

### 1.6 Decisión

**Opción A+: un adaptador en código por transportista, con el vocabulario de estados y la
zona horaria como dato editable desde el panel.**

El razonamiento que la sostiene, en orden de peso:

**1 · El argumento de la frecuencia.** Es el que decide.

> Una tarea que haces dos veces al año es una tarea que nunca aprendes.

Dar de alta un transportista pasa una o dos veces al año. Si la herramienta para hacerlo es
un formulario del panel, cada enero quien la use la reaprende desde cero, con prisa y con
el transportista esperando. Las interfaces para tareas raras son malas interfaces casi por
definición: no hay repetición que genere destreza. El programador que escribe el adaptador,
en cambio, hace cosas de esa forma todas las semanas. **La tarea rara se pone donde están
las manos entrenadas.**

El mismo criterio, aplicado al otro lado, da el resultado contrario: traducir un estado
nuevo pasa varias veces al año, es una línea, es reversible, y **lo sabe hacer atención al
cliente mejor que nadie**. Eso sí va al panel.

**2 · La responsabilidad.** Si quien configura el huso horario se equivoca, un cliente
recibe una respuesta errónea. Mover esa decisión a atención al cliente, sin revisión de
código, sin pruebas y sin vuelta atrás, no es dar autonomía: es repartir riesgo hacia quien
no puede evaluarlo.

**3 · El argumento de C se cae con un dato del propio enunciado.** C valía la pena si el
cliente no fuera a tener programador disponible en enero. El encargo dice que habrá **un
equipo de dos personas manteniendo esto**. Lo hay. Un despliegue al año no es un problema
para un equipo que existe — y sí lo sería la carga de mantener un motor genérico que ese
mismo equipo no escribió.

**4 · El presupuesto.** ~2 h para los tres adaptadores, el registro y el vocabulario, frente
a ~4 h de C y más de 15 h del mapeador visual. En un presupuesto total de ~9 h, esa
diferencia no es un detalle: es la que decide si `DECISIONS.md` se escribe con calma o a
las tres de la mañana. Y `DECISIONS.md` es el entregable que más pesa.

**Cómo se le cuenta al cliente, en lenguaje de negocio:**

> "Consideré darles una pantalla para configurar transportistas nuevos ustedes mismos. La
> descarté por una razón práctica: es algo que harían una o dos veces al año, y nadie llega
> a dominar una herramienta que usa dos veces al año — cada enero la estarían reaprendiendo
> con prisa. Ese trabajo lo hace mejor un programador en un día, aislado, sin tocar nada de
> lo que ya funciona. Lo que sí les dejé en el panel es lo que sí pasa a menudo: cuando un
> transportista empieza a mandar un estado nuevo, ustedes lo traducen desde la pantalla en
> treinta segundos, sin llamar a nadie. Ahí es donde estaban perdiendo tiempo de verdad."

**Lo que esta decisión NO promete**, y conviene decirlo antes de que lo pregunten: el
cuarto transportista no funciona el primer día solo. Lo que se garantiza es que su llegada
sea un suceso acotado, visible y de bajo riesgo — no rompe nada de lo que ya funcionaba, lo
que no se entienda queda en cuarentena a la vista en vez de perderse, y el crudo está
guardado para reprocesar en cuanto el adaptador esté listo.

### 1.7 Alternativa descartada: el mapeador visual

Vale la pena dejarla escrita con detalle porque es la alternativa más ambiciosa que se
consideró, y porque el motivo del rechazo es más interesante que el rechazo.

**Qué era.** Un asistente en el panel que permitiera dar de alta un transportista con
cualquier formato sin escribir código, en tres niveles acumulativos:

- **Nivel 1 · Descubrimiento.** El operador pega payloads reales (o el sistema coge los que
  ya llegaron a cuarentena), el sistema los aplana y le muestra todas las rutas encontradas
  con su valor de ejemplo, su tipo inferido y el porcentaje de veces que aparece. El
  operador solo tiene que decir cuál es la guía, cuál la fecha y cuál el estado. No añade
  poder expresivo: añade **descubrimiento**, y resuelve solo el caso de nombres y
  anidamiento desconocidos.
- **Nivel 2 · Transformaciones de catálogo cerrado.** Por campo, una tubería corta elegida
  de una lista fija: `recortar`, `reemplazar(a,b)`, `partir(sep) → tomar(n)`,
  `concatenar(rutaA, rutaB)`, `extraer por expresión regular`, `si está vacío usar(rutaB)`.
  Con solo eso se caen tres de los cuatro casos que rompen un motor declarativo:
  - `"AC 4471"` → `reemplazar(" ", "-")` → `AC-4471`
  - `"Cúcuta, CO"` → `partir(",") → tomar(0)` y `tomar(1)` → ciudad y país
  - estado partido en dos campos → `concatenar(tipo, "_", resultado)` produce
    `"ENTREGA_FALLIDA"`, **y la tabla de estados que ya existe lo traduce a `incidencia`**.
    Este último es el hallazgo bonito: un caso que parecía exigir código se resuelve
    componiendo dos piezas que ya estaban.
- **Nivel 3 · Un payload, varios eventos.** Un campo más: `iterarSobre: "movimientos"`.
  *"Cada elemento de esta lista es un evento; estos otros campos se heredan del padre."*
  Cierra el caso del envoltorio con lista dentro.

Queda vivo un solo caso irresoluble: las fechas relativas (`"hace 2 horas"`), y no por
falta de motor sino porque **al payload le falta información** que ninguna herramienta
puede inventar.

**Nivel 4 (código escrito por el usuario en el panel): rechazado aparte y antes.** Ejecutar
JavaScript suministrado por un usuario exige aislamiento real, límites de CPU y tiempo, y
es una superficie de seguridad seria. Pero el problema de fondo es peor: ese código no
tendría control de versiones, ni revisión, ni pruebas, ni forma de volver atrás, y sería
invisible para el equipo de dos personas que hereda el proyecto. Código escondido en una
fila de base de datos es lo contrario de mantenible.

**Por qué se descarta el conjunto, aun siendo la opción más potente:**

1. **La frecuencia** (§1.6, argumento 1). Es una herramienta para una tarea que se hace dos
   veces al año.
2. **Es cobertura especulativa.** Se pagarían quince horas hoy por formatos que quizá no
   lleguen nunca, cuando el principio que rige el resto del diseño es el contrario: no
   cubrir el futuro, abaratar el fallo (§1.4, *El objetivo de diseño*). El mapeador es
   cobertura amplia con una interfaz bonita encima.
3. **No cabe en el presupuesto.** ~15 h frente a las ~9 h totales del ejercicio. Construirlo
   a medias sería peor que no construirlo: el enunciado avisa de que dos opcionales a
   medias suman menos que uno bien resuelto.
4. **Empeora la herencia.** Un catálogo de transformaciones componibles es más difícil de
   entender para quien llega nuevo que tres adaptadores de treinta líneas.

**Qué se conserva de todo esto en la decisión final:** la tabla de estados precargada con
los valores realmente vistos y su contador, la vista previa antes de guardar, el reproceso
de la cuarentena, y el estado *"en configuración"* para un transportista dado de alta antes
de que exista su adaptador — de modo que sus lotes se guarden en crudo desde el primer día
y no se pierda nada mientras se escribe el código.

**Y esto es exactamente el "qué haría con una semana más"** de `DECISIONS.md`: los niveles
1 y 2, en ese orden, empezando por el descubrimiento de rutas, que es el que más valor da
por hora invertida.

### 1.8 El bucle que justifica el panel

Esta es la pieza que conecta la decisión con la pantalla, y probablemente lo más vendible
del proyecto:

```
        lote entra
             │
             ▼
    ┌────────────────┐   estado desconocido / campo obligatorio ausente
    │  normalización │──────────────────────────────┐
    └────────┬───────┘                              ▼
             │ ok                          ┌──────────────────┐
             ▼                             │   CUARENTENA     │
     evento canónico                       │ (crudo + motivo) │
                                           └────────┬─────────┘
                                                    │  el panel lo muestra:
                                                    │  "12 eventos de TransBolívar
                                                    │   rechazados: código 7 desconocido"
                                                    ▼
                                        ┌────────────────────────┐
                                        │ /transportistas/[id]   │
                                        │  añadir 7 → incidencia │
                                        └───────────┬────────────┘
                                                    │
                                                    ▼
                                            reprocesar cuarentena
                                            (usa el `raw` guardado)
```

Ese bucle es, a la vez: el punto 1 de las notas personales (resguardar el crudo), la
respuesta a "qué hace el código cuando un evento no se puede interpretar", y — si se
implementa el reproceso — uno de los opcionales casi resuelto sin esfuerzo extra.

**Distinción que hay que dejar escrita** (frase 06 del cliente): campo desconocido que
sobra → se ignora y se sigue. Campo obligatorio ausente o estado no mapeable → el evento
no es interpretable → cuarentena, nunca descarte silencioso. Ignorar no es lo mismo que
perder.

### 1.9 Lo que queda por decidir

1. ~~¿A, B o C?~~ → **resuelto: A+** (§1.6).
2. Los vocabularios de los tres transportistas actuales, ¿se cargan por *seeder* y quedan
   editables? Recomendación: editables, pero **no borrables** si tienen eventos asociados.
3. ¿La cuarentena y sus métricas entran en el alcance mínimo, o son el opcional elegido de
   los cinco? Con A+ la cuarentena es casi obligatoria: es el único sitio donde acaba un
   estado desconocido.
4. ¿Entra el estado *"en configuración"* en la primera versión? Cuesta poco y es lo que
   permite no perder nada mientras se escribe el adaptador de un transportista nuevo.

### 1.10 Efecto sobre los puntos abiertos del encuadre

- **Cierra el punto 5** (zona horaria de RutaSur). Se asume **`America/Caracas` (UTC−4)**,
  deducido comparando el mismo envío con Andes Express, y vive como **dato visible con su
  nota de justificación** en la ficha del transportista. Si la asunción falla: se corrige en
  el panel y se reprocesa con el `raw` guardado.
- **Adelanta el punto 8** (qué opcional se ataca): el reproceso de la cuarentena queda casi
  resuelto como efecto colateral del diseño, sin esfuerzo dedicado.
- **No cierra** los puntos 1, 2, 3, 4, 6, 7 ni 9. En particular, la semántica del endpoint de
  ingesta (punto 6) y la clave de deduplicación (punto 7) siguen abiertas y son las
  siguientes en importancia.
- **Añade contexto nuevo al desarrollo:** el panel tiene un apartado de transportistas que
  gestiona **vocabulario** (estados y zona horaria), no mapeo, y existe el estado
  "en configuración" para dar de alta a un transportista antes que a su adaptador.

---

## Estructura lógico-visual del panel (v0)

Next.js, App Router. Sin maquetar: la estética no puntúa, la legibilidad sí.

### Mapa de rutas

```
/                                Buscador + listado paginado de envíos
                                 filtros: estado canónico · transportista · rango de fechas
                                 (el filtro útil para Camila: "con incidencia", hoy)

/envios/[guia]                   Detalle: estado actual derivado + línea de tiempo ordenada
                                 muestra de qué transportista viene cada evento

/transportistas                  Listado de perfiles: nombre, activo, nº de eventos hoy,
                                 nº en cuarentena  ← [Nuevo transportista]

/transportistas/[id]             Alta / edición del perfil (ver detalle abajo)

/ingesta                         Lotes recibidos, métricas y cuarentena
                                 "de 5.000 eventos: 4.987 ok, 13 en cuarentena — ver por qué"
```

Cuatro pantallas. La 1 y la 2 son el encargo literal; la 3 es donde se resuelve sin
desarrollo el incidente frecuente —un estado que nadie había visto—; la 4 es lo que hace
que un fallo sea visible en vez de silencioso.

### Detalle de `/transportistas` (el apartado del ejemplo)

Con la decisión A+, esta pantalla gestiona **vocabulario, no mapeo**. Es más modesta que la
que se imaginó al principio y sigue siendo una pantalla viva: es donde se resuelve el
incidente frecuente sin llamar a nadie.

**Listado:**

```
┌───────────────────────────────────────────────────────────────────────┐
│  Transportistas                              [ + Nuevo transportista ]│
├───────────────────────────────────────────────────────────────────────┤
│  Nombre           Adaptador          Estado    Hoy      Cuarentena    │
│ ──────────────────────────────────────────────────────────────────────│
│  Andes Express    andes-express.ts   Activo    4.812        0     [✎] │
│  TransBolívar     transbolivar.ts    Activo    5.000       13  ⚠  [✎] │
│  RutaSur          ruta-sur.ts        Activo    3.907        0     [✎] │
│  Llanos Express   — sin adaptador    En conf.  1.119    1.119  ⚙  [✎] │
└───────────────────────────────────────────────────────────────────────┘
```

Dos columnas hacen el trabajo. **Cuarentena** convierte esto en algo que alguien mira, y no
en un CRUD muerto: enlaza directamente al motivo del rechazo. **Adaptador** dice la verdad
sobre dónde vive la gramática de cada uno, para que nadie busque en el panel algo que está
en el repositorio.

La cuarta fila es el **estado "en configuración"**: un transportista dado de alta *antes* de
que exista su adaptador. Sus lotes entran y se guardan en crudo, no se normaliza nada y todo
va a cuarentena. Sirve para que la ingesta pueda empezar el día que ellos estén listos, no
el día que nosotros lo estemos, y para que al desplegar el adaptador se reprocese todo lo
acumulado sin haber perdido un evento.

**Ficha del transportista** — tres bloques, todos de vocabulario:

```
┌── 1 · Identidad ─────────────────────────────────────────────────────┐
│  Nombre        [ RutaSur                    ]                        │
│  Identificador   ruta-sur     (va en la URL de ingesta, inmutable)   │
│  Adaptador       ruta-sur.adapter.ts        ← vive en el repositorio │
│  Estado        ( • ) Activo  ( ) Inactivo  ( ) En configuración      │
│                  Inactivo NO borra: deja de aceptar lotes.           │
└──────────────────────────────────────────────────────────────────────┘

┌── 2 · Reloj del transportista ───────────────────────────────────────┐
│  Zona horaria  [ America/Caracas (UTC−4) ▾ ]                         │
│  Nota          [ RutaSur no envía zona horaria. Se dedujo compa-  ]  │
│                [ rando AC-4471 con Andes Express: su 10:22 son    ]  │
│                [ las 14:22 UTC → UTC−4, huso venezolano. Sella    ]  │
│                [ con su propio reloj aunque el paquete esté en CO.]  │
│                                                                      │
│  ⚠ Si se cambia, los eventos ya guardados NO se recalculan solos.    │
│    Hay que reprocesar.                                               │
└──────────────────────────────────────────────────────────────────────┘

┌── 3 · Diccionario de estados ────────────────────────────────────────┐
│  Valor recibido      Visto     Estado canónico de Andina             │
│  Recogido              412     [ recogido       ▾ ]      [ eliminar ]│
│  EnRuta              1.089     [ en tránsito    ▾ ]      [ eliminar ]│
│  Repartiendo           377     [ en reparto     ▾ ]      [ eliminar ]│
│  Entregado             341     [ entregado      ▾ ]      [ eliminar ]│
│  Incidencia             28     [ incidencia     ▾ ]      [ eliminar ]│
│  ─────────────────────────────────────────────────────────────────── │
│  EnRutaLocal             9     [  ← sin asignar   ]  ⚠   [ asignar  ]│
│                                                                      │
│  Si llega un valor no listado:                                       │
│    ( • ) enviar a cuarentena    ( ) ignorar el evento                │
│                                                                      │
│                    [ Cancelar ]  [ Guardar ]  [ Guardar y reprocesar ]│
└──────────────────────────────────────────────────────────────────────┘
```

Cuatro decisiones incrustadas en esta pantalla:

1. **La columna "Visto" y las filas sin asignar salen del tráfico real.** El sistema
   precarga los valores que de verdad han llegado, con su contador, en vez de esperar a que
   alguien los adivine. La fila `EnRutaLocal` con 9 apariciones y sin traducción es un
   incidente detectado antes de que nadie llame por teléfono. Es posible porque se guarda
   el `raw` de todo.
2. **"Guardar y reprocesar" es la acción que cierra el bucle.** Añades la traducción que
   faltaba y los eventos que estaban en cuarentena entran normalizados. Sin ella, arreglar
   el diccionario dejaría el pasado roto.
3. **Desactivar en vez de borrar.** Un transportista con eventos históricos no se puede
   eliminar sin dejar huérfana la línea de tiempo de envíos reales. El botón "eliminar"
   solo aparece si no tiene ningún evento asociado.
4. **Lo que NO se puede editar aquí está a la vista, no escondido.** El identificador y el
   adaptador se muestran en gris. Quien busque cómo cambiar el mapeo de campos ve
   inmediatamente que eso vive en el código, en vez de perder diez minutos buscando una
   pestaña que no existe.

### Qué queda por diseñar de la pantalla

- `/envios/[guia]`: cómo se marca visualmente que el estado actual se **deriva** del evento
  de mayor `occurredAt` y no del último recibido (frase 05 — la trampa).
- `/`: qué filtro exacto se ofrece y cómo se pagina.
- Estrategia de fetching y refresco (punto abierto del encuadre).

---

## P02 · Dónde vive el histórico: Postgres, Mongo o las dos

### 2.1 Qué pidió el cliente y qué significa realmente

> Frase 03: *«Usen Postgres y Mongo, que las dos ya están contratadas en el proyecto.»*

No es una instrucción de arquitectura, es una frase de comprador: **«ya pago dos facturas, no
me traigas una tercera»**. Le da igual el reparto. El encuadre de la prueba lo marca como
*trampa amable*: usar una, la otra o las dos puede ser correcto **si viene con su argumento**.

Lo que sí es cierto —y hay que reconocerlo antes de descartarlo— es que **las dos se pueden
usar a la vez**, y hay dos repartos que son patrones reconocibles, no inventos:

| Reparto | Cómo funciona | Nombre habitual |
|---|---|---|
| Mongo aterriza, Postgres canoniza | el lote entra crudo en Mongo; un proceso posterior normaliza y escribe en Postgres, de donde lee el panel | *raw landing zone* / staging |
| Mongo escribe, Postgres lee | la ingesta escribe en Mongo y se proyecta a Postgres para consultas e informes | CQRS |

Los dos funcionan. Los dos añaden **exactamente el mismo problema**: la ingesta deja de ser
una escritura atómica. Existe el instante en que el evento está guardado en un motor y el
estado del envío todavía no se ha actualizado en el otro. Resolverlo bien exige *outbox*,
reintentos idempotentes y un reconciliador que detecte divergencias — más código que todo el
resto de la entrega, heredado por un equipo de dos personas que no estuvo en esta fase.

### 2.2 Por qué Mongo y no Postgres, con argumentos de este dominio

No «por simplicidad». Cuatro anclajes concretos:

**a) El crudo no es un extra, es un requisito de disponibilidad — y el crudo es un documento.**
Los transportistas **empujan** y no hay forma de pedírselos. Si guardas solo lo normalizado y
tres semanas después aparece un fallo en el adaptador de RutaSur, esos datos no se recuperan:
no hay a quién reclamárselos. Y ese payload tiene hoy tres formas, en enero cuatro, con la
instrucción explícita de ignorar campos desconocidos. Es la definición de documento sin
esquema fijo. En Postgres acabaría en una columna `JSONB`, es decir, una carcasa relacional
alrededor de un documento.

**b) La lectura es «traer un agregado», no «cruzar tablas».**
La pantalla de Camila es: una guía → su envío y su línea de tiempo. No hay joins entre cinco
entidades ni informes con agrupaciones arbitrarias. Las virtudes caras de Postgres
(integridad referencial entre muchas tablas, joins complejos, SQL analítico) apenas se usan
en un dominio de dos entidades con una sola forma de consulta. Se paga la rigidez sin cobrar
el beneficio.

**c) La escritura por lotes encaja con la primitiva del motor.**
Cinco mil eventos de golpe. `bulkWrite` con `ordered: false` hace en un viaje lo necesario:
inserta todo lo válido, **no aborta por un evento malo**, y devuelve la lista de fallos con su
índice y su motivo — que es, literalmente, el informe de descartes y la cuarentena, sin código
extra. El equivalente en Postgres existe (`INSERT ... ON CONFLICT DO NOTHING` multi-fila) y es
válido, pero el reporte por elemento hay que construirlo.

**d) El estado actual desordenado se resuelve con atomicidad de un solo documento.**
La frase 05 es una trampa: los lotes llegan tarde y desordenados, el último en llegar no es el
más reciente. La solución es una actualización condicional y monótona —*actualiza el envío
solo si el evento que traigo es posterior al último registrado*— y Mongo garantiza atomicidad
a nivel de documento sin transacción. Dos lotes concurrentes no pueden hacer retroceder el
estado. **La consistencia que importa aquí es intra-documento, no inter-tabla**, que es
justamente la que el segundo motor no aporta.

### 2.3 El modelo, con las dos trampas de Mongo evitadas

Dos colecciones:

| Colección | Un documento por | Contiene |
|---|---|---|
| `events` | evento normalizado | núcleo canónico + `raw` + `dedupKey` + contadores |
| `shipments` | guía | estado actual derivado, `lastEventAt`, transportistas implicados |

- **Los eventos NO van embebidos dentro del envío.** Tentador y erróneo: la lista crece sin
  techo, cada evento reescribiría el documento entero y hay un límite duro de 16 MB.
- **`shipments` no es tabla maestra: es una proyección derivada de `events`**, reconstruible
  entera en cualquier momento. Esto desarma de un plumazo la objeción «Mongo no tiene
  integridad referencial»: no hay una relación que mantener, hay una vista materializada que
  se regenera. Existe solo para que el **listado** pueda filtrar por estado actual, cosa
  carísima desde la colección de eventos. El **detalle** de una guía no la necesita.

Índices:

| Índice | Para qué |
|---|---|
| `{ trackingNumber: 1, occurredAt: -1 }` en `events` | línea de tiempo ordenada y estado actual, con la misma estructura |
| `{ dedupKey: 1 }` único en `events` | idempotencia (ver P03) |
| `{ currentStatus: 1, lastEventAt: -1 }` en `shipments` | el listado paginado y su filtro |

### 2.4 Los números, sin exagerar

**El volumen no es el argumento y conviene decirlo antes de que lo diga el evaluador.** Un
evento normalizado con su crudo ronda los 700 bytes:

| Escenario | Eventos | Tamaño aprox. |
|---|---|---|
| 2 M de eventos (≈33 días con los 4 transportistas) | 2 000 000 | ~1,4 GB |
| Un año con 4 transportistas | ~22 000 000 | ~15 GB |

Ninguno de los dos motores se inmuta con eso. Afirmar «elegí Mongo porque escala mejor» a
estas cifras es regalarle el argumento a quien corrige.

### 2.5 Borrador para DECISIONS.md — *reescribir con palabras propias*

**Situación.** El cliente pidió usar Postgres y Mongo porque las dos ya están contratadas. Hay
que decidir dónde vive el histórico de envíos: lotes de hasta cinco mil eventos, tres veces al
día por transportista, cada uno con su formato, más el payload crudo, que hay que conservar
íntegro porque los transportistas empujan y no hay forma de volver a pedírselo. Y la pantalla
de Camila necesita, dada una guía, el estado actual y la línea de tiempo completa.

**Decisión.** Un solo motor, MongoDB, con dos colecciones. `events` guarda un documento por
evento normalizado con su payload crudo dentro; `shipments` guarda uno por guía con el estado
actual ya calculado. `shipments` no es la tabla maestra: es una proyección derivada de
`events`, reconstruible entera en cualquier momento. Postgres no sale del proyecto, sale de
este servicio.

**Alternativas descartadas.** *Postgres sola:* funciona perfectamente —`JSONB` para el crudo,
índice único para deduplicar, particionado por fecha— pero acaba siendo una carcasa relacional
alrededor de un documento, y las virtudes que se pagan con ella apenas se usan en un dominio
de dos entidades con una sola forma de consulta. *Las dos, con reparto* (crudo en Mongo y
canónico en Postgres, o escritura en una y lectura en la otra): son patrones conocidos y
funcionan, pero convierten cada ingesta en una escritura que deja de ser atómica —existe el
instante en que el evento está guardado en un motor y el estado del envío aún no en el otro—.
Hacerlo bien exige *outbox*, reintentos y un reconciliador: más código que todo el resto de la
entrega, heredado por dos personas que no estuvieron aquí. *Embeber la línea de tiempo dentro
del documento del envío:* descartada porque la lista crece sin techo, cada evento reescribiría
el documento entero y hay un límite duro de 16 MB.

**Qué sacrifiqué.** Las consultas analíticas: «cuántos envíos pasaron de 48 horas, por
transportista y por mes» es una frase en SQL y aquí es un *pipeline* de agregación más largo y
menos legible para quien herede esto; si Andina quiere informes habrá que exportar, y ahí es
donde Postgres, que ya está contratada, encuentra su sitio. Sacrifiqué también la red del
motor: Postgres rechazaría una fila mal formada y Mongo la acepta, así que la validación en el
borde deja de ser buena práctica y pasa a ser la única defensa. Y toda la idempotencia queda
colgando de un índice único bien elegido: si esa clave está mal definida, no hay nada debajo.

**Qué rompe esto a escala 100×.** El volumen no, y conviene decirlo: dos millones de eventos
son unos 1,4 GB y un año entero con los cuatro transportistas ronda los 15 GB; ninguno de los
dos motores se inmuta. Buscar una guía cuesta lo mismo con veinte mil eventos que con dos
millones porque el índice por guía y fecha descendente sirve la línea de tiempo y el estado
actual con la misma estructura. Lo que de verdad crece es el crudo, al mismo ritmo que los
eventos y casi sin leerse nunca: primer candidato a archivarse por antigüedad. Si algún día
hubiera que repartir en varias máquinas, la clave natural es el número de guía, que es a la
vez la clave de consulta y el prefijo de la clave de deduplicación, de modo que todas las
lecturas de un envío caen en un solo nodo; la restricción que eso impone, y queda escrita, es
que el índice único de deduplicación tiene que empezar por el número de guía. Lo que sí
rompería esta decisión no es el tamaño, es la forma: el día que el dominio deje de tener dos
entidades y aparezcan clientes, facturas, acuerdos de nivel de servicio y correcciones
auditadas cruzándose entre sí, esto se revisa.

**Qué haría con una semana más.** Réplica y copias de seguridad con restauración probada —una
copia que nunca se ha restaurado no es una copia—. Un validador de esquema en la propia
colección, como segunda barrera detrás de la validación en el borde, para devolverle al motor
parte de la red que le quité. Y la exportación a Postgres para informes, que cierra el círculo
con lo que el cliente ya está pagando.

**La traducción para el cliente.**

> «Las dos están contratadas» habla del coste de licencia, no del coste de uso: lo caro de una
> base de datos no es contratarla, es operarla. Y partir el histórico entre dos motores le
> añade un modo de fallo nuevo a lo único que existe para que Camila deje de dar respuestas
> equivocadas. Hoy tiene tres fuentes que no coinciden; no le voy a entregar una pantalla con
> dos fuentes internas que tampoco.

### 2.6 Efecto sobre los puntos abiertos

- Cierra el punto 1 del encuadre (Postgres, Mongo o ambas) → **Mongo sola**.
- Fija el modelo de datos que usarán P03 (identidad del evento) y P04 (estado derivado).

---

## P03 · Qué es «el mismo evento» y en qué instante ocurrió

### 3.1 La raíz: ninguno de los tres manda un identificador de evento

Ninguno de los tres formatos trae un `event_id`. Solo mandan el número de guía, que identifica
el **envío**, no el **evento**.

Por eso la frase 04 del cliente —*«a veces reenvían los mismos eventos, pero eso no pasa nada,
¿verdad?»*— no es una pregunta, es un encargo: **hay que fabricar la identidad de cada evento
a partir de su contenido**. Y en cuanto la identidad se calcula del contenido, cualquier campo
que entre en el cálculo se vuelve crítico: si se interpreta mal, el mismo evento produce dos
identidades y entra dos veces.

Uno de esos campos es la fecha. Y la fecha de RutaSur no se sabe interpretar. **Por eso el huso
y la clave de deduplicación son un solo problema**: el huso decide el instante, el instante
forma parte de la identidad, y la identidad decide qué es un duplicado.

### 3.2 El huso de RutaSur: la evidencia y lo poco que vale

RutaSur manda `30/08/2026 10:22`. Sin zona, sin desplazamiento y sin segundos.

La única pista es que el enunciado presenta los tres ejemplos como **el mismo envío en la misma
ciudad**. Andes lo sitúa en `14:22:10Z`. Con hora de Venezuela (UTC−4), `10:22` es `14:22Z` y
cuadra; con hora de Colombia (UTC−5) sería `15:22Z` y no cuadra.

**Asunción adoptada: RutaSur informa en UTC−4, el reloj de Venezuela.**

Dos matices que hay que dejar escritos:

1. **Es una inferencia sobre una sola muestra.** Un ejemplo que encaja no es una prueba; es la
   mejor evidencia disponible y nada más. Por eso la asunción es **configuración por
   transportista**, no una constante en el adaptador — vive donde el vocabulario de estados
   (§1.6).
2. **El reloj es el del transportista, no el del lugar del evento.** Cúcuta está en Colombia
   (UTC−5), en la frontera. Si RutaSur sellara «hora local del lugar», `10:22` allí sería
   `15:22Z` y no cuadraría. Como cuadra con −4, la lectura es que sella con su propio reloj
   fijo mire donde mire el paquete. Eso abarata la solución: una constante por transportista en
   vez de una tabla de ciudades a zonas horarias. Y como ni Colombia ni Venezuela aplican
   horario de verano, el desplazamiento no cambia en todo el año: la conversión es total, sin
   horas repetidas ni horas inexistentes.

### 3.3 Por qué importa: tres daños, de menor a mayor

**Daño 1 — la línea de tiempo se desordena.** Con cuatro o cinco horas de desvío, los eventos
de RutaSur se intercalan mal con los de los otros dos. Camila puede ver «en reparto» antes que
«recogido». Feo y confuso, pero visible.

**Daño 2 — el estado actual miente. Este es el caro.** Basta una hora de error:

> **Verdad (RutaSur es −4):** «en reparto» a las 10:22 → `14:22Z`. Andes: «entregado» a las
> `15:00Z`. Estado actual correcto: **entregado**.
>
> **Con la asunción equivocada (−5):** el evento de RutaSur se guarda como `15:22Z` y pasa a
> ser el más reciente. Estado actual: **en reparto**.

El paquete se entregó hace cuarenta minutos y la pantalla dice que va en camino. No es un fallo
de visualización: es **exactamente la respuesta equivocada que este proyecto existe para
eliminar**. Y ocurre en el momento de más riesgo, el traspaso entre transportistas, cuando dos
reportan el mismo envío con pocos minutos de diferencia.

**Daño 3 — la asunción queda cocida dentro de la clave.** Como el instante forma parte de la
identidad, todos los eventos históricos de RutaSur llevan dentro el desplazamiento usado el día
que entraron. Cambiar la configuración **no arregla lo ya guardado**: el mismo evento reenviado
después del cambio genera otra identidad y se almacena duplicado. Corregir el huso no es un
interruptor, es una migración —recalcular fecha y clave de todos los eventos de RutaSur y
volver a deduplicar—. Con 2 M de eventos, un tercio suyos, son unos 600 000 documentos.

Dos mitigaciones, las dos baratas:

- **El crudo lo hace reversible.** Se puede recalcular porque la cadena `"30/08/2026 10:22"`
  original sigue guardada. Sin el crudo habría que deshacer una conversión a ciegas.
- **La asunción viaja con el dato.** Cada evento guarda el desplazamiento que se usó para
  calcularlo (`sourceOffset`). Así se sabe qué eventos se computaron bajo qué asunción, la
  migración ataca solo a los afectados y nadie tiene que adivinar.

### 3.4 Las cinco preguntas abiertas y sus respuestas

| # | Pregunta | Decisión | Motivo en una línea |
|---|---|---|---|
| 1 | ¿Truncar al minuto o conservar segundos? | **Truncar al minuto** | Unos segundos no cambian una operación de miles de eventos al día, y truncar mide a los tres con la misma regla. |
| 2 | ¿El lugar entra en la clave? | **No** | Texto libre, conjunto abierto, sin forma canónica: la identidad sería tan estable como la ortografía del transportista. |
| 3 | ¿Cómo se desempata a igualdad de instante? | **Gana el que llegó después** | A falta de mejor información, el reporte más reciente es el conocimiento más actual; y es determinista. |
| 4 | ¿Qué se hace con el duplicado? | **Contarlo** | Sale gratis: la misma escritura que deduplica incrementa el contador. |
| 5 | Umbrales de cordura | **+15 min al futuro, 90 días al pasado** | Ver §3.6. |

**Sobre truncar, una precisión importante:** truncar **no elimina** los empates, los hace
explícitos. Hoy Andes a las `14:22:10` y RutaSur a las `14:22:00` no empatan, pero RutaSur
pierde por un artefacto de su granularidad, no porque ocurriera antes. Al truncar, los dos caen
en `14:22:00` y el empate sale a la luz, donde lo resuelve una regla escrita. Las decisiones 1
y 3 son la misma decisión partida en dos: una hace visible el problema y la otra lo resuelve.

Y truncar **no tira el dato**: `occurredAt` queda truncado (es el campo canónico, indexado y
parte de la clave) y el instante exacto tal como llegó se conserva aparte en `occurredAtExact`.
Lo que se sacrifica es el segundo **como criterio de orden y de identidad**, no como
información.

Beneficio lateral de truncar que no estaba previsto: absorbe el temblor de los reenvíos. Un
transportista que regenera la marca de tiempo al reenviar y la mueve un par de segundos
produciría hoy un duplicado; truncado al minuto, no.

### 3.5 La clave, definida

**Descartada: el hash del payload crudo.** Es lo primero que se le ocurre a cualquiera y lo
mata la propia frase 06 del cliente (*«si viene algún campo raro que no conocemos, ignórenlo y
sigan»*): si el transportista reenvía el mismo evento con un campo nuevo, otro orden de claves
o un espacio de más, el hash cambia y entra un duplicado. La identidad no puede depender de la
forma del envoltorio, precisamente porque han avisado de que el envoltorio va a cambiar.

**Criterio adoptado:** *solo entran en la identidad los campos cuya normalización es
determinista y de conjunto cerrado.*

```
dedupKey = carrier | trackingNumber | occurredAt(truncado al minuto, UTC) | status
```

| Campo | ¿Entra? | Por qué |
|---|---|---|
| `carrier` | **sí** | Ver abajo: dos fuentes coincidiendo no son un duplicado. |
| `trackingNumber` | **sí, y primero** | Identificador, y prefijo del futuro reparto horizontal (§2.5). |
| `occurredAt` truncado | **sí** | Conjunto cerrado tras la normalización: un número. |
| `status` canónico | **sí** | Conjunto cerrado de cinco valores. |
| `location` | **no** | Texto libre y abierto: `Cúcuta`, `CUCUTA`, `Cucuta, Norte de Santander`. |
| `raw` completo | **no** | Frase 06: el envoltorio cambia sin avisar. |

**Por qué `carrier` va dentro, que es lo menos obvio.** El enunciado dice que los tres reportan
**el mismo envío**. Puede pasar que Andes y RutaSur informen el mismo hecho, en la misma
ciudad, en el mismo instante. Eso **no es un duplicado**: son dos fuentes independientes
coincidiendo, y la procedencia es información, no ruido. Deduplicar entre transportistas
significaría que un fallo de reloj en uno silencia el evento real de otro, y una vez fusionado
no hay vuelta atrás. Además, la idempotencia que pide el cliente es contra **reenvíos del mismo
transportista**, que es otro fenómeno. Si en pantalla queda ruidoso, se agrupa visualmente
(«reportado por Andes y RutaSur»): **se deduplica en el almacenamiento por origen, se agrupa en
la presentación.**

**La escritura que deduplica y cuenta a la vez.** Un solo `bulkWrite` con `ordered: false`
resuelve el lote entero:

```ts
{ updateOne: {
    filter: { dedupKey },
    update: {
      $setOnInsert: { ...evento canónico, receivedAt },
      $inc:         { timesReceived: 1 },
      $set:         { lastReceivedAt },
    },
    upsert: true,
}}
```

De ahí salen los contadores del lote sin escribir una línea más: `upsertedCount` son los nuevos
y `modifiedCount` los duplicados. Es la respuesta a la pregunta 4 y deja encaminado el opcional
de métricas de ingesta sin haberlo perseguido.

*Detalle honesto:* con índice único y `upsert` concurrente existe la carrera clásica que
devuelve `E11000`; ese documento se reintenta una vez y ya está. No es un caso teórico con tres
lotes de cinco mil llegando a la vez.

### 3.6 Los umbrales de cordura

La inconsistencia del enunciado —el epoch de TransBolívar cae en 2025 y no en 2026— deja de ser
una curiosidad en cuanto se lee como comportamiento posible en producción: **un transportista
con el reloj mal puesto**.

| Umbral | Valor | Por qué |
|---|---|---|
| Futuro | **+15 min** sobre `receivedAt` del lote | Un evento no puede haber ocurrido después de que nos lo cuenten; los 15 min son margen para relojes desincronizados y latencia del lote. Apretado a propósito: **un evento futuro deja el estado del envío clavado para siempre**, porque ningún evento posterior podrá superarlo. |
| Pasado | **90 días** antes de `receivedAt` del lote | Generoso porque un evento viejo no secuestra el estado actual, solo ensucia la línea de tiempo. Cubre de sobra un envío atascado en aduana o un transportista reenviando su atraso, y aun así atrapa el fallo del año, que está a 365 días. |

- Se miden contra el `receivedAt` **del lote original**, no contra el reloj de ahora: si algún
  día se reprocesa un lote de hace seis meses, medirlo contra hoy mandaría el lote entero a
  cuarentena.
- Al saltar: **cuarentena, nunca descarte silencioso** — la maquinaria de §1.6.
- Son configuración por transportista, no constantes: viven donde la zona horaria.

Y en la misma línea, el análisis de `30/08/2026` es **estricto y con formato declarado**.
`new Date("30/08/2026 10:22")` devuelve fecha inválida y `new Date("05/08/2026")` devuelve el 8
de mayo en vez del 5 de agosto: falla en silencio y con el día equivocado. Nada de análisis
permisivo; lo que no encaje con el formato declarado va a cuarentena. (Coherente con §1.4: *el
fallo peligroso no es el que falla, es el que funciona y miente*.)

### 3.7 Los campos que esto añade al evento canónico

| Campo | Para qué |
|---|---|
| `occurredAt` | instante truncado al minuto, en UTC. Canónico: ordena, indexa y forma la clave. |
| `occurredAtExact` | instante tal como llegó, sin truncar. Informativo. |
| `precision` | `'second' \| 'minute'` — de dónde venía la resolución (ya en §1.3). |
| `sourceOffset` | el desplazamiento asumido al convertir (`'-04:00'`). Hace la migración dirigida. |
| `receivedAt` | cuándo nos enteramos. Desempata, audita el retraso del transportista y ancla los umbrales. |
| `dedupKey` | la identidad calculada. Índice único. |
| `timesReceived` / `lastReceivedAt` | cuántas veces llegó y cuándo la última. |

**Dos relojes por evento, no uno:** cuándo ocurrió y cuándo nos enteramos. Es la misma pareja
que sostendrá la decisión sobre lotes desordenados (frase 05).

### 3.8 La red que hace todo esto reversible

> **La deduplicación decide qué es canónico, no qué se conserva.**

Cada evento recibido se registra en crudo pase lo que pase, incluso los descartados por
duplicados o por cuarentena. La clave solo gobierna la colección `events`, que es una
proyección reconstruible. Con esa red debajo, equivocarse de clave o de huso deja de ser un
error irreparable y pasa a ser un reproceso.

### 3.9 Borrador para DECISIONS.md — *reescribir con palabras propias*

**Situación.** El cliente da por hecho que reenviar los mismos eventos «no pasa nada». Sí pasa:
ninguno de los tres transportistas manda un identificador de evento, solo el número de guía,
que identifica el envío y no el evento. Hay que fabricar la identidad a partir del contenido. Y
el contenido incluye una fecha que en el caso de RutaSur llega sin zona horaria y sin segundos,
de modo que decidir la identidad y decidir el instante son el mismo problema.

**Decisión.** La identidad de un evento es transportista + número de guía + instante truncado
al minuto + estado canónico. RutaSur se interpreta en UTC−4, el reloj de Venezuela, porque es
lo que hace cuadrar su ejemplo con el de Andes; la asunción es configuración por transportista
y viaja guardada dentro de cada evento. Se trunca al minuto para medir a los tres con la misma
regla, y a igualdad de instante gana el evento que llegó después. El duplicado no se descarta:
se cuenta sobre el evento que ya existía.

**Alternativas descartadas.** *Hash del payload crudo:* lo mata la propia instrucción del
cliente de ignorar campos desconocidos — un campo nuevo, otro orden de claves o un espacio de
más cambian el hash y meten un duplicado. *Meter el lugar en la clave:* es texto libre sin
forma canónica (`Cúcuta`, `CUCUTA`, `Cucuta, Norte de Santander`), y una identidad solo es tan
estable como el campo menos normalizable que contiene. *Deduplicar entre transportistas:* si
dos informan el mismo hecho no es un duplicado, son dos fuentes coincidiendo; fusionarlas
destruye la procedencia y permite que un fallo de reloj en uno silencie el evento real de otro.
*Conservar los segundos:* mantendría la precisión de dos de los tres, pero dejaría a RutaSur
compitiendo en desventaja permanente al ordenar, perdiendo empates por un artefacto de su
granularidad y no porque ocurriera antes.

**Qué sacrifiqué.** El segundo como criterio de orden: dos eventos del mismo minuto ya no se
pueden ordenar por lo que dice la fuente, sino por una regla nuestra. El dato exacto se
conserva aparte, pero deja de decidir. Sacrifiqué también la certeza sobre el huso: está
apoyado en un solo ejemplo del enunciado, y como el instante forma parte de la identidad, esa
asunción queda cocida dentro de la clave de todos los eventos de RutaSur ya guardados —
corregirla no será un interruptor, será una migración. Y acepto ver duplicados aparentes en
pantalla cuando dos transportistas reporten lo mismo, porque prefiero explicarlos a fusionarlos
sin vuelta atrás.

**Qué rompe esto a escala 100×.** Nada por volumen: la deduplicación es un índice único y una
escritura por lotes, y cuesta lo mismo con veinte mil eventos que con dos millones. Lo que
escala mal es el error: si el huso de RutaSur resulta ser otro, no se corrige con un cambio de
configuración, hay que recalcular fecha y clave de unos 600 000 documentos y volver a
deduplicar. Es un trabajo por lotes, no un despliegue. Se puede hacer porque el payload crudo
sigue guardado y porque cada evento lleva escrito el desplazamiento con el que se calculó, así
que la migración ataca solo a los afectados. Y con cuatro transportistas crece la probabilidad
del caso que más ruido hace: varios reportando el mismo envío, lo que multiplica los empates de
instante y hace que la regla de desempate deje de ser un detalle.

**Qué haría con una semana más.** Una vigilancia del huso: para los envíos que reportan dos
transportistas a la vez, comparar sistemáticamente el desfase entre sus reportes del mismo
estado. Si la asunción de RutaSur está mal, ese desfase se agrupa alrededor de una hora exacta
y salta a la vista sin esperar a que alguien se queje. Y escribiría las pruebas de esta pieza,
que es la más frágil del sistema: los tres formatos, el cambio de huso, el minuto truncado, el
reenvío con un campo extra y el evento fechado en el futuro.

**La traducción para el cliente.**

> Reenviar el mismo evento sí pasa algo, porque ninguno de los tres nos manda un identificador
> de evento: nos toca deducir cuál es cuál por su contenido. Lo hemos resuelto, y de paso
> contamos cuántas veces llega cada uno, que es información gratis sobre cómo se porta cada
> transportista. Lo que no vamos a hacer es fusionar el reporte de Andes con el de RutaSur
> cuando coincidan: que dos fuentes independientes digan lo mismo es una confirmación, y
> borrarla sería tirar la única prueba de que el dato es bueno.

### 3.10 Efecto sobre los puntos abiertos

- Cierra el punto 5 (zona horaria asumida para RutaSur) → **UTC−4, configurable, guardada por
  evento**.
- Cierra el punto 7 (estrategia de deduplicación) → **clave natural de cuatro campos**.
- Deja encaminado el opcional de métricas de ingesta sin comprometerse a desarrollarlo.

---

## P04 · Cómo comparten los tipos el panel y el API

### 4.1 La frase que hay detrás

> Frase 10: *«Que el panel y el API compartan los tipos, ya nos pasó de romper la pantalla al
> cambiar algo por detrás.»*

Lo que describe no es un problema de tipos, es un problema de **momento en que se descubre el
fallo**. Alguien cambió el API, nadie tocó el panel, y el error apareció delante de Camila. Una
solución que solo detecte el desajuste al compilar es media solución: si el panel se despliega
por separado, compila perfectamente contra un contrato que el API ya no cumple.

### 4.2 Las opciones

| Opción | Cómo | Por qué no |
|---|---|---|
| **Copia manual** de interfaces | dos ficheros `types.ts`, uno a cada lado | Es exactamente el fallo que el cliente está contando. Divergen el día que alguien tiene prisa. |
| **Generación desde OpenAPI** | el API publica el esquema, un generador escribe los tipos del panel | Funciona y es lo estándar en equipos grandes, pero mete un paso de generación y un artefacto que hay que regenerar y versionar. Para un equipo de dos personas es una pieza más que mantener y que se queda obsoleta en silencio. |
| **tRPC o similar** | tipos extremo a extremo por inferencia | Acopla el panel al API a nivel de framework. El enunciado fija NestJS y Next.js; meter una tercera pieza que los case es más superficie que valor. |
| **Paquete interno con esquema de Zod** ✅ | `@andina/contracts`: el esquema es la fuente y el tipo se deriva con `z.infer` | — |

### 4.3 La decisión

**Un paquete interno del espacio de trabajo, `@andina/contracts`, donde la fuente de verdad es
un esquema de Zod y el tipo de TypeScript se deriva de él.**

Dos propiedades, y la segunda es la que de verdad responde a la frase del cliente:

1. **No pueden divergir.** No hay dos definiciones que sincronizar, hay una de la que sale la
   otra. Escribir un tipo a mano al lado del esquema sería reintroducir el problema.
2. **El contrato se comprueba en ejecución, no solo al compilar.** Un tipo de TypeScript se
   evapora en `tsc`; el esquema sigue ahí cuando el API devuelve algo que no debía, y revienta
   en el borde con un mensaje concreto en vez de dos capas más adelante con un `undefined` en
   mitad de la pantalla.

Eso segundo es, de paso, el opcional **«contrato verificable»** del enunciado. No se persigue
como funcionalidad extra: sale de haber elegido bien la herramienta.

### 4.4 Tres decisiones finas que salieron al escribirlo

**a) El contrato NO incluye el cuerpo de la petición de ingesta.**
Son dos fronteras distintas: panel ↔ API por un lado, transportista → API por otro. El payload
que manda Andes Express es un contrato suyo, propio y distinto del de RutaSur, y lo valida su
adaptador. Meterlo aquí obligaría al panel a conocer los tres formatos de entrada, que es
literalmente lo que este proyecto existe para ocultar. Lo que sí viaja en el contrato es el
**informe** de la ingesta, porque eso sí lo mira una persona.

**b) El identificador de transportista es `string` abierto en el contrato, cerrado en el API.**
El conjunto de transportistas con adaptador escrito es cerrado —vive donde viven los
adaptadores— pero el panel no necesita conocerlo: recibe identificador y nombre para mostrar
como datos. Consecuencia práctica: **dar de alta el cuarto transportista en enero no obliga a
volver a desplegar el panel.** El conjunto que sí es cerrado y sí viaja son los cinco estados
canónicos, porque la pantalla dibuja cinco y solo cinco.

**c) Los cinco estados llevan valores en español.**
El convenio del proyecto es código en inglés, y se mantiene para los identificadores. Pero
`recogido`, `en_transito`, `en_reparto`, `incidencia` y `entregado` no son nombres de código:
son el vocabulario del negocio, el mismo que usa Camila. Traducirlos a inglés para volver a
traducirlos en pantalla añade una capa de mapeo que no resuelve nada y que es una fuente de
fallos más.

**d) Todo instante que cruza el cable es UTC con `Z` obligatoria.**
No es un detalle de formato, es la decisión P03 escrita dentro del contrato: el esquema
rechaza `2026-08-30T10:22:00-04:00` aunque sea el mismo instante. A partir del borde del API,
los tres husos de entrada dejan de existir. Comprobado en ejecución:

```
UTC ok      -> true
con -04:00  -> false
estado raro -> false   ('EnRuta', el valor crudo de RutaSur)
estado ok   -> true    ('en_transito')
```

### 4.5 Borrador para DECISIONS.md — *reescribir con palabras propias*

**Situación.** El cliente cuenta que ya se les rompió la pantalla al cambiar algo por detrás, y
pide que el panel y el API compartan los tipos. El problema real no es tener tipos, es que el
desajuste aparezca delante de la persona que atiende al cliente en vez de delante de quien hizo
el cambio.

**Decisión.** Un paquete interno del espacio de trabajo con los esquemas de los datos que
cruzan entre las dos capas, escritos con Zod, del que se derivan los tipos de TypeScript en vez
de escribirlos aparte. El mismo esquema valida en el borde del API en tiempo de ejecución.

**Alternativas descartadas.** *Copiar las interfaces a los dos lados:* es exactamente el fallo
que el cliente está describiendo, y divergen el primer día que alguien tiene prisa. *Generar
los tipos del panel desde la documentación del API:* funciona y es lo habitual en equipos
grandes, pero añade un paso de generación y un artefacto versionado que se queda obsoleto en
silencio; para dos personas es una pieza más que mantener. *Acoplar las dos capas con una
librería de tipos extremo a extremo:* obligaría a meter una tercera pieza entre dos frameworks
que el encargo ya fija.

**Qué sacrifiqué.** Validar en ejecución cuesta tiempo de proceso en cada petición, y en la
ingesta eso se multiplica por cinco mil. Es un coste medible y lo asumo porque el borde es
justo donde quiero pagarlo. Sacrifiqué también algo de comodidad: el panel no puede inventarse
campos "temporales" en una respuesta para salir del paso, porque el esquema los rechaza; a
cambio, nadie descubre en producción que ese campo temporal se quedó tres meses.

**Qué rompe esto a escala 100×.** No el número de eventos, sino el número de esquemas. Con
cuatro transportistas y más pantallas, un paquete de contrato mal organizado se convierte en un
cajón donde todo el mundo añade y nadie borra. Lo que hay que vigilar es la frontera: el
contrato es lo que cruza entre el panel y el API, y no debe absorber ni los formatos de entrada
de los transportistas ni la forma interna de los documentos guardados. Cada vez que uno de esos
dos se cuele aquí, el panel empieza a conocer cosas que no le tocan.

**Qué haría con una semana más.** Publicaría el esquema también como documentación del API
generada desde el mismo sitio, para que un transportista nuevo no tenga que leer código para
saber qué se le acepta. Y añadiría una comprobación automática que falle si una respuesta del
API no valida contra su propio contrato, para que el desajuste se note en las pruebas y no en
la primera petición real.

### 4.6 Efecto sobre los puntos abiertos

- Cierra el punto 3 (monorepo vs. dos proyectos) → **monorepo con espacios de trabajo de npm**.
- Cierra el punto 4 (cómo se comparten los tipos) → **paquete interno con Zod, tipo derivado**.
- Deja resuelto el opcional **«contrato verificable»** como efecto lateral, no como funcionalidad
  perseguida.

---

## P05 · Espacio de trabajo y entorno de ejecución

Estas dos no son material de `DECISIONS.md` —son organización, y van al `README`— pero se
anotan aquí porque se tomaron durante el desarrollo y conviene que estén razonadas.

### 5.1 Monorepo con espacios de trabajo de npm

```
proyecto/
├── package.json          espacios de trabajo, sin herramienta extra
├── tsconfig.base.json    strict + los cuatro extras que de verdad pillan fallos
├── packages/
│   └── contracts/        @andina/contracts — el contrato compartido
└── apps/
    ├── api/              NestJS
    └── panel/            Next.js
```

**Espacios de trabajo de npm y no pnpm ni Turborepo.** El requisito de tipos compartidos obliga
a monorepo; la herramienta para gestionarlo, no. npm viene con Node 22, no hay que instalar
nada, no hay fichero de configuración que aprender y `npm install` en la raíz deja el proyecto
listo. Con tres paquetes, lo que aporta una herramienta de construcción incremental es menos
que lo que cuesta que dos personas nuevas la aprendan. Si el proyecto creciera a diez paquetes,
la conversación cambia.

**`strict` y cuatro comprobaciones más.** Además de `strict`, están activadas
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` y
`noFallthroughCasesInSwitch`. Las dos primeras son las que de verdad importan aquí: la primera
obliga a tratar el caso de que un índice no exista —que en un lote de cinco mil eventos pasa— y
la segunda distingue *«el campo no vino»* de *«el campo vino vacío»*, que es exactamente la
diferencia entre los tres transportistas con el `country`.

### 5.2 Docker: dos servicios, no un contenedor

La idea inicial era un único `Dockerfile` sobre `node:22` donde corrieran Mongo y la aplicación.
Se descarta por tres motivos concretos:

1. **`node:22-alpine` no puede ejecutar `mongod`**, que necesita glibc. Habría que irse a la
   imagen Debian e instalar MongoDB por `apt` dentro, con lo que la imagen crece y la
   construcción se vuelve frágil.
2. **Dos procesos en un contenedor exigen un supervisor.** Sin él, si `mongod` muere el
   contenedor sigue pareciendo sano y Docker no reinicia nada.
3. **No se ahorra el volumen.** El requisito dice que los datos sobrevivan a un reinicio, así
   que hace falta un volumen montado en `/data/db` igualmente. El contenedor único no evita
   ninguna de las piezas, solo las esconde.

**Decisión: `docker compose` con dos servicios** —la imagen oficial de Mongo y un `Dockerfile`
sobre `node:22` para la aplicación—. Sigue siendo *un solo comando*, que es lo que pide el
enunciado (y `docker compose up` es literalmente el ejemplo que da), y añade gratis volumen con
nombre, comprobación de salud y política de reinicio.

---

## P06 · Semántica del endpoint de ingesta: síncrono o aceptado

### 6.1 El presupuesto real

Lotes de hasta cinco mil eventos, tres veces al día, por transportista. Con cuatro
transportistas son doce peticiones al día y unos 60 000 eventos. **No es un sistema con carga
continua: es un sistema que duerme y se despierta doce veces.** Dimensionarlo como si recibiera
tráfico constante sería resolver un problema que no existe.

Cuánto tarda de verdad un lote de cinco mil: normalizar es trabajo de CPU sobre objetos
pequeños, y la escritura es un `bulkWrite` sin orden más otro para la proyección de envíos. El
orden de magnitud es **por debajo de dos segundos**, no de dos minutos.

### 6.2 Las dos opciones

| | Síncrono (200 con el informe) | Aceptado (202 + proceso diferido) |
|---|---|---|
| Cuándo sabe el transportista qué pasó | en su propia respuesta | cuando consulte un endpoint de estado |
| Infraestructura | ninguna | una cola: en memoria se pierde al reiniciar, persistida es una pieza más que mantener |
| Consistencia para Camila | al responder, el dato ya se consulta | hay una ventana en la que el 202 ya se dio y el panel no lo refleja |
| Riesgo | mantiene una conexión abierta unos segundos | el informe acaba en una pantalla que nadie mira |

### 6.3 La decisión

**Síncrono: `200` con el informe del lote.**

El argumento decisivo no es el rendimiento, es una restricción del encargo que se olvida
fácil: **a los transportistas no se les puede pedir nada.** No hay pull, no hay reintento que
podamos provocar, no hay a quién llamar. Consecuencia: **el único momento garantizado en que
vamos a tener su atención es mientras nos están hablando.** Un 202 aplaza el veredicto a un
endpoint de estado que estos tres no van a consultar, y el desglose de descartes —que es la
información que hace falta para arreglar la causa— acaba en un sitio que nadie abre.

Y es una elección segura precisamente por la decisión anterior: si el cliente del transportista
corta por tiempo de espera y reintenta el lote entero, **la clave de deduplicación hace que el
reintento no cueste nada**. Las dos decisiones se sostienen la una a la otra: sin idempotencia,
el endpoint síncrono sería temerario.

Piezas que van con ella:

- **Límite de tamaño de lote**, con `413` si se supera. Acota el tiempo de respuesta por diseño
  en vez de confiar en que nadie mande cincuenta mil de golpe.
- **Escritura por trozos**, no un `for` con una escritura por evento ni una transacción única
  gigante: `bulkWrite` sin orden, en bloques, con éxito parcial.
- **Códigos coherentes:** `200` aunque haya eventos en cuarentena, porque la cuarentena es un
  resultado normal y no un fallo de la petición; `404` si el transportista no tiene adaptador;
  `413` si el lote es demasiado grande; `400` solo si el sobre en sí es ilegible.

### 6.4 Borrador para DECISIONS.md — *reescribir con palabras propias*

**Situación.** Los transportistas mandan lotes de hasta cinco mil eventos tres veces al día y
no hay forma de pedirles nada: ellos empujan y nosotros recibimos. Había que decidir si la
petición espera a que el lote esté procesado o si se acepta y se responde después.

**Decisión.** El endpoint procesa el lote y responde con el informe: cuántos entraron, cuántos
eran reenvíos y cuántos quedaron en cuarentena, con el desglose de por qué. La escritura va por
bloques con éxito parcial, nunca evento a evento ni en una transacción única.

**Alternativas descartadas.** *Aceptar con un 202 y procesar después:* es lo que se hace cuando
el trabajo es largo o la carga es continua, y aquí no es ninguna de las dos cosas —son doce
lotes al día y cada uno se resuelve en un par de segundos—. Además obliga a una cola, que si
vive en memoria se pierde al reiniciar y si se persiste es otra pieza que mantener. Pero lo que
de verdad la descarta es que el informe de errores acabaría en un endpoint de estado que estos
transportistas no van a consultar. *Procesar el lote en una sola transacción:* un evento malo
tumbaría los otros cuatro mil novecientos noventa y nueve, que es justo lo contrario de lo que
pide el cliente cuando dice que sigamos adelante con lo que no entendamos.

**Qué sacrifiqué.** El transportista espera unos segundos en cada lote, y si algún día mandan
lotes mucho mayores esa espera crece; por eso hay un límite de tamaño explícito, que es una
restricción que les impongo. Sacrifiqué también la comodidad de absorber un pico: si los cuatro
transportistas coincidieran a la misma hora, las peticiones compiten en vez de encolarse.

**Qué rompe esto a escala 100×.** No los cinco mil eventos, sino el día que dejen de ser tres
lotes al día. Si un transportista pasara a mandar continuamente, o si el volumen por lote se
multiplicara, la respuesta síncrona empieza a rozar los tiempos de espera y toca dar el paso a
aceptar y procesar aparte. Ese cambio es barato porque la pieza que normaliza y la que escribe
no se enteran de por dónde entró el lote: lo que cambia es el controlador. Lo que sí habría que
resolver ese día es dónde ve el transportista el resultado, que es el problema que hoy nos
ahorramos.

**Qué haría con una semana más.** Guardaría el informe de cada lote como un registro
consultable, para poder responder «¿qué pasó con el envío de ayer a las tres?» sin buscar en
los registros del servidor. Con eso, el opcional de métricas de ingesta queda hecho: los
números ya se calculan, solo hay que dejar de tirarlos.

### 6.5 Efecto sobre los puntos abiertos

- Cierra el punto 6 (semántica del endpoint de ingesta) → **síncrono, 200 con informe**.

---

## P07 · Lo que apareció al escribir las pruebas de normalización

Las pruebas están en `apps/api/src/normalization/normalizer.test.ts`. Trece casos, elegidos por
los bordes que aparecieron leyendo los datos, no por cobertura. Tres cosas que salieron de
escribirlas:

### 7.1 El umbral del futuro delata el huso mal configurado

No estaba previsto. Si se configura RutaSur como UTC−5 en vez de UTC−4, sus eventos aterrizan
una hora más tarde de lo real; y cuando el lote llega fresco, ese desplazamiento los coloca
**después del momento en que el transportista nos los contó**, que es imposible. El umbral de
cordura salta.

No es una red completa —un lote de la tarde, con horas de retraso, ya no lo detectaría— pero
convierte un fallo silencioso en uno visible sin haber añadido una sola línea. Queda anotado
como lo que es: un efecto lateral afortunado, no un mecanismo de detección en el que confiar.
El mecanismo de verdad sería el que está en el «qué haría con una semana más» de la decisión de
identidad: comparar sistemáticamente el desfase entre transportistas que reportan el mismo
envío.

### 7.2 El ejemplo de TransBolívar del enunciado no pasa

`occurred_at: 1756563730` es `2025-08-30T14:22:10Z`. Frente a un lote recibido en agosto de
2026, está a 365 días: fuera del umbral de 90, y por tanto en cuarentena con el motivo
`date_out_of_bounds`. **Es el comportamiento correcto**, no un fallo: en producción eso sería
un transportista con el reloj mal puesto, y se ve el mismo día en vez de aparecer como un
evento fantasma un año atrás en la línea de tiempo de un envío real.

Decisión sobre el seeder: los datos de ejemplo llevarán el epoch **corregido a 2026**, con el
caso original incluido aparte como ejemplo de cuarentena. Así el sistema se ve con contenido
real y además se ve funcionando la red.

### 7.3 El tipo `RawInstant` es lo que hace imposible olvidar el huso

Un adaptador no puede devolver una fecha ya resuelta: tiene que declarar de qué clase es su
instante. El de RutaSur devuelve `localNaive`, que **por definición no se puede convertir sin un
dato externo**, y el compilador obliga a aportarlo. Si el tipo hubiera sido `Date` a secas, ese
`10:22` se habría convertido en algún punto con la zona del servidor y nadie se habría enterado
hasta que Camila diera una respuesta equivocada. Es la aplicación concreta de §1.4: *el fallo
peligroso no es el que falla, es el que funciona y miente*.
