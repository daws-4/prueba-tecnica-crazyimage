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

- 1 

