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
  import PartsOverlay from '../ui/PartsOverlay.svelte';
  import { bodyLook, frameLook } from '../core/render';
  import { SKEW_ALERT, alignQuad, frameOf, gizmoOf, moveFrame, quadOf as frameToQuad, resizeFrameAt, rotateFrame, sizeHandlesOf, skewOf, snapFrame, tiltOf, type Frame, type RefPlane } from '../core/manipulator';
  import { anchorOf, axisOfDir, boxGizmoOf, moveOutline, outlineCenter3, rotateDir, worldAxes, type PosedPlane, type V3 } from '../core/boxGizmo';
  import { applyHomography, projectPoint, solveHomography } from '../core/homography';
  import { boxDirOf, faceOf, wallPlaneOf } from '../core/wallPlane';
  import type { Calibration } from '../core/calibration';
  import { bubbleLabel, lastStateOf } from '../core/bubbles';
  import { DEFAULT_TIP, UNIT_RECT } from '../core/bubbleShape';
  import BubbleShape from '../ui/BubbleShape.svelte';
  import { app, type Tool } from '../state.svelte';

  let {
    photo, url, zoom, objects, measures, selectedId, sameIds = [], multiIds = [], tool, editable = true, unread = {},
    ontap,
    pins = [], selectedPinId = null, oncreatepin, onselectpin, onpinpatch, onbubble, onpinmoveend,
    segmentState, hoverPolygon = null, onmagicenter, onmagichover, onmagicleave, onmagicclick,
    zoneSel, oncreatezone, onselectzone, onmovezonevertex, onzonemoveend, onaddzonevertex,
    overlay, twoD = true, onduplicate, calib, onbox, gizmoPx = 48,
    toPhoto, oncreate, onselect, onchat, onquad, onmove, ondelete, onrender, oncamera, cameraSet = false, threeD = 'none', showWarnings = false,
  }: {
    pins?: Pin[];
    selectedPinId?: string | null;
    /** 핀 도구로 사진을 눌렀을 때 (viewer 도 가능) */
    oncreatepin?: (x: number, y: number) => void;
    onselectpin?: (id: string | null) => void;
    /** 말풍선 자리 바꾸기 (전체·몸통·꼭지) */
    onpinpatch?: (id: string, patch: Partial<Pick<Pin, 'x' | 'y' | 'bx' | 'by'>>) => void;
    /** 사인물 말풍선 자리 (사인물 좌표) */
    onbubble?: (id: string, bubble: NonNullable<SignObject['bubble']>) => void;
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
    /** add = Shift+클릭 (다중 선택에 더하기, 2026-10-17) */
    onselect: (id: string | null, add?: boolean) => void;
    /** 사인물 말풍선을 눌렀을 때 (그 사인물의 대화 열기) — 2026-10-17 말풍선 = 소통 창구 */
    onchat?: (id: string) => void;
    /** 다중 선택에 든 다른 사인물들 (강조만, 매니퓰레이터는 주 선택에만) */
    multiIds?: string[];
    onquad: (id: string, quad: Pt[]) => void;
    /** 외곽선과 벽에서 돌린 상태를 함께 저장 (turn = undefined 면 벽에 붙음) */
    /** 박스 방향 바꾸기 (평면 판 = 정면 축, 회전 고리 = 박스 방향. 둘 다 undefined = 자동) — 외곽선은 그대로 */
    onbox?: (id: string, patch: { faceAxis?: SignObject['faceAxis']; boxDir?: SignObject['boxDir'] }) => void;
    onmove: (dx: number, dy: number) => void;
    ondelete: () => void;
    onrender?: () => void;
    /** 3D 단계: 사진 위에 겹칠 합성 결과(데이터 URL). 있으면 영역·디자인은 숨기고 편집하지 않는다 */
    overlay?: string;
    /** 2D 단계: 바탕색·디자인·글자 겹침을 그린다 (원본 단계는 외곽선·치수만) — 2026-10-17 */
    twoD?: boolean;
    /** Alt/Option + 끌기 = 제자리에 복사해서 그 복사본을 옮김 (2026-10-17). 복사본 id 를 돌려준다 */
    onduplicate?: (id: string) => string | null;
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
  let editing: { id: string; quad: Pt[]; mode: number | 'move' | 'edge' | GizmoMode; /** mode = 'edge' 일 때 변 번호 (i, i+1 꼭짓점) */ edge?: number; from: Pt; orig: Pt[]; plane?: RefPlane; frame0?: Frame; wall0?: Pt; sx?: number; sy?: number; axis?: 'x' | 'y' | 'z'; face3?: PosedPlane; c3?: V3; box0?: V3; box?: V3 } | null = $state(null);

  // ---------- 입체 매니퓰레이터 (2026-10-15) ----------
  /** gx·gz·gfree = 면 위 이동, grot = 면 안 회전(원근 없는 사진), gsize = 크기 손잡이, bmove = 원근 축 이동, brot = 박스 회전 */
  type GizmoMode = 'gx' | 'gz' | 'gfree' | 'grot' | 'gsize' | 'bmove' | 'brot';
  /** 매니퓰레이터 모드: 이동 / 회전 / 크기 (2026-10-15 사용자: "매니퓰레이터 작게, 회전과 이동 스케일이 필요하다") */
  // 모드는 앱 상태 (W·E·R 단축키로도 바뀐다)
  const gizmoMode = $derived(app.gizmoMode);
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
  /** 매니퓰레이터 메뉴 자리: 외곽선 맨 아래보다 조금 아래, 가운데 x (화살표·고리·손잡이와 겹치지 않게) */
  const menuAt = (q: Pt[], c: Pt): Pt => [c[0], Math.max(c[1], ...q.map((p) => p[1])) + 6 * gu];
  const gizmoable = (o: SignObject) => o.shape !== 'polygon' && o.quad.length === 4;
  function gizmoDown(e: PointerEvent, o: SignObject, mode: GizmoMode, sx = 0, sy = 0, on?: RefPlane) {
    if (e.button !== 0 || !editable) return;
    e.stopPropagation();
    // 기준 면은 끌기 시작할 때 고정 (자기 면을 쓰는 사진에서 끄는 동안 면이 따라 움직이지 않게). on = 사인물 면(원근 있는 사진)
    const plane = on ?? refPlaneOf(o);
    if (!plane) return;
    const from = toPhoto(e.clientX, e.clientY);
    // Alt/Option + 옮기기 = 제자리 복사본을 옮긴다 (2026-10-17)
    const id = (e.altKey && (mode === 'gfree' || mode === 'gx' || mode === 'gz') && onduplicate ? onduplicate(o.id) : null) ?? o.id;
    editing = { id, quad: o.quad, mode, from, orig: o.quad, plane, frame0: frameOf(plane, o.quad), wall0: applyHomography(plane.Hinv, from), sx, sy };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  /** 변 막대 잡기: Shift = 다중 선택, 매니퓰레이터를 붙일 수 있고 면이 있으면 면 위에서(gfree, 원근 사진은 사인물 자신의 면), 아니면(다각형·면 없음) 화면에서 그대로 옮긴다 */
  /** 변 손잡이·휴대폰 외곽선 띠: 그 변(양 끝 꼭짓점)만 옮긴다 — 꼭짓점 손잡이와 같은 종류의 외곽선 다듬기 (2026-10-18 사용자: "선만 움직여야지"). 띠를 눌렀을 때는 가장 가까운 변 */
  function edgeDown(e: PointerEvent, o: SignObject, q: Pt[], edge?: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.shiftKey) { onselect(o.id, true); return; }
    onselect(o.id);
    if (!editable) return;
    const from = toPhoto(e.clientX, e.clientY);
    const idx = edge ?? nearestEdge(q, from);
    editing = { id: o.id, quad: o.quad, mode: 'edge', edge: idx, from, orig: o.quad };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  /** 점에서 가장 가까운 변 번호 (i = 꼭짓점 i→i+1) */
  function nearestEdge(q: Pt[], p: Pt): number {
    let best = 0, bd = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L));
      const d = Math.hypot(a[0] + vx * t - p[0], a[1] + vy * t - p[1]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // ---------- 박스 매니퓰레이터 (원근 설정이 있는 사진, 2026-10-15 사용자: "메니폴레이터는 원근의 값을 기준으로 작동해야한다",
  //            "사인물사각툴은 3d가 아니다… 따라다니는 박스만 3d이다", "박스만 회전하고 크기는 외곽선만") ----------
  const has3d = $derived(!!calib?.metric && !!calib.pose);
  const calWall = $derived(calib?.metric ? wallPlaneOf([], calib) : null);
  /** 사인물 면 (구도로 정한 면, 없으면 원근 설정의 벽면) — 외곽선의 3D 자리를 읽는 데 쓴다 */
  /** 매니퓰레이터 자리(3D)와 외곽선을 읽을 면. 기준 면의 지평선 너머 사인물도 자리를 잡는다 (2026-10-15 핀볼 측사면·측면) */
  const anchor3 = (o: SignObject, q: Pt[]) => (calWall ? anchorOf(calWall, faceOf({ ...o, quad: q }, calWall)?.plane ?? calWall, q) : null);
  function boxDown(e: PointerEvent, o: SignObject, mode: 'bmove' | 'brot', axis: 'x' | 'y' | 'z') {
    if (e.button !== 0 || !editable || !calWall) return;
    e.stopPropagation();
    const a = anchor3(o, o.quad);
    if (!a) return;
    const id = (e.altKey && mode === 'bmove' && onduplicate ? onduplicate(o.id) : null) ?? o.id; // Alt = 제자리 복사
    editing = { id, quad: o.quad, mode, from: toPhoto(e.clientX, e.clientY), orig: o.quad, axis, face3: a.plane, c3: a.c3, box0: boxDirOf(o, calWall) ?? undefined };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  /** 화살표 길이(mm): 가장 잘 보이는 축이 화면에서 기본 매니퓰레이터 크기(px)가 되게 */
  function len3(c3: V3): number {
    const pose = calib!.pose!, A = worldAxes(pose), c = projectPoint(pose, c3);
    const per = Math.max(...(['x', 'y', 'z'] as const).map((k) => { const b = projectPoint(pose, [c3[0] + A[k][0] * 1000, c3[1] + A[k][1] * 1000, c3[2] + A[k][2] * 1000]); return Math.hypot(b[0] - c[0], b[1] - c[1]) / 1000; }));
    return per > 0 ? (gizmoPx * u) / per : 500;
  }
  /** 평면 판: 그 축을 박스 방향으로. 지금 그 축이면(고른 것) 자동으로 */
  function pickFace(o: SignObject, a: 'x' | 'y' | 'z', cur: string) {
    if (!onbox) return;
    if (cur === a && (o.faceAxis === a || o.boxDir)) onbox(o.id, { faceAxis: undefined, boxDir: undefined });
    else onbox(o.id, { faceAxis: a, boxDir: undefined });
  }
  const FACE_TITLE = { x: '정면 X: 박스가 벽 가로로 (돌출 간판)', y: '정면 Y: 박스가 벽 밖으로 (벽면 간판)', z: '정면 Z: 박스가 위·아래로 (어닝 등)' } as const;

  /**
   * 상자 가이드 (2026-10-15 사용자: "원근 문제 격자도 어렵다. 정육면체로 가이드를 줄 수 있나? 두께가 있는 것만 문제"):
   * 두께 있는 사인물만. 흰 상자 = 3D 가 그릴 면(signPlaneOf)에서 외곽선을 카메라 쪽으로 밀어낸 상자(보기 쉽게 깊이 = 짧은 변).
   * (자홍 점선 제안 상자는 없앰 — 2026-10-15 사용자: "너무 복잡해". 면 방향은 signPlaneOf 가 구도로 알아본다)
   */

  /** 원근 매니퓰레이터: 외곽선을 기준 면의 직사각형으로 펴고, 면 축에서 조금 기운 방향은 축에 맞춘다 */
  /** 외곽선을 면(기본: 사인물이 놓인 면, 없으면 벽)의 직사각형으로 펴고 축에 맞춘다 */
  function alignToPerspective(o: SignObject, on?: RefPlane | null) {
    const plane = on ?? refPlaneOf(o);
    if (!plane) return;
    onquad(o.id, frameToQuad(plane, snapFrame(frameOf(plane, alignQuad(plane, o.quad)), 25))); // 단추가 25° 까지 나오므로 맞추기도 25° 까지
  }

  const drawShape = $derived<ShapeKind>(tool === 'ellipse' ? 'ellipse' : 'rect');
  const quadOf = (o: SignObject) => (editing?.id === o.id ? editing.quad : o.quad);
  /** 영역 윤곽 (사진 px): 둥근 사각 / 옛 타원 / 다각형 / 사각 */
  const outlinePts = (shape: ShapeKind, quad: Pt[], poly?: Pt[], corner?: number): Pt[] =>
    shape === 'ellipse' ? ellipseInQuad(quad) : shape === 'polygon' && poly ? poly : corner ? roundedInQuad(quad, corner) : quad;
  const outline = (shape: ShapeKind, quad: Pt[], poly?: Pt[], corner?: number) => outlinePts(shape, quad, poly, corner).map((p) => p.join(',')).join(' ');
  const clamp = ([x, y]: Pt): Pt => [Math.max(0, Math.min(photo.w, x)), Math.max(0, Math.min(photo.h, y))];
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');


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
    if (e.shiftKey && mode === 'move') { onselect(o.id, true); return; } // Shift+클릭 = 다중 선택 (끌지 않음)
    onselect(o.id);
    if (!editable || (tool !== 'select' && mode === 'move')) return;
    // Alt/Option + 끌기: 제자리에 복사하고 복사본을 끈다 (2026-10-17 "alt/option 누르고 이동하면 복사")
    const id = (mode === 'move' && e.altKey && onduplicate ? onduplicate(o.id) : null) ?? o.id;
    editing = { id, quad: o.quad, mode, from: toPhoto(e.clientX, e.clientY), orig: o.quad };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (zoneDraft) { zoneDraft = { ...zoneDraft, end: clamp(toPhoto(e.clientX, e.clientY)) }; return; }
    if (draft) { draft = { ...draft, end: clamp(toPhoto(e.clientX, e.clientY)) }; return; }
    if (!editing) return;
    const [x, y] = toPhoto(e.clientX, e.clientY);
    if ((editing.mode === 'bmove' || editing.mode === 'brot') && editing.face3 && editing.c3 && editing.axis && calib?.pose) {
      const pose = calib.pose, A = worldAxes(pose);
      if (editing.mode === 'bmove') { const nq = moveOutline(pose, editing.face3, editing.orig, A[editing.axis], editing.from, [x, y]); if (nq) editing.quad = nq; }
      else if (editing.box0) editing.box = rotateDir(pose, editing.c3, editing.box0, A[editing.axis], editing.from, [x, y]);
      return;
    }
    if (typeof editing.mode === 'string' && editing.mode !== 'move' && editing.plane && editing.frame0 && editing.wall0) {
      // 매니퓰레이터: 면 위에서 옮기기·돌리기·늘리기 → 원근 그대로 사진 외곽선으로
      const w = applyHomography(editing.plane.Hinv, [x, y]);
      const d: Pt = [w[0] - editing.wall0[0], w[1] - editing.wall0[1]];
      const f0 = editing.frame0;
      const f = editing.mode === 'gx' ? moveFrame(f0, d, 'x') : editing.mode === 'gz' ? moveFrame(f0, d, 'z') : editing.mode === 'gfree' ? moveFrame(f0, d, 'free')
        : editing.mode === 'grot' ? rotateFrame(f0, editing.wall0, w) : resizeFrameAt(f0, editing.sx ?? 1, editing.sy ?? 1, w);
      editing.quad = frameToQuad(editing.plane, f);
      return;
    }
    const dx = x - editing.from[0], dy = y - editing.from[1];
    const ed = editing.mode === 'edge' ? editing.edge! : -1;
    editing.quad = editing.mode === 'move'
      ? editing.orig.map(([a, b]) => [a + dx, b + dy] as Pt)
      : editing.orig.map((p, i) => (i === editing!.mode || (ed >= 0 && (i === ed || i === (ed + 1) % 4)) ? clamp([p[0] + dx, p[1] + dy]) : p)); // 변 = 양 끝 꼭짓점이 함께 (2026-10-18 "선만 움직여야지")
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
      if (editing.mode === 'brot') { if (editing.box && onbox) onbox(editing.id, { boxDir: editing.box, faceAxis: undefined }); }
      else if (editing.quad !== editing.orig) onquad(editing.id, editing.quad);
      editing = null;
    }
  }

  // 헤더(사진 이름 바) 드래그로 사진 구역 이동
  let confirmsOpen = $state(false);
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

<!-- 이동 모드: 외곽선 변마다 잡는 막대 — 변을 잡아 면 위에서 옮긴다 (2026-10-17 사용자: "메니폴레이터 이동 형태 - 영역도 막대 보이게") -->

{#snippet modeChips(at: Pt)}
  <!-- 매니퓰레이터 모드 단추 (2026-10-18 사용자: "회전 스케일 우선 숨겨줘, 이동도 이동 선택하면 나오게 기본은 안나오게"): [이동 ✥] 하나, 누르면 켜고 끈다. 회전·크기는 단축키 E·R 로만 -->
  <g class="modes" transform="translate({at[0] - 11 * gu} {at[1] + 14 * gu})">
    <g class="mode" class:on={gizmoMode === 'move'} role="button" tabindex="-1" data-testid="gizmo-mode-move" onpointerdown={(e) => { e.stopPropagation(); app.gizmoMode = gizmoMode === 'move' ? 'none' : 'move'; }}>
      <title>이동 (W)</title>
      <!-- 아이콘은 글리프(✥) 대신 선으로 그린다 — 아이폰에서 글리프가 비어 보였음 (2026-10-18 캡처) -->
      <circle cx={11 * gu} cy={9 * gu} r={8 * gu} />
      <g class="ico" transform="translate({11 * gu} {9 * gu}) scale({gu})" pointer-events="none">
        <path d="M0 -5 L0 5 M-5 0 L5 0 M0 -5 L-1.6 -3.2 M0 -5 L1.6 -3.2 M0 5 L-1.6 3.2 M0 5 L1.6 3.2 M-5 0 L-3.2 -1.6 M-5 0 L-3.2 1.6 M5 0 L3.2 -1.6 M5 0 L3.2 1.6" />
      </g>
    </g>
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
    {#if pins.some((p) => p.resolved) && !tiny}
      <!-- 완료한 말풍선 목록 (2026-10-18): 사인물을 가리키지 않는 것도 여기서 다시 연다 -->
      <button class="x" class:set={confirmsOpen} data-testid="photo-confirms" title="완료한 말풍선" onpointerdown={(e) => e.stopPropagation()} onclick={() => (confirmsOpen = !confirmsOpen)}>✓ 완료 {pins.filter((p) => p.resolved).length}</button>
    {/if}
    {#if editable && !tiny}<button class="x" title="사진 삭제" onpointerdown={(e) => e.stopPropagation()} onclick={ondelete}>✕</button>{/if}
  </div>
  {#if confirmsOpen && pins.some((p) => p.resolved)}
    <div class="confirms" data-testid="confirm-list" role="menu" tabindex="-1" style:transform="scale({1 / zoom})" onpointerdown={(e) => e.stopPropagation()}>
      {#each pins.filter((p) => p.resolved) as p (p.id)}
        <button class="citem" data-testid="confirm-item" onclick={() => { confirmsOpen = false; onselectpin?.(p.id); }}>✓ #{p.number} <b>{p.author}</b>{#if p.to} → {p.to}{/if} <span>{lastStateOf(app.messages, p.id)?.text.slice(0, 24) ?? ''}</span></button>
      {/each}
    </div>
  {/if}
  {#if url}
    <img src={url} alt={photo.name} data-testid="photo-img" draggable="false" />
    {#if overlay}<img class="overlay" src={overlay} alt="3D 합성" data-testid="photo-overlay" draggable="false" />{/if}
    <!-- 입힌 디자인: 사진 px 좌표계에서 잘라낸 영역을 원근 사각형으로 변형 -->
    {#if twoD && !overlay}
    <!-- 겹침 층은 사진 원본 px 가 아니라 **표시 px** 크기로 (2026-10-18 아이폰 크롬 크래시: 4000×3000 CSS px 층을 transform 으로 줄이면 층마다 원본 크기 메모리를 잡아 사진 여러 장이면 수백 MB). 좌표는 모두 scale 을 곱해 넣는다 -->
    <div class="designs" style:width="{photo.w * scale}px" style:height="{photo.h * scale}px">
      <!-- 2D 단계 (2026-10-17 "사인물 바탕색 원본에 보이게 … 투명도"): 바탕(종류 기본 겉모습 또는 고른 색·투명도) → 입힌 디자인 → 글자·그림 순으로 겹친다 -->
      {#each objects.filter((o) => bodyLook(o)) as o (o.id)}
        {@const look = bodyLook(o)!}
        <div class="design fill" data-testid="sign-fill" style:clip-path="polygon({outlinePts(o.shape, quadOf(o), o.polygon, o.corner).map((p) => `${p[0] * scale}px ${p[1] * scale}px`).join(',')})" style:background={look.color} style:opacity={look.opacity}></div>
      {/each}
      <!-- 프레임 테 (2026-10-17 "3d에서 프레임과 판을 구별하나?"): 바탕 위에 테 폭(mm)만큼 안으로 들어간 고리. 원근은 중심 기준 축소로 근사 -->
      {#each objects.filter((o) => frameLook(o)?.mm && o.widthMm && o.heightMm) as o (o.id)}
        {@const fl = frameLook(o)!}
        {@const outer = outlinePts(o.shape, quadOf(o), o.polygon, o.corner)}
        {@const c = outer.reduce((a, p) => [a[0] + p[0] / outer.length, a[1] + p[1] / outer.length], [0, 0])}
        {@const kx = Math.max(0.2, 1 - (2 * fl.mm) / o.widthMm!)}
        {@const ky = Math.max(0.2, 1 - (2 * fl.mm) / o.heightMm!)}
        {@const inner = outer.map((p) => [c[0] + (p[0] - c[0]) * kx, c[1] + (p[1] - c[1]) * ky])}
        <div class="design fill" data-testid="sign-frame" style:clip-path="polygon(evenodd, {outer.map((p) => `${p[0] * scale}px ${p[1] * scale}px`).join(',')}, {inner.map((p) => `${p[0] * scale}px ${p[1] * scale}px`).join(',')})" style:background={fl.color}></div>
      {/each}
      {#each objects.filter((o) => o.design) as o (o.id)}
        {@const q = quadOf(o).map((p) => [p[0] * scale, p[1] * scale] as Pt)}
        {@const c = o.design!.crop}
        <div class="design" style:clip-path={o.shape === 'rect' && !o.corner ? 'none' : `polygon(${outlinePts(o.shape, q, o.polygon?.map((p) => [p[0] * scale, p[1] * scale] as Pt), o.corner).map((p) => `${p[0]}px ${p[1]}px`).join(',')})`}>
          <div class="warp" style:transform={(() => { try { return cssMatrix3d(rectToQuad(c.w, c.h, q)); } catch { return 'none'; } })()}>
            <DesignFace design={o.design!} w={c.w} h={c.h} />
          </div>
        </div>
      {/each}
      <!-- 조합형 글자·그림 배치(정면도)를 사진 위 외곽선 안에 원근 그대로 (2026-10-17 사용자: "글자를 조정해도 반영되지 않는다"). 3D 단계는 합성 그림이 대신 -->
      {#each objects.filter((o) => o.widthMm && o.heightMm && o.parts?.some((p) => p.items.length)) as o (o.id)}
        {@const q = quadOf(o).map((p) => [p[0] * scale, p[1] * scale] as Pt)}
        {@const pw = o.widthMm! * 0.5}
        {@const ph = o.heightMm! * 0.5}
        <div class="design" style:clip-path={o.shape === 'rect' && !o.corner ? 'none' : `polygon(${outlinePts(o.shape, q, o.polygon?.map((p) => [p[0] * scale, p[1] * scale] as Pt), o.corner).map((p) => `${p[0]}px ${p[1]}px`).join(',')})`}>
          <div class="warp" style:transform={(() => { try { return cssMatrix3d(rectToQuad(pw, ph, q)); } catch { return 'none'; } })()}>
            <div class="pbox" style:width="{pw}px" style:height="{ph}px"><PartsOverlay {o} mmW={o.widthMm!} mmH={o.heightMm!} w={pw} h={ph} /></div>
          </div>
        </div>
      {/each}
    </div>
    {/if}
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
      {@const multiSel = !sel && multiIds.includes(o.id)}
      {@const same = !sel && !multiSel && sameIds.includes(o.id)}
      {@const warn = showWarnings && (m?.warnings.length ?? 0) > 0}
      {@const chatId = o.sameAs ?? o.id}
      {@const lastMsg = lastStateOf(app.messages, chatId)}
      {@const turned = !!o.turn}
      <g class="sign" class:sel={sel || multiSel} class:same class:warn data-multi={multiSel || undefined}>
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
          pointer-events={tool === 'magic' || tool === 'pin' ? 'none' : 'auto'}
          onpointerdown={(e) => shapeDown(e, o, 'move')}
        />
        <text x={q[0][0]} y={q[0][1] - 6 * u} font-size={12 * u} stroke-width={3 * u}>
          {#if warn}<tspan data-testid="sign-warning-icon" class="w">⚠ </tspan>{/if}{#if unread[o.sameAs ?? o.id]}<tspan data-testid="sign-unread" class="u">💬 {unread[o.sameAs ?? o.id]} </tspan>{/if}{#if o.sameAs}<tspan data-testid="sign-linked" class="l">⇄ </tspan>{/if}{o.name}{#if o.widthMm && o.heightMm} · {fmt(o.widthMm)}×{fmt(o.heightMm)}{:else if m?.estimate} · ≈{fmt(m.estimate.widthMm)}×{fmt(m.estimate.heightMm)}{/if}
        </text>
        <!-- 사인물 말풍선 (2026-10-17 "말풍선이 해당 게시물 또는 영역을 지정해서 소통하는 창구"; 2026-10-18 모양·끌기): 대화가 있는 사인물에. 꼭지·몸통 자리는 사인물 좌표로 저장되어 사인물과 함께 움직이고 정면도 카드에도 같은 자리. 누르면 대화 열기 -->
        {#if lastMsg && q.length === 4 && !overlay}
          {@const H = solveHomography(UNIT_RECT, q)}
          {@const Hi = solveHomography(q, UNIT_RECT)}
          {@const tipL = o.bubble?.tip ?? DEFAULT_TIP}
          {@const tipP = applyHomography(H, tipL)}
          {@const bodyP = (o.bubble?.body ? applyHomography(H, o.bubble.body) : [tipP[0] + 56 * u, tipP[1] - 48 * u]) as Pt}
          {@const saveBubble = (tp: Pt, bp: Pt) => onbubble?.(o.id, { tip: applyHomography(Hi, tp).map((v) => Math.round(v * 1e4) / 1e4) as [number, number], body: applyHomography(Hi, bp).map((v) => Math.round(v * 1e4) / 1e4) as [number, number] })}
          <BubbleShape tip={tipP} body={bodyP} label={bubbleLabel({ last: lastMsg, me: app.nickname })} badge={unread[chatId] ?? 0} color={colorFor(lastMsg.author)} {u} {editable} testid="object-bubble" attrs={{ 'data-id': o.id }}
            onclick={() => (onchat ?? onselect)(o.id)}
            onwhole={(dx, dy) => saveBubble([tipP[0] + dx, tipP[1] + dy], [bodyP[0] + dx, bodyP[1] + dy])}
            onbody={(dx, dy) => saveBubble(tipP, [bodyP[0] + dx, bodyP[1] + dy])}
            ontip={(dx, dy) => saveBubble([tipP[0] + dx, tipP[1] + dy], bodyP)}
            ondragend={() => onpinmoveend?.()} />
        {/if}
        <!-- 변 손잡이 = 꼭짓점과 같은 컨트롤 (2026-10-18 사용자: "변도 코너와 같은 컨트롤로 사용해줘", "선만 움직여야지"): 변 가운데에 같은 모양·같은 터치 영역의 손잡이, 끌면 그 변(양 끝 꼭짓점)만 옮긴다. 휴대폰은 외곽선을 따라 굵은(보이지 않는) 터치 띠도 — 누른 자리에서 가장 가까운 변 -->
        {#if sel && editable && tool === 'select' && !turned}
          {#if app.compact}
            <polygon class="touch-outline" data-testid="sign-touch-outline" points={outline(o.shape, q, o.polygon, o.corner)} stroke-width={22 * u} role="button" tabindex="-1" onpointerdown={(e) => edgeDown(e, o, q)} />
          {/if}
          {#each [0, 1, 2, 3] as i (i)}
            {@const a = q[i]}
            {@const b = q[(i + 1) % 4]}
            <circle class="hit" data-testid="edge-hit-{i}" cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} r={12 * u} role="button" tabindex="-1" onpointerdown={(e) => edgeDown(e, o, q, i)} />
            <circle class="handle edge" data-testid="edge-handle-{i}" cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} r={6 * u} stroke-width={2 * u} role="button" tabindex="-1" onpointerdown={(e) => edgeDown(e, o, q, i)}><title>변 옮기기 (양 끝 꼭짓점이 함께)</title></circle>
          {/each}
        {/if}
        <!-- 꼭짓점 손잡이는 매니퓰레이터보다 아래 층 (메뉴·손잡이를 가리지 않게) -->
        {#if sel && editable && tool === 'select' && !turned && gizmoMode !== 'scale'}
          {#each q as p, i (i)}
            <!-- 보이는 핸들보다 두 배 넓은 투명 터치 영역 (2026-10-14 사용자: "꼭짓점 컨트롤러 터치 영역을 두 배로") -->
            <circle class="hit" data-testid="sign-handle-hit" cx={p[0]} cy={p[1]} r={12 * u} role="button" tabindex="-1" onpointerdown={(e) => shapeDown(e, o, i)} />
            <circle class="handle" data-testid="sign-handle" cx={p[0]} cy={p[1]} r={6 * u} stroke-width={2 * u} role="button" tabindex="-1"
              onpointerdown={(e) => shapeDown(e, o, i)} />
          {/each}
        {/if}
        {#if sel && editable && tool === 'select' && gizmoable(o) && has3d && calib?.pose && calWall}
          <!-- 박스 매니퓰레이터 (원근 설정이 있는 사진, 2026-10-15): 축 = 원근 설정의 X·Y·Z, 자리 = 외곽선 대각선 교점(원근 중심).
               이동 = 외곽선을 원근 축을 따라 / 판 = 박스 방향을 그 축으로 / 고리 = 박스 방향만 돌림 / 크기 = 외곽선만 (네 변 가운데·네 꼭짓점) -->
          {@const pose = calib.pose}
          {@const a3 = editing?.id === o.id && editing.face3 ? { plane: editing.face3, c3: outlineCenter3(calWall, editing.face3, q) } : anchor3(o, q)}
          {@const face3 = a3?.plane ?? null}
          {@const c3 = a3?.c3 ?? null}
          {@const g3 = c3 ? boxGizmoOf(pose, c3, len3(c3)) : null}
          {#if face3 && g3}
            {@const dirNow = editing?.id === o.id && editing.box ? editing.box : boxDirOf({ ...o, quad: q }, calWall)}
            {@const cur = dirNow ? (axisOfDir(pose, dirNow) ?? 'none') : 'none'}
            <!-- 원근에 맞추기 (2026-10-18 사용자: "원근 안 맞을 때 자동 배치 버튼 안 나와" → "이전과 다르게 잘 못 맞춘다"): 기준 면 = 사용자가 정면 축·박스 방향을 직접 정했으면 그 면, 아니면 **벽**.
                 비뚤어진 외곽선은 면 자동 판정이 흔들려(옆면으로 보기도) 그 면에 맞추면 엉뚱해지므로, 자동이면 늘 벽에 맞춘다. 많이 기울어도(25° 까지) 단추가 나온다 -->
            {@const alignPlane = o.faceAxis || o.boxDir ? face3 : calWall}
            {@const skew = skewOf(alignPlane, q)}
            {@const tilt = tiltOf(frameOf(alignPlane, q))}
            <!-- 벽 기준 비틀림이 25° 를 넘으면 돌출면 등 다른 면에 그린 외곽선로 보고 제안하지 않는다 -->
            {#if !editing && skew <= 25 && (skew > SKEW_ALERT || (tilt > 0.5 && tilt <= 25))}
              <g class="persp" data-testid="persp-guide" data-skew={skew.toFixed(1)}>
                {@render iconBtn([q[2][0] + 14 * gu, q[2][1] + 14 * gu], '⊞', `원근에 맞추기 (${Math.round(Math.max(skew, tilt))}° 어긋남)`, 'persp-align', () => alignToPerspective(o, alignPlane), '#ff4dd2')}
              </g>
            {/if}
            {@const mAt = menuAt(q, g3.c)}
            <g class="gizmo box3" data-testid="gizmo" data-mode={gizmoMode} data-box={cur}>
              {#if gizmoMode === 'move'}
                {#each ['x', 'y', 'z'] as const as a (a)}
                  {@const ar = g3.arrows[a]}
                  <line class="halo" x1={ar[0][0]} y1={ar[0][1]} x2={ar[1][0]} y2={ar[1][1]} stroke-width={2.4 * gu} />
                  <line class="ax {a}" x1={ar[0][0]} y1={ar[0][1]} x2={ar[1][0]} y2={ar[1][1]} stroke-width={1.1 * gu} style:stroke={AXIS_COLOR[a]} />
                  <circle class="gh axis" data-testid="gizmo-{a}" cx={ar[1][0]} cy={ar[1][1]} r={8 * gu} role="button" tabindex="-1" onpointerdown={(e) => boxDown(e, o, 'bmove', a)}><title>{a.toUpperCase()} 축을 따라 옮기기</title></circle>
                  <!-- 반대 방향 (2026-10-18 "이동 6방향으로 표시"): 같은 축, 끄는 방향으로 움직인다 -->
                  {@const neg = [2 * ar[0][0] - ar[1][0], 2 * ar[0][1] - ar[1][1]]}
                  <line class="halo" x1={ar[0][0]} y1={ar[0][1]} x2={neg[0]} y2={neg[1]} stroke-width={2.4 * gu} />
                  <line class="ax {a}" x1={ar[0][0]} y1={ar[0][1]} x2={neg[0]} y2={neg[1]} stroke-width={1.3 * gu} style:stroke={AXIS_COLOR[a]} stroke-opacity="0.7" />
                  <circle class="gh axis" data-testid="gizmo-{a}-neg" cx={neg[0]} cy={neg[1]} r={8 * gu} role="button" tabindex="-1" onpointerdown={(e) => boxDown(e, o, 'bmove', a)}><title>-{a.toUpperCase()} 방향으로 옮기기</title></circle>
                {/each}
                <circle class="dot" cx={g3.c[0]} cy={g3.c[1]} r={2.5 * gu} pointer-events="none" /><rect class="gh center" data-testid="gizmo-move" x={g3.c[0] - 7 * gu} y={g3.c[1] - 7 * gu} width={14 * gu} height={14 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gfree', 0, 0, face3)}><title>사인물 면 위에서 옮기기</title></rect>
              {:else if gizmoMode === 'rotate'}
                {#each ['x', 'y', 'z'] as const as a (a)}
                  {@const pts = g3.rings[a].map((p) => p.join(',')).join(' ')}
                  <polyline class="ring-hit" points={pts} stroke-width={10 * gu} role="button" tabindex="-1" onpointerdown={(e) => boxDown(e, o, 'brot', a)} />
                  <polyline class="halo" points={pts} stroke-width={2.6 * gu} />
                  <polyline class="ring3" data-testid="gizmo-ring-{a}" points={pts} stroke-width={1.2 * gu} style:stroke={AXIS_COLOR[a]} role="button" tabindex="-1" onpointerdown={(e) => boxDown(e, o, 'brot', a)} />
                  <circle class="gh rot" data-testid="gizmo-rot-{a}" cx={g3.ringHandles[a][0]} cy={g3.ringHandles[a][1]} r={6 * gu} style:fill={AXIS_COLOR[a]} role="button" tabindex="-1" onpointerdown={(e) => boxDown(e, o, 'brot', a)}><title>박스를 {a.toUpperCase()} 축 둘레로 돌리기 (외곽선은 그대로)</title></circle>
                {/each}
              {:else if gizmoMode === 'scale'}<!-- none 이면 아무것도 없음 (2026-10-18: 크기 손잡이가 기본으로 보이던 버그) -->
                {@const fr = frameOf(face3, q)}
                {#each sizeHandlesOf(fr) as h (`${h.sx}_${h.sy}`)}
                  {@const at = applyHomography(face3.H, h.at)}
                  {@const r = (h.sx && h.sy ? 6 : 5) * gu}
                  <rect class="gh {h.sx && h.sy ? 'uni' : 'size'}" data-testid="gizmo-size-{h.sx}_{h.sy}" x={at[0] - r} y={at[1] - r} width={2 * r} height={2 * r} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gsize', h.sx, h.sy, face3)}><title>{h.sx && h.sy ? '외곽선 크기 (비율 유지)' : h.sx ? '외곽선 가로' : '외곽선 세로'}</title></rect>
                {/each}
              {/if}
              <!-- 메뉴는 맨 마지막(맨 위)에, 외곽선 아래에 (2026-10-16 사용자: "메이폴레이터로 인해서 하단 매뉴를 누를 수 없게될 때가 있다") -->
              {@render modeChips(mAt)}
                {#if gizmoMode === 'move' && onbox}
                  <!-- 정면(박스 방향) 단추 (2026-10-15 사용자: "사인물 정면을 선택하는 것 move일때 하단에 x,y,z 단추로 선택하게 사각은 보이지 않는다"):
                       모드 단추 아래 X·Y·Z. 누르면 그 축이 박스 방향(외곽선·사인물 크기는 그대로), 켜진 단추를 다시 누르면 자동 -->
                  <g class="faces" data-testid="face-axes" data-axis={cur} data-auto={String(!o.faceAxis && !o.boxDir)} transform="translate({mAt[0] - 22 * gu} {mAt[1] + 45 * gu})">
                    {#each ['x', 'y', 'z'] as const as a, i (a)}
                      <g class="fb" class:on={cur === a} role="button" tabindex="-1" data-testid="face-{a}" data-on={String(cur === a)}
                        onpointerdown={(e) => { e.stopPropagation(); pickFace(o, a, cur); }}>
                        <title>{FACE_TITLE[a]}{cur === a ? (o.faceAxis === a || o.boxDir ? ' — 지금 (다시 누르면 자동)' : ' — 지금 (자동)') : ''}</title>
                        <circle cx={i * 22 * gu} cy={0} r={9 * gu} style:fill={AXIS_COLOR[a]} stroke-width={(cur === a ? 2.5 : 0) * gu} />
                        <text x={i * 22 * gu} y={4 * gu} font-size={11 * gu} text-anchor="middle">{a.toUpperCase()}</text>
                      </g>
                    {/each}
                  </g>
                {/if}
            </g>
          {/if}
        {:else if sel && editable && tool === 'select' && gizmoable(o)}
          <!-- 원근 설정이 없는 사진: 사인물 자신의 면 위 매니퓰레이터 -->
          {@const plane = editing?.id === o.id && editing.plane ? editing.plane : refPlaneOf(o)}
          {#if plane}
            {@const fr = frameOf(plane, q)}
            {@const g = gizmoOf(plane, fr, screenLen(plane, fr))}
            <g class="gizmo" data-testid="gizmo" data-mode={gizmoMode}>
              {#if gizmoMode === 'move'}
                <line class="halo" x1={g.c[0]} y1={g.c[1]} x2={g.x[0]} y2={g.x[1]}   stroke-width={3 * gu} />
                <line class="ax x" x1={g.c[0]} y1={g.c[1]} x2={g.x[0]} y2={g.x[1]} stroke-width={1.3 * gu} style:stroke={AXIS_COLOR.x} />
                <line class="halo" x1={g.c[0]} y1={g.c[1]} x2={g.z[0]} y2={g.z[1]}   stroke-width={3 * gu} />
                <line class="ax z" x1={g.c[0]} y1={g.c[1]} x2={g.z[0]} y2={g.z[1]} stroke-width={1.3 * gu} style:stroke={AXIS_COLOR.z} />
                <circle class="gh axis" data-testid="gizmo-x" cx={g.x[0]} cy={g.x[1]} r={8 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gx')} />
                <circle class="gh axis" data-testid="gizmo-z" cx={g.z[0]} cy={g.z[1]} r={8 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gz')} />
                <!-- 반대 방향 (2026-10-18 "이동 6방향"): 원근 없는 사진은 X·Z 양쪽 = 4방향 -->
                <line class="halo" x1={g.c[0]} y1={g.c[1]} x2={2 * g.c[0] - g.x[0]} y2={2 * g.c[1] - g.x[1]} stroke-width={3 * gu} />
                <line class="ax x" x1={g.c[0]} y1={g.c[1]} x2={2 * g.c[0] - g.x[0]} y2={2 * g.c[1] - g.x[1]} stroke-width={1.3 * gu} style:stroke={AXIS_COLOR.x} stroke-opacity="0.7" />
                <line class="halo" x1={g.c[0]} y1={g.c[1]} x2={2 * g.c[0] - g.z[0]} y2={2 * g.c[1] - g.z[1]} stroke-width={3 * gu} />
                <line class="ax z" x1={g.c[0]} y1={g.c[1]} x2={2 * g.c[0] - g.z[0]} y2={2 * g.c[1] - g.z[1]} stroke-width={1.3 * gu} style:stroke={AXIS_COLOR.z} stroke-opacity="0.7" />
                <circle class="gh axis" data-testid="gizmo-x-neg" cx={2 * g.c[0] - g.x[0]} cy={2 * g.c[1] - g.x[1]} r={8 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gx')} />
                <circle class="gh axis" data-testid="gizmo-z-neg" cx={2 * g.c[0] - g.z[0]} cy={2 * g.c[1] - g.z[1]} r={8 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gz')} />
                <circle class="dot" cx={g.c[0]} cy={g.c[1]} r={2.5 * gu} pointer-events="none" /><rect class="gh center" data-testid="gizmo-move" x={g.c[0] - 7 * gu} y={g.c[1] - 7 * gu} width={14 * gu} height={14 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gfree')} />
              {:else if gizmoMode === 'rotate'}
                <polyline class="halo" points={g.ring.map((p) => p.join(',')).join(' ')} stroke-width={2.6 * gu} />
                <polyline class="ring" points={g.ring.map((p) => p.join(',')).join(' ')} stroke-width={1.1 * gu} />
                <circle class="gh rot" data-testid="gizmo-rotate" cx={g.ringHandle[0]} cy={g.ringHandle[1]} r={6 * gu} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'grot')} />
              {:else if gizmoMode === 'scale'}
                {#each sizeHandlesOf(fr) as h (`${h.sx}_${h.sy}`)}
                  {@const at = applyHomography(plane.H, h.at)}
                  {@const r = (h.sx && h.sy ? 6 : 5) * gu}
                  <rect class="gh {h.sx && h.sy ? 'uni' : 'size'}" data-testid="gizmo-size-{h.sx}_{h.sy}" x={at[0] - r} y={at[1] - r} width={2 * r} height={2 * r} role="button" tabindex="-1" onpointerdown={(e) => gizmoDown(e, o, 'gsize', h.sx, h.sy)} />
                {/each}
              {/if}
              {@render modeChips(menuAt(q, g.c))}
            </g>
          {/if}
        {/if}
      </g>
    {/each}
    <!-- 완료한 말풍선은 화면에서 사라진다 (2026-10-18 "완료를 누르면 컨펌 리스트로 속성에 남기고 화면에서는 말풍선을 제거") — 사진 머리의 ✓ 완료 n 과 사인물 속성의 컨펌 리스트에서 다시 연다 -->
    {#each pins.filter((p) => !p.resolved) as pin (pin.id)}
      {@const last = bubbleLabel({ resolved: pin.resolved, last: lastStateOf(app.messages, pin.id), me: app.nickname })}
      {@const tip = [pin.x, pin.y] as Pt}
      {@const bodyAt = (pin.bx !== undefined && pin.by !== undefined ? [pin.x + pin.bx, pin.y + pin.by] : [pin.x + 56 * u, pin.y - 48 * u]) as Pt}
      <!-- 지점 말풍선 (2026-10-18 모양): 몸통 안에 번호·받는 사람·마지막 상태, 꼭지는 사진 지점. 안쪽 끌기 = 전체, 변 끌기 = 몸통만, 꼭지 손잡이 = 꼭지만 -->
      <BubbleShape {tip} body={bodyAt} label={last} number={`#${pin.number}${pin.to ? ' →' : ''}`} badge={unread[pin.id] ?? 0} color={colorFor(pin.author)} {u}
        selected={pin.id === selectedPinId} resolved={pin.resolved} {editable} testid="pin" attrs={{ 'data-resolved': String(pin.resolved), 'data-to': pin.to || undefined }} title="{pin.author} → {pin.to || '모두'}"
        onclick={() => onselectpin?.(pin.id)}
        onwhole={(dx, dy) => onpinpatch?.(pin.id, { x: Math.round(pin.x + dx), y: Math.round(pin.y + dy) })}
        onbody={(dx, dy) => onpinpatch?.(pin.id, { bx: Math.round(bodyAt[0] + dx - pin.x), by: Math.round(bodyAt[1] + dy - pin.y) })}
        ontip={(dx, dy) => onpinpatch?.(pin.id, { x: Math.round(pin.x + dx), y: Math.round(pin.y + dy), bx: Math.round(bodyAt[0] - pin.x - dx), by: Math.round(bodyAt[1] - pin.y - dy) })}
        ondragend={() => onpinmoveend?.()} />
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
  .designs { position: absolute; left: 0; top: 0; overflow: hidden; pointer-events: none; }
  .pbox { position: relative; }
  .design { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
  .design.fill { pointer-events: none; }
  .warp { position: absolute; left: 0; top: 0; transform-origin: 0 0; opacity: 0.95; }
  svg.drawing { cursor: crosshair; }
  svg.pinning { cursor: copy; }
  .pin { cursor: pointer; }
  .handle.edge { cursor: move; }
  .edge-bar:hover { stroke-opacity: 0.75; }
  .pin.resolved { opacity: 0.4; }
  .confirms { position: absolute; left: 0; top: 0; transform-origin: 0 0; z-index: 6; display: flex; flex-direction: column; gap: 2px; padding: 6px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); max-width: 360px; }
  .citem { background: none; border: 0; color: var(--text); font: inherit; font-size: 12px; text-align: left; padding: 4px 8px; border-radius: 6px; cursor: pointer; display: flex; gap: 6px; align-items: baseline; }
  .citem:hover { background: rgba(255,255,255,0.06); }
  .citem span { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  /* 휴대폰 터치 띠는 보이지 않아야 한다 — 위 .sign polygon 규칙(노란 채움·선)이 덮어쓰던 것 (2026-10-18 캡처: 굵은 노란 띠) */
  .sign polygon.touch-outline, .sign.sel polygon.touch-outline, .sign.warn polygon.touch-outline, .sign.same polygon.touch-outline { fill: none; stroke: transparent; stroke-dasharray: none; pointer-events: stroke; cursor: move; }
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
  .gizmo .halo { fill: none; stroke: rgba(0, 0, 0, 0.75); pointer-events: none; stroke-linecap: round; }
  .gizmo .ring { fill: none; stroke: #fff; pointer-events: none; }
  .gizmo .ring-hit { fill: none; stroke: transparent; pointer-events: stroke; cursor: grab; } /* 얇은 고리를 잡기 쉽게 넓은 투명 영역 */
  .gizmo .ring3 { fill: none; pointer-events: stroke; cursor: grab; stroke-linecap: round; }
  .faces .fb { cursor: pointer; }
  .faces .fb circle { stroke: #fff; }
  .faces .fb:not(.on) circle { fill-opacity: 0.55; }
  .faces .fb text { fill: #111; font-weight: 700; pointer-events: none; }
  .gizmo .ax { pointer-events: none; stroke-linecap: round; }
  .gizmo .gh { stroke: #111; stroke-width: 1.5px; vector-effect: non-scaling-stroke; cursor: grab; }
  /* 이동 매니퓰레이터는 선만 보인다 (2026-10-18 "매니퓰레이터 나오면 그냥 선만 보이게"): 축 손잡이·가운데는 보이지 않는 터치 영역, 가운데에 작은 점 */
  .gizmo .gh.axis, .gizmo .gh.center { fill: transparent; stroke: none; }
  .gizmo .dot { fill: #fff; stroke: rgba(0,0,0,0.7); stroke-width: 1px; vector-effect: non-scaling-stroke; }
  .gizmo .gh.rot { fill: #ffcc00; }
  .gizmo .gh.size { fill: #fff; stroke: #333; }
  /* 돌린 사인물: 이동 모드 = 경첩 옮기기, 회전 모드 = 각도, 크기 모드는 펴서(벽에 붙여) */
  .modes .mode { cursor: pointer; }
  .modes .mode circle { fill: rgba(23, 26, 33, 0.85); stroke: rgba(255,255,255,0.5); stroke-width: 1px; vector-effect: non-scaling-stroke; }
  .modes .mode.on circle { fill: #ffcc00; stroke: #111; }
  .modes .mode .ico path { fill: none; stroke: #fff; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .modes .mode.on .ico path { stroke: #1a1500; }
  .ibtn { cursor: pointer; }
  .ibtn circle { stroke: #111; stroke-width: 1.5px; vector-effect: non-scaling-stroke; }
  .ibtn text { fill: #111; stroke: none; font-weight: 800; pointer-events: none; }
  .gizmo .gh.uni { fill: #ffcc00; stroke: #333; }
  .gizmo .deg { fill: #fff; stroke: rgba(0,0,0,0.7); paint-order: stroke; font-weight: 700; pointer-events: none; }
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
