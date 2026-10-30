"""Bind the finite Bend selection model to the real vendored recipe files."""
from pathlib import Path
import hashlib,json,sys
ROOT=Path(__file__).resolve().parents[1]
required_path=ROOT/'docs/public-experience/required-transitions.json'
provenance_path=ROOT/'vendor/transitions-dev/provenance.json'
required=json.loads(required_path.read_text())['sourceSlugs']
provenance=json.loads(provenance_path.read_text())
assert len(required)==24 and len(set(required))==24,'Required user selection must contain24 unique recipe IDs'
assert provenance['commit']=='e3aefb554d8fd2cb3e91e773e82a0f2d5a4f82a0','Unexpected upstream source revision'
ids=[];bindings={str(required_path.relative_to(ROOT)):hashlib.sha256(required_path.read_bytes()).hexdigest(),str(provenance_path.relative_to(ROOT)):hashlib.sha256(provenance_path.read_bytes()).hexdigest()}
for row in provenance['files']:
    name=row['name'];filename=name+('.html' if name=='dropdown-menu-morph' else '.md');path=ROOT/'vendor/transitions-dev'/filename
    assert path.is_file(),f'Missing recipe {filename}'
    digest=hashlib.sha256(path.read_bytes()).hexdigest();assert digest==row['sha256'],f'Changed upstream recipe {filename}'
    bindings[str(path.relative_to(ROOT))]=digest
    ids.append(required.index(name) if name in required else 24)
identity=hashlib.sha256(json.dumps(bindings,sort_keys=True,separators=(',',':')).encode()).hexdigest()
model='# Generated from actual selected files. Source binding SHA256 '+identity+'\nimport Base\n\ndef selected_ids() -> List<Nat>:\n  ['+', '.join(str(n)+'n' for n in sorted(ids))+']\n'
target=ROOT/'proof/motion/DATA.bend'
if '--write-model' in sys.argv:target.write_text(model)
else:assert target.read_text()==model,'Stale Bend model; regenerate after reviewing source changes'
print(json.dumps({'status':'source-bound','recipes':len(ids),'sourceBindingSha256':identity,'coverage':'Selected source identities only, not UI behavior or visual fidelity'}))
