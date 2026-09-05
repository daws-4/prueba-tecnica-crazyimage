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
| P01 | Los tres formatos de entrada y cómo entra el cuarto transportista | **Debatida — falta elección del autor** |

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

### 1.4 Las tres opciones

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

### 1.5 Comparativa

| | A · Adaptadores en código | B · Perfil declarativo | C · Híbrido |
|---|---|---|---|
| Cuarto transportista normal | despliegue | formulario | formulario |
| Cuarto transportista raro | despliegue | **no se puede** | despliegue aislado |
| Estado nuevo (código 7) | despliegue | formulario | formulario |
| Panel de transportistas | metadatos | real | real |
| Fuerza del tipado | máxima | en ejecución | mixta |
| Zona horaria de RutaSur | constante en código | campo visible y editable | campo visible y editable |
| Coste de construir | bajo | medio | alto |
| Riesgo de romper por error humano | bajo | alto (mitigable con vista previa) | alto (mitigable) |
| Material para `DECISIONS.md` | correcto | bueno | el mejor |

### 1.6 Recomendación

**Opción C, entregando hoy los tres transportistas como perfiles declarativos.**

El argumento no es técnico, es de negocio, y es el que se le daría al cliente:

> El cliente dijo dos cosas en la misma reunión: *"en enero entra un cuarto y no quiero
> volver a pagar por lo mismo"* y *"si viene un campo raro, ignórenlo y sigan"*. Las dos
> apuntan a lo mismo: quiere que el sistema absorba cambios sin llamar al proveedor. Un
> adaptador en código por transportista cumple la letra de la frase 09 —no se toca lo que
> funciona— pero no su intención: sigue habiendo factura en enero. Convertir el mapeo en
> dato editable hace que la factura de enero sea cero para el caso normal, y la puerta de
> escape evita prometer algo que no se puede sostener cuando llegue un formato que no
> encaje.

Y hay un segundo argumento, más callado: **la incidencia frecuente en producción no es
"llegó un transportista nuevo", es "llegó un valor de estado que no conocíamos"**. Eso
pasa varias veces al año por transportista. Si esa incidencia se resuelve con un
despliegue, atención al cliente vuelve a estar bloqueada esperando a desarrollo — que es
exactamente el problema del que Camila quiere salir. En B y C se resuelve desde el panel.

Si el presupuesto de tiempo aprieta, el recorte honesto es: **entregar B completa y dejar
el discriminador `strategy` en el tipo con un solo camino implementado**, documentando en
`DECISIONS.md` que el camino `custom` está previsto en el modelo y no implementado. Eso es
"decirlo y explicar por qué", que puntúa más que fingir.

### 1.7 El bucle que justifica el panel

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

### 1.8 Lo que hace falta decidir

1. ¿A, B o C? (recomendación: C, con recorte a B si aprieta el tiempo)
2. Si es B o C: ¿los perfiles de los tres transportistas actuales se cargan por *seeder*
   y son editables, o se marcan como "de sistema" y no se pueden borrar desde el panel?
   (recomendación: editables, pero no borrables si tienen envíos asociados)
3. ¿La cuarentena y sus métricas entran en el alcance mínimo o son el opcional elegido?

### 1.9 Efecto sobre los puntos abiertos del encuadre

- **No cierra ninguno** de los nueve puntos abiertos: esta pregunta no estaba en esa lista.
- **Condiciona el punto 5** (zona horaria de RutaSur): con B o C deja de ser una constante
  y pasa a ser configuración visible. La asunción sigue habiendo que escribirla, pero
  "qué hacer si esa asunción falla" tiene respuesta operativa: se corrige en el panel y se
  reprocesa.
- **Adelanta trabajo del punto 9** (frase 09 / extensibilidad) y del opcional *reproceso de
  lote*.
- **Añade contexto nuevo al desarrollo:** existe un apartado de gestión de transportistas
  en el panel, y con B o C ese apartado es funcionalidad de núcleo, no accesorio.

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

Cuatro pantallas. La 1 y la 2 son el encargo literal; la 3 es lo que hace que el sistema
sobreviva a enero sin desarrollo; la 4 es lo que hace que un fallo sea visible en vez de
silencioso.

### Detalle de `/transportistas` (el apartado del ejemplo)

**Listado:**

```
┌───────────────────────────────────────────────────────────────────────┐
│  Transportistas                              [ + Nuevo transportista ]│
├───────────────────────────────────────────────────────────────────────┤
│  Nombre           Estrategia    Activo   Eventos hoy   Cuarentena     │
│ ──────────────────────────────────────────────────────────────────────│
│  Andes Express    declarativo    Sí        4.812           0      [✎] │
│  TransBolívar     declarativo    Sí        5.000          13  ⚠   [✎] │
│  RutaSur          declarativo    Sí        3.907           0      [✎] │
└───────────────────────────────────────────────────────────────────────┘
```

La columna *Cuarentena* con el aviso es lo que convierte esta pantalla en algo que alguien
mira, y no en un CRUD muerto. Enlaza directamente al motivo del rechazo.

**Formulario de alta / edición** — cuatro secciones en la misma página, no un asistente
por pasos (menos clics para quien ya sabe lo que hace):

```
┌── 1 · Identidad ─────────────────────────────────────────────────────┐
│  Nombre        [ RutaSur                    ]                        │
│  Identificador [ ruta-sur ]  (se usa en la URL de ingesta, inmutable)│
│  Activo        [x]   ← desactivar NO borra: deja de aceptar lotes    │
│  Estrategia    ( • ) Declarativa   ( ) Manejador propio en código    │
└──────────────────────────────────────────────────────────────────────┘

┌── 2 · Mapeo de campos ───────────────────────────────────────────────┐
│  Campo canónico      Ruta en el payload recibido                     │
│  Guía            *   [ guia                ]                         │
│  Estado          *   [ estado              ]                         │
│  Fecha           *   [ fecha               ]                         │
│  Ciudad              [ lugar               ]                         │
│  País                [                     ]  (RutaSur no lo manda)  │
│                                                                      │
│  Se admite notación de punto: location.city                          │
│  Los campos no mapeados se ignoran (frase 06 del cliente).           │
└──────────────────────────────────────────────────────────────────────┘

┌── 3 · Fechas y zona horaria ─────────────────────────────────────────┐
│  Formato   ( ) ISO-8601   ( ) epoch en segundos   ( • ) patrón       │
│  Patrón    [ DD/MM/YYYY HH:mm ]                                      │
│  Zona      [ America/Caracas (UTC−4) ▾ ]                             │
│                                                                      │
│  ⚠ Este transportista no envía zona horaria. La que se elija aquí se │
│    aplica a todos sus eventos. Si se cambia, los eventos ya          │
│    guardados NO se recalculan solos: hay que reprocesar.             │
└──────────────────────────────────────────────────────────────────────┘

┌── 4 · Diccionario de estados ────────────────────────────────────────┐
│  Valor recibido        Estado canónico de Andina                     │
│  [ Recogido        ]   [ recogido      ▾ ]              [ eliminar ] │
│  [ EnRuta          ]   [ en tránsito   ▾ ]              [ eliminar ] │
│  [ Repartiendo     ]   [ en reparto    ▾ ]              [ eliminar ] │
│  [ Entregado       ]   [ entregado     ▾ ]              [ eliminar ] │
│  [                 ]   [               ▾ ]              [ añadir   ] │
│                                                                      │
│  Si llega un valor no listado:                                       │
│    ( • ) enviar a cuarentena    ( ) ignorar el evento                │
└──────────────────────────────────────────────────────────────────────┘

┌── Probar antes de guardar ───────────────────────────────────────────┐
│  Pega aquí un evento de ejemplo:                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ { "guia": "AC-4471", "estado": "EnRuta",                       │  │
│  │   "fecha": "30/08/2026 10:22", "lugar": "Cúcuta" }             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                    [ Probar mapeo ]  │
│                                                                      │
│  Resultado:                                                          │
│    guía        AC-4471                                               │
│    estado      en tránsito        ← desde "EnRuta"                   │
│    ocurrió     2026-08-30 14:22 UTC   (10:22 local, UTC−4)           │
│    precisión   minuto             ← el origen no manda segundos      │
│    ciudad      Cúcuta                                                │
│    país        —                                                     │
│                                                                      │
│                                     [ Cancelar ]  [ Guardar perfil ] │
└──────────────────────────────────────────────────────────────────────┘
```

Tres decisiones incrustadas en este formulario que conviene notar:

1. **"Probar mapeo" no es un extra, es lo que hace segura la opción B/C.** Sin vista previa,
   dar de alta un transportista es rellenar un formulario a ciegas y rezar. Con ella, el
   error se ve antes de que entre el primer lote.
2. **Desactivar en vez de borrar.** Un transportista con eventos históricos no se puede
   eliminar sin dejar huérfana la línea de tiempo de envíos reales. El botón "eliminar"
   solo aparece si el perfil no tiene ningún evento asociado; en el resto de casos, la
   acción disponible es desactivar.
3. **El aviso de la zona horaria dice la verdad incómoda:** cambiar la configuración no
   reescribe el pasado. Decirlo en la pantalla evita la llamada de "cambié la zona y los
   envíos viejos siguen mal".

### Qué queda por diseñar de la pantalla

- `/envios/[guia]`: cómo se marca visualmente que el estado actual se **deriva** del evento
  de mayor `occurredAt` y no del último recibido (frase 05 — la trampa).
- `/`: qué filtro exacto se ofrece y cómo se pagina.
- Estrategia de fetching y refresco (punto abierto del encuadre).
