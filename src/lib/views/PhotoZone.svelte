<!-- 사진 = 보드 위의 구역. 사인물 영역(사각·원형)을 그리고 편집한다. 좌표는 사진 원본 픽셀. -->
<script lang="ts">
  import type { Pt } from '../core/homography';
  import type { Photo, Pin, SignObject, ShapeKind } from '../core/model';
  import { colorFor } from '../core/presence';
  import { midpoints, zonesOf } from '../core/zone';
  import { AXIS_COLOR, REF_COLOR, pairAxes, refLineOf, solveCamera } from '../core/camera';
  import type { MeasureResult } from '../core/measure';
  import { cssMatrix3d, ellipseInQuad, quadFromDrag, rectToQuad, roundedInQuad } from '../core/perspective';
  import DesignFace from '../ui/DesignFace.svelte';
  import { SKEW_ALERT, alignQuad, frameOf, gizmoOf, moveFrame, quadOf as frameToQuad, boxGuideOf, cornersOf, readTurn, resizeFrame, rotateFrame, scaleFrame, skewOf, snapFrame, tiltOf, turnAngleAt, turnGizmoOf, turnedQuad, type Frame, type Hinge, type RefPlane, type TurnFrame } from '../core/manipulator';
  import { applyHomography } from '../core/homography';
  import { placeOnWall, projectionFromPlane, signPlaneOf, wallPlaneOf } from '../core/wallPlane';
  import { thicknessOf } from '../core/render';
  import type { Calibration } from '../core/calibration';
  import type { Tool } from '../state.svelte';

  let {
    photo, url, zoom, objects, measures, selectedId, sameIds = [], tool, editable = true, unread = {},
    ontap,
    pins = [], selectedPinId = null, oncreatepin, onselectpin, onmovepin, onpinmoveend,
    segmentState, hoverPolygon = null, onmagicenter, onmagichover, onmagicleave, onmagicclick,
    zoneSel, oncreatezone, onselectzone, onmovezonevertex, onzonemoveend, onaddzonevertex,
    overlay, calib, onplace, gizmoPx = 48,
    toPhoto, oncreate, onselect, onquad, onmove, ondelete, onrender, oncamera, cameraSet = false, threeD = 'none', showWarnings = false,
  }: {
    pins?: Pin[];
    selectedPinId?: string | null;
    /** 핀 도구로 사진을 눌렀을 때 (viewer 도 가능) */
    oncreatepin?: (x: number, y: number) => void;
    onselectpin?: (id: string | null) => void;
    onmovepin?: (id: string, x: number, y: number) => void;
    onpinmoveend?: () => void;
    /** 자동 분리: 사진 분석 상태·호버 윤곽·이벤트 */
    segmentState?: 'embedding' | 'ready' | 'error';
    hoverPolygon?: Pt[] | null;
    onmagicenter?: () => void;
    onmagichover?: (x: number, y: number) => void;
    onmagicleave?: () => void;
    onmagicclick?: () => void;
    /** 작업 존 선택: undefined = 없음, { zone, vertex(null = 존만) } */
    zoneSel?: { zone: number; vertex: number | null };
    oncreatezone?: (zone: Pt[]) => void;
    /** zone = null 이면 선택 해제 */
    onselectzone?: (zone: number | null, vertex: number | null) => void;
    onmovezonevertex?: (zone: number, index: number, p: Pt) => void;
    onzonemoveend?: () => void;
    onaddzonevertex?: (zone: number, edge: number, p: Pt) => void;
    /** false = 보기 전용 (영역 이동·모서리·사진 이동·삭제 불가) */
    editable?: boolean;
    /** 사인물별 안 읽은 메시지 수 */
    unread?: Record<string, number>;
    /** 머리글(이름)을 끌지 않고 탭했을 때 — 휴대폰에서 사진 → 첫 사인물 실측 입력 흐름 */
    ontap?: () => void;
    /** 선택한 사인물과 같은 사인물(다른 사진) — 핸들 없이 하이라이트만 */
    sameIds?: string[];
    photo: Photo;
    url?: string;
    zoom: number;
    objects: SignObject[];
    measures: Map<string, MeasureResult>;
    selectedId: string | null;
    tool: Tool;
    toPhoto: (cx: number, cy: number) => Pt;
    oncreate: (shape: ShapeKind, quad: Pt[]) => void;
    onselect: (id: string | null) => void;
    onquad: (id: string, quad: Pt[]) => void;
    /** 외곽선과 벽에서 돌린 상태를 함께 저장 (turn = undefined 면 벽에 붙음) */
    onplace?: (id: string, quad: Pt[], turn: SignObject['turn']) => void;
    onmove: (dx: number, dy: number) => void;
    ondelete: () => void;
    onrender?: () => void;
    /** 3D 단계: 사진 위에 겹칠 합성 결과(데이터 URL). 있으면 영역·디자인은 숨기고 편집하지 않는다 */
    overlay?: string;
    /** 사진 원근 맞추기(카메라 설정) 창 열기. cameraSet = 이 사진에 설정이 있음 */
    oncamera?: () => void;
    cameraSet?: boolean;
    /** 이 사진에 3D 벽면이 있는가 (원근 설정 또는 치수 입력 사인물) */
    threeD?: 'ok' | 'none';
    /** 치수 경고(⚠) 표시 여부 (옵션) */
    showWarnings?: boolean;
    /** 매니퓰레이터 기본 크기(화면 px, 설정) */
    gizmoPx?: number;
    /** 이 사진의 원근 설정(카메라) — 있으면 매니퓰레이터가 그 벽면을 따른다 */
    calib?: Calibration;
  } = $props();

  const scale = $derived(photo.width / photo.w);
  /** 머리글이 화면에서 좁으면(휴대폰·축소) 라벨을 축약 */
  const narrow = $derived(photo.width * zoom < 520);
  /** 아주 좁으면(260px 미만, 휴대폰에서 전체 보기) 머리글은 이름만, 사진 위 글자 라벨은 숨김 — 겹쳐서 읽을 수 없으므로 */
  const tiny = $derived(photo.width * zoom < 260);
  /** 화면 1px 에 해당하는 사진 픽셀 */
  const u = $derived(1 / (scale * zoom));
  const worldH = $derived(photo.width * (photo.h / photo.w));

  let draft: { start: Pt; end: Pt } | null = $state(null);
  /** 편집 중인 오브젝트의 임시 사각형 (pointerup 에 문서 반영) */
  let editing: { id: string; quad: Pt[]; mode: number | 'move' | GizmoMode; from: Pt; orig: Pt[]; plane?: RefPlane; frame0?: Frame; wall0?: Pt; tf0?: TurnFrame; turn?: SignObject['turn'] } | null = $state(null);

  // ---------- 입체 매니퓰레이터 (2026-10-15) ----------
  type GizmoMode = 'gx' | 'gz' | 'gfree' | 'grot' | 'gright' | 'gtop' | 'gscale' | 'tx' | 'tz' | 'tfree' | 'tturn';
  /** 매니퓰레이터 모드: 이동 / 회전 / 크기 (2026-10-15 사용자: "매니퓰레이터 작게, 회전과 이동 스케일이 필요하다") */
  let gizmoMode = $state<'move' | 'rotate' | 'scale'>('move');
  /** 손잡이 단위: 기본 매니퓰레이터 크기(설정, 화면 px)에 비례 */
  const gu = $derived(u * gizmoPx / 48);
  /** 화살표 길이(면 mm): 화면에서 약 48px 가 되게 — 사인물 크기와 무관하게 작게 */
  function screenLen(plane: RefPlane, fr: Frame, px = gizmoPx): number {
    const a = applyHomography(plane.H, fr.c), b = applyHomography(plane.H, [fr.c[0] + fr.ex[0] * 1000, fr.c[1] + fr.ex[1] * 1000]);
    const perMm = Math.hypot(b[0] - a[0], b[1] - a[1]) / 1000 / u; // 화면 px / mm
    return perMm > 0 ? px / perMm : Math.max(fr.w, fr.h) * 0.25;
  }
  /** 사인물의 기준 면: 원근 설정이 있으면 그 벽면(카메라 포함), 없으면 사인물 자신의 면 */
  function refPlaneOf(o: SignObject): RefPlane | null {
    if (calib?.metric) { const p = wallPlaneOf([], calib); return p ? { H: p.H, Hinv: p.Hinv, pose: p.pose } : null; }
    const p = wallPlaneOf([o], null);
    return p ? { H: p.H, Hinv: p.Hinv } : null;
  }
  /** 매니퓰레이터를 붙일 수 있는 사인물 (사각·둥근 사각·원형; 다각형은 꼭짓점 편집) */
  const gizmoable = (o: SignObject) => o.shape !== 'polygon' && o.quad.length === 4;
  function gizmoDown(e: PointerEvent, o: SignObject, mode: GizmoMode) {
    if (e.button !== 0 || !editable) return;
    e.stopPropagation();
    // 기준 면은 끌기 시작할 때 고정 (자기 면을 쓰는 사진에서 끄는 동안 면이 따라 움직이지 않게)
    const plane = refPlaneOf(o);
    if (!plane) return;
    const from = toPhoto(e.clientX, e.clientY);
    editing = { id: o.id, quad: o.quad, mode, from, orig: o.quad, plane, frame0: frameOf(plane, o.quad), wall0: applyHomography(plane.Hinv, from) };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  /** 3단계: 벽에서 돌려 세우기 — 원근 설정(카메라)이 있는 사진에서만 */
  const canTurn = $derived(!!calib?.metric && !!calib.pose);
  /** 돌린 사인물의 경첩 틀 (끄는 중이면 그 값) */
  function turnFrameNow(o: SignObject, plane: RefPlane, q: Pt[]): TurnFrame | null {
    if (editing?.id === o.id && editing.tf0 && editing.turn) return readTurn(plane, q, editing.turn);
    return o.turn ? readTurn(plane, q, o.turn) : null;
  }
  /** 돌리기·경첩 이동 시작. 벽에 붙은 사인물이면 지금 외곽선에서 경첩 틀을 만든다 (기본 경첩 = 왼쪽) */
  function turnDown(e: PointerEvent, o: SignObject, mode: 'tx' | 'tz' | 'tfree' | 'tturn') {
    if (e.button !== 0 || !editable) return;
    e.stopPropagation();
    const plane = refPlaneOf(o);
    if (!plane?.pose) return;
    // 벽에 붙은 사인물: 경첩(왼쪽) 변의 실제 꼭짓점에서 시작 — 틀 평균을 쓰면 경첩이 몇 px 어긋난다
    const tf0 = readTurn(plane, o.quad, o.turn ?? { deg: 0, hinge: 'left' });
    if (!tf0) return;
    const from = toPhoto(e.clientX, e.clientY);
    editing = { id: o.id, quad: o.quad, mode, from, orig: o.quad, plane, tf0, wall0: applyHomography(plane.Hinv, from), turn: { deg: tf0.deg, hinge: tf0.side } };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  /** 바로 놓기: 벽에 직각(90°) ↔ 벽에 붙이기(0°), 경첩 바꾸기 */
  function setTurn(o: SignObject, deg: number, hinge?: Hinge) {
    const plane = refPlaneOf(o);
    if (!plane?.pose || !onplace) return;
    const tf = readTurn(plane, o.quad, o.turn ?? { deg: 0, hinge: hinge ?? 'left' });
    if (!tf) return;
    // 경첩 바꾸기: 벽에 붙은 상태로 편 외곽선에서 반대쪽 변을 경첩으로
    let next: TurnFrame = { ...tf, deg };
    if (hinge && hinge !== tf.side) {
      const flat = readTurn(plane, turnedQuad(plane, { ...tf, deg: 0 }), { deg: 0, hinge });
      if (!flat) return;
      next = { ...flat, deg };
    }
    onplace(o.id, turnedQuad(plane, next), deg > 0.5 ? { deg: Math.round(deg * 10) / 10, hinge: next.side } : undefined);
  }

  /**
   * 상자 가이드 (2026-10-15 사용자: "원근 문제 격자도 어렵다. 정육면체로 가이드를 줄 수 있나? 두께가 있는 것만 문제"):
   * 두께 있는 사인물만. 흰 상자 = 3D 가 그릴 면(signPlaneOf)에서 외곽선을 카메라 쪽으로 밀어낸 상자(보기 쉽게 깊이 = 짧은 변).
   * 원근 설정이 있는데 외곽선이 그 원근에서 비틀렸으면 자홍 점선 상자 = 원근 설정대로의 올바른 상자
   */
  function boxFor(o: SignObject, q: Pt[]) {
    if (!thicknessOf(o)) return null;
    const cal = calib?.metric ? wallPlaneOf([], calib) : null;
    const turn = editing?.id === o.id && editing.tf0 ? (editing.turn && editing.turn.deg > 0.5 ? editing.turn : undefined) : o.turn;
    const pl = signPlaneOf({ ...o, quad: q, turn }, cal);
    if (!pl) return null;
    const at = placeOnWall(pl, { quad: q });
    const depth = Math.min(at.w, at.h);
    const box = boxGuideOf(projectionFromPlane(pl, photo.w, photo.h), q.map((p) => applyHomography(pl.Hinv, p)), depth);
    let target: ReturnType<typeof boxGuideOf> = null;
    if (cal && !turn && pl !== cal && skewOf(cal, q) > SKEW_ALERT) {
      const fr = snapFrame(frameOf(cal, alignQuad(cal, q)));
      target = boxGuideOf(projectionFromPlane(cal, photo.w, photo.h), cornersOf(fr), depth);
    }
    return box ? { box, target } : null;
  }

  /** 원근 매니퓰레이터: 외곽선을 기준 면의 직사각형으로 펴고, 면 축에서 조금 기운 방향은 축에 맞춘다 */
  function alignToPerspective(o: SignObject) {
    const plane = refPlaneOf(o);
    if (!plane) return;
    onquad(o.id, frameToQuad(plane, snapFrame(frameOf(plane, alignQuad(plane, o.quad)))));
  }

  const drawShape = $derived<ShapeKind>(tool === 'ellipse' ? 'ellipse' : 'rect');
  const quadOf = (o: SignObject) => (editing?.id === o.id ? editing.quad : o.quad);
  /** 영역 윤곽 (사진 px): 둥근 사각 / 옛 타원 / 다각형 / 사각 */
  const outlinePts = (shape: ShapeKind, quad: Pt[], poly?: Pt[], corner?: number): Pt[] =>
    shape === 'ellipse' ? ellipseInQuad(quad) : shape === 'polygon' && poly ? poly : corner ? roundedInQuad(quad, corner) : quad;
  const outline = (shape: ShapeKind, quad: Pt[], poly?: Pt[], corner?: number) => outlinePts(shape, quad, poly, corner).map((p) => p.join(',')).join(' ');
  const clamp = ([x, y]: Pt): Pt => [Math.max(0, Math.min(photo.w, x)), Math.max(0, Math.min(photo.h, y))];
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

  let pinDrag: { id: string; moved: boolean } | null = null;
  function pinDown(e: PointerEvent, pin: Pin) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onselectpin?.(pin.id);
    if (!editable) return;
    pinDrag = { id: pin.id, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function pinMove(e: PointerEvent) {
    if (!pinDrag) return;
    const [x, y] = clamp(toPhoto(e.clientX, e.clientY));
    pinDrag.moved = true;
    onmovepin?.(pinDrag.id, Math.round(x), Math.round(y));
  }
  function pinUp() { if (pinDrag?.moved) onpinmoveend?.(); pinDrag = null; }

  // ---- 작업 존 (여러 개) ----
  const zones = $derived(zonesOf(photo));
  let zoneDraft: { start: Pt; end: Pt } | null = $state(null);
  let zoneDrag: { zone: number; index: number; moved: boolean } | null = null;
  function zoneDown(e: PointerEvent, zi: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (tool === 'zone' && editable) { // 존 도구로 존 위를 눌러도 새로 그린다
      const p = clamp(toPhoto(e.clientX, e.clientY));
      zoneDraft = { start: p, end: p };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    onselectzone?.(zi, null);
  }
  function zoneVertexDown(e: PointerEvent, zi: number, i: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onselectzone?.(zi, i);
    if (!editable) return;
    zoneDrag = { zone: zi, index: i, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function zoneVertexMove(e: PointerEvent) {
    if (!zoneDrag) return;
    zoneDrag.moved = true;
    const [x, y] = clamp(toPhoto(e.clientX, e.clientY));
    onmovezonevertex?.(zoneDrag.zone, zoneDrag.index, [Math.round(x), Math.round(y)]);
  }
  function zoneVertexUp() { if (zoneDrag?.moved) onzonemoveend?.(); zoneDrag = null; }
  function zoneMidDown(e: PointerEvent, zi: number, edge: number, p: Pt) {
    if (e.button !== 0 || !editable) return;
    e.stopPropagation();
    onaddzonevertex?.(zi, edge, [Math.round(p[0]), Math.round(p[1])]);
  }
  /** 존 밖을 어둡게: 사진 전체 사각형 + 존 구멍들 (evenodd) */
  const dimPath = $derived(zones.length ? `M0 0H${photo.w}V${photo.h}H0Z ` + zones.map((z) => `M${z.map((p) => p.join(' ')).join(' L')}Z`).join(' ') : '');

  let magicTimer = 0;
  function magicMove(e: PointerEvent) {
    if (tool !== 'magic' || magicTimer) return;
    magicTimer = window.setTimeout(() => {
      magicTimer = 0;
      const [x, y] = clamp(toPhoto(e.clientX, e.clientY));
      onmagichover?.(x, y);
    }, 60);
  }

  function bgDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (tool === 'zone') {
      if (!editable) return;
      e.stopPropagation();
      const p = clamp(toPhoto(e.clientX, e.clientY));
      zoneDraft = { start: p, end: p };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    if (tool === 'magic') { e.stopPropagation(); onmagicclick?.(); return; }
    if (tool === 'pin') {
      e.stopPropagation();
      const [x, y] = clamp(toPhoto(e.clientX, e.clientY));
      oncreatepin?.(x, y);
      return;
    }
    if (tool === 'select') { onselect(null); onselectpin?.(null); onselectzone?.(null, null); return; } // 이벤트 전파 → 캔버스 이동
    e.stopPropagation();
    const p = clamp(toPhoto(e.clientX, e.clientY));
    draft = { start: p, end: p };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function shapeDown(e: PointerEvent, o: SignObject, mode: number | 'move') {
    if (e.button !== 0) return;
    e.stopPropagation();
    onselect(o.id);
    if (!editable || (tool !== 'select' && mode === 'move')) return;
    editing = { id: o.id, quad: o.quad, mode, from: toPhoto(e.clientX, e.clientY), orig: o.quad };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (zoneDraft) { zoneDraft = { ...zoneDraft, end: clamp(toPhoto(e.clientX, e.clientY)) }; return; }
    if (draft) { draft = { ...draft, end: clamp(toPhoto(e.clientX, e.clientY)) }; return; }
    if (!editing) return;
    const [x, y] = toPhoto(e.clientX, e.clientY);
    if ((editing.mode === 'tx' || editing.mode === 'tz' || editing.mode === 'tfree' || editing.mode === 'tturn') && editing.plane && editing.tf0 && editing.wall0) {
      // 돌린 사인물: 경첩을 벽 위에서 옮기거나, 경첩 높이의 수평면에서 돌린다
      const t0 = editing.tf0;
      let tf: TurnFrame = { ...t0, deg: editing.turn?.deg ?? t0.deg };
      if (editing.mode === 'tturn') {
        let deg = turnAngleAt(editing.plane, t0, [x, y]);
        if (deg > 85) deg = 90; else if (deg < 3) deg = 0; // 직각·붙임에 붙이기
        tf = { ...tf, deg };
      } else {
        const w = applyHomography(editing.plane.Hinv, [x, y]);
        const d: Pt = [w[0] - editing.wall0[0], w[1] - editing.wall0[1]];
        const along: Pt = [t0.up[1], -t0.up[0]];
        const m: Pt = editing.mode === 'tx' ? [along[0] * (d[0] * along[0] + d[1] * along[1]), along[1] * (d[0] * along[0] + d[1] * along[1])]
          : editing.mode === 'tz' ? [t0.up[0] * (d[0] * t0.up[0] + d[1] * t0.up[1]), t0.up[1] * (d[0] * t0.up[0] + d[1] * t0.up[1])] : d;
        tf = { ...tf, hinge: [t0.hinge[0] + m[0], t0.hinge[1] + m[1]] };
      }
      editing.turn = { deg: tf.deg, hinge: tf.side };
      editing.quad = turnedQuad(editing.plane, tf);
      return;
    }
    if (typeof editing.mode === 'string' && editing.mode !== 'move' && editing.plane && editing.frame0 && editing.wall0) {
      // 매니퓰레이터: 면 위에서 옮기기·돌리기·늘리기 → 원근 그대로 사진 외곽선으로
      const w = applyHomography(editing.plane.Hinv, [x, y]);
      const d: Pt = [w[0] - editing.wall0[0], w[1] - editing.wall0[1]];
      const f0 = editing.frame0;
      const f = editing.mode === 'gx' ? moveFrame(f0, d, 'x') : editing.mode === 'gz' ? moveFrame(f0, d, 'z') : editing.mode === 'gfree' ? moveFrame(f0, d, 'free')
        : editing.mode === 'grot' ? rotateFrame(f0, editing.wall0, w) : editing.mode === 'gscale' ? scaleFrame(f0, w) : resizeFrame(f0, editing.mode === 'gright' ? 'right' : 'top', w);
      editing.quad = frameToQuad(editing.plane, f);
      return;
    }
    const dx = x - editing.from[0], dy = y - editing.from[1];
    editing.quad = editing.mode === 'move'
      ? editing.orig.map(([a, b]) => [a + dx, b + dy] as Pt)
      : editing.orig.map((p, i) => (i === editing!.mode ? clamp([p[0] + dx, p[1] + dy]) : p));
  }

  function up() {
    if (zoneDraft) {
      const q = quadFromDrag(zoneDraft.start, zoneDraft.end).map(([x, y]) => [Math.round(x), Math.round(y)] as Pt);
      if ((q[1][0] - q[0][0]) / u > 8 && (q[2][1] - q[1][1]) / u > 8) oncreatezone?.(q);
      zoneDraft = null;
    }
    if (draft) {
      const q = quadFromDrag(draft.start, draft.end);
      if ((q[1][0] - q[0][0]) / u > 8 && (q[2][1] - q[1][1]) / u > 8) oncreate(drawShape, q);
      draft = null;
    }
    if (editing) {
      if (editing.tf0 && onplace) { if (editing.quad !== editing.orig) onplace(editing.id, editing.quad, editing.turn && editing.turn.deg > 0.5 ? editing.turn : undefined); }
      else if (editing.quad !== editing.orig) onquad(editing.id, editing.quad);
      editing = null;
    }
  }

  // 헤더(사진 이름 바) 드래그로 사진 구역 이동
  let headerDrag: { x: number; y: number } | null = null;
  let headerMoved = false;
  function headerDown(e: PointerEvent) {
    headerMoved = false;
    if (!editable) return;
    e.stopPropagation();
    headerDrag = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function headerMove(e: PointerEvent) {
    if (!headerDrag) return;
    if (Math.hypot(e.clientX - headerDrag.x, e.clientY - headerDrag.y) > 2) headerMoved = true;
    onmove((e.clientX - headerDrag.x) / zoom, (e.clientY - headerDrag.y) / zoom);
    headerDrag = { x: e.clientX, y: e.clientY };
  }
</script>

{#snippet modeChips(at: Pt)}
  <!-- 매니퓰레이터 모드: 이동 ✥ / 회전 ⟳ / 크기 ⤡ (글자 대신 아이콘, 2026-10-15 사용자: "글자로 표시된 건 혼란스럽다") -->
  <g class="modes" transform="translate({at[0] - 33 * gu} {at[1] + 14 * gu})">
    {#each [['move', '✥', '이동'], ['rotate', '⟳', '회전'], ['scale', '⤡', '크기']] as [m, icon, label], i (m)}
      <g class="mode" class:on={gizmoMode === m} role="button" tabindex="-1" data-testid="gizmo-mode-{m}" onpointerdown={(e) => { e.stopPropagation(); gizmoMode = m as typeof gizmoMode; }}>
        <title>{label}</title>
        <circle cx={i * 22 * gu + 11 * gu} cy={9 * gu} r={9 * gu} /><text x={i * 22 * gu + 11 * gu} y={13 * gu} font-size={12 * gu} text-anchor="middle">{icon}</text>
      </g>
    {/each}
  </g>
{/snippet}

{#snippet iconBtn(at: Pt, icon: string, title: string, testid: string, act: () => void, color: string)}
  <!-- 아이콘 버튼 (뜻은 마우스를 올리면 나오는 설명으로) -->
  <g class="ibtn" role="button" tabindex="-1" data-testid={testid} onpointerdown={(e) => { e.stopPropagation(); act(); }}>
    <title>{title}</title>
    <circle cx={at[0]} cy={at[1]} r={10 * gu} style:fill={color} /><text x={at[0]} y={at[1] + 4.5 * gu} font-size={13 * gu} text-anchor="middle">{icon}</text>
  </g>
{/snippet}


<div class="zone" data-testid="photo-zone" style:left="{photo.x}px" style:top="{photo.y}px" style:width="{photo.width}px" style:height="{worldH}px">
  <div
    class="header"
    style:transform="scale({1 / zoom})"
    style:width="{photo.width * zoom}px"
    role="toolbar"
    tabindex="-1"
    onpointerdown={headerDown}
    onpointermove={headerMove}
    onpointerup={() => (headerDrag = null)}
    onclick={(e) => { const t = e.target as HTMLElement; if (!headerMoved && (t === e.currentTarget || t.classList.contains('name'))) ontap?.(); }}
    onkeydown={(e) => { if (e.key === 'Enter') ontap?.(); }}
  >
    <span class="name" title={photo.name}>{photo.name}</span>
    {#if !narrow}<span class="count">사인물 {objects.length}</span>{/if}
    {#if oncamera && !tiny}
      <button class="x cam" class:set={cameraSet} data-testid="camera-open" data-status={cameraSet ? 'set' : 'none'} title={cameraSet ? '이 사진의 원근이 맞춰져 있습니다. 눌러서 고치기' : '이 사진에서 치수를 재고 실사를 합성하려면 벽의 직선과 실측 길이로 원근을 맞추세요'} onpointerdown={(e) => e.stopPropagation()} onclick={oncamera}>{narrow ? (cameraSet ? '📐✓' : '📐') : cameraSet ? '📐 원근 맞춤 ✓' : '📐 원근 맞추기'}</button>
    {/if}
    {#if onrender && !tiny}<button class="x" class:set={threeD === 'ok'} data-testid="render-open" data-status={threeD} title={threeD === 'ok' ? '렌더링 (디자인을 입힌 최종 합성, 주간·야간, PNG 저장)' : '이 사진은 아직 3D 가 안 됩니다 — 원근 맞추기 또는 치수 입력'} onpointerdown={(e) => e.stopPropagation()} onclick={onrender}>{narrow ? (threeD === 'ok' ? '🎨✓' : '🎨') : threeD === 'ok' ? '🎨 렌더링 ✓' : '🎨 렌더링'}</button>{/if}
    {#if editable && !tiny}<button class="x" title="사진 삭제" onpointerdown={(e) => e.stopPropagation()} onclick={ondelete}>✕</button>{/if}
  </div>
  {#if url}
    <img src={url} alt={photo.name} data-testid="photo-img" draggable="false" />
    {#if overlay}<img class="overlay" src={overlay} alt="3D 합성" data-testid="photo-overlay" draggable="false" />{/if}
    <!-- 입힌 디자인: 사진 px 좌표계에서 잘라낸 영역을 원근 사각형으로 변형 -->
    <div class="designs" class:hidden={!!overlay} style:width="{photo.w}px" style:height="{photo.h}px" style:transform="scale({scale})">
      {#each objects.filter((o) => o.design) as o (o.id)}
        {@const q = quadOf(o)}
        {@const c = o.design!.crop}
        <div class="design" style:clip-path={o.shape === 'rect' && !o.corner ? 'none' : `polygon(${outlinePts(o.shape, q, o.polygon, o.corner).map((p) => `${p[0]}px ${p[1]}px`).join(',')})`}>
          <div class="warp" style:transform={(() => { try { return cssMatrix3d(rectToQuad(c.w, c.h, q)); } catch { return 'none'; } })()}>
            <DesignFace design={o.design!} w={c.w} h={c.h} />
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="loading">불러오는 중…</div>
  {/if}
  <svg
    class:tiny={tiny}
    class:ghost={!!overlay}
    viewBox="0 0 {photo.w} {photo.h}"
    class:drawing={tool !== 'select'}
    class:pinning={tool === 'pin'}
    class:magicking={tool === 'magic'}
    class:zoning={tool === 'zone'}
    data-bg={tool === 'select' ? '' : undefined}
    role="presentation"
    onpointerdown={bgDown}
    onpointermove={(e) => { move(e); magicMove(e); }}
    onpointerup={up}
    onpointerenter={() => { if (tool === 'magic') onmagicenter?.(); }}
    onpointerleave={() => { if (tool === 'magic') onmagicleave?.(); }}
  >
    {#if zones.length}
      <path class="zone-dim" d={dimPath} fill-rule="evenodd" />
      {#each zones as zone, zi (zi)}
        {@const selected = zoneSel?.zone === zi}
        <polygon class="zone" class:sel={selected} data-testid="zone-shape" points={zone.map((p) => p.join(',')).join(' ')}
          stroke-width={2 * u} stroke-dasharray="{8 * u} {5 * u}" role="button" tabindex="-1"
          pointer-events={tool === 'magic' || tool === 'rect' || tool === 'ellipse' || tool === 'pin' ? 'none' : 'auto'} onpointerdown={(e) => zoneDown(e, zi)} onpointermove={move} onpointerup={up} />
        <text class="zone-label" x={zone[0][0]} y={zone[0][1] - 8 * u} font-size={12 * u} stroke-width={3 * u}>작업 존{zones.length > 1 ? ` ${zi + 1}` : ''}</text>
        {#if selected && editable}
          {#each midpoints(zone) as m, i (i)}
            <rect data-testid="zone-mid" class="zone-mid" x={m[0] - 4 * u} y={m[1] - 4 * u} width={8 * u} height={8 * u} stroke-width={1.5 * u} role="button" tabindex="-1" onpointerdown={(e) => zoneMidDown(e, zi, i, m)} />
          {/each}
          {#each zone as v, i (i)}
            <circle data-testid="zone-vertex" class="zone-vertex" class:sel={zoneSel?.vertex === i} cx={v[0]} cy={v[1]} r={6 * u} stroke-width={2 * u} role="button" tabindex="-1"
              onpointerdown={(e) => zoneVertexDown(e, zi, i)} onpointermove={zoneVertexMove} onpointerup={zoneVertexUp} />
          {/each}
        {/if}
      {/each}
    {/if}
    {#if zoneDraft}
      <polygon class="zone draft" points={quadFromDrag(zoneDraft.start, zoneDraft.end).map((p) => p.join(',')).join(' ')} stroke-width={2 * u} stroke-dasharray="{8 * u} {5 * u}" />
    {/if}
    {#if photo.camera}
      {@const refL = refLineOf(photo.camera, false, solveCamera(photo.camera, photo.w, photo.h) ?? undefined)}
      {@const pw = pairAxes(photo.camera)}
      <!-- 원근 설정(축 선·원점·기준 길이)을 옅게 보여 준다: 이 사진에 설정이 있다는 표시 -->
      <g class="camera" data-testid="camera-overlay" pointer-events="none">
        {#each photo.camera.x as l, i (i)}<line class="cl" style:stroke={AXIS_COLOR[pw[0]]} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke-width={1.5 * u} />{/each}
        {#each photo.camera.y as l, i (i)}<line class="cl" style:stroke={AXIS_COLOR[pw[1]]} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke-width={1.5 * u} />{/each}
        {#each photo.camera.z ?? [] as l, i (i)}<line class="cl" style:stroke={AXIS_COLOR[pw[2]]} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke-width={1.5 * u} />{/each}
        {#if refL}<line class="cr" style:stroke={REF_COLOR} x1={refL.a[0]} y1={refL.a[1]} x2={refL.b[0]} y2={refL.b[1]} stroke-width={2 * u} />{/if}
        <circle class="co" cx={photo.camera.origin[0]} cy={photo.camera.origin[1]} r={5 * u} stroke-width={1.5 * u} />
      </g>
    {/if}
    {#each objects as o (o.id)}
      {@const q = quadOf(o)}
      {@const m = measures.get(o.id)}
      {@const sel = o.id === selectedId}
      {@const same = !sel && sameIds.includes(o.id)}
      {@const warn = showWarnings && (m?.warnings.length ?? 0) > 0}
      {@const turned = !!(o.turn || (editing?.id === o.id && editing.tf0 && (editing.turn?.deg ?? 0) > 0.5))}
      {#if sel && editable && tool === 'select' && gizmoable(o)}
        {@const bg = boxFor(o, q)}
        {#if bg}
          {@const edges = (b: { back: Pt[]; front: Pt[] }) => [0, 1, 2, 3].flatMap((i) => [[b.back[i], b.back[(i + 1) % 4]], [b.front[i], b.front[(i + 1) % 4]], [b.back[i], b.front[i]]]) as [Pt, Pt][]}
          {#if bg.target}
            <g class="boxg target" data-testid="box-guide-target" pointer-events="none">
              {#each edges(bg.target) as [a, b], i (i)}<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke-width={1.5 * u} stroke-dasharray="{5 * u} {3 * u}" />{/each}
            </g>
          {/if}
          <g class="boxg" data-testid="box-guide" pointer-events="none">
            <polygon class="face" points={bg.box.front.map((p) => p.join(',')).join(' ')} />
            {#each edges(bg.box) as [a, b], i (i)}<line class="halo" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke-width={3.5 * u} />{/each}
            {#each edges(bg.box) as [a, b], i (i)}<line class="edge" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke-width={1.5 * u} />{/each}
          </g>
        {/if}
      {/if}
      <g class="sign" class:sel class:same class:warn>
        <polygon
          data-testid="sign-shape"
          data-shape={o.shape}
          data-selected={sel || undefined}
          data-same={same || undefined}
          points={outline(o.shape, q, o.polygon, o.corner)}
          data-corner={o.shape === 'rect' ? (o.corner ?? 0) : undefined}
          stroke-width={2 * u}
          role="button"
          tabindex="-1"
          pointer-events={tool === 'magic' ? 'none' : 'auto'}
          onpointerdown={(e) => shapeDown(e, o, 'move')}
        />
        <text x={q[0][0]} y={q[0][1] - 6 * u} font-size={12 * u} stroke-width={3 * u}>
          {#if warn}<tspan data-testid="sign-warning-icon" class="w">⚠ </tspan>{/if}{#if unread[o.sameAs ?? o.id]}<tspan data-testid="sign-unread" class="u">💬 {unread[o.sameAs ?? o.id]} </tspan>{/if}{#if o.sameAs}<tspan data-testid="sign-linked" class="l">⇄ </tspan>{/if}{o.name}{#if o.widthMm && o.heightMm} · {fmt(o.widthMm)}×{fmt(o.heightMm)}{:else if m?.estimate} · ≈{fmt(m.estimate.widthMm)}×{fmt(m.estimate.heightMm)}{/if}
        </text>
        {#if sel && editable && tool === 'select' && gizmoable(o) && canTurn && turned}
          {@const plane = editing?.id === o.id && editing.plane ? editing.plane : refPlaneOf(o)}
          {@const tf = plane ? turnFrameNow(o, plane, q) : null}
          {#if plane && tf}
            {@const tg = turnGizmoOf(plane, tf, screenLen(plane, { c: tf.hinge, ex: [tf.up[1], -tf.up[0]], ey: [-tf.up[0], -tf.up[1]], w: tf.w, h: tf.h }))}
            <g class="gizmo turned" data-testid="gizmo" data-mode={gizmoMode} data-turn={Math.round(tf.deg)} data-hinge={tf.side}>
              {@render modeChips(tg.c)}
              <line class="halo" x1={tg.c[0]} y1={tg.c[1]} x2={tg.z[0]} y2={tg.z[1]}   stroke-width={5.5 * gu} />
              <line class="ax z" x1={tg.c[0]} y1={tg.c[1]} x2={tg.z[0]} y2={tg.z[1]} stroke-width={3 * gu} style:stroke={AXIS_COLOR.z} />
              <line class="halo" x1={tg.c[0]} y1={tg.c[1]} x2={tg.x[0]} y2={tg.x[1]}   stroke-width={5.5 * gu} />
              <line class="ax x" x1={tg.c[0]} y1={tg.c[1]} x2={tg.x[0]} y2={tg.x[1]} stroke-width={3 * gu} style:stroke={AXIS_COLOR.x} />
              <line class="halo" x1={tg.c[0]} y1={tg.c[1]} x2={tg.turn[0]} y2={tg.turn[1]}    stroke-width={4.5 * gu} />
              <line class="ax y" x1={tg.c[0]} y1={tg.c[1]} x2={tg.turn[0]} y2={tg.turn[1]} stroke-width={2 * gu} stroke-dasharray="{4 * gu} {3 * gu}" style:stroke={AXIS_COLOR.y} />
              <circle class="gh tmove" data-testid="gizmo-x" cx={tg.x[0]} cy={tg.x[1]} r={6 * gu} style:fill={AXIS_COLOR.x} role="button" tabindex="-1" onpointerdown={(e) => turnDown(e, o, 'tx')} />
              <circle class="gh tmove" data-testid="gizmo-z" cx={tg.z[0]} cy={tg.z[1]} r={6 * gu} style:fill={AXIS_COLOR.z} role="button" tabindex="-1" onpointerdown={(e) => turnDown(e, o, 'tz')} />
              <rect class="gh tmove center" data-testid="gizmo-move" x={tg.c[0] - 6 * gu} y={tg.c[1] - 6 * gu} width={12 * gu} height={12 * gu} role="button" tabindex="-1" onpointerdown={(e) => turnDown(e, o, 'tfree')} />
              <circle class="gh tturn" data-testid="gizmo-turn" cx={tg.turn[0]} cy={tg.turn[1]} r={7 * gu} style:fill={AXIS_COLOR.y} role="button" tabindex="-1" onpointerdown={(e) => turnDown(e, o, 'tturn')} />
              {#if !editing}
                {@render iconBtn([tg.c[0] - 13 * gu, tg.c[1] + 46 * gu], '⇄', `경첩 바꾸기 (지금 ${tf.side === 'left' ? '왼쪽' : '오른쪽'} 변이 벽에 붙음)`, 'gizmo-hinge', () => setTurn(o, tf.deg, tf.side === 'left' ? 'right' : 'left'), '#3ddc84')}
                {@render iconBtn([tg.c[0] + 13 * gu, tg.c[1] + 46 * gu], '▭', '벽에 붙이기 (0°로)', 'gizmo-flat', () => setTurn(o, 0), '#8b93a3')}
              {/if}
              <text class="deg" x={tg.turn[0] + 12 * gu} y={tg.turn[1] - 8 * gu} font-size={12 * gu}>{Math.round(tf.deg)}°</text>
            </g>
          {/if}
        {:else if sel && editable && tool === 'select' && gizmoable(o)}
          {@const plane = editing?.id === o.id && editing.plane ? editing.plane : refPlaneOf(o)}
          {#if plane}
            {@const fr = frameOf(plane, q)}
            {@const g = gizmoOf(plane, fr, screenLen(plane, fr))}
            {@const skew = skewOf(plane, q)}
            {@const tilt = tiltOf(fr)}
            <!-- 원근 매니퓰레이터: 외곽선이 원근에서 비틀렸거나 축에서 조금 기울었으면, 맞춘 모양을 점선으로 보여 주고 [원근에 맞추기] -->
            {#if !editing && calib?.metric && (skew > SKEW_ALERT || (tilt > 0.5 && tilt <= 10))}
              {@const fixed = frameToQuad(plane, snapFrame(frameOf(plane, alignQuad(plane, q))))}
              <g class="persp" data-testid="persp-guide" data-skew={skew.toFixed(1)}>
                <polygon class="guide" points={fixed.map((p) => p.join(',')).join(' ')} stroke-width={1.5 * gu} stroke-dasharray="{6 * gu} {4 * gu}" />
                {@render iconBtn([fixed[2][0] + 14 * gu, fixed[2][1] + 14 * gu], '⊞', `원근에 맞추기 (${Math.round(Math.max(skew, tilt))}° 어긋남)`, 'persp-align', () => alignToPerspective(o), '#ff4dd2')}
              </g>
            {/if}
            <g class="gizmo" data-testid="gizmo" data-mode={gizmoMode}>
              {@render modeChips(g.c)}
              {#if gizmoMode === 'move'}
                <line class="halo" x1={g.c[0]} y1={g.c[1]} x2={g.x[0]} y2={g.x[1]}   stroke-width={4.5 * gu} />
                <line class="ax x" x1={g.c[0]} y1={g.c[1]} x2={g.x[0]} y2={g.x[1]} stroke-width={2 * gu} style:stroke={AXIS_COLOR.x} />
                <line class="halo" x1={g.c[0]} y1={g.c[1]} x2={g.z[0]} y2={g.z[1]}   stroke-width={4.5 * gu} />
                <line class="ax z" x1={g.c[0]} y1={g.c[1]} x2={g.z[0]} y2={g.z[1]} stroke-width={2 * gu} style:stroke={AXIS_COLOR.z} />
                {#if g.y}<line class="halo" x1={g.c[0]} y1={g.c[1]} x2={g.y[0]} y2={g.y[1]}    stroke-width={4.0 * gu} /><line class="ax y" x1={g.c[0]} y1={g.c[1]} x2={g.y[0]} y2={g.y[1]} stroke-width={1.5 * gu} stroke-dasharray="{3 * gu} {2 * gu}" style:stroke={AXIS_COLOR.y} />{/if}
                <circle class="gh" data-testid="gizmo-x" cx={g.x[0]} cy={g.x[1]} r={6 * gu} style:fill={AXIS_COLOR.x} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gx')} />
                <circle class="gh" data-testid="gizmo-z" cx={g.z[0]} cy={g.z[1]} r={6 * gu} style:fill={AXIS_COLOR.z} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gz')} />
                <rect class="gh center" data-testid="gizmo-move" x={g.c[0] - 6 * gu} y={g.c[1] - 6 * gu} width={12 * gu} height={12 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gfree')} />
              {:else if gizmoMode === 'rotate'}
                <polyline class="halo" points={g.ring.map((p) => p.join(',')).join(' ')} stroke-width={4 * gu} />
                <polyline class="ring" points={g.ring.map((p) => p.join(',')).join(' ')} stroke-width={1.5 * gu} />
                <circle class="gh rot" data-testid="gizmo-rotate" cx={g.ringHandle[0]} cy={g.ringHandle[1]} r={6 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'grot')} />
                {#if canTurn && g.y}
                  <!-- 3단계: 초록 손잡이를 끌면 왼쪽 변을 경첩으로 벽에서 돌려 세운다 -->
                  <line class="halo" x1={g.c[0]} y1={g.c[1]} x2={g.y[0]} y2={g.y[1]}   stroke-width={4.5 * gu} />
                  <line class="ax y" x1={g.c[0]} y1={g.c[1]} x2={g.y[0]} y2={g.y[1]} stroke-width={2 * gu} style:stroke={AXIS_COLOR.y} />
                  <circle class="gh" data-testid="gizmo-turn" cx={g.y[0]} cy={g.y[1]} r={6 * gu} style:fill={AXIS_COLOR.y} role="button" tabindex="-1" onpointerdown={(e) => turnDown(e, o, 'tturn')} />
                  {#if !editing}
                    {@render iconBtn([g.c[0], g.c[1] + 46 * gu], '⟂', '벽에 직각으로 세우기 (돌출 간판)', 'gizmo-perp', () => setTurn(o, 90), '#3ddc84')}
                  {/if}
                {/if}
              {:else}
                <rect class="gh size" data-testid="gizmo-width" x={g.right[0] - 5 * gu} y={g.right[1] - 5 * gu} width={10 * gu} height={10 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gright')} />
                <rect class="gh size" data-testid="gizmo-height" x={g.top[0] - 5 * gu} y={g.top[1] - 5 * gu} width={10 * gu} height={10 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gtop')} />
                <rect class="gh uni" data-testid="gizmo-scale" x={g.corner[0] - 6 * gu} y={g.corner[1] - 6 * gu} width={12 * gu} height={12 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gscale')} />
              {/if}
            </g>
          {/if}
        {/if}
        {#if sel && editable && tool === 'select' && !turned}
          {#each q as p, i (i)}
            <!-- 보이는 핸들보다 두 배 넓은 투명 터치 영역 (2026-10-14 사용자: "꼭짓점 컨트롤러 터치 영역을 두 배로") -->
            <circle class="hit" data-testid="sign-handle-hit" cx={p[0]} cy={p[1]} r={12 * u} role="button" tabindex="-1" onpointerdown={(e) => shapeDown(e, o, i)} />
            <circle class="handle" data-testid="sign-handle" cx={p[0]} cy={p[1]} r={6 * u} stroke-width={2 * u} role="button" tabindex="-1"
              onpointerdown={(e) => shapeDown(e, o, i)} />
          {/each}
        {/if}
      </g>
    {/each}
    {#each pins as pin (pin.id)}
      {@const r = 11 * u}
      <g class="pin" class:sel={pin.id === selectedPinId} class:resolved={pin.resolved} data-testid="pin" data-resolved={pin.resolved}
        role="button" tabindex="-1" transform="translate({pin.x} {pin.y})"
        onpointerdown={(e) => pinDown(e, pin)} onpointermove={pinMove} onpointerup={pinUp}>
        <path d="M0 0 L{-r * 0.9} {-r * 1.6} A{r * 1.25} {r * 1.25} 0 1 1 {r * 0.9} {-r * 1.6} Z" fill={colorFor(pin.author)} stroke="#fff" stroke-width={1.5 * u} />
        <text y={-r * 1.9} font-size={r * 1.1} text-anchor="middle" fill="#fff" font-weight="700">{pin.number}</text>
        {#if unread[pin.id]}
          <g transform="translate({r * 1.6} {-r * 3.2})">
            <circle r={r * 0.8} fill="var(--accent)" />
            <text data-testid="pin-unread" font-size={r * 0.9} text-anchor="middle" dy={r * 0.32} fill="#1a1500" font-weight="800">{unread[pin.id]}</text>
          </g>
        {/if}
      </g>
    {/each}
    {#if tool === 'magic' && hoverPolygon}
      <polygon class="magic" data-testid="magic-preview" points={hoverPolygon.map((p) => p.join(',')).join(' ')} stroke-width={2 * u} />
    {/if}
    {#if tool === 'magic' && segmentState === 'embedding'}
      <text class="status" data-testid="photo-ai-status" x={photo.w / 2} y={photo.h / 2} font-size={18 * u} text-anchor="middle" stroke-width={4 * u}>AI 가 사진을 분석하는 중…</text>
    {/if}
    {#if draft}
      <polygon class="draft" points={outline('rect', quadFromDrag(draft.start, draft.end), undefined, drawShape === 'ellipse' ? 0.5 : 0)} stroke-width={2 * u} stroke-dasharray="{6 * u} {4 * u}" />
    {/if}
  </svg>
</div>

<style>
  .zone { position: absolute; box-shadow: 0 6px 30px rgba(0, 0, 0, 0.35); background: #222; }
  img, .loading { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .loading { display: grid; place-items: center; color: #999; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .designs { position: absolute; left: 0; top: 0; transform-origin: 0 0; pointer-events: none; }
  .design { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
  .warp { position: absolute; left: 0; top: 0; transform-origin: 0 0; opacity: 0.95; }
  svg.drawing { cursor: crosshair; }
  svg.pinning { cursor: copy; }
  .pin { cursor: pointer; }
  .pin.resolved { opacity: 0.4; }
  .pin.sel path { stroke: var(--accent); }
  .pin text { pointer-events: none; }
  .header {
    position: absolute; left: 0; bottom: 100%; transform-origin: 0 100%; height: 30px;
    display: flex; align-items: center; gap: 8px; padding: 0 2px; cursor: move; color: var(--muted); font-size: 13px;
  }
  .header .name { color: var(--text); font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .header .x { white-space: nowrap; flex-shrink: 0; }
  .overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .designs.hidden { display: none; }
  svg.tiny text { display: none; }
  .header .x { margin-left: auto; background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 13px; }
  .header .x ~ .x { margin-left: 6px; }
  .sign polygon { fill: rgba(47, 139, 255, 0.12); stroke: var(--blue); cursor: pointer; }
  .sign.warn polygon { stroke: var(--warn); fill: rgba(255, 170, 0, 0.12); }
  .sign.sel polygon { fill: rgba(255, 204, 0, 0.16); stroke: var(--accent); }
  .sign.same polygon { fill: rgba(255, 204, 0, 0.1); stroke: var(--accent); stroke-dasharray: 6 4; }
  .sign text { fill: #fff; stroke: rgba(0, 0, 0, 0.75); paint-order: stroke; pointer-events: none; font-weight: 600; }
  .sign text .w { fill: var(--warn); }
  .sign text .u { fill: var(--accent); }
  .sign text .l { fill: var(--blue); }
  .camera { opacity: 0.55; }
  .camera .cl { stroke-dasharray: 6 4; }
  .camera .co { fill: none; stroke: #fff; }
  .header .cam.set, .header .x.set { color: var(--ok); }
  .handle { fill: #fff; stroke: var(--accent); cursor: grab; }
  svg { z-index: 2; } /* 편집 층은 3D 합성 그림(.overlay)보다 항상 위 */
  .overlay { z-index: 1; }
  /* 입체 매니퓰레이터 */
  /* 3D 그림·밝은 사인물 위에서도 보이게: 모든 선 밑에 어두운 테두리, 손잡이는 어두운 외곽선 (2026-10-15 사용자: "매니퓰레이터가 3D 에 가려진다. 항상 보이게") */
  /* 상자 가이드: 흰 상자 = 3D 가 그릴 상자, 자홍 점선 = 원근 설정대로의 상자 */
  .boxg .face { fill: rgba(255, 255, 255, 0.12); stroke: none; }
  .boxg .edge { stroke: #fff; stroke-linecap: round; }
  .boxg .halo { stroke: rgba(0, 0, 0, 0.6); stroke-linecap: round; }
  .boxg.target line { stroke: #ff4dd2; }
  .gizmo .halo { fill: none; stroke: rgba(0, 0, 0, 0.75); pointer-events: none; stroke-linecap: round; }
  .gizmo .ring { fill: none; stroke: #fff; pointer-events: none; }
  .gizmo .ax { pointer-events: none; stroke-linecap: round; }
  .gizmo .gh { stroke: #111; stroke-width: 1.5px; vector-effect: non-scaling-stroke; cursor: grab; }
  .gizmo .gh.center { fill: rgba(255, 255, 255, 0.85); stroke: #333; }
  .gizmo .gh.rot { fill: #ffcc00; }
  .gizmo .gh.size { fill: #fff; stroke: #333; }
  /* 돌린 사인물: 이동 모드 = 경첩 옮기기, 회전 모드 = 각도, 크기 모드는 펴서(벽에 붙여) */
  .gizmo.turned:not([data-mode='move']) .tmove, .gizmo.turned:not([data-mode='rotate']) .tturn { display: none; }
  .modes .mode { cursor: pointer; }
  .modes .mode circle { fill: rgba(23, 26, 33, 0.9); stroke: rgba(255,255,255,0.45); }
  .modes .mode.on circle { fill: #ffcc00; stroke: #111; }
  .ibtn { cursor: pointer; }
  .ibtn circle { stroke: #111; stroke-width: 1.5px; vector-effect: non-scaling-stroke; }
  .ibtn text { fill: #111; stroke: none; font-weight: 800; pointer-events: none; }
  .modes .mode text { fill: #fff; stroke: none; font-weight: 700; pointer-events: none; }
  .modes .mode.on text { fill: #1a1500; }
  .gizmo .gh.uni { fill: #ffcc00; stroke: #333; }
  .gizmo .deg { fill: #fff; stroke: rgba(0,0,0,0.7); paint-order: stroke; font-weight: 700; pointer-events: none; }
  .persp .guide { fill: rgba(255, 77, 210, 0.08); stroke: #ff4dd2; pointer-events: none; }
  /* 3D 단계: 합성 그림 위에서 사인물은 보이지 않게 눌러 고르고, 고른 것만 외곽선·매니퓰레이터 */
  svg.ghost .sign polygon { fill: transparent; stroke: transparent; }
  svg.ghost .sign.sel polygon { stroke: var(--accent); stroke-dasharray: 6 4; }
  svg.ghost .sign > text, svg.ghost .zone, svg.ghost .zone-label, svg.ghost .zone-dim, svg.ghost .camera { display: none; }
  .hit { fill: transparent; stroke: none; cursor: grab; }
  .draft { fill: rgba(255, 204, 0, 0.12); stroke: var(--accent); pointer-events: none; }
  .magic { fill: rgba(47, 139, 255, 0.28); stroke: #7fd3ff; pointer-events: none; }
  svg.zoning { cursor: crosshair; }
  .zone-dim { fill: rgba(0, 0, 0, 0.28); pointer-events: none; }
  .zone { fill: transparent; stroke: #7ef0a0; cursor: pointer; }
  .zone.sel { stroke: var(--accent); }
  .zone.draft { stroke: var(--accent); pointer-events: none; }
  .zone-label { fill: #7ef0a0; stroke: rgba(0, 0, 0, 0.75); paint-order: stroke; font-weight: 600; pointer-events: none; }
  .zone-vertex { fill: #fff; stroke: #7ef0a0; cursor: grab; }
  .zone-vertex.sel { fill: var(--accent); stroke: #fff; }
  .zone-mid { fill: #7ef0a0; stroke: #fff; cursor: copy; }
  .status { fill: #fff; stroke: rgba(0, 0, 0, 0.75); paint-order: stroke; pointer-events: none; font-weight: 600; }
  svg.magicking { cursor: cell; }
</style>
