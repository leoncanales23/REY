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
