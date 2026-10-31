# 채널 키트 굽기·내보내기 (2026-10-31, docs/features/channel-models.md)
# 블렌더에서 실행:  Blender -b --python scripts/models/bake_kit.py -- scripts/models/kit.json <저장소 루트> [종류 id ...]
# 종류(컬렉션)마다: 모디파이어 적용 사본 + 벽 → 라이트맵 UV(두 번째 UV) → 낮·밤 회색조 라이트맵 굽기(색은 굽지 않음 — 앱이 입힌다)
#                    → 역할 이름 재질로 glb 내보내기 + 라이트맵 PNG + manifest.json
import bpy, json, os, sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
CFG_PATH, ROOT = argv[0], argv[1]
ONLY = set(argv[2:])
cfg = json.load(open(CFG_PATH, encoding='utf-8'))
SRC = os.path.join(ROOT, cfg['source'])
OUT = os.path.join(ROOT, cfg['out'])
os.makedirs(OUT, exist_ok=True)
PX = int(cfg.get('lightmapPx', 1024))
EMISSIVE = set(cfg.get('emissiveRoles', []))


def role_of(obj_name):
    base = obj_name
    if '__' in base:
        return base.rsplit('__', 1)[1]
    return cfg['roles'].get(base)


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = 'GPU'
    except Exception:
        scene.cycles.device = 'CPU'
    scene.cycles.samples = int(cfg.get('samples', 96))
    scene.render.bake.margin = 6
    return scene


def world(color, strength):
    w = bpy.context.scene.world or bpy.data.worlds.new('bake')
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (*color, 1)
    bg.inputs[1].default_value = strength


def bake_material(name, img, emissive_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
    bsdf.inputs['Roughness'].default_value = 0.6
    em = bsdf.inputs.get('Emission Color')
    if em is not None:
        em.default_value = (1, 1, 1, 1)
        bsdf.inputs['Emission Strength'].default_value = emissive_strength
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'lightmap'
    nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
    nt.nodes.active = tex
    return m


def bake(objs, imgs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for img in imgs:
        img.pixels[:] = np.zeros(len(img.pixels), dtype=np.float32)
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=6, use_clear=False)


def luminance(img):
    a = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    return a[:, :3].mean(axis=1), img.size[0], img.size[1]


def norm(lum):
    nz = lum[lum > 0]
    p = float(np.percentile(nz, 99.5)) if nz.size else 1.0
    return 0.95 / max(p, 1e-6)


def smooth(lum, w, h, r):
    a = lum.reshape(h, w)
    k = np.exp(-0.5 * (np.arange(-3 * r, 3 * r + 1) / r) ** 2)
    k /= k.sum()
    a = np.apply_along_axis(lambda x: np.convolve(x, k, mode='same'), 1, a)
    a = np.apply_along_axis(lambda x: np.convolve(x, k, mode='same'), 0, a)
    return a.ravel()


def save_gray(lum, w, h, path, scale):
    v = np.clip(lum * scale, 0, 1)
    out = bpy.data.images.new(os.path.basename(path), w, h, alpha=False, float_buffer=False)
    out.colorspace_settings.name = 'Non-Color'
    px = np.repeat(v[:, None], 4, axis=1)
    px[:, 3] = 1
    out.pixels[:] = px.ravel()
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()


def process(v):
    bpy.ops.wm.open_mainfile(filepath=SRC)
    scene = setup_render()
    col = bpy.data.collections[v['collection']]
    keep = list(col.all_objects) + [o for p in v.get('parts', []) for o in bpy.data.collections[p].all_objects]
    keep = [o for o in keep if o.type == 'MESH']
    for o in bpy.data.objects:
        o.hide_render = True
    bake_col = bpy.data.collections.new('BAKE')
    scene.collection.children.link(bake_col)
    # 뷰 레이어에서 제외한(체크 해제) 컬렉션은 계산되지 않아 저장된 옛 위치·회전 그대로 — 모두 넣고 다시 계산 (2026-10-31: 90° 세운 글자가 누워 나왔다)
    def include(lc):
        lc.exclude = False
        for ch in lc.children:
            include(ch)
    include(bpy.context.view_layer.layer_collection)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    copies = []
    for o in keep:
        role = role_of(o.name) or ('bracket' if o.name in [x.name for p in v.get('parts', []) for x in bpy.data.collections[p].all_objects] else None)
        if not role:
            print(f'!! 역할 없음: {o.name} ({v["collection"]}) — kit.json roles 또는 이름 끝 __역할')
            continue
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        c = bpy.data.objects.new(f'{role}', me)
        c.matrix_world = ev.matrix_world.copy()
        c['role'] = role
        bake_col.objects.link(c)
        copies.append(c)
    if not copies:
        raise SystemExit(f'{v["id"]}: 내보낼 오브젝트 없음')
    # 크기 (블렌더 좌표: 앞 = -Y, 벽 쪽 = +Y)
    pts = np.array([c.matrix_world @ vtx.co for c in copies for vtx in c.data.vertices])
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    size = hi - lo
    span = max(size[0], size[2])
    wy = hi[1] + float(v.get('wallGap', 0)) + 0.0005
    cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    bpy.ops.mesh.primitive_plane_add(size=1)
    wall = bpy.context.active_object
    wall.name = 'wall'
    wall['role'] = 'wall'
    wall.rotation_euler = (1.5707963, 0, 0)
    WALL = span * 2
    wall.scale = (WALL, WALL, 1)
    wall.location = (cx, wy, cz)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for cc in list(wall.users_collection):
        cc.objects.unlink(wall)
    bake_col.objects.link(wall)
    # UV: 첫 UV(없으면 만듦) + 'lightmap'(두 번째) — 앱은 늘 uv1 을 라이트맵으로
    letters = copies
    for o in letters + [wall]:
        me = o.data
        if not me.uv_layers:
            me.uv_layers.new(name='uv')
        lm = me.uv_layers.new(name='lightmap')
        me.uv_layers.active = lm
    # 글자 라이트맵 UV 를 한 장에 펼친다
    bpy.ops.object.select_all(action='DESELECT')
    for o in letters:
        o.select_set(True)
    bpy.context.view_layer.objects.active = letters[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')
    # 벽은 자기 그림 전체에 (평면 그대로)
    for loop, uv in zip(wall.data.loops, wall.data.uv_layers['lightmap'].data):
        co = wall.data.vertices[loop.vertex_index].co  # 벽 자기 좌표 (가운데 = 0)
        uv.uv = (co.x / WALL + 0.5, co.z / WALL + 0.5)
    res = {}
    for mode in ('day', 'night'):
        img_l = bpy.data.images.new(f'{v["id"]}_{mode}_letters', PX, PX, float_buffer=True)
        img_w = bpy.data.images.new(f'{v["id"]}_{mode}_wall', PX // 2, PX // 2, float_buffer=True)
        for o in letters:
            strength = 6.0 if (mode == 'night' and o['role'] in EMISSIVE) else 0.0
            o.data.materials.clear()
            o.data.materials.append(bake_material(f'b_{o.name}_{mode}', img_l, strength))
        wall.data.materials.clear()
        wall.data.materials.append(bake_material(f'b_wall_{mode}', img_w))
        for o in bpy.data.objects:
            if o.type == 'LIGHT':
                o.hide_render = True
        if mode == 'day':
            world((0.62, 0.66, 0.72), 0.9)
            ld = bpy.data.lights.new('sun', 'SUN')
            ld.energy = 3.0
            sun = bpy.data.objects.new('sun', ld)
            sun.rotation_euler = (1.15, 0.0, -0.55)  # 앞·위·왼쪽에서
            bake_col.objects.link(sun)
        else:
            world((0, 0, 0), 0.0)
        bake(letters + [wall], [img_l, img_w])
        if mode == 'day':
            bpy.data.objects.remove(bpy.data.objects['sun'])
        ll, w1, h1 = luminance(img_l)
        lw, w2, h2 = luminance(img_w)
        lw = smooth(lw, w2, h2, 2)  # 벽은 부드러운 빛 — 굽기 잡음만 지운다
        fl, fw = f'{v["id"]}.{mode}.letters.png', f'{v["id"]}.{mode}.wall.png'
        sl, sw = norm(ll), norm(lw)  # 그림마다 따로 펴고 세기는 manifest 에 — 밝은 LED 면 때문에 후광이 묻히지 않게
        save_gray(ll, w1, h1, os.path.join(OUT, fl), sl)
        save_gray(lw, w2, h2, os.path.join(OUT, fw), sw)
        res[mode] = {'letters': fl, 'wall': fw, 'letterIntensity': round(1 / sl, 4), 'wallIntensity': round(1 / sw, 4)}
    # 내보내기: 역할 이름 재질(색은 앱이)
    for o in letters + [wall]:
        o.data.materials.clear()
        m = bpy.data.materials.get(o['role']) or bpy.data.materials.new(o['role'])
        o.data.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT')
    for o in letters + [wall]:
        o.select_set(True)
    glb = os.path.join(OUT, f'{v["id"]}.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True, export_texcoords=True,
                              export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False, export_yup=True)
    roles = sorted({o['role'] for o in letters})
    return {'id': v['id'], 'label': v['label'], 'file': f'{v["id"]}.glb', 'roles': roles, 'lightmaps': res,
            'size': [round(float(size[0]), 4), round(float(size[2]), 4), round(float(size[1]), 4)], 'bytes': os.path.getsize(glb)}


manifest_path = os.path.join(OUT, 'manifest.json')
old = json.load(open(manifest_path, encoding='utf-8')) if os.path.exists(manifest_path) else {'version': 0, 'variants': []}
by_id = {x['id']: x for x in old.get('variants', [])}
for v in cfg['variants']:
    if ONLY and v['id'] not in ONLY:
        continue
    print(f'== {v["id"]} ({v["collection"]})')
    by_id[v['id']] = process(v)
    print(f'   ok {by_id[v["id"]]["bytes"]} bytes, roles {by_id[v["id"]]["roles"]}')
order = [v['id'] for v in cfg['variants']]
manifest = {'version': int(old.get('version', 0)) + 1, 'letter': 'G', 'variants': [by_id[i] for i in order if i in by_id]}
json.dump(manifest, open(manifest_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('manifest', manifest_path, 'version', manifest['version'])
