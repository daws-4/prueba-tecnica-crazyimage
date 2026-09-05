# Andina Cargo · Seguimiento de envíos

Una sola pantalla donde buscar un número de guía y ver la historia completa de un envío, sin
importar cuál de los tres transportistas lo esté moviendo.

Andina Cargo no tiene flota propia: contrata transportistas y cada uno reporta el avance a su
manera. Atención al cliente vivía con tres portales abiertos buscando la misma guía en cada uno.
Esto es el backend que normaliza los tres formatos y el panel que los muestra juntos.

---

## Levantarlo

Requisito: Docker.

```bash
docker compose up
```

Eso es todo. Levanta Mongo, el API y el panel, y **siembra datos de ejemplo con los tres
formatos reales** la primera vez. Cuando termine:

| | |
|---|---|
| Panel | <http://localhost:3000> |
| API | <http://localhost:3001> |
| Mongo | `mongodb://localhost:27017/andina` |

Los datos viven en un volumen con nombre, así que **sobreviven a un reinicio**. El sembrado no
pisa lo que ya haya; para reemplazarlo:

```bash
docker compose run --rm seed node apps/api/dist/seed/seed.js --force
```

### Sin Docker

Hace falta Node 22+ y un Mongo escuchando en `localhost:27017`.

```bash
npm install
npm run build -w @andina/contracts
npm run seed  -w @andina/api      # datos de ejemplo
npm run start -w @andina/api      # API en :3001
npm run dev   -w @andina/panel    # panel en :3000
```

---

## Qué mirar primero

**Abre <http://localhost:3000/envios/AC-4471>.** Es el envío del enunciado, reportado por los
tres transportistas, y enseña de un vistazo las tres decisiones que más pesan:

1. **El último aviso recibido dice «en reparto» y el envío aparece como «entregado».** Los dos
   están marcados en la línea de tiempo. No es un fallo: los lotes llegan tarde y desordenados,
   así que el último en llegar no es el más reciente. El estado lo decide el evento que
   **ocurrió** más tarde.
2. **Dos transportistas informan del mismo momento y salen como dos líneas.** No se fusionan:
   que dos fuentes independientes coincidan es una confirmación, y borrarla sería tirar la
   única prueba de que el dato es bueno.
3. **RutaSur aparece marcado como «informa al minuto».** Manda la hora sin segundos y sin zona
   horaria; se interpreta en UTC−4 y se trunca al minuto para medir a los tres con la misma regla.

Después, en el listado, prueba el filtro **«Parados más de 48 h»**: los envíos que llevan
demasiado tiempo quietos sin llegar a entregado. Los otros filtros dicen en qué punto está cada
envío; ese dice cuáles van a generar una llamada.

### Verlo actualizarse en vivo

Deja el panel abierto en <http://localhost:3000> —arriba a la derecha pone **«En vivo»** con un
punto verde— y desde otra terminal manda un lote:

```bash
curl -X POST http://localhost:3001/ingest/andes-express \
  -H 'Content-Type: application/json' \
  -d '[{"guia":"AC-4471","evento":"INCIDENCIA","ts":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","ciudad":"Cúcuta"}]'
```

La pantalla se actualiza sola, sin recargar. El API abre un flujo de avisos (SSE) y el panel
escucha; cuando entra un lote, el aviso llega en el momento.

**El aviso no lleva datos, solo dice que algo cambió.** El panel reacciona volviendo a pedir el
renderizado del servidor, que es el único sitio que habla con el API. Así el flujo sustituye al
temporizador y no a la capa de datos: si se cae, el panel sigue funcionando igual, solo que se
entera más tarde —hay una vigilancia que refresca si dejan de llegar latidos.

### Probar la ingesta a mano

```bash
# Un lote de Andes Express
curl -X POST http://localhost:3001/ingest/andes-express \
  -H 'Content-Type: application/json' \
  -d '[{"guia":"AC-9001","evento":"EN_TRANSITO","ts":"2026-09-04T15:30:00Z","ciudad":"Cúcuta"}]'

# El MISMO lote otra vez: no duplica nada
#   -> {"received":1,"accepted":0,"duplicates":1,...}
```

Los otros dos formatos:

```bash
# TransBolívar: JSON anidado, estado por código, epoch en segundos
curl -X POST http://localhost:3001/ingest/transbolivar \
  -H 'Content-Type: application/json' \
  -d '[{"tracking_number":"AC-9001","status":{"code":5,"label":"delivered"},
       "occurred_at":1788000000,"location":{"city":"Maracaibo","country":"VE"}}]'

# RutaSur: campos planos, DD/MM/YYYY HH:mm sin zona horaria
curl -X POST http://localhost:3001/ingest/rutasur \
  -H 'Content-Type: application/json' \
  -d '[{"guia":"AC-9001","estado":"EnReparto","fecha":"04/09/2026 11:30","lugar":"Maracaibo"}]'
```

---

## El API

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/ingest/:carrierId` | Recibe un lote de un transportista y devuelve el informe: cuántos entraron, cuántos eran reenvíos, cuántos quedaron en cuarentena y por qué |
| `GET` | `/shipments` | Listado paginado por cursor. Filtros: `status`, `carrierId`, `stalledForHours` |
| `GET` | `/shipments/:trackingNumber` | Estado actual y línea de tiempo ordenada |
| `GET` | `/stream` | Flujo de avisos en vivo (SSE). Emite cuando termina de entrar un lote, y late cada 20 s |

Transportistas con adaptador: `andes-express`, `transbolivar`, `rutasur`.

**Códigos de respuesta.** `200` aunque haya eventos en cuarentena, porque la cuarentena es un
resultado normal del proceso y no un fallo de la petición; `400` si el sobre no es
interpretable; `404` si no hay adaptador para ese transportista o si la guía no existe; `413` si
el lote supera el máximo configurado.

---

## Cómo está organizado

```
packages/contracts/     el contrato compartido entre el panel y el API
apps/api/
  src/carriers/         lo que sabe de CADA transportista
    adapters/             un fichero por transportista
    vocabulary.ts         lo que es dato: estados, huso horario, umbrales
    carrier.registry.ts   la lista de transportistas con adaptador
  src/normalization/    las reglas comunes a todos: instante, identidad, cuarentena
  src/ingestion/        escritura por lotes y proyección del envío
  src/shipments/        el API de consulta
  src/seed/             datos de ejemplo en los tres formatos
apps/panel/             el panel en Next.js
```

**La separación que importa** no es por capas, es esta: `carriers/` sabe de cada transportista y
**nada más del sistema lo sabe**. Ni el normalizador, ni la ingesta, ni el panel.

### Añadir el cuarto transportista

En enero entra uno nuevo. Cuesta tres cosas y ninguna toca lo que ya funciona:

1. Un fichero en `apps/api/src/carriers/adapters/`, que implemente `CarrierAdapter`.
2. Una línea en `carrier.registry.ts`.
3. Su vocabulario inicial en `vocabulary.ts` (traducción de estados y desfase horario).

El panel no se toca: recibe los transportistas como datos, no conoce la lista.

---

## Pruebas

```bash
npm test -w @andina/api
```

Trece casos sobre la normalización, que es la pieza más frágil del sistema: es donde tres
formatos ajenos que cambian cuando quieren se convierten en un tipo único, y donde un fallo no
revienta sino que **miente**. No buscan cobertura: son los bordes que aparecieron leyendo los
datos —los tres formatos convergiendo, el cambio de huso, el minuto truncado, el reenvío con un
campo extra, la fecha que no existe y el evento fechado en el futuro.

---

## Configuración

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | `3001` | Puerto del API |
| `MONGODB_URI` | `mongodb://localhost:27017` | Conexión a Mongo |
| `MONGODB_DB` | `andina` | Base de datos |
| `MAX_BATCH_SIZE` | `10000` | Tope de eventos por lote (`413` si se supera) |
| `WRITE_CHUNK_SIZE` | `1000` | Tamaño del bloque de escritura |
| `API_URL` | `http://localhost:3001` | Dónde busca el API el panel |

Se validan al arrancar: si algo falta o viene mal, el proceso no levanta.

---

## Las decisiones

El porqué de cada cosa está en **[`docs/DECISIONS.md`](docs/DECISIONS.md)**, que es el documento
que de verdad explica este proyecto. En corto:

| | Decisión |
|---|---|
| Formatos | Un adaptador en código por transportista; el vocabulario, editable como dato |
| Persistencia | Un solo motor, MongoDB, pese a que el cliente pidió dos |
| Idempotencia | La identidad del evento se calcula de su contenido, porque nadie manda un identificador |
| Contrato | Un esquema del que se derivan los tipos, validado en ejecución y no solo al compilar |
| Ingesta | Síncrona, con el informe del lote en la propia respuesta |
| Estado | Derivado del evento más reciente, nunca sobrescrito por el último en llegar |

También hay [`docs/AI.md`](docs/AI.md) con el uso de IA en el desarrollo.

---

## Licencia

MIT. Ver [`LICENSE`](LICENSE).
