# FRONTERAS Era Core — arquitectura y alcance

FRONTERAS es el nombre provisional del motor multi-era. Este cambio crea una frontera de contenido compatible con el REY actual; **no** convierte todavía Chile 1810–1826 ni Marte 2135 en juegos ejecutables.

## Paquetes registrados

```text
rey/era-core.js                    registro, validación y contratos
rey/content/eras/rey.js            contenido jugable actual de REY
rey/content/eras/chile1810.js      manifiesto histórico sin misiones ni afirmaciones
rey/content/eras/mars2135.js       manifiesto ficticio de extensibilidad
```

Un pack tiene `id`, `version`, `rulesVersion`, `status`, entidades/capacidades, recursos y costes, edades, tecnologías, facciones, comandantes, mapas/reglas del mundo, campaña, fuentes y defaults de escenario. El registro valida estructura e IDs, clona y congela los datos; la simulación lee las definiciones jugables desde el pack activo. `Net.commandCatalog()` deriva unidades entrenables, edificios, tecnologías, habilidades y campamentos desde ese mismo contenido.

| Pack | Estado | Prueba arquitectónica |
| --- | --- | --- |
| `rey` | `playable` | Datos de combate, producción, progresión, facciones, poderes, mapa inicial, eventos y misiones existentes. Es el pack predeterminado. |
| `chile1810` | `manifest-only` | Recursos de suministros, munición y moral; categorías de infantería de línea, cazadores, granaderos, milicia, caballería, artillería y mando; roster de los personajes indicados como referencias planeadas, sin poderes ni atributos; modos `historical` y `alternate`; soportes para logística, posiciones defensivas e inteligencia. No aporta cifras, uniformes, fuerzas ni misiones. |
| `mars2135` | `manifest-only` | Energía, oxígeno, materiales y comunicaciones; rovers, drones, hábitats e infraestructura orbital. No tiene reglas de combate ni mapa jugable. |

Una misión futura podrá llevar `mode`, `historicalContext`, `objectives`, `mapId`, `rules`, `decisions`, `rewards` y una lista `sources` de IDs de bibliografía del pack. Para misiones `historical`, el registro exige fuentes HTTPS verificables y rechaza referencias ausentes o desconocidas. Los hechos citados y las reconstrucciones mecánicas deben permanecer separados; hoy Chile no registra ninguna misión ni fuente.

## Compatibilidad y determinismo

La forma del estado canónico REY y `reinos-state-v1` se mantienen. Era y versiones viven en `getMatchMeta()`, el registro del replay y el contrato del match; no se añadieron al estado canónico, por lo que los checksums REY no cambian. Un replay nuevo guarda `eraId`, `eraVersion` y `rulesVersion`; `normalizeReplay()` exige coincidencia con el pack activo. La compatibilidad histórica de los registros `reinos-world-v9` que carecen de campos de era se realiza mediante una migración explícita y acotada a `rey`.

El contrato P2P v3 intercambia era, versiones, mapa y semilla antes de habilitar comandos o snapshots. Host y cliente deben coincidir en era/reglas/mapa; el host proporciona la semilla autoritativa. Cada comando y snapshot lleva ese contrato, y se descartan mensajes previos al acuerdo o con contrato diferente. La autoridad de simulación del host no cambia.

## Auditoría y límites conocidos

- `game.js` sigue siendo un módulo monolítico de simulación, IA, input y render (aprox. 3.5 mil líneas). Este PR extrae sus catálogos estáticos y el mapa inicial, pero no separa todavía esos subsistemas.
- Quedan reglas conductuales específicas de REY: slots de economía `g/w`, eventos por ID, poderes/aura, victoria por castillo o supremacía, setups y estrellas de campaña por misión, etiquetas del editor de escenarios, hotkeys y dibujos medievales. Parte de la campaña y el World Map también se define/ejecuta en `game.js` y `world.js`. Las capacidades del esquema son la migración gradual, no una afirmación de que esas reglas ya sean genéricas.
- Por esa razón `chile1810` y `mars2135` son manifests de validación y **no se pueden activar para iniciar una partida**: no tienen estado `playable` ni ledger de recursos/reglas completo. `game.js` falla de forma explícita si se intenta arrancar con un pack no jugable. No hay selector de eras en el menú.
- `determinism.js` conserva la forma del checksum, incluida la representación `g/w`, para no invalidar replays ni checksum REY. El metadato de era se valida por separado antes de ejecutar; un checksum por sí solo nunca demuestra compatibilidad de era.
- El P2P continúa usando PeerJS y host autoritativo; el contrato nuevo tiene prueba determinista simulada, no un E2E entre dos navegadores conectados a través del servicio de señalización. No se añaden lobby, reconexión ni matchmaking.
- Chromium headless mostró variación de rendimiento en la escena de campaña entre corridas: mediana de 33.3–50 ms y p95 de 50–66.7 ms. Es evidencia del runner, no un perfil representativo de todos los equipos; no se garantiza 60 FPS.

## Siguiente secuencia recomendada

1. Extraer reglas de combate y habilidades a efectos declarativos basados en capacidades, manteniendo los mismos escenarios/checksums REY.
2. Añadir una capa de recursos arbitraria y migrar escenarios/HUD sin cambiar el adaptador `g/w` de REY hasta comprobar equivalencia.
3. Hacer campaña, eventos, victoria y mapas data-driven; conservar World Map y replay existentes.
4. Añadir prueba de dos clientes real para rechazo de versiones incompatibles y negociación de semilla/mapa.
5. Investigar fuentes primarias/académicas para Chacabuco 1817; registrar fuentes por misión antes de diseñar fuerzas o resultados. Separar hechos citados de reglas y alternativas ficticias.
6. Desarrollar el primer vertical slice `historical` de Chacabuco en una PR posterior. Marte seguirá siendo prueba de esquema hasta que se priorice como producto.

## Verificación de esta fase

`npm test` valida el shell, las regiones, el contrato determinista y packs con recursos/catálogos distintos; Chromium valida World Map, campaña, escenario, replay/checksum, rechazo de replay de otra era, móvil y PWA offline. El test de Era Core cambia el catálogo activo y demuestra validación de órdenes con recursos/IDs no medievales sin editar `game.js`; no pretende probar una batalla de esas eras.
