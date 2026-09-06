# DOCUMENTO DE DECISIONES TOMADAS PARA EL DESARROLLO DEL PROYECTO 

Versión final del documento. Las versiones preliminares, con las situaciones todavía en evaluación y sin veredicto, están disponibles en los primeros commits del proyecto.

## TIPADO MÁXIMO O INTERPRETACIÓN DE FORMATOS 

### Situación
Hay tres formatos de datos que entran de tres empresas transportistas diferentes, el principal problema no es normalizarlos sino encontrar la forma que una cuarta empresa transportista entre en el futuro y la aplicación se mantenga funcionando sin que el cliente deba pagar por lo mismo otra vez, tomando en consideración que el código lo hereda un equipo de dos personas que no participó en esta fase

### Decisión
Un adaptador en código por transportista, con validación estricta de esquema. La forma de leer el payload vive en el repositorio, donde hay control de versiones y vuelta atrás; el vocabulario (la traducción de estados y la zona horaria) queda aislado como dato fuera del adaptador, porque cambia varias veces al año y lo sabe hacer atención al cliente, no un programador.

Aclaración para quien herede esto: lo que está entregado es la separación, no la pantalla que la explota. Hoy el vocabulario se carga desde una semilla en código (`carriers/vocabulary.ts`) y `IngestionService.vocabularyFor()` es el único punto que hay que cambiar para leerlo de una tabla. Cambiar un estado o un huso todavía exige un despliegue; ese es el trabajo pendiente y está en el apartado «lo que se sabe que falta» de `ARQUITECTURA.md`.
 
### Alternativas descartadas
Descarté la alternativa de permitir al operador de la aplicación ingresar el payload y mapear cada uno de sus campos para que empiece a funcionar, es un trabajo muy complejo para las pocas veces que se usará y no garantiza la estabilidad de los datos. El tiempo que requiere esa solución por parte del operador es mayor al tiempo que requiere un programador en implementar el adaptador del nuevo transportista.
También descarté la alternativa de un perfil declarativo que vaya recorriendo el payload en busca de los datos, aunque pueda funcionar es una opción bastante frágil si el formato de los datos del nuevo transportista difiere mucho de los actuales.

### Qué sacrifiqué
Sacrifiqué el alta de un transportista nuevo para poder mantener la estabilidad del proyecto. Pues vale más la pena tener estabilidad y planear la actualización cuando se sepa con exactitud los requerimientos del nuevo transportista a dejar una solución que si no se implmenta bien puede romper la operación diaria de más de un transportista.

### Qué rompe esto a escala 100×
Lo que se rompe no es el volumen, es el día que llega el cuarto transportista sin adaptador escrito. Sus lotes entran y van enteros a cuarentena, su operación queda detenida, pero no se pierde: el crudo se guarda siempre, y en cuanto el adaptador está desplegado se reprocesa sin haber perdido un evento. El coste es de calendario, no de datos, y se evita conociendo la fecha de alta con antelación. Lo que sí escala mal es el número de transportistas, no el de eventos, y por dos sitios. El primero es el vocabulario como dato editable: con cuatro transportistas inventando estados nuevos, esa tabla de traducción crece y, el día que se pueda editar desde el panel, la toca gente distinta sin control de versiones, y un estado mal traducido no rompe nada, entra y miente; a esa escala haría falta registrar quién cambió qué y desde cuándo aplica. El segundo es que los adaptadores acaben copiándose entre sí, porque entonces una corrección se aplica a uno y no a los otros; la defensa es que todo lo común (fechas, umbrales, deduplicación) vive fuera del adaptador y el adaptador solo extrae campos. Y con ocho transportistas nadie se entera a ojo de que uno cambió su formato en silencio: la cuarentena ya lo detecta, pero tendría que avisar sola en vez de esperar a que alguien la mire.

### Qué haría con una semana más
Con una semana más la decisión no cambiaría, lo que sí podría añadir es reducir el trabajo que hoy cuesta escribir un adaptador nuevo. Construiría una herramienta interna que analice los payloads guardados en crudo y liste sus campos con la frecuencia de aparición de cada uno, no para que el operador configure nada, sino para que el programador que escriba el cuarto adaptador tarde un par de horas en vez de un día y no se le escape un campo opcional. Y dejaría el adaptador convertido en una plantilla con su lista de comprobación: qué campos hay que extraer, qué decisiones ya están tomadas fuera de él y no se tocan (el huso, los umbrales, el truncado al minuto) y sobre todo qué no debe hacer un adaptador. Es lo que convierte el alta del cuarto transportista en una tarde para dos personas que no estuvieron en esta fase.


## MOTOR Y MODELADO DE BASE DE DATOS

### Situación
El cliente pidió usar Postgres y Mongo porque las dos ya están contratadas.
### Decisión
Se decidió usar un solo motor, MongoDB, hay que conservar el payload crudo en cada evento, tiene tres formas hoy y cuatro en enero, la lectura es "traer un agregado" y no cruzar tablas, por lo que no hace indispensable el uso de postgresql. 
### Alternativas descartadas
Postgres solo, usando JSONB para el crudo funcionaría perfectamente, índice único para deduplicar, particionado por fecha. Se descarta porque acaba siendo una carcasa relacional alrededor de un documento, y las virtudes que pagas con ella apenas se usan en un dominio de dos entidades con una sola forma de consulta.
### Qué sacrifiqué
Postgre rechazaría una fila mal formada, Mongo la acepta, esto convierte a la validación de datos en la única defensa que hay, significa que el adpatador deja pasar algo no hay nada detrás que lo pare.
### Qué rompe esto a escala 100×
El payload crudo es lo único que crece de verdad al mismo ritmo que los eventos y no se espera que sea común leerlo, en el futuro probablemente se decida a archivarlo por antigüedad.
### Qué haría con una semana más
- Réplica y copias de seguridad con restauración probada. Una copia que nunca se ha restaurado no es una copia.
- La exportación a Postgres para informes, que cierra el círculo con lo que el cliente ya está pagando y responde a su frase sin darle la razón técnica.


## QUÉ ES EL "MISMO EVENTO" Y CUANDO OCURRIÓ

### Situación
Ninguno de los tres transportistas manda un identificador de evento, solo el número de guía, que identifica el envío y no el evento. Hay que fabricar la identidad a partir del contenido, y ese contenido incluye la fecha de RutaSur, que llega sin zona horaria y sin segundos. Decidir qué es un duplicado y decidir en qué instante ocurrió son el mismo problema.

### Decisión
La identidad de un evento es transportista + guía + instante truncado al minuto + estado canónico. RutaSur se interpreta en UTC−4, el reloj de Venezuela, porque es lo que hace cuadrar su ejemplo con el de Andes; la asunción es configuración por transportista y queda guardada dentro de cada evento. A igualdad de instante gana el que llegó después. El duplicado no se descarta, se cuenta sobre el evento que ya existía.

### Alternativas descartadas
Descarté el hash del payload crudo, que es lo primero que se le ocurre a cualquiera y lo mata la propia instrucción del cliente de ignorar campos desconocidos: un campo nuevo o un espacio de más cambian el hash y meten un duplicado. Descarté meter el lugar en la clave, es texto libre sin forma canónica (Cúcuta, CUCUTA, Cucuta Norte de Santander) y una identidad es solo tan estable como su campo menos normalizable. Y descarté deduplicar entre transportistas, porque si dos informan el mismo hecho no es un duplicado, son dos fuentes coincidiendo, y fusionarlas permitiría que un fallo de reloj en uno silencie el evento real del otro.

### Qué sacrifiqué
Sacrifiqué el segundo como criterio de orden, dos eventos del mismo minuto ya no se ordenan por lo que dice la fuente sino por una regla mía; el instante exacto se conserva aparte pero deja de decidir. Y sacrifiqué la certeza sobre el huso de RutaSur, que se apoya en un solo ejemplo del enunciado y, como el instante forma parte de la identidad, queda cocido dentro de la clave de todos sus eventos ya guardados.

### Qué rompe esto a escala 100×
Por volumen nada, la deduplicación es un índice único y una escritura por lotes, y cuesta lo mismo con veinte mil eventos que con dos millones. Lo que escala mal es el error: si el huso de RutaSur resulta ser otro, no se corrige cambiando la configuración, hay que recalcular fecha y clave de unos 600.000 documentos y volver a deduplicar. Es un trabajo por lotes, no un despliegue, y se puede hacer porque el payload crudo sigue guardado y porque cada evento lleva escrito el desplazamiento con el que se calculó, así que la migración ataca solo a los afectados.

### Qué haría con una semana más
Una vigilancia del huso: en los envíos que reportan dos transportistas a la vez, comparar el desfase entre sus reportes del mismo estado. Si la asunción de RutaSur está mal, ese desfase se agrupa alrededor de una hora exacta y salta a la vista sin esperar a que alguien se queje.


## CONTRATO COMPARTIDO ENTRE EL PANEL Y EL API

### Situación
El cliente cuenta que ya se les rompió la pantalla al cambiar algo por detrás. El problema real no es no tener tipos, es el momento en que se descubre el desajuste: si solo se detecta al compilar, el panel se despliega aparte y compila perfectamente contra un contrato que el API ya no cumple, y el error acaba apareciendo delante de Camila.

### Decisión
Un paquete interno del monorepo con los esquemas de los datos que cruzan entre las dos capas, escritos con Zod, del que se derivan los tipos de TypeScript en vez de escribirlos aparte. El mismo esquema valida en el borde del API en tiempo de ejecución. No hay dos definiciones que sincronizar, hay una de la que sale la otra.

### Alternativas descartadas
Descarté copiar las interfaces a los dos lados, que es exactamente el fallo que el cliente está describiendo y divergen el primer día que alguien tiene prisa. Descarté generar los tipos del panel desde la documentación del API, que funciona y es lo habitual en equipos grandes, pero añade un paso de generación y un artefacto versionado que se queda obsoleto en silencio, y para dos personas es una pieza más que mantener. Y descarté acoplar las dos capas con una librería de tipos extremo a extremo, que mete una tercera pieza entre dos frameworks que el encargo ya fija.

### Qué sacrifiqué
Validar en ejecución cuesta tiempo de proceso en cada petición, y en la ingesta eso se multiplica por cinco mil. Lo asumo porque el borde es justo donde quiero pagar ese coste. Sacrifiqué también algo de comodidad: el panel no puede inventarse un campo temporal en una respuesta para salir del paso, porque el esquema lo rechaza.

### Qué rompe esto a escala 100×
Lo que crece no es el número de eventos, es el número de esquemas. Con cuatro transportistas y más pantallas, un paquete de contrato mal organizado se convierte en un cajón donde todo el mundo añade y nadie borra. Lo que hay que vigilar es la frontera: aquí solo va lo que cruza entre el panel y el API, ni los formatos de entrada de los transportistas ni la forma interna de los documentos guardados, porque cada vez que uno de esos dos se cuela el panel empieza a conocer cosas que no le tocan.

### Qué haría con una semana más
Publicaría el esquema también como documentación del API generada desde el mismo sitio, para que un transportista nuevo no tenga que leer código para saber qué se le acepta. Y añadiría una comprobación automática que falle si una respuesta del API no valida contra su propio contrato, para que el desajuste se note en las pruebas y no en la primera petición real.


## SEMÁNTICA DEL ENDPOINT DE INGESTA

### Situación
Los transportistas mandan lotes de hasta cinco mil eventos tres veces al día y no hay forma de pedirles nada, ellos empujan y nosotros recibimos. Había que decidir si la petición espera a que el lote esté procesado o si se acepta y se responde después.

### Decisión
El endpoint procesa el lote y responde con el informe: cuántos entraron, cuántos eran reenvíos y cuántos quedaron en cuarentena, con el desglose de por qué. El argumento no es el rendimiento, es que a los transportistas no se les puede pedir nada, así que el único momento garantizado en que tenemos su atención es mientras nos están hablando. Es una elección segura porque la clave de deduplicación hace que un reintento por tiempo de espera no cueste nada.

### Alternativas descartadas
Descarté aceptar con un 202 y procesar después, que es lo que se hace cuando el trabajo es largo o la carga es continua, y aquí no es ninguna de las dos: son doce lotes al día y cada uno se resuelve en un par de segundos. Además obliga a una cola, que si vive en memoria se pierde al reiniciar y si se persiste es otra pieza que mantener, y sobre todo el informe de errores acabaría en un endpoint de estado que estos transportistas no van a consultar. Descarté también procesar el lote en una sola transacción, porque un evento malo tumbaría los otros cuatro mil novecientos noventa y nueve, justo lo contrario de lo que pide el cliente cuando dice que sigamos adelante con lo que no entendamos.

### Qué sacrifiqué
El transportista espera unos segundos en cada lote, y si algún día mandaran lotes mucho mayores esa espera crece; por eso hay un límite de tamaño explícito, que es una restricción que le impongo yo a él. Sacrifiqué también la comodidad de absorber un pico: si los cuatro transportistas coincidieran a la misma hora, las peticiones compiten en vez de encolarse.

### Qué rompe esto a escala 100×
No los cinco mil eventos, sino el día que dejen de ser tres lotes al día. Si un transportista pasara a mandar de forma continua, la respuesta síncrona empieza a rozar los tiempos de espera y toca dar el paso a aceptar y procesar aparte. Ese cambio es barato porque la pieza que normaliza y la que escribe no se enteran de por dónde entró el lote, lo que cambia es el controlador. Lo que sí habría que resolver ese día es dónde ve el transportista el resultado, que es el problema que hoy nos ahorramos.

### Qué haría con una semana más
Guardaría el informe de cada lote como un registro consultable, para poder responder "qué pasó con el envío de ayer a las tres" sin ir a buscar en los registros del servidor. Con eso el opcional de métricas de ingesta queda hecho, porque los números ya se calculan, solo hay que dejar de tirarlos.


## EL ESTADO ACTUAL SE DERIVA, NO SE SOBRESCRIBE

### Situación
El cliente describió el estado actual como un campo que se actualiza cada vez que llega un evento nuevo. El problema es que los lotes llegan tres veces al día y desordenados, un evento de esta mañana puede entrar esta tarde después de otro que ocurrió más tarde. Con esa descripción, un envío ya entregado vuelve a "en reparto" en cuanto llega un lote atrasado, que es exactamente la respuesta equivocada que este proyecto existe para eliminar.

### Decisión
El estado actual sigue guardado en el envío porque el listado lo necesita para poder filtrar, pero no se sobrescribe: solo lo mueve un evento posterior al que ya está. A igualdad de instante gana el que llegó después, y si también empatan ahí hay un desempate fijo para que el resultado sea siempre el mismo. La comparación va dentro del filtro de la escritura, así que comparar y escribir son una sola operación atómica sobre un documento. La pantalla muestra además cuál es el evento que decide el estado.

### Alternativas descartadas
Descarté sobrescribir con cada evento, como lo describió el cliente, porque es la fuente exacta de las respuestas equivocadas que quieren eliminar. Descarté no guardar el estado y calcularlo al vuelo desde los eventos, que es correcto y más simple para la pantalla de detalle pero imposible para el listado, porque filtrar cuarenta mil envíos por su estado obligaría a recorrer todos sus eventos en cada consulta. Y descarté desempatar por "estado más avanzado", que es tentador y equivocado: "incidencia" no está en ninguna progresión lineal y un envío puede volver a "en tránsito" después de una, así que sería meter reglas de negocio inventadas dentro de una decisión técnica.

### Qué sacrifiqué
El estado del envío es un dato duplicado, vive en el envío y a la vez se puede deducir de sus eventos, y si alguien escribiera en la colección de envíos por su cuenta las dos versiones dejarían de coincidir sin que la aplicación se entere. Lo asumo porque el envío es una proyección reconstruible. Sacrifiqué también usar la hora de llegada como criterio principal, que habría sido más simple de explicar y es lo que el cliente esperaba.

### Qué rompe esto a escala 100×
Por volumen no, mover el estado es una escritura sobre un documento identificado por su guía y cuesta lo mismo con cuarenta envíos que con dos millones. Lo que crece es el número de envíos tocados por lote: hoy un lote de cinco mil eventos toca unos mil envíos, y con cuatro transportistas informando los mismos envíos aparece más contención sobre los mismos documentos. La salida no es cambiar la regla, es agrupar por envío antes de escribir, que ya se hace, y si algún día no bastara, procesar por franjas de guía en paralelo, que es posible justamente porque cada envío se decide solo con sus propios eventos.

### Qué haría con una semana más
Una tarea que recalcule la proyección desde cero y la compare con lo que hay guardado, para que una divergencia se detecte sola en vez de esperar a que alguien la note. Es barata de escribir precisamente porque el envío es derivado: si el recálculo y lo guardado no coinciden, lo guardado está mal, sin discusión.


## LA PIEZA MÁS FRÁGIL Y QUÉ PROBÉ PRIMERO

La pieza más frágil es la normalización, porque es donde una equivocación no se nota: un evento mal interpretado no revienta, entra y miente. Es además la única pieza que toca a la vez las tres decisiones anteriores, la identidad del evento, el instante y el estado actual.

Por eso es lo primero que probé. Hay 13 casos en `apps/api/src/normalization/normalizer.test.ts` que cubren los tres formatos y los bordes que aparecieron al escribirlos: el cambio de huso de RutaSur, el minuto truncado, el reenvío con un campo extra que no debe generar un duplicado, y el evento fechado en el futuro.
