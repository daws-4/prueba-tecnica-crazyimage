# CLAUDE.md

Instrucciones para trabajar en este repositorio con un asistente de IA.

**Andina Cargo · seguimiento de envíos.** Tres transportistas externos empujan lotes de eventos en
tres formatos distintos; esto los normaliza a un solo modelo y los muestra en una pantalla donde se
busca por número de guía.

Antes de tocar nada sustancial: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) explica cómo funciona
y dónde se cambia cada cosa; [`docs/DECISIONS.md`](docs/DECISIONS.md) explica por qué está así.

---

## Comandos

```bash
docker compose up                          # entorno completo, siembra datos la primera vez
npm install                                # espacios de trabajo de npm, desde la raíz
npm run build -w @andina/contracts         # OBLIGATORIO tras tocar el contrato
npm run build -w @andina/api               # necesario antes de seed, start y escenario
npm test -w @andina/api                    # 13 pruebas de normalización (compila por su cuenta)
npm run typecheck --workspaces             # los tres paquetes
npm run escenario -w @andina/api -- todos  # carga los seis escenarios de demostración
```

**Si modificas `packages/contracts`, recompílalo antes de dar por buena cualquier comprobación de
tipos del API o del panel.** Consumen la salida compilada, no el código fuente.

---

## Arquitectura en seis líneas

- **`packages/contracts`** — esquemas de Zod de los que se **derivan** los tipos con `z.infer`.
  Fuente de verdad única entre API y panel, y se valida en ejecución.
- **`apps/api`** — NestJS. `carriers/` es lo único que sabe de cada transportista;
  `normalization/` tiene las reglas comunes; `ingestion/` escribe; `shipments/` consulta.
- **`apps/panel`** — Next.js. Renderizado en el servidor sin caché; `lib/api.ts` es el único sitio
  que habla con el API.
- **MongoDB** con el controlador nativo, sin Mongoose. Tres colecciones: `events`, `shipments`
  (proyección derivada), `quarantine`.

---

## Invariantes: romper esto no da error, da datos incorrectos

Las siete completas están en `docs/ARQUITECTURA.md`. Las que más fácil se rompen sin querer:

1. **El payload crudo se guarda siempre**, incluso el de eventos rechazados. No hay forma de
   pedirle nada a un transportista otra vez: si se borra, el dato se perdió.
2. **Un estado desconocido va a cuarentena; no se adivina el más parecido.**
3. **Las fechas se analizan con formato declarado.** Nunca `new Date(cadena)`:
   `new Date("05/08/2026")` devuelve el 8 de mayo en vez del 5 de agosto, en silencio.
4. **El estado del envío se compara, no se sobrescribe**, y la comparación va dentro del filtro de
   la escritura para que sea atómica. No lo reescribas como leer-decidir-escribir.
5. **`beats()` y `beatsFilter()` en `ingestion/event-order.ts` son la misma regla escrita dos
   veces, a propósito.** No unifiques una en términos de la otra sin entender por qué: una decide
   en memoria dentro del lote, la otra contra lo ya guardado. Si cambias una sola, el sistema se
   contradice y nada falla visiblemente.
6. **Solo `carriers/` sabe de transportistas.** Un `if (carrierId === '...')` fuera de esa carpeta
   es una señal de que la solución está en otro sitio.

---

## Rarezas deliberadas: NO las «arregles»

Este dominio tiene tres trampas, y el código está construido alrededor de ellas. Lo que parece un
fallo casi siempre es la solución:

| Lo que parece | Lo que es |
|---|---|
| `occurredAt` truncado al minuto pierde precisión | RutaSur no manda segundos. Se trunca a los tres por igual para medirlos con la misma regla; el instante exacto se conserva en `occurredAtExact` |
| Dos eventos idénticos de transportistas distintos parecen duplicados | Son dos fuentes independientes coincidiendo: **una confirmación**. `carrierId` está en la clave de deduplicación a propósito. Fusionarlos no tiene vuelta atrás |
| El estado actual no coincide con el último evento recibido | Correcto. Los lotes llegan desordenados y el estado lo decide el que **ocurrió** más tarde |
| El ejemplo de TransBolívar cae en cuarentena | Su `occurred_at` está en 2025, a 365 días del lote: fuera del umbral de cordura. Es el comportamiento buscado |
| El huso de RutaSur (UTC−4) parece arbitrario | Es una asunción documentada, apoyada en el único ejemplo disponible. Vive en `vocabulary.ts` para poder cambiarla sin desplegar, y cada evento guarda el desfase con el que se calculó |

Si algo de esto parece mal, la respuesta está en `docs/DECISIONS.md` antes que en el código.

---

## Convenciones

- **Idioma:** código en inglés (variables, tipos, endpoints); documentación, comentarios y mensajes
  de commit **en español**. Los cinco valores de estado son español a propósito: son vocabulario de
  negocio, no nombres de código.
- **TypeScript `strict`**, más `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`. Un `any`
  puede estar justificado; diez, difícilmente.
- **Los tipos se derivan de los esquemas** con `z.infer`. Nunca escribas a mano un tipo que ya
  define un esquema: reintroduce las dos definiciones que este proyecto existe para evitar.
- **Comentarios que explican el porqué, no el qué.** El código lo mantiene un equipo que no estuvo
  en la primera fase; un comentario que repite lo que hace la línea siguiente es ruido, uno que
  explica por qué se eligió eso vale una tarde.
- **Commits en español, incrementales**, contando la decisión y no solo el cambio.

---

## Al añadir un transportista

Es el caso de cambio más previsible. Cuesta tres ficheros y **ninguno de ellos es lógica
existente**:

1. Un adaptador en `apps/api/src/carriers/adapters/` que implemente `CarrierAdapter`. **Solo extrae
   campos**; no traduce estados ni convierte fechas.
2. Una línea en `carriers/carrier.registry.ts`.
3. Su vocabulario en `carriers/vocabulary.ts`.

Si su fecha viene sin zona horaria, el adaptador devuelve `{ kind: 'localNaive', ... }`. El tipo
`RawInstant` impide devolver una fecha ya resuelta, que es como se cuelan los errores de huso.

Añade también un caso en `normalization/normalizer.test.ts` con un payload real suyo.

---

## Qué no hacer

- **No añadas dependencias sin motivo claro.** El proyecto es deliberadamente escueto: sin
  Mongoose, sin framework de CSS, sin gestor de monorepo, sin librería de fechas. Cada una de esas
  ausencias es una decisión, no un olvido.
- **No metas caché** en las respuestas del panel. Los lotes entran sin avisar y un dato rancio es
  exactamente el fallo que este sistema existe para eliminar.
- **No hagas que el flujo SSE transporte datos.** Lleva un aviso —«entró un lote»— y el panel
  reacciona rehaciendo su renderizado. Si transportara eventos habría dos caminos hasta la pantalla
  y dos formas de contradecirse.
- **No introduzcas servicios de pago.** Restricción del proyecto.
- **No toques `docs/DECISIONS.md`, `docs/AI.md` ni `docs/planeacion.md`** salvo que se te pida
  expresamente: los redacta una persona a mano.
