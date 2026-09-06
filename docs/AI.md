# DOCUMENTO DE USO DE LA IA PARA EL DESARROLLO DE ESTE PROYECTO

Versión final del documento. Las versiones preliminares están disponibles en los primeros commits del proyecto.

## Qué generé con IA

La usé en practicamente todo el proyecto. Para debatir las ideas principales del proyecto definidas en el documento enviado, explorar qué tecnologías usar para cubrir las necesidades planteadas, definir uno a uno los puntos que requieren de mi criterio y cerrarlos con las decisiones correspondientes, ayudarme a redactar para poder comunicar correctamente lo que quiero decir y escribir todo el código, de punta a punta, con las decisiones tomadas por mí.

Lo que no salió de ahí son las decisiones de `DECISIONS.md`. La IA sirvió para tener contra qué discutirlas, no para tomarlas: en las que importaban acabé en un sitio distinto del que proponía.

## Qué reescribí y por qué

El caso más claro es la decisión sobre los formatos. La IA me planteó tres opciones (un adaptador en código por transportista, un perfil declarativo guardado en base de datos, y un híbrido de los dos) y yo añadí una cuarta, un mapeador visual para que el operador configurase al transportista nuevo desde el panel. Terminé descartando la mía y quedándome con la primera, pero no tal como venía: la que entregué, un adaptador en código con el vocabulario separado como dato fuera del adaptador, no estaba en ninguna de las cuatro.

Salió de separar dos cosas que las cuatro opciones trataban igual. Dar de alta un transportista pasa una o dos veces al año y necesita control de versiones, revisión y vuelta atrás, así que va al repositorio; traducir un estado nuevo pasa varias veces al año y lo sabe hacer atención al cliente, así que sale del código y queda como dato. La gramática es código, el vocabulario es dato. Ninguna de las propuestas hacía esa separación.

Lo que entregué es esa separación, no la pantalla que la explota: el vocabulario se carga hoy desde una semilla en código. La costura está construida y es un único punto de cambio; la interfaz de edición se quedó fuera, y está declarada como tal en `DECISIONS.md` y en `ARQUITECTURA.md`.

## Algo que la IA propuso y rechacé

Para mantener el panel al día, la IA propuso resolverlo con un temporizador que recargara cada 30 segundos, y descartó SSE por sobredimensionado para un proyecto de este tamaño.

Lo rechacé por un motivo concreto: ese temporizador deja una ventana de hasta medio minuto en la que la pantalla puede estar mostrando un estado que ya no es cierto, y cerrar exactamente esa ventana es la razón por la que existe este proyecto. Treinta segundos de desfase son una respuesta equivocada más de las que Camila ya da un par de veces por semana. Y el argumento del coste tampoco se sostuvo al medirlo: el aviso que viaja por SSE no lleva datos, solo dice que entró un lote para que el panel rehaga su renderizado en el servidor, y eso son unas cincuenta líneas.

El temporizador no desapareció, quedó como plan B dentro de la vigilancia que refresca si el flujo deja de dar señales. El razonamiento completo está en el README, junto con el límite que tiene esta solución. Dejo escrito el cambio de rumbo en vez de contar la historia como si hubiera acertado a la primera, porque el argumento que se cayó enseña más que el que quedó.
