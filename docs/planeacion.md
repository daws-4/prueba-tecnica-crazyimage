# DOCUMENTO ESCRITO A MANO DEL MOTIVO DE MIS DECISIONES

Andina Cargo no tiene flota propia: contrata a tres transportistas y cada uno reparte en su zona. El problema es que cada transportista informa del avance de los envíos a su manera, y el equipo de atención al cliente vive con tres pestañas abiertas — una por transportista — buscando el mismo número de guía en tres portales distintos para poder responder a una pregunta tan simple como «¿dónde está mi paquete?».
Camila, que coordina atención al cliente, calcula que se les va media hora larga cada día solo en saltar entre portales, y que un par de veces por semana dan una respuesta equivocada porque el portal que consultaron estaba desactualizado.
Andina quiere una sola pantalla donde buscar una guía y ver su historia completa, sin importar quién la esté transportando. Tú vas a construir la primera versión. 
Después de ti, **el código lo mantendrá un equipo de dos personas que no participaron en esta fase** : es un dato de diseño, no un detalle.



## **Los transportistas empujan los eventos hacia ustedes en lotes; no hay forma de pedírselos.** 
- 1 resguardar la información (generar copias) del evento en crudo para respaldarlo en caso que no se pueda leer a la primera vez y crear notificaciones cuando uno no se pudo cargar adecuadamente o un sistema de reintento automático
- 2  crear varias simulaciones con diferentes ejemplos de eventos, para probar casos límite y funcionamiento 

## **el código lo mantendrá un equipo de dos personas que no participaron en esta fase**
- 1 dejar comentarios en el código con referencias a decisiones tomadas y ejemplos de uso de la documentación para el equipo futuro que vaya a mantener esta aplicación
- 2 separar el código en funciones y módulos para facilitar su mantenimiento, y utilizar nombres de variables y funciones claros y descriptivos
- 3 añadir un documento extra de lo que pide la prueba técnica para el equipo nuevo pueda entender mis decisiones y tengan los scripts listos para probar la funcionalidad principal del proyecto

## ** Cómo se manejarán los distintos formatos de datos que envía cada transportista y cómo se abordará el ingreso cuarto? **

- 1 un adaptador en código por transportista
- 2 vocabulario configurable por el operador para traducir los nombres de los campos que envían los transportistas para poder manejarlo localmente, siendo que por ejemplo el código de uno de los transportistas no tiene una interpretación directa para el desarrollador pero el usuario (Camila) sí lo conoce
- 3 el cuarto transportista cuesta una sesión de desarrollo de un programador para poder integrarlo de la forma más optima

## ** Qué motor de base de datos usar, postgresql o mongodb **
- 1 Mongo proteje la integridad de los payloads originales, información que se perdería al usar postgresql 
- 2 el flujo de la información para el usuario y la información que se maneja en sí no requiere de consultas complejas entre las colecciones, lo que haría que postgresql no tuviera más valor que mongodb
- 3 Mongo garantiza atomicidad a nivel de documento sin necesidad de transacción, la consistencia que importa es dentro de los documentos, no entre colecciones

## ** Lo que pidió el cliente, en sus palabras**

Respuesta corta de lo que se usará para cada petición del cliente

01 «Que el equipo pueda buscar por número de guía y ver toda la historia del envío en una sola pantalla.»
    Dashboard en Nextjs con paginación y busqueda implementados, junto con una línea de tiempo que permite ver el historial de cada envío y poder ver los detalles del mismo

02 «Los tres nos mandan lo mismo pero cada uno a su manera; ustedes normalícenlo.»
    Un adaptador por transportista, pero el adaptador solo extrae los campos y declara de qué clase es su fecha, no traduce estados ni resuelve husos, eso lo hace un normalizador común a los tres, que es donde viven las reglas, la traducción del estado, el huso asumido, los umbrales de fecha y el cálculo de la identidad. La gramática es código, el vocabulario es dato. Por eso dar de alta un transportista nuevo no obliga a tocar nada de lo que ya funciona.

03 «Usen Postgres y Mongo, que las dos ya están contratadas en el proyecto.»
    Solo se usará MongoDB, utilizar dos motores distittos de base de datos requiere una infraestructura más costosa, la consistencia que importa aquí es dentro de un documento, no entre tablas, y Mongo la da sin necesidad de transacción. La potencia transaccional extra de Postgres existe, pero en este dominio no se usaría. Y el motivo principal del descarte no es el coste: partir el histórico entre dos motores convierte cada ingesta en una escritura que deja de ser atómica

04 «A veces reenvían los mismos eventos, pero eso no pasa nada, ¿verdad?»
    Ninguno de los tres manda un identificador de evento, así que la identidad se fabrica de su contenido transportista + guía + instante truncado al minuto + estado. Un reenvío no se guarda dos veces: se cuenta sobre el evento que ya existía (timesReceived), y en la pantalla se ve "recibido 2 veces". Así queda constancia de que llegó sin duplicar la línea de tiempo.

05 «El estado actual lo guardan en un campo y lo actualizan cada vez que llega un evento nuevo.»
   Los eventos van en su propia colección, no dentro del envío. Y el estado actual no se sobrescribe con el evento que llega, se compara y solo lo mueve el que ocurrió más tarde. Los lotes llegan tres veces al día y desordenados, así que el último en llegar no es el más reciente

06 «Si viene algún campo raro que no conocemos, ignórenlo y sigan.»
    Realizado, cualquier campo extra se ignora, pero no es lo mismo a recibir un campo reconocido que incluya información que no se esperaba, esos casos van a una cuarentena para ser revisados

07 «Nos mandan lotes de hasta cinco mil eventos de golpe, tres veces al día.»
    Respuesta síncrona con el informe del lote, escritura por bloques con éxito parcial, y un límite de tamaño para acotar el tiempo por diseño

08 «Camila va a tener el panel abierto toda la jornada, así que tiene que estar siempre al día.»
    Se implementó Server Sent Events con latidos cada 20 segundos más Polling de respaldo que solo refresca si pasan 60 segundos sin señal

09 «En enero entra un cuarto transportista y no quiero volver a pagar por lo mismo.»
    Cuesta una sesión de desarrollo y un despliegue. Descarté las alternativas que prometían cero programador —un perfil declarativo configurable, un mapeador visual— porque esa promesa no se sostiene cuando el formato del cuarto no se parece a los tres actuales, y el precio de que falle es romper la operación diaria de los que ya funcionan.

    Y ahí está la respuesta a «no volver a pagar por lo mismo» no vuelve a pagar por lo mismo, paga por lo nuevo. Leer un formato que nadie ha visto todavía no lo hace gratis ninguna arquitectura. Lo que sí garantizo es que no paga otra vez por la normalización, la deduplicación, el orden de los eventos ni la pantalla, eso ya está y no se toca.

10 «Y que el panel y el API compartan los tipos, que ya nos pasó de romper la pantalla al cambiar algo por detrás.»
    Realizado, un esquema del que se derivan los tipos, validado en ejecución y no solo al compilar



## ** Núcleo obligatorio **

Si algo varía o no de lo propuesto en el documento

El cliente dice que se usen dos motores de base de datos y solo se usa uno, de resto todo está tal cual lo piden

## ** Un extra, si el núcleo ya está cerrado**

De las opciones propuestas, implementar Server Sent Events más Polling para que el panel del usuario (Camila) se actualice solo cuando hay nuevos eventos, que no sea necesario recargar la página manualmente.

## ** Cobertura de Pruebas **

Cobertura de pruebas. Con cuatro casos bien elegidos ya nos dices más que con cuarenta.
un caso típico, tres casos límites, dos con tres transportistas, dos con cuatro transportistas