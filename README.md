# REINOS

RTS original de navegador inspirado en el género clásico de estrategia, construido con Canvas 2D y JavaScript sin dependencias de compilación. Incluye partida individual contra CPU y duelo P2P host-autoritativo mediante PeerJS.

## Estado real del producto

La aplicación ejecutable vive en `rey/` y usa HTML, CSS y JavaScript estáticos. `TECHNOLOGY_REGISTRY.md` conserva ideas y especificaciones de diseño, pero no debe interpretarse como una lista automática de funciones ya publicadas.

La edición Next Level recupera sistemas que se habían perdido en un merge: terreno con costes de movimiento, niebla de guerra, formaciones, hash espacial, partículas, audio procedural y controles táctiles. También endurece los comandos P2P, limita frecuencia y tamaño de mensajes, añade invitaciones por URL, experiencia instalable PWA y validación continua.

## Ejecutar localmente

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080/rey/`.

## Validar

```bash
node scripts/validate.mjs
node --check rey/game.js
node --check rey/net.js
node --check rey/app.js
node --check rey/sw.js
```

## Desplegar

Requiere Firebase CLI autenticado:

```bash
./deploy.sh
```

## Arquitectura

- `rey/game.js`: simulación, IA, render, input y serialización.
- `rey/net.js`: transporte P2P, validación y límites de mensajes.
- `rey/app.js`: lobby, invitaciones, instalación y estado de red.
- `rey/sw.js`: caché del app shell para carga resiliente.
- `firebase.json`: publicación bajo `/rey` y cabeceras defensivas.

## Seguridad y límites conocidos

El host controla la simulación, lo que reduce trampas del cliente pero no convierte la partida en un sistema competitivo verificable. Un modo clasificado necesitará servidor autoritativo, identidad, persistencia y protección anti-replay. PeerJS usa señalización pública, por lo que la disponibilidad del duelo online depende de un servicio externo.

## Era de Conquista

La progresión estratégica incluye tres edades, desbloqueos por época y tecnologías investigables desde castillo o cuartel. La IA ofrece perfiles Explorador, Guerrero y Conquistador que modifican economía, velocidad de decisión, composición, investigación y presión ofensiva. El multijugador mantiene al host como autoridad y valida también los comandos de investigación.

Desbloqueos principales:

- Edad de Aldea: aldeanos y espadachines.
- Edad de Fortaleza: arqueros, torres, mampostería, filos forjados y emplumado.
- Edad Imperial: caballeros, cría de guerra y población máxima ampliada.


## Reinos Asimétricos

León y Nelson ya no son variaciones cosméticas. La **Legión del Rugido** obtiene presión cuerpo a cuerpo, mayor poder de captura y un aura ofensiva alrededor del Rey León. La **Orden del Horizonte** obtiene más alcance para arqueros y torres, visión ampliada y aldeanos más eficientes.

El mapa incorpora tres Bastiones neutrales. Las unidades militares capturan presencia dentro de su radio; cada Bastión controlado entrega un ingreso moderado y dominar dos activa una cuenta regresiva de 75 segundos. La partida termina por destrucción del castillo o por supremacía territorial. La IA reconoce los objetivos y los prioriza antes del asalto final.


## Comandantes y Eventos del Mapa

Los Reyes disponen de habilidades activas desde la Edad de Fortaleza. León activa **Rugido de Guerra** para potenciar temporalmente a las tropas cercanas; Nelson utiliza **Ojo del Horizonte** para revelar una región amplia incluso durante Niebla Negra y aumentar 18% el daño de proyectiles contra objetivos dentro de esa zona. Ambas habilidades tienen enfriamiento, se validan en el host y la IA usa las mismas reglas.

Dos campamentos neutrales permiten contratar Guardias Mercenarias. El Rey debe acercarse físicamente, pagar el contrato y disponer de población. Los campamentos tienen su propio enfriamiento y el Mercado de Guerra modifica temporalmente precio y disponibilidad.

El mundo alterna entre Tiempo de Abundancia, Mercado de Guerra y Niebla Negra. Cada evento se anuncia 12 segundos antes, se sincroniza por snapshot y altera reglas concretas sin entregar victoria automática.
