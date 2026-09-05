# DOCUMENTO DE USO DE LA IA PARA EL DESARROLLO DE ESTE PROYECTO

Esta es la primera versión preliminar de la documentación del uso de la IA, visible en commits iniciales pero no la versión final.

La IA me propuso 3 opciones para resolver el requerimiento del cliente, con sus respectivas ventajas y desventajas, más una que yo le plantee y las terminamos de desarrollar
Opción A: un adaptador en código por transportista con validación estricta de esquema en código
Opción B: perfil declarativo en base de datos que deja al aire el tipado de datos que maneja cada transportista
Opción C: híbrido que maneja el schema tipado estricto para los tres transportistas existenes y deja el perfil declarativo para el cuarto
Opción D (la que propuse): un mapeador visual que permita configurar el tipado de datos que maneja cada transportista por el operador en base a los payloads recibidos

De esto, terminé eligiendo la opción A con una pequeña diferencia: un adaptador en código por transportista con validación estricta de esquema con un vocabulario editable en el panel para poder aprobar las diferencias que tienen como por ejemplo que cada transportista tiene una forma diferente de enviar la fecha y la hora. Lo elegí porque es la mejor opción para no romper la operación diaria del cliente sin comprometer al equipo futuro a pesar que se sale de los requerimientos del cliente