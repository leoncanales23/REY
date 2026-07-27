from pathlib import Path

path = Path('/tmp/apply-lab.py')
source = path.read_text()
call = '\npatch_validate()\n'
if call not in source:
    raise RuntimeError('No se encontró la llamada patch_validate')
path.write_text(source.replace(call, '\n# validate.mjs se parchea mediante apply-lab-validator.py\n', 1))
