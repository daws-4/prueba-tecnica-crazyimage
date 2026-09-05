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

03 «Usen Postgres y Mongo, que las dos ya están contratadas en el proyecto.»
    Solo se usará MongoDB, utilizar dos motores distittos de base de datos requiere una infraestructura más costosa y Mongo cumple con los requerimientos de atomicidad de los documentos mejor que postgresql



## ** Núcleo obligatorio **

Si algo varía o no de lo propuesto en el documento

## ** Un extra, si el núcleo ya está cerrado**

De las opciones propuestas, implementar Polling para que el panel del usuario (Camila) se actualice solo cuando hay nuevos eventos, que no sea necesario recargar la página manualmente.

## ** Cobertura de Pruebas **
Cobertura de pruebas. Con cuatro casos bien elegidos ya nos dices más que con cuarenta.
un caso típico, tres casos límites, dos con tres transportistas, dos con cuatro transportistas