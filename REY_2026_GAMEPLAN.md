# REY 2026 · evolución del reino

Auditoría de `main` 46fce98, previa a cambios de producto. Revisados todos los
archivos versionados, rama histórica `origin/master`, historial y PR fusionados
#6–13. `TECHNOLOGY_REGISTRY.md` describe aspiraciones antiguas, no funciones
verificadas. No hay framework ni backend: HTML/CSS, Canvas 2D y scripts IIFE.

## Base comprobada

`game.js` (3535 líneas) reúne simulación a 20 Hz, IA, terreno, flow fields,
hash espacial, fog, render, audio procedural y controles mouse/touch.
`net.js` usa PeerJS: host autoritativo y snapshots a 10 Hz; listas blancas,
límites de bytes, IDs y frecuencia. `app.js` adapta API, invitaciones y PWA.
Campaña, escenarios, replay y crónica son módulos de UI/persistencia separados.
Tres edades, cinco tecnologías, dos facciones, tres Bastiones, supremacía,
dos poderes, mercenarios y seis eventos están implementados: conservarlos.

Ejecutado localmente en Chromium: menú y acto I sin errores JS, capturas de
referencia. Validación estática y checksum unitario pasan. Motor real, 360 ticks:
misma semilla `fbe1b83b` / `fbe1b83b`; otra semilla `3549e6dc`.
Esto no demuestra balance, 60 FPS sostenidos ni estabilidad P2P entre redes reales.

## Hallazgos prioritarios

- **Combate/navegación:** movimiento normal vuelve a adquirir aggro, dificultando
  retiradas. `attack` permite objetivos propios; construcción paga antes de
  comprobar constructores válidos. Producción no reserva población en cola.
  El fallback directo y separación pueden cruzar agua/obstáculos; LOS de coste
  cero y redondeo del camino pierden información de costes. No prometer pasos
  infranqueables hasta corregir colisión. Formaciones generan una orden por tropa.
- **IA/balance:** toma Bastiones, investiga y contrata, pero no estima pérdidas ni
  se retira. Conquistador recibe +22% recolección, +12% ataque y recursos iniciales;
  exponer esas ayudas o sustituirlas gradualmente por decisiones. Los textos de
  Tregua Comercial difieren del efecto real (+4 oro/s); Tormenta afecta castillos.
- **Red:** inicio inmediato beneficia al host; falta ready, handshake de versión,
  heartbeat, reconexión autenticada y pausa. Snapshots solo validan tamaño/objeto;
  no esquema, monotonicidad ni checksum. Se transmite información enemiga completa
  y G permite quitar fog; no apto para ranking. Ráfagas de formaciones pueden perder
  órdenes por rate limit. `copyLink` busca `btnCopy`, ausente del HTML actual.
- **Determinismo/replay:** semilla y órdenes son una base sólida. Partículas consumen
  RNG de simulación; checksum omite RNG actual, IA, rally y terreno. Resultado de
  campaña añade estrellas antes de grabar, pero replay las compara sin puntuarlas:
  requiere prueba de victoria completa, no solo 360 ticks. PR #13 cambió reglas sin
  cambiar versión de motor: no se puede garantizar compatibilidad v8 histórica.
- **Rendimiento:** `nearestEnemy`, steering y búsquedas por ID recorren arrays;
  hash espacial solo alivia separación. Flow fields se invalidan cada 3 s.
  HUD escribe DOM cada frame; panel se reconstruye cada 500 ms; fog recalculado
  por frame. Medir percentiles de frame/tick antes de cambiar algoritmos.
- **Presentación/UX/móvil:** menú alto centrado recorta cabecera en desktop;
  HUD sobrecargado, terreno cuadriculado, falta zoom y feedback de órdenes.
  Touch no ofrece selección grupal equivalente; minimapa compite con panel.
  Audio crea contextos por reinicio, sin volumen, música ni buses.
- **Persistencia/PWA:** guardados sin recuperación consistente de cuota/permisos;
  crónica observa DOM y mide reloj real. SW elimina cachés ajenas del origen y
  combina HTML de red con scripts cacheados. Fuentes/PeerJS dependen de CDN.
  Pruebas estáticas mayormente comprueban marcadores, no comportamiento.

## Fases pequeñas, cada una con PR y verificación

1. **Mapa del reino (este PR):** catálogo de regiones sobre actos existentes,
   Capital → Bosque → Paso, biomas/modificadores simétricos, fronteras y estandartes,
   progreso local independiente, recompensa de exploración y estrellas. Identidad
   regional en replay/checksum; pruebas de bloqueos, derrota, victoria, recarga,
   replay y móvil. Sin bonos persistentes de combate ni cambios P2P.
2. **Órdenes fiables:** retirada explícita, propiedad de objetivos/constructores,
   población reservada, colisión y destinos accesibles. Pruebas de movimiento,
   combate y dos simulaciones iguales; versionar cambios del motor.
3. **Duelo 1v1 completo:** lobby, reglas/semilla/versiones acordadas, ready e inicio
   sincronizado; después heartbeat, pausa/reconexión y rematch. Dos navegadores,
   desconexiones y mensajes malformados. Mantener autoridad del host.
4. **Actividades y memoria:** catálogo `id + trigger + objective + reward` con
   estado serializable; primera escolta o mina disputada. Briefing y una decisión
   que cambie una misión posterior. Expandir a 10/20 regiones mediante datos.
5. **IA y claridad:** perfiles de intención, defensa económica y retirada;
   cámara suave, siluetas, impacto y HUD legible. Benchmarks con 80 unidades/lado,
   dispositivo móvil y carga de partículas; extracción incremental de render.
6. **Identidad audiovisual y metajuego:** buses de audio y música por estado,
   cosméticos/logros/desafíos separados de campaña y competitivo. 2v2,
   espectadores y ranking solo tras estabilizar protocolo y autoridad.

Cada PR: sintaxis, validación estática, tests existentes, determinismo y browser
E2E; capturas y limitaciones concretas. Sin merge automático ni producción.
