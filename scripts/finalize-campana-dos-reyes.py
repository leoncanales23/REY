from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        if new in source:
            return source
        raise RuntimeError(f'No se encontró el anclaje: {label}')
    return source.replace(old, new, 1)


game_path = Path('rey/game.js')
game = game_path.read_text(encoding='utf-8')
game = replace_once(
    game,
    "function startGame(opts){\n  mode=opts.mode; mySide=opts.side; enemySide = mySide==='red'?'blue':'red';\n  campaignMissionId=opts.campaignId||null; campaignOutcomeSent=false;",
    "function startGame(opts){\n  // CAMPAIGN_RESTART_RESET: una misión puede reiniciarse sin recargar ni conservar UI vieja.\n  const endScreen=document.getElementById('endScreen'); if(endScreen) endScreen.style.display='none';\n  document.getElementById('battleSummary')?.replaceChildren();\n  for(const id of ['campaignRetryBtn','campaignNextBtn']){ const button=document.getElementById(id); if(button) button.hidden=true; }\n  sel.clear(); buildKind=null; drag=null; snapPrev=null; snapCur=null;\n  mode=opts.mode; mySide=opts.side; enemySide = mySide==='red'?'blue':'red';\n  campaignMissionId=opts.campaignId||null; campaignOutcomeSent=false;",
    'reset interno de misión',
)
game = replace_once(
    game,
    "      : `ACTO ${campaignResult.act} FALLIDO · ${campaignResult.title} · el Rey debe sobrevivir.`;",
    "      : reason==='campaignFailure'\n        ? `ACTO ${campaignResult.act} FALLIDO · ${campaignResult.title} · el Rey cayó en batalla.`\n        : `ACTO ${campaignResult.act} FALLIDO · ${campaignResult.title} · el reino fue derrotado.`;",
    'texto de derrota preciso',
)
game_path.write_text(game, encoding='utf-8')

campaign_path = Path('rey/campaign.js')
campaign = campaign_path.read_text(encoding='utf-8')
campaign = campaign.replace("  let lastMissionId = null;\n", "")
campaign = campaign.replace("      lastMissionId = mission.id;\n", "")
campaign = campaign.replace("    lastMissionId = detail.id;\n", "")
campaign = replace_once(
    campaign,
    "  byId('campaignRetryBtn')?.addEventListener('click', () => {\n    if (lastMissionId) REINOS.startCampaign(lastMissionId);\n  });\n\n",
    "  // SINGLE_RETRY_HANDLER: prepareEndActions asigna exactamente un onclick por resultado.\n\n",
    'manejador duplicado de reintento',
)
campaign_path.write_text(campaign, encoding='utf-8')

validator_path = Path('scripts/validate.mjs')
validator = validator_path.read_text(encoding='utf-8')
validator = replace_once(
    validator,
    "for (const marker of ['const CAMPAIGN_MISSIONS =', 'applyCampaignSetup', 'stepCampaign(dt)', 'scoreCampaign', \"CustomEvent('reinos:campaign-complete'\", 'startCampaign(id)', 'getCampaignDefinitions']) {",
    "for (const marker of ['const CAMPAIGN_MISSIONS =', 'applyCampaignSetup', 'stepCampaign(dt)', 'scoreCampaign', \"CustomEvent('reinos:campaign-complete'\", 'startCampaign(id)', 'getCampaignDefinitions', 'CAMPAIGN_RESTART_RESET']) {",
    'candado reset campaña',
)
validator = replace_once(
    validator,
    "for (const marker of ['reinos.campaign.v1', 'bestStars', 'reinos:campaign-complete', 'campaignNextBtn', 'campaignRetryBtn']) {",
    "for (const marker of ['reinos.campaign.v1', 'bestStars', 'reinos:campaign-complete', 'campaignNextBtn', 'campaignRetryBtn', 'SINGLE_RETRY_HANDLER']) {",
    'candado handler único',
)
validator_path.write_text(validator, encoding='utf-8')

print('Hardening de Campaña de los Dos Reyes aplicado')
