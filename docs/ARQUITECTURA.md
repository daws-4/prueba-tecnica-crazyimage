# Guía para el equipo que hereda esto

Este documento existe para que alguien que no estuvo en la primera fase pueda tocar el código sin
romper nada y sin tener que preguntar. Si solo vas a leer una sección, lee
[Las siete reglas que no se rompen](#5-las-siete-reglas-que-no-se-rompen).

- Cómo levantarlo → [`../README.md`](../README.md)
- Por qué está hecho así → [`DECISIONS.md`](DECISIONS.md)
- Cómo trabajar aquí con un asistente de IA → [`../CLAUDE.md`](../CLAUDE.md)

---

## 1. Empieza aquí: el problema en tres párrafos

Andina Cargo no tiene flota propia. Contrata a tres transportistas —**Andes Express**,
**TransBolívar** y **RutaSur**— y cada uno informa del avance de los envíos a su manera: distintos
nombres de campo, distintos formatos de fecha, distintos vocabularios de estado. Atención al
cliente vivía con tres portales abiertos buscando la misma guía en cada uno.

Este sistema recibe esos tres formatos, los convierte en **un solo tipo de evento** y los muestra
juntos en una pantalla donde se busca por número de guía.

Lo difícil no es traducir tres formatos. Lo difícil es que el resultado siga siendo **correcto**
cuando los datos llegan tarde, desordenados, repetidos y a veces mal — que es lo que pasa siempre.
Casi todas las rarezas que vas a encontrar en el código están ahí por eso.

**Dos restricciones que lo explican casi todo:**

1. **Los transportistas empujan; no se les puede pedir nada.** No hay forma de reclamar un dato
   perdido. Por eso el payload en crudo se guarda siempre y nada se descarta en silencio.
2. **Los lotes llegan tres veces al día y desordenados.** Por eso el estado de un envío nunca se
   sobrescribe: se compara.

---

## 2. Los cuatro conceptos

Con estos cuatro claros, el resto del código se lee solo.

### El evento canónico

Un evento normalizado. **Su tipo no depende de quién lo mandó**: no hay ni un campo condicionado al
transportista, `carrierId` es un dato más. Definido en
[`packages/contracts/src/event.ts`](../packages/contracts/src/event.ts) para lo que ve el panel, y
en [`apps/api/src/mongo/documents.ts`](../apps/api/src/mongo/documents.ts) para lo que se guarda.
Son distintos a propósito: el panel no necesita el payload crudo ni la clave de deduplicación.

### Gramática y vocabulario

La distinción que sostiene la extensibilidad:

| | Qué es | Dónde vive | Quién lo cambia |
|---|---|---|---|
| **Gramática** | Dónde están los campos, qué forma tiene la fecha | Un adaptador `.ts` por transportista | Un programador, con despliegue |
| **Vocabulario** | Traducción de estados, huso horario, umbrales | [`vocabulary.ts`](../apps/api/src/carriers/vocabulary.ts) | Pensado para editarse desde el panel, sin despliegue |

**El adaptador no interpreta nada.** Saca los campos en bruto y declara de qué clase es la fecha; el
normalizador —común a los tres— aplica las reglas. Esa frontera es lo que hace que dar de alta un
transportista nuevo no obligue a tocar nada de lo que ya funciona.

### La identidad de un evento

Ninguno de los tres transportistas manda un identificador de evento: solo el número de guía, que
identifica el **envío**. Así que la identidad se fabrica del contenido:

```
dedupKey = carrierId | trackingNumber | occurredAt (truncado al minuto) | status
```

Definida en [`normalization/dedup-key.ts`](../apps/api/src/normalization/dedup-key.ts), donde hay una
tabla de qué campo entra y por qué. Un índice único sobre `{trackingNumber, dedupKey}` es lo que
sostiene toda la idempotencia del sistema.

### La proyección del envío

La colección `shipments` **no es una tabla maestra: es una vista derivada de `events`**,
reconstruible entera en cualquier momento. Existe solo para que el listado pueda filtrar por estado
actual, cosa carísima desde la colección de eventos. Si alguna vez diverge de los eventos, **los
eventos tienen razón**.

---

## 3. El recorrido de un evento

```
payload crudo del transportista
        │
        ▼  adapter.extract()              carriers/adapters/*.adapter.ts
   ExtractedEvent { rawStatus, RawInstant, ... }
        │                                 sabe DÓNDE están los campos
        ▼  normalizeEvent()               normalization/normalizer.ts
   ├── resolveInstant()   → UTC, truncado al minuto      normalization/instant.ts
   ├── umbrales de cordura → ¿es creíble esta fecha?
   ├── vocabulary.statusMap → ¿sé traducir este estado?
   └── buildDedupKey()    → la identidad                 normalization/dedup-key.ts
        │
        ├──── no ────► colección `quarantine` (payload intacto + motivo)
        │
        ▼ sí
   bulkWrite sin orden, por bloques       ingestion/events.repository.ts
   inserta si es nuevo, cuenta si es reenvío
        │
        ▼
   proyección del envío                   ingestion/shipments.projection.ts
   comparar y escribir en UNA operación atómica
        │
        ▼
   aviso por SSE                          ingestion/ingestion-events.service.ts
        │
        ▼
   el panel rehace su renderizado         panel/src/components/auto-refresh.tsx
```

---

## 4. Mapa del repositorio

```
packages/contracts/          El contrato compartido entre el API y el panel
apps/api/                    NestJS
apps/panel/                  Next.js
```

### `packages/contracts/src/`

La fuente de verdad es un **esquema de Zod**; el tipo de TypeScript se deriva con `z.infer`. No hay
dos definiciones que puedan divergir, y el esquema sigue existiendo en ejecución.

| Fichero | Qué contiene |
|---|---|
| `common.ts` | Instante UTC obligatorio, número de guía, lugar, paginación por cursor |
| `status.ts` | Los cinco estados canónicos y sus etiquetas |
| `event.ts` | El evento tal y como lo ve el panel |
| `shipment.ts` | Resumen del envío y detalle con línea de tiempo |
| `query.ts` | Parámetros del listado y su respuesta |
| `ingest.ts` | Informe de un lote y los motivos de cuarentena |
| `stream.ts` | Los mensajes del flujo en vivo |

### `apps/api/src/`

| Carpeta | Qué hace | Ojo con |
|---|---|---|
| `carriers/` | **Lo único que sabe de cada transportista** | Nada más en el sistema debe saberlo |
| `carriers/adapters/` | Un fichero por transportista | Solo extraen campos, no interpretan |
| `carriers/vocabulary.ts` | Estados, huso horario y umbrales | Es dato, no lógica |
| `carriers/carrier.registry.ts` | La lista de transportistas con adaptador | **El único sitio que se toca al añadir uno** |
| `normalization/` | Las reglas comunes a todos | No debe importar nada de un transportista concreto |
| `ingestion/` | Escritura por lotes y proyección del envío | Donde vive la idempotencia |
| `shipments/` | El API de consulta | |
| `mongo/` | Conexión, formas guardadas e índices | Cada índice lleva su porqué al lado |
| `seed/` | Datos de ejemplo en los tres formatos | Entra por el mismo endpoint que un transportista |
| `scenarios/` | Seis escenarios cargables uno a uno | Ver el README |
| `config/env.ts` | Configuración validada al arrancar | Si falta algo, el proceso no levanta |

### `apps/panel/src/`

| Fichero | Qué hace |
|---|---|
| `lib/api.ts` | **El único sitio del panel que habla con el API.** Valida cada respuesta contra el contrato |
| `app/page.tsx` | Buscador, filtros y listado |
| `app/envios/[guia]/page.tsx` | Detalle con línea de tiempo |
| `app/api/stream/route.ts` | Puente del flujo en vivo, para que el navegador no hable con el API |
| `components/auto-refresh.tsx` | Escucha el flujo y rehace el renderizado |

---

## 5. Las siete reglas que no se rompen

Si vas a cambiar algo cerca de una de estas, lee antes el comentario del fichero. Están escritas
porque romperlas no produce un error: produce **datos incorrectos en silencio**, que es peor.

### 1. El payload crudo se guarda siempre

Incluido el de los eventos rechazados. Los transportistas empujan y no hay forma de pedirles nada
otra vez: si borras el crudo y luego aparece un fallo en un adaptador, **ese dato se perdió para
siempre**. No es prudencia, es la única red que existe.

### 2. Un estado desconocido no se adivina

Si el vocabulario no sabe traducir un valor, el evento va a cuarentena con el motivo
`unknown_status`. Nunca se mapea «lo más parecido». Ignorar un campo extra y no entender un valor
conocido **no son lo mismo**.

### 3. Las fechas se analizan con formato declarado y estricto

Nada de `new Date(cadena)`. `new Date("30/08/2026 10:22")` devuelve fecha inválida y
`new Date("05/08/2026")` devuelve el 8 de mayo en vez del 5 de agosto: **falla en silencio y con el
día cambiado**. Ver [`normalization/instant.ts`](../apps/api/src/normalization/instant.ts).

### 4. El estado actual se compara, nunca se sobrescribe

Los lotes llegan desordenados: el último en llegar no es el más reciente. La comparación va **dentro
del filtro de la escritura**, así que comparar y escribir son una sola operación atómica. Si alguna
vez lo reescribes como «leer, decidir en el código, escribir», introduces una carrera.

### 5. `beats()` y `beatsFilter()` tienen que cambiar juntas

En [`ingestion/event-order.ts`](../apps/api/src/ingestion/event-order.ts) la misma regla está escrita
dos veces: como función de TypeScript y como filtro de Mongo. **Es duplicación deliberada**, no un
descuido pendiente de refactorizar: una decide el ganador dentro del lote en memoria, la otra lo
decide contra lo que ya está guardado. Si tocas una y no la otra, el sistema se contradice consigo
mismo y nada falla visiblemente.

### 6. El transportista forma parte de la identidad del evento

Que Andes y RutaSur informen del mismo hecho **no es un duplicado**: son dos fuentes independientes
coincidiendo, y eso es información. Si algún día «arreglas» los duplicados aparentes fusionándolos,
un reloj mal puesto en un transportista silenciará el evento real de otro, y no habrá vuelta atrás.
Se agrupan en pantalla; no se fusionan al guardar.

### 7. Solo `carriers/` sabe de transportistas

Si te encuentras escribiendo `if (carrierId === 'rutasur')` fuera de esa carpeta, la solución está
en otro sitio. Ese `if` es el primer paso para que dar de alta un transportista deje de ser barato.

---

## 6. Recetas: quiero hacer X

### Añadir un transportista nuevo

1. Un fichero en `apps/api/src/carriers/adapters/`, que implemente `CarrierAdapter`. Copia el más
   parecido de los tres. **Solo extrae campos**: no traduzcas ni conviertas fechas.
2. Una línea en [`carrier.registry.ts`](../apps/api/src/carriers/carrier.registry.ts).
3. Su vocabulario inicial en [`vocabulary.ts`](../apps/api/src/carriers/vocabulary.ts): traducción de
   estados y desfase horario.
4. Un caso en `normalizer.test.ts` con un payload real suyo.

Nada más. Ni el normalizador, ni la ingesta, ni el panel se enteran — el panel ni siquiera conoce la
lista de transportistas, la recibe como datos.

**Si su fecha viene sin zona horaria**, el adaptador devuelve `{ kind: 'localNaive', ... }` y el
desfase se configura en el vocabulario. El tipo `RawInstant` te obliga a declararlo: no puedes
devolver una fecha ya resuelta ni por descuido.

### Añadir un estado a un transportista existente

Solo su `statusMap` en `vocabulary.ts`. Los eventos que estaban en cuarentena por
`unknown_status` se pueden reprocesar desde su payload crudo.

### Cambiar el huso horario asumido de un transportista

`utcOffsetMinutes` en `vocabulary.ts`. **Pero léete esto antes:** el instante forma parte de la
clave de deduplicación, así que todos los eventos ya guardados de ese transportista llevan dentro el
desfase con el que se calcularon. Cambiar el número no arregla el pasado — hace falta recalcular
fecha y clave de los eventos afectados y volver a deduplicar. Se puede hacer porque el crudo sigue
ahí y cada evento guarda su `sourceOffsetMinutes`.

### Añadir un campo al evento

1. El esquema en `packages/contracts/src/event.ts`.
2. El documento en `apps/api/src/mongo/documents.ts`.
3. Rellenarlo en `normalization/normalizer.ts` y mapearlo en `shipments/shipments.service.ts`.
4. `npm run build -w @andina/contracts` antes de que el resto compile.

**Piensa dos veces antes de meterlo en la clave de deduplicación.** Solo entran campos cuya
normalización es determinista y de conjunto cerrado; el criterio está en `dedup-key.ts`.

### Añadir un filtro al listado

`query.ts` en el contrato y `buildFilter()` en `shipments.service.ts`. Comprueba que hay un índice
que lo soporte en `mongo.service.ts`; si no, añádelo con su comentario.

### Depurar «este envío muestra un estado raro»

1. `GET /shipments/:guia` → mira `currentStatusEventId` y busca ese evento en la línea de tiempo.
2. Compara `occurredAt` con `receivedAt` de cada evento. Casi siempre la respuesta es que llegaron
   desordenados y el sistema está haciendo lo correcto.
3. Si falta un evento que el transportista dice haber mandado, mira la colección `quarantine`
   filtrando por `trackingNumber` dentro de `raw`. El motivo dice qué pasó.

---

## 7. Lo que parece un fallo y no lo es

| Lo que ves | Por qué está bien |
|---|---|
| El último evento de la línea de tiempo no es el que decide el estado | Los lotes llegan desordenados. El estado lo decide el que **ocurrió** más tarde |
| Dos eventos idénticos en el mismo minuto, de transportistas distintos | Dos fuentes coincidiendo. Se agrupan en pantalla, no se fusionan al guardar |
| Los eventos de RutaSur siempre caen en el segundo `:00` | Informa al minuto. Se trunca a todos por igual para medirlos con la misma regla |
| Un evento del enunciado con `occurred_at` de 2025 cae en cuarentena | Está a 365 días del lote, fuera del umbral. En producción sería un reloj mal puesto |
| El envío dice 5 eventos pero enviaste 8 | Tres eran reenvíos. Mira `timesReceived` en cada evento |
| `beats()` está duplicada como filtro de Mongo | Deliberado. Ver la regla 5 |
| El panel no tiene estado de carga en los filtros | Se renderizan en el servidor y viajan en la URL, a propósito |

---

## 8. Comandos

```bash
docker compose up                     # todo, con datos de ejemplo la primera vez
npm test -w @andina/api               # las pruebas de normalización
npm run typecheck --workspaces        # los tres paquetes
npm run escenario -w @andina/api      # lista los escenarios cargables
```

**Si tocas `packages/contracts`, recompílalo** antes de que el API o el panel lo vean:
`npm run build -w @andina/contracts` (o déjalo en marcha con `npm run dev -w @andina/contracts`).

---

## 9. Glosario

| Término | Qué es |
|---|---|
| **Guía** (`trackingNumber`) | Identifica el **envío**. Nunca un evento |
| **Evento canónico** | Un evento ya normalizado, cuyo tipo no depende del transportista |
| **Gramática / vocabulario** | Lo que es código / lo que es dato configurable |
| **`dedupKey`** | La identidad calculada de un evento |
| **Cuarentena** | Un evento que no se pudo interpretar. No es una papelera: se conserva íntegro |
| **Proyección** | La colección `shipments`, derivada de `events` y reconstruible |
| **`occurredAt` / `receivedAt`** | Cuándo ocurrió / cuándo nos enteramos. **Dos relojes distintos** |

---

## 10. Lo que se sabe que falta

Honestidad para que no lo descubras solo:

- **El vocabulario se lee de una semilla en código**, no de una tabla editable. El diseño está
  pensado para ello y `IngestionService.vocabularyFor()` es el único punto que habría que cambiar.
- **No hay reproceso de cuarentena desde el panel.** Los datos están guardados para hacerlo, la
  interfaz no existe.
- **Las métricas de ingesta no se guardan.** Se calculan por lote y se devuelven en la respuesta,
  pero no queda histórico.
- **El canal de avisos en vivo vive dentro de un proceso.** Con dos instancias del API, un panel
  conectado a una no oiría los lotes de la otra. La salida son los *change streams* de Mongo.
- **No hay autenticación**, por decisión de alcance: el panel vive dentro de la red de Andina.
