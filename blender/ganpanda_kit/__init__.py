# 간판다 채널 키트 애드온 (2026-10-31 사용자: "블랜더에서 간판다로 모델 생성해서 보낼수 있는 플러그인 만들수 있나?" → "운영자만, 초안 공개 2단계로 진행해줘").
# 3D 뷰 오른쪽 N 패널 "간판다": 종류(컬렉션)·역할 지정 → [검사] → [굽고 초안 보내기] — 백그라운드 블렌더가 파일 사본으로 굽고(지금 파일은 그대로),
# 결과를 내용 해시 이름으로 서버에 올린 뒤 초안 목록을 보낸다. 공개는 간판다 /ops "채널 키트"에서 운영자가. 문서: docs/features/channel-models.md
import bpy
import hashlib
import json
import os
import subprocess
import tempfile
import threading
import urllib.request
from bpy.props import EnumProperty, FloatProperty, IntProperty, PointerProperty, StringProperty

ROLES = [
    ('face', '앞면', '빛나는 앞판·도장 앞면'), ('side', '옆면(몸통)', '채널 몸통'), ('cap', '캡', '캡 테두리'), ('back', '뒤판·후광면', '아크릴 뒤판·후광 발광면'),
    ('light', 'LED', 'LED 모듈'), ('bulb', '전구', ''), ('bulbBase', '전구받침', ''), ('bracket', '까치발', ''), ('frame', '프레임', ''), ('none', '(없앰)', '역할 지우기'),
]
ROLE_IDS = {r[0] for r in ROLES} - {'none'}
BAKE = os.path.join(os.path.dirname(__file__), 'bake.py')


def role_of(o):
    if '__' in o.name:
        return o.name.rsplit('__', 1)[1]
    return str(o['gp_role']) if o.get('gp_role') else None


def variants():
    vs = [c for c in bpy.data.collections if c.get('gp_variant')]
    return sorted(vs, key=lambda c: int(c.get('gp_order', 999)))


# ---------- 검사 ----------
def check_lines():
    """문제 목록 (빈 목록 = 보낼 수 있음)"""
    out = []
    vs = variants()
    if not vs:
        return ['종류로 지정한 컬렉션이 없습니다 — 아래 [종류로 지정] 또는 [kit.json 가져오기]']
    ids = [str(c['gp_variant']) for c in vs]
    if len(ids) != len(set(ids)):
        out.append('종류 id 가 겹칩니다: ' + ', '.join(sorted({i for i in ids if ids.count(i) > 1})))
    for c in vs:
        meshes = [o for o in c.all_objects if o.type == 'MESH']
        if not meshes:
            out.append(f'{c.name}: 메시가 없습니다')
        roles = set()
        for o in meshes:
            r = role_of(o)
            if not r:
                out.append(f'{c.name}: {o.name} 역할 없음')
            elif r not in ROLE_IDS:
                out.append(f'{c.name}: {o.name} 모르는 역할 "{r}"')
            else:
                roles.add(r)
            big = max(o.dimensions) if o.dimensions else 0
            if big > 5:
                out.append(f'{c.name}: {o.name} 크기 {big:.1f}m — 너무 큽니다(스케일 확인)')
        if meshes and not roles & {'face', 'side', 'frame'}:
            out.append(f'{c.name}: 앞면·옆면·프레임 역할이 하나도 없습니다')
        for p in [x.strip() for x in str(c.get('gp_parts', '')).split(',') if x.strip()]:
            if p not in bpy.data.collections:
                out.append(f'{c.name}: 부품 컬렉션 "{p}" 없음')
    return out


# ---------- kit.json 가져오기 (저장소의 설정을 파일 안으로 한 번) ----------
def import_kit_json(path):
    cfg = json.load(open(path, encoding='utf-8'))
    n = 0
    for i, v in enumerate(cfg.get('variants', [])):
        c = bpy.data.collections.get(v['collection'])
        if not c:
            continue
        c['gp_variant'] = v['id']; c['gp_label'] = v.get('label', c.name); c['gp_wall_gap'] = float(v.get('wallGap', 0)); c['gp_parts'] = ','.join(v.get('parts', [])); c['gp_order'] = i
        n += 1
    for name, role in cfg.get('roles', {}).items():
        o = bpy.data.objects.get(name)
        if o:
            o['gp_role'] = role
    sc = bpy.context.scene
    sc['gp_lightmap_px'] = int(cfg.get('lightmapPx', 1024)); sc['gp_samples'] = int(cfg.get('samples', 96))
    return n


# ---------- 굽기 + 보내기 ----------
def sha256_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 16), b''):
            h.update(b)
    return h.hexdigest()


def http(method, url, token, data=None, ctype='application/octet-stream'):
    req = urllib.request.Request(url, data=data, method=method, headers={'authorization': f'Bearer {token}', 'content-type': ctype})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status, r.read()


def upload(out_dir, server, token, log=print):
    """굽기 결과(out_dir/manifest.json + 파일)를 내용 해시 이름으로 올리고 초안을 보낸다 → 서버 판 번호"""
    m = json.load(open(os.path.join(out_dir, 'manifest.json'), encoding='utf-8'))
    server = server.rstrip('/')
    names = {}
    for v in m['variants']:
        for f in [v['file'], v['lightmaps']['day']['letters'], v['lightmaps']['day']['wall'], v['lightmaps']['night']['letters'], v['lightmaps']['night']['wall']]:
            if f in names:
                continue
            p = os.path.join(out_dir, f)
            n = f'{sha256_file(p)}.{f.rsplit(".", 1)[1]}'
            log(f'올리는 중 {f}')
            with open(p, 'rb') as fh:
                http('PUT', f'{server}/api/kit/files/{n}', token, fh.read())
            names[f] = n
    for v in m['variants']:
        v['file'] = names[v['file']]
        for mode in ('day', 'night'):
            for k in ('letters', 'wall'):
                v['lightmaps'][mode][k] = names[v['lightmaps'][mode][k]]
    st, body = http('POST', f'{server}/api/kit/draft', token, json.dumps({'letter': m.get('letter', 'G'), 'variants': m['variants']}).encode('utf-8'), 'application/json')
    return json.loads(body)['version']


def bake_copy(src_copy, out_dir, log=print):
    """백그라운드 블렌더로 굽는다 (지금 열린 파일은 건드리지 않는다)"""
    p = subprocess.Popen([bpy.app.binary_path, '-b', '--factory-startup', '--python', BAKE, '--', '--from-blend', src_copy, out_dir],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    tail = []
    for line in p.stdout:
        line = line.rstrip()
        if line.startswith('==') or line.startswith('   ok') or 'Error' in line or 'Traceback' in line:
            log(line.strip())
        tail = (tail + [line])[-15:]
    if p.wait() != 0 or not os.path.exists(os.path.join(out_dir, 'manifest.json')):
        raise RuntimeError('굽기 실패:\n' + '\n'.join(tail))


class Job:
    """패널에 보일 진행 상태 (스레드 → 타이머가 다시 그림)"""
    running = False
    lines: list = []
    result = ''


def run_job(src_copy, server, token):
    Job.running, Job.lines, Job.result = True, [], ''
    log = lambda s: Job.lines.append(s) or Job.lines.__setitem__(slice(None), Job.lines[-8:])  # noqa: E731
    try:
        out = tempfile.mkdtemp(prefix='ganpanda_kit_')
        log('굽는 중… (종류마다 약 30초)')
        bake_copy(src_copy, out, log)
        v = upload(out, server, token, log)
        Job.result = f'초안 {v}판을 보냈습니다 — 간판다 /ops "채널 키트"에서 미리 보고 공개하세요'
    except Exception as e:  # noqa: BLE001
        Job.result = f'실패: {e}'
    finally:
        Job.running = False


# ---------- UI ----------
class GPKitPrefs(bpy.types.AddonPreferences):
    bl_idname = __package__
    server: StringProperty(name='서버', default='https://sync.ganpanda.co.kr')
    token: StringProperty(name='업로드 키', subtype='PASSWORD', description='운영자 업로드 키 (서버 KIT_UPLOAD_TOKEN)')

    def draw(self, context):
        self.layout.prop(self, 'server')
        self.layout.prop(self, 'token')


class GPKIT_OT_set_variant(bpy.types.Operator):
    bl_idname = 'gpkit.set_variant'
    bl_label = '종류로 지정'
    bl_description = '고른 컬렉션을 채널 종류(굽기 단위)로'

    def execute(self, context):
        sc = context.scene
        c = sc.gpkit_collection
        if not c:
            self.report({'ERROR'}, '컬렉션을 고르세요'); return {'CANCELLED'}
        if not sc.gpkit_id:
            self.report({'ERROR'}, '종류 id(영문 소문자·숫자·-)를 넣으세요'); return {'CANCELLED'}
        c['gp_variant'] = sc.gpkit_id; c['gp_label'] = sc.gpkit_label or c.name; c['gp_wall_gap'] = sc.gpkit_wall_gap; c['gp_parts'] = sc.gpkit_parts
        c['gp_order'] = int(c.get('gp_order', len(variants())))
        return {'FINISHED'}


class GPKIT_OT_unset_variant(bpy.types.Operator):
    bl_idname = 'gpkit.unset_variant'
    bl_label = '종류에서 빼기'

    def execute(self, context):
        c = context.scene.gpkit_collection
        if c and c.get('gp_variant'):
            del c['gp_variant']
        return {'FINISHED'}


class GPKIT_OT_set_role(bpy.types.Operator):
    bl_idname = 'gpkit.set_role'
    bl_label = '역할 지정'
    bl_description = '선택한 오브젝트에 역할(앱이 색을 입히는 면)을'

    def execute(self, context):
        r = context.scene.gpkit_role
        for o in context.selected_objects:
            if r == 'none':
                if o.get('gp_role'):
                    del o['gp_role']
            else:
                o['gp_role'] = r
        return {'FINISHED'}


class GPKIT_OT_import_json(bpy.types.Operator):
    bl_idname = 'gpkit.import_json'
    bl_label = 'kit.json 가져오기'
    bl_description = '저장소 scripts/models/kit.json 의 종류·역할을 이 파일 안으로'
    filepath: StringProperty(subtype='FILE_PATH')

    def invoke(self, context, event):
        context.window_manager.fileselect_add(self); return {'RUNNING_MODAL'}

    def execute(self, context):
        n = import_kit_json(self.filepath)
        self.report({'INFO'}, f'종류 {n}개를 가져왔습니다'); return {'FINISHED'}


class GPKIT_OT_check(bpy.types.Operator):
    bl_idname = 'gpkit.check'
    bl_label = '검사'

    def execute(self, context):
        Job.lines = check_lines() or ['문제 없음 — 보낼 수 있습니다']
        Job.result = ''
        return {'FINISHED'}


class GPKIT_OT_send(bpy.types.Operator):
    bl_idname = 'gpkit.send'
    bl_label = '굽고 초안 보내기'
    bl_description = '모든 종류를 굽고 간판다에 초안으로 보낸다 (공개는 간판다 /ops 에서)'
    _timer = None

    def execute(self, context):
        prefs = context.preferences.addons[__package__].preferences
        if not prefs.token:
            self.report({'ERROR'}, '애드온 설정에 업로드 키를 넣으세요'); return {'CANCELLED'}
        bad = check_lines()
        if bad:
            Job.lines = bad; self.report({'ERROR'}, '검사에서 문제가 나왔습니다'); return {'CANCELLED'}
        copy = os.path.join(tempfile.mkdtemp(prefix='ganpanda_src_'), 'kit.blend')
        bpy.ops.wm.save_as_mainfile(filepath=copy, copy=True)  # 지금 파일은 그대로, 사본으로 굽는다
        threading.Thread(target=run_job, args=(copy, prefs.server, prefs.token), daemon=True).start()
        self._timer = context.window_manager.event_timer_add(0.5, window=context.window)
        context.window_manager.modal_handler_add(self)
        return {'RUNNING_MODAL'}

    def modal(self, context, event):
        for a in context.screen.areas:
            if a.type == 'VIEW_3D':
                a.tag_redraw()
        if event.type == 'TIMER' and not Job.running:
            context.window_manager.event_timer_remove(self._timer)
            self.report({'INFO'} if not Job.result.startswith('실패') else {'ERROR'}, Job.result)
            return {'FINISHED'}
        return {'PASS_THROUGH'}


class GPKIT_PT_panel(bpy.types.Panel):
    bl_label = '간판다 채널 키트'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = '간판다'

    def draw(self, context):
        sc, L = context.scene, self.layout
        b = L.box(); b.label(text='종류 (컬렉션 = 굽기 단위)')
        for c in variants():
            b.label(text=f'{c["gp_variant"]} · {c.get("gp_label", c.name)} · 벽 {float(c.get("gp_wall_gap", 0)):.2f}m', icon='OUTLINER_COLLECTION')
        b.prop(sc, 'gpkit_collection', text='컬렉션')
        r = b.row(); r.prop(sc, 'gpkit_id', text='id'); r.prop(sc, 'gpkit_label', text='이름')
        r = b.row(); r.prop(sc, 'gpkit_wall_gap', text='벽 간격(m)'); r.prop(sc, 'gpkit_parts', text='부품')
        r = b.row(); r.operator('gpkit.set_variant'); r.operator('gpkit.unset_variant')
        b.operator('gpkit.import_json', icon='IMPORT')
        b = L.box(); b.label(text='역할 (선택한 오브젝트)')
        o = context.active_object
        if o:
            b.label(text=f'{o.name}: {role_of(o) or "역할 없음"}')
        r = b.row(); r.prop(sc, 'gpkit_role', text=''); r.operator('gpkit.set_role')
        b = L.box()
        r = b.row(); r.operator('gpkit.check', icon='CHECKMARK'); r.enabled = not Job.running
        r = b.row(); r.operator('gpkit.send', icon='EXPORT'); r.enabled = not Job.running
        for line in Job.lines:
            b.label(text=line)
        if Job.result:
            b.label(text=Job.result, icon='INFO')


CLASSES = (GPKitPrefs, GPKIT_OT_set_variant, GPKIT_OT_unset_variant, GPKIT_OT_set_role, GPKIT_OT_import_json, GPKIT_OT_check, GPKIT_OT_send, GPKIT_PT_panel)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    S = bpy.types.Scene
    S.gpkit_collection = PointerProperty(type=bpy.types.Collection)
    S.gpkit_id = StringProperty()
    S.gpkit_label = StringProperty()
    S.gpkit_wall_gap = FloatProperty(default=0.0, min=0.0, max=1.0, precision=3)
    S.gpkit_parts = StringProperty(description='함께 굽는 부품 컬렉션(쉼표) — 예: 까치발')
    S.gpkit_role = EnumProperty(items=ROLES, default='face')
    S.gpkit_order = IntProperty(default=0)


def unregister():
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)
    for k in ('gpkit_collection', 'gpkit_id', 'gpkit_label', 'gpkit_wall_gap', 'gpkit_parts', 'gpkit_role', 'gpkit_order'):
        delattr(bpy.types.Scene, k)
