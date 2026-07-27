from pathlib import Path

path = Path('scripts/validate.mjs')
source = path.read_text()


def once(old: str, new: str, label: str) -> None:
    global source
    if new in source:
        return
    if old not in source:
        raise RuntimeError(f'No se encontró el anclaje de validación: {label}')
    source = source.replace(old, new, 1)


once(
    "  'rey/campaign.css',\n  'rey/net.js',",
    "  'rey/campaign.css',\n  'rey/scenario.css',\n  'rey/replay.css',\n  'rey/net.js',",
    'CSS',
)
once(
    "  'rey/campaign.js',\n  'rey/sw.js',",
    "  'rey/campaign.js',\n  'rey/scenario.js',\n  'rey/replay.js',\n  'rey/sw.js',",
    'JS',
)
once(
    "const campaign = await readFile('rey/campaign.js', 'utf8');\nconst serviceWorker",
    "const campaign = await readFile('rey/campaign.js', 'utf8');\nconst scenario = await readFile('rey/scenario.js', 'utf8');\nconst replay = await readFile('rey/replay.js', 'utf8');\nconst serviceWorker",
    'lecturas',
)
once(
    "['style.css', 'chronicle.css', 'campaign.css', 'net.js', 'game.js', 'app.js', 'chronicle.js', 'campaign.js', 'manifest.webmanifest']",
    "['style.css', 'chronicle.css', 'campaign.css', 'scenario.css', 'replay.css', 'net.js', 'game.js', 'app.js', 'chronicle.js', 'campaign.js', 'scenario.js', 'replay.js', 'manifest.webmanifest']",
    'referencias',
)
once(
    "if (!sw.includes('reinos-campana-v6')) throw new Error('La PWA no renovó su caché para Campaña de los Dos Reyes');",
    "if (!sw.includes('reinos-laboratorio-v7')) throw new Error('La PWA no renovó su caché para el Laboratorio');",
    'caché',
)

block = """
for (const id of ['openScenarioBtn','scenarioDialog','scenarioInfo','openReplayBtn','replayDialog','replayInfo','replayPauseBtn','replaySpeedBtn']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Falta la interfaz del laboratorio #${id}`);
}
for (const marker of ['SCENARIO_RULES_LAB','normalizeScenario','applyScenarioSetup','stepScenario(dt)','startScenario(config)','scenarioTitle']) {
  if (!game.includes(marker)) throw new Error(`Editor de escenarios incompleto: falta ${marker}`);
}
for (const marker of ['reinos.scenarios.v1','MAX_SCENARIOS','scenarioImportInput','scenarioExportBtn','REINOS.startScenario']) {
  if (!scenario.includes(marker)) throw new Error(`Biblioteca de escenarios incompleta: falta ${marker}`);
}
for (const marker of ['REPLAY_SEEDED_RNG','REPLAY_DETERMINISTIC_COMMAND_LOG','recordReplayCommand','applyReplayCommands','normalizeReplay','startReplay(record)','cycleReplaySpeed']) {
  if (!game.includes(marker)) throw new Error(`Repeticiones deterministas incompletas: falta ${marker}`);
}
for (const marker of ['reinos.replays.v1','MAX_REPLAYS','reinos:replay-complete','replayImportInput','toggleReplayPause']) {
  if (!replay.includes(marker)) throw new Error(`Biblioteca de repeticiones incompleta: falta ${marker}`);
}
for (const asset of ['./scenario.css','./replay.css','./scenario.js','./replay.js']) {
  if (!serviceWorker.includes(asset)) throw new Error(`El service worker no cachea ${asset}`);
}
if (game.includes('Math.random()')) throw new Error('game.js conserva azar no sembrado y rompería la reproducción determinista');
"""
marker = "\nconsole.log('Validación estática, salas, crónica, conquista, asimetría, comandantes, eventos y campaña completadas.');"
replacement = "\n" + block.strip() + "\n\nconsole.log('Validación estática, campaña, laboratorio de escenarios y repeticiones deterministas completadas.');"
once(marker, replacement, 'bloque final')
path.write_text(source)
