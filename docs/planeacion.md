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
    Dashboard en Nextjs con paginación y busqueda implementados

02 «Los tres nos mandan lo mismo pero cada uno a su manera; ustedes normalícenlo.»
    Se utilizarán adaptadores para cada transportista, cada adaptador se encargará de transformar los datos a un formato común para poder verlos iguales en el panel desarrollado

03 «Usen Postgres y Mongo, que las dos ya están contratadas en el proyecto.»
    Solo se usará MongoDB, utilizar dos motores distittos de base de datos requiere una infraestructura más costosa y Mongo cumple con los requerimientos de atomicidad de los documentos mejor que postgresql

04 «A veces reenvían los mismos eventos, pero eso no pasa nada, ¿verdad?»
    Se dejarán registrados todos los eventos, no se eliminarán los eventos duplicados solo para llevar constancia que sí se recibieron

05 «El estado actual lo guardan en un campo y lo actualizan cada vez que llega un evento nuevo.»
    Cuando llega un evento nuevo se buscará el documento que tenga ese número de guía y se le agregará el nuevo evento, también se actualizará el campo de estado con el nuevo estado

06 «Si viene algún campo raro que no conocemos, ignórenlo y sigan.»
    Realizado

07 «Nos mandan lotes de hasta cinco mil eventos de golpe, tres veces al día.»
    No supone un problema

08 «Camila va a tener el panel abierto toda la jornada, así que tiene que estar siempre al día.»
    Se implementó Server Sent Events más Polling de respaldo cada 20 segundos

09 «En enero entra un cuarto transportista y no quiero volver a pagar por lo mismo.»


10 «Y que el panel y el API compartan los tipos, que ya nos pasó de romper la pantalla al cambiar algo por detrás.»
    Realizado



## ** Núcleo obligatorio **

Núcleo obligatorio
Todo lo de esta página debe existir. Si algo se queda fuera, dilo y explica por qué: eso puntúa más que fingir que
está.
A · Ingesta y normalización
B · Datos y persistencia
C · API de consulta
D · Panel
E · Tipos y entrega
Un endpoint que reciba un lote de eventos de un transportista y lo procese. Los tres formatos de la
página anterior deben entrar por ahí.
La normalización a un modelo único es el corazón del ejercicio: nombres de campo, estados, fechas
y zonas horarias. Que el tipo de un evento normalizado no dependa de quién lo mandó.
Añadir el cuarto transportista en enero no debería obligar a tocar la lógica que ya funciona. Cómo lo
consigues es tuyo.
Decide qué hace tu código cuando un evento del lote no se puede interpretar, y déjalo escrito.
Al menos un motor de base de datos real, con datos que sobrevivan a un reinicio.
El reparto entre lo relacional y lo documental es una decisión tuya y la vamos a leer con atención.
Cualquiera de las dos, o las dos, puede ser la respuesta correcta si viene con su argumento.
Un seeder o unos datos de ejemplo con los tres formatos, para que podamos ver el sistema con
contenido dentro.
Responde en el documento de decisiones: ¿qué pasa con tu modelo cuando haya dos millones
de eventos y cuatro transportistas?
Buscar un envío por número de guía y devolver su estado actual y su línea de tiempo ordenada.
Validación en el borde, códigos de respuesta coherentes y errores que digan algo útil a quien los
recibe.
Un listado paginado de envíos, con al menos un filtro que te parezca útil para Camila.
Una pantalla en Next.js: buscador y detalle del envío con su línea de tiempo.
Cómo obtienes y refrescas los datos es cosa tuya — renderizado en servidor, en cliente, una mezcla,
revalidación, lo que prefieras. Solo cuéntanos en el documento de decisiones qué te llevó por ahí.
Sin maquetar: legible basta. Si te apetece cuidar la experiencia, adelante.
El panel y el API deben compartir la definición de los datos que se intercambian. Cómo lo resuelves
es parte de la respuesta.
strict activado. Un any puede estar justificado; diez, difícilmente.
Repositorio público en GitHub con historial real: mínimo seis commits que cuenten la historia del
trabajo. Un único initial commit con todo dentro nos deja sin ver cómo trabajaste.

## ** Un extra, si el núcleo ya está cerrado**

De las opciones propuestas, implementar Server Sent Events más Polling para que el panel del usuario (Camila) se actualice solo cuando hay nuevos eventos, que no sea necesario recargar la página manualmente.

## ** Cobertura de Pruebas **
Cobertura de pruebas. Con cuatro casos bien elegidos ya nos dices más que con cuarenta.
un caso típico, tres casos límites, dos con tres transportistas, dos con cuatro transportistas