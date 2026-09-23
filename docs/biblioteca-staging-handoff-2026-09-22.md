# Biblioteca Canaria de Terapia Regresiva: estado y continuidad

Fecha de corte: 22 de septiembre de 2026.

## Objetivo

Trasladar a staging la experiencia de biblioteca probada en `C:\dev\GofioDesign\playground`, conservando los datos editoriales, créditos de imagen, privacidad y disponibilidad bibliotecaria que ya existían en Mi Terapia Regresiva.

## Repositorios de referencia

- Staging: `C:\dev\miterapiaregresiva\stg`
- Playground: `C:\dev\GofioDesign\playground`
- Rama local de trabajo: `main`
- Remoto: `origin/main`
- No se ha publicado esta fase en GitHub.

## Recorrido realizado

1. Se comparó la biblioteca del playground con la página y las fichas existentes en staging.
2. Se creó un índice único en `data/library/explorar.json` con 13 autores y 35 obras.
3. Se incorporaron las vistas por autores, temas y listado A-Z, además de búsqueda y tres tamaños de portada.
4. Se recuperó el desplazamiento horizontal por rueda, trackpad, táctil, arrastre de ratón, teclado y flechas.
5. Se ajustó la distribución para que autores con pocas obras puedan compartir fila en escritorio.
6. Se sustituyeron las etiquetas ambiguas por iconos de monitor para lectura online y libro para ejemplar físico.
7. Se conectaron las 13 fichas editoriales que ya existían en staging para Brian Weiss y Michael Newton.
8. Se dio acceso a una ficha inicial dentro del explorador para el resto de obras, sin inventar portada, ISBN, reseña o disponibilidad.
9. Se adaptó la ficha abierta al lenguaje del playground: portada a la izquierda, lectura a la derecha, temas, solapa del autor, fuentes y estante de otros libros.
10. El botón `Volver al estante de [autor]` se colocó encima de la portada.
11. La ficha sustituye a los estantes mientras está abierta; ya no se añade debajo de la página.
12. Se corrigió el historial interno: una ficha abierta directamente vuelve al estante sin saltar a una URL anterior ajena; Atrás del navegador conserva su comportamiento normal.
13. Se añadió crédito por portada y se corrigió la convivencia entre el icono de información y el arrastre del estante.
14. Los créditos de imagen funcionan como acordeón global: abrir uno cierra cualquier otro abierto en la página.
15. Se recuperaron las proporciones del playground: portadas 2:3, separación editorial, estante visual, densidades compacta/estándar/ampliada y ficha sin desbordamiento horizontal.

## Datos y piezas principales

- Página de entrada: `biblioteca-de-terapia-regresiva/index.html`
- Índice: `data/library/explorar.json`
- Explorador: `assets/library-explorer.js`
- Estilos del explorador: `assets/library-explorer.css`
- Comportamiento global de créditos: `assets/site.js`
- Fichas editoriales existentes: `data/book-pages/brian-weiss/` y `data/book-pages/michael-newton/`
- Páginas completas existentes: `autores/*/libros/*/index.html`
- Disponibilidad diaria actual: `data/availability/brian-weiss.json`
- Directorio de bibliotecas: `data/libraries/canarias.json`
- Listado de medios pendientes: `C:\Users\juana\OneDrive\Escritorio\medios-pendientes-mtr.md`

## Verificaciones realizadas

- Las 35 obras abren una ficha desde el explorador.
- Las 13 fichas completas reutilizan los datos editoriales de staging.
- Una ficha inicial muestra avisos explícitos para los datos no verificados.
- `Volver al estante` no abandona la biblioteca cuando la ficha se abrió mediante una URL directa.
- Los estantes conservan desplazamiento horizontal y clic de apertura.
- Al abrir un segundo crédito de imagen, el primero se cierra.
- No hay desbordamiento horizontal en la ficha comprobada en escritorio.
- Los archivos JavaScript pasan la comprobación de sintaxis y el JSON se puede leer correctamente.

## Trabajo pendiente, por prioridad

### 1. Integrar correctamente RED BICA

- Definir una búsqueda estable por ISBN y, como respaldo, por título y autor normalizados.
- Resolver variantes de título, traducción, signos de puntuación y coautoría.
- Asociar cada registro BICA con la obra correcta sin falsos positivos.
- Ampliar el proceso diario, hoy centrado en Brian Weiss, al resto del catálogo.
- Mostrar fecha de comprobación, ejemplares y disponibilidad solo cuando el emparejamiento sea verificable.
- Probar enlaces de ficha, reserva y cambios de disponibilidad.

### 2. Completar las fichas editoriales restantes

- Crear JSON editorial para las 22 obras que ahora tienen ficha inicial.
- Verificar título original, idiomas, ediciones e ISBN.
- Redactar reseñas neutrales y documentadas.
- Añadir lectura online únicamente cuando exista una copia legítima y verificable.
- Generar páginas completas con `scripts/generate-book-pages.mjs` cuando los datos estén listos.
- Adaptar también las páginas HTML completas al mismo lenguaje visual del playground; por ahora la adaptación principal vive en el explorador.

### 3. Completar retratos y revisar créditos

- Las 35 obras ya tienen portada en el explorador.
- Las 16 portadas externas se guardaron localmente en WebP y conservan la fuente visual en su crédito.
- Las 6 portadas que ya existían para Helen Wambach, Ian Stevenson y Raymond A. Moody están conectadas.
- Quedan pendientes 9 retratos de autores con procedencia suficientemente documentada.
- Revisar la fuente exacta de la copia local de `Where Reincarnation and Biology Intersect`.

### 4. Revisión responsive y accesible final

- Revisar móvil estrecho, tableta, escritorio y escritorio ancho.
- Confirmar dos portadas visibles en móvil estándar y que las densidades no cortan títulos.
- Probar navegación completa con teclado, foco, Escape, lector de pantalla y movimiento reducido.
- Confirmar que el panel de créditos móvil queda dentro del viewport.
- Verificar que no haya saltos de diseño al cargar portadas remotas.

### 5. Revisión editorial y publicación

- Revisar nomenclatura definitiva de la biblioteca y textos de ayuda.
- Decidir si las fichas iniciales se publican o se ocultan hasta completar sus datos.
- Revisar CSP si se añaden nuevos dominios de imágenes.
- Ejecutar una comprobación completa de enlaces y recursos.
- Publicar en GitHub solo después de la validación visual y de BICA.

## Cómo retomar

1. Abrir `C:\dev\miterapiaregresiva\stg`.
2. Revisar este documento y `data/library/explorar.json`.
3. Iniciar el servidor local y abrir `/biblioteca-de-terapia-regresiva/`.
4. Continuar primero por el emparejamiento de libros con RED BICA.
5. Mantener separados los datos verificados de los textos y recursos pendientes.
