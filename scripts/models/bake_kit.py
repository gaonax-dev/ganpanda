# 채널 키트 굽기 CLI (2026-10-31) — 굽기 코드는 애드온과 한 벌: blender/ganpanda_kit/bake.py
# 블렌더에서:  Blender -b --python scripts/models/bake_kit.py -- scripts/models/kit.json <저장소 루트> [종류 id ...]
# 결과: public/channel-models (앱에 든 기본 키트 — 서버 공개판이 없을 때 쓰인다)
import json, os, sys

argv = sys.argv[sys.argv.index('--') + 1:]
CFG_PATH, ROOT = argv[0], argv[1]
ONLY = set(argv[2:])
sys.path.insert(0, os.path.join(ROOT, 'blender', 'ganpanda_kit'))
import bake  # noqa: E402

cfg = json.load(open(CFG_PATH, encoding='utf-8'))
OUT = os.path.join(ROOT, cfg['out'])
m = bake.run(cfg, os.path.join(ROOT, cfg['source']), OUT, ONLY)
path = os.path.join(OUT, 'manifest.json')
old = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {'version': 0, 'variants': []}
by_id = {x['id']: x for x in old.get('variants', [])}
for x in m['variants']:
    by_id[x['id']] = x
order = [v['id'] for v in cfg['variants']]
manifest = {'version': int(old.get('version', 0)) + 1, 'letter': m['letter'], 'variants': [by_id[i] for i in order if i in by_id]}
json.dump(manifest, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('manifest', path, 'version', manifest['version'])
