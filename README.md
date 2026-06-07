# REINOS — Nelson vs León ⚔

Un juego de **estrategia en tiempo real (RTS)** original, hecho para revivir esas
tardes de cyber café jugando 1v1 con el primo. Dos reinos:

- 🔴 **LEÓN** (rojo)
- 🔵 **NELSON** (azul)

Junta recursos, construye tu base, entrena ejército y destruye el castillo
enemigo. Se juega **solo contra la CPU** o **online contra otra persona** por
código de sala (peer-to-peer, sin servidor propio).

> Es un juego **original** inspirado en el género RTS clásico — no usa código,
> arte, música ni nombres de ningún juego con derechos de autor.

---

## 🎮 Cómo se juega

| Acción | Control |
|---|---|
| Mover cámara | `WASD` / flechas / mover el mouse al borde / click en minimapa |
| Seleccionar 1 unidad o edificio | Click izquierdo |
| Seleccionar varias unidades | Arrastrar caja con click izquierdo |
| Mover / Atacar / Recolectar | Click derecho (según dónde apuntes) |
| Construir (con aldeano elegido) | `Q` casa · `E` cuartel · `R` torre, luego click para ubicar |
| Cancelar construcción | `Esc` |
| Punto de reunión | Selecciona un edificio y click derecho en el mapa |

### Bucle del juego
1. Selecciona aldeanos → click derecho en una **mina de oro** 🪙 o un **árbol** 🪵.
2. Construye **Casas** (suben el tope de población) y un **Cuartel**.
3. Desde el **Castillo** entrenas aldeanos; desde el **Cuartel**, espadachines,
   arqueros y caballeros.
4. Junta un ejército, selecciónalo y mándalo sobre el **castillo enemigo**.
5. El primero que destruye el castillo del otro, gana.

Las **Torres** y el **Castillo** disparan solos a los enemigos cercanos:
úsalos para defender la base.

---

## 👫 Jugar con el primo (online)

No hace falta estar en la misma red. Usa WebRTC vía PeerJS (broker público).

1. Uno entra a la web y aprieta **CREAR SALA** → le aparece un código tipo `REINO-4821`.
   Ese jugador es **LEÓN**.
2. Le pasa el código al otro (WhatsApp, lo que sea).
3. El otro entra a la misma web, escribe el código y aprieta **UNIRME**.
   Ese jugador es **NELSON**.
4. ¡A la guerra! El anfitrión corre la simulación y sincroniza al otro automáticamente.

> Si el broker público de PeerJS está caído o muy lento, puedes levantar tu propio
> PeerServer y cambiar la config en `net.js` (`new Peer(code, { host, port, path })`).

---

## 🚀 Correr en local

Cualquier servidor estático sirve. Por ejemplo:

```bash
# con Node
npx serve .
# o con Python
python3 -m http.server 8080
```

Luego abre `http://localhost:8080`.

> Tiene que ser por `http://` (no abrir el archivo con `file://`), porque WebRTC
> necesita un contexto seguro.

---

## ☁️ Deploy a Firebase Hosting

Ya viene listo con `firebase.json`. Solo cambia el `project` en `.firebaserc`
por el ID de tu proyecto de Firebase y:

```bash
firebase deploy --only hosting
```

---

## 🗂 Estructura

```
nelson-vs-leon/
├─ index.html      # menú, HUD, canvas
├─ style.css       # estética CRT / LAN retro
├─ game.js         # motor RTS: simulación, IA, render, input
├─ net.js          # multijugador P2P (PeerJS, host-autoritativo)
├─ firebase.json   # config de hosting
├─ .firebaserc     # id del proyecto (cámbialo)
├─ package.json
└─ README.md
```

## ⚙️ Cómo funciona el multijugador (resumen técnico)

Modelo **host-autoritativo**: el anfitrión corre toda la simulación y manda
*snapshots* del estado ~10 veces por segundo. El que se une solo dibuja esos
snapshots (con interpolación de posiciones para que se vea fluido) y le envía
sus **órdenes** (mover, atacar, construir, entrenar) al anfitrión, que las
valida y aplica. Así no hay que sincronizar lógica compleja entre las dos
máquinas y queda mucho más robusto.

---

Hecho con cariño para jugar con el primo. 🕹
