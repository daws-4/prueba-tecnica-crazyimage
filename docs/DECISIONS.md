# DOCUMENTO DE DECISIONES TOMADAS PARA EL DESARROLLO DEL PROYECTO 

Versión preliminar del documento disponible en los primeros commits del proyecto, por ahora solo anotaré las sitauciones que estoy evaluando sin dar el veredicto final de la decisión de cada una.

## DECIDIR - TIPADO MÁXIMO O INTERPRETACIÓN DE FORMATOS 

Elegí mantener el tipado máximo y no añadir nada que permita añadir al cuarto transportista sin intervención de un programador.

Descarté la alternativa de permitir al operador de la aplicación ingresar el payload y mapear cada uno de sus campos para que empiece a funcionar, es un trabajo muy complejo para las pocas veces que se usará y no garantiza la estabilidad de los datos. El tiempo que requiere esa solución por parte del operador es mayor al tiempo que requiere un programador en implementar el adaptador del nuevo transportista.

Sacrifiqué la petición del cliente que decía "no quiero volver a pagar por lo mismo." para poder mantener la estabilidad del proyecto. Pues vale más la pena tener estabilidad y planear la actualización cuando se sepa con exactitud los requerimientos del nuevo transportista a dejar una solución que si no se implmenta bien puede romper la operación diaria de más de un transportista.

Con dos millones de eventos y cuatro transportistas se rompería al primer momento detendría la operación del cuarto transportista más no la perdería, pues los payloads se guardan en crudo entonces un programador que añada el adaptador del cuarto transportista podría reprocesar los datos y reingresarlos al sistema sin perder información, aunque lo ideal sería poder planificar con antelación el ingreso del nuevo transportista a la operación de la aplicación. La cantidad de eventos no supone un problema con esta decisión. 

Con una semana más la decisión no cambiaría, lo que sí podría añadir es reducir el trabajo que hoy cuesta escribir un adaptador nuevo. Construiría una herramienta interna que analice los payloads guardados en crudo y liste sus campos con la frecuencia de aparición de cada uno, **no para que el operador configure nada, sino para que el programador que escriba el cuarto adaptador tarde un par de horas en vez de un día y no se le escape un campo opcional**. Y escribiría las pruebas de normalización de los tres formatos con sus casos borde, que hoy es la pieza más frágil del sistema.