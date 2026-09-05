# DOCUMENTO DE DECISIONES TOMADAS PARA EL DESARROLLO DEL PROYECTO 

Versión preliminar del documento disponible en los primeros commits del proyecto, por ahora solo anotaré las sitauciones que estoy evaluando sin dar el veredicto final de la decisión de cada una.

## TIPADO MÁXIMO O INTERPRETACIÓN DE FORMATOS 

### Situación
Hay tres formatos de datos que entran de tres empresas transportistas diferentes, el principal problema no es normalizarlos sino encontrar la forma que una cuarta empresa transportista entre en el futuro y la aplicación se mantenga funcionando sin que el cliente deba pagar por lo mismo otra vez, tomando en consideración que el código lo hereda un equipo de dos personas que no participó en esta fase

### Decisión
Un adaptador en código por transportista, con validación estricta de esquema. Lo único editable desde el panel es el vocabulario (la traducción de estados y la zona horaria), que cambia varias veces al año y lo sabe hacer atención al cliente; la forma de leer el payload vive en el repositorio, donde hay control de versiones y vuelta atrás.
 
### Alternativas descartadas
Descarté la alternativa de permitir al operador de la aplicación ingresar el payload y mapear cada uno de sus campos para que empiece a funcionar, es un trabajo muy complejo para las pocas veces que se usará y no garantiza la estabilidad de los datos. El tiempo que requiere esa solución por parte del operador es mayor al tiempo que requiere un programador en implementar el adaptador del nuevo transportista.
También descarté la alternativa de un perfil declarativo que vaya recorriendo el payload en busca de los datos, aunque pueda funcionar es una opción bastante frágil si el formato de los datos del nuevo transportista difiere mucho de los actuales.

### Qué sacrifiqué
Sacrifiqué el alta de un transportista nuevo para poder mantener la estabilidad del proyecto. Pues vale más la pena tener estabilidad y planear la actualización cuando se sepa con exactitud los requerimientos del nuevo transportista a dejar una solución que si no se implmenta bien puede romper la operación diaria de más de un transportista.

### Qué rompe esto a escala 100×
Lo que se rompe no es el volumen, es el día que llega el cuarto transportista sin adaptador escrito. Sus lotes entran y van enteros a cuarentena, su operación queda detenida, pero no se pierde: el crudo se guarda siempre, y en cuanto el adaptador está desplegado se reprocesa sin haber perdido un evento. El coste es de calendario, no de datos, y se evita conociendo la fecha de alta con antelación. Dos millones de eventos no son un problema de volumen, son treinta y tres días de operación con los cuatro transportistas dentro. Buscar una guía cuesta lo mismo con veinte mil eventos que con dos millones, porque es una búsqueda por índice que devuelve la misma decena de filas. Lo que cambia con el volumen son tres decisiones de diseño, no límites del motor, el estado actual se guarda desnormalizado en el envío en vez de recalcularse recorriendo los eventos, el listado se pagina por cursor y no por desplazamiento, y la deduplicación se apoya en un índice único con inserción por lotes, lo que de verdad crece es el payload crudo: al mismo ritmo que los eventos, y casi nunca se lee.

### Qué haría con una semana más
Con una semana más la decisión no cambiaría, lo que sí podría añadir es reducir el trabajo que hoy cuesta escribir un adaptador nuevo. Construiría una herramienta interna que analice los payloads guardados en crudo y liste sus campos con la frecuencia de aparición de cada uno, no para que el operador configure nada, sino para que el programador que escriba el cuarto adaptador tarde un par de horas en vez de un día y no se le escape un campo opcional. Y escribiría las pruebas de normalización de los tres formatos con sus casos borde, que hoy es la pieza más frágil del sistema.


## MOTOR Y MODELADO DE BASE DE DATOS

### Situación
El cliente pidió usar Postgres y Mongo porque las dos ya están contratadas.
### Decisión
Se decidió usar un solo motor, MongoDB, hay que conservar el payload crudo en cada evento, tiene tres formas hoy y cuatro en enero, la lectura es "traer un agregado" y no cruzar tablas, por lo que no hace indispensable el uso de postgresql. 
### Alternativas descartadas
PostgreSQL 

### Qué sacrifiqué

### Qué rompe esto a escala 100×
### Qué haría con una semana más










### Situación
### Decisión
### Alternativas descartadas
### Qué sacrifiqué
### Qué rompe esto a escala 100×
### Qué haría con una semana más
