# FRONTERAS // CHILE 1817: vertical slice de Chacabuco

## Arquitectura

REY conserva su ruta y balance de simulación. El selector de FRONTERAS carga el Era Pack elegido antes de que `game.js` lo capture. Un registro de runtimes selecciona `formations-v1` por perfil (`runtimeId`); el runtime recibe definiciones, tema, mapa, fuerzas, objetivos y reglas declarativas. No identifica Chile por `eraId` ni obliga a REY a adoptar recursos o combate del siglo XIX.

El nuevo runtime ofrece fichas deterministas de formación, órdenes de mover/atacar, LINE/COLUMN, disparo con alcance y recarga, stocks arbitrarios por bando, munición limitada por ficha, moral/rutina de retirada, aura de mando, reorganización, abastecimiento desde el carro, proyectiles de artillería con área moderada, humo limitado y una IA que avanza, busca blancos y disputa el paso. La primera victoria se resuelve por control sostenido del paso o quiebre de la línea.

El pack `chile1810` aporta `chacabuco1817`, bandos contextuales, unidades/capacidades, mandos, reglas, fuentes y modo `historical`/`alternate`. `resources.definitions` usa `supplies`, `ammunition` y `morale`; el estado de simulación de esta edición no representa suministros con oro/madera. `mars2135` permanece sin runtime y no puede iniciar partida.

El checksum incluye era/versión/reglas/mapa/modo, libro de recursos y todos los campos que alteran formaciones, disparos, moral, objetivo y proyectiles. Los campos nuevos se incluyen condicionalmente, preservando el JSON canónico anterior de REY. Replay conserva pack, reglas, mapa, modo, semilla, órdenes y checksum final; la carga exige coincidencia exacta. El contrato de red compara edición, versiones, mapa, modo/escenario y semilla. La negociación existe; el lobby P2P de esta edición todavía no está habilitado.

## Diseño de partida

- **Historical — Reconstrucción histórica:** empieza desde una disposición inspirada en las fuentes; se puede ganar o perder. El objetivo táctico es desorganizar la línea y controlar el paso.
- **Alternate — Historia alternativa:** conserva las mismas fuerzas iniciales y reglas, pero permite cambiar órdenes y desenlace. Se presenta como simulación contrafactual.
- **Comandantes:** San Martín, O’Higgins, Soler y Maroto aparecen como marcadores de mando. Sus radios de cohesión y la orden de reorganización son abstracciones RTS declaradas como tales; no son habilidades mágicas ni afirmaciones de acciones puntuales.
- **Terreno:** loma central, dos rutas esquemáticas, estero, laderas y espacios de despliegue. El plano de 1890 de Memoria Chilena inspira la lectura general; todas las coordenadas y pasos tácticos del motor son reconstrucción.

## Pruebas/evidencia

`npm test` cubre estática, checksum, World Map, Era Core, catálogo y contrato. `npm run test:browser` conserva la ruta de REY y añade una pasada desktop/mobile de FRONTERAS; también guarda capturas. `scripts/browser-determinism.mjs` mantiene la prueba real de navegador de REY. El service worker cachea runtime, selector, CSS y pack.

En la pasada local final, headless Chromium midió Chacabuco en escritorio: mediana de intervalo RAF **50.0 ms**, p95 **100.0 ms**, mediana del coste del tick **0.2 ms** (22 intervalos/26 ticks medidos). La pasada reportó `8739cc33` en dos ejecuciones con semilla y orden iguales y `784e0718` con semilla distinta; replay esperado/real `8739cc33`. Son muestras breves de Chromium headless, no un benchmark de hardware móvil ni una afirmación de 60 FPS.

Las capturas E2E se guardan en `docs/evidence/chacabuco/` para selector, briefing, batalla desktop, artillería, móvil y Archivo Histórico. Las métricas de frame/tick del Archivo Histórico son medidas de la sesión que se está jugando, no una promesa de 60 FPS.

## Limitaciones conocidas

- Runtime experimental aislado; no hay construcción, árbol tecnológico ni campaña histórica completa.
- Topografía representativa, no GIS; posiciones no pretenden precisión de escala.
- Las fichas representan formaciones abstractas, no cantidades de soldados. No se añaden nombres de regimientos, uniformes ni cifras sin soporte documental suficiente.
- La IA es de nivel inicial: avanza, adquiere blancos y presiona el objetivo; no coordina una maniobra histórica sofisticada.
- Formaciones usan una evasión local determinista frente a la cresta, no un pathfinder militar completo. Un cuello de botella o una unidad atascada puede requerir órdenes adicionales.
- Artillería/impacto, humo y tropas tienen límites; el rendimiento se medirá en Chromium y en móvil durante E2E, y no se afirmará 60 FPS si las métricas no lo respaldan.
- El contrato P2P se valida, pero no hay lobby de Chacabuco ni prueba de partida P2P en esta fase.
- FRONTERAS conserva la biblioteca de replay de REY; cada archivo solo carga con su era y versión exactas. El formato propio de comandos del runtime es `fronteras-formations-v1`.
