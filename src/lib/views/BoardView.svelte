<!-- 사진 보드: 사진(구역)들이 놓인 무한 캔버스 -->
<script lang="ts">
  import { askConfirm } from '../ui/ask.svelte';
  import { panThrough } from '../ui/panThrough';
  import MultiSize from '../ui/MultiSize.svelte';
  import MultiLast from '../ui/MultiLast.svelte';
  import { untrack } from 'svelte';
  import { nextPhotoName } from '../core/photoName';
  import InfiniteCanvas from '../ui/InfiniteCanvas.svelte';
  import FlatBar from '../ui/FlatBar.svelte';
  import TouchHelp from '../ui/TouchHelp.svelte';
  import PhotoZone from './PhotoZone.svelte';
  import BoardCard from './BoardCard.svelte';
  import { boardToList, clampFlatScale, flatBounds, flatOrigin, listToBoard, mmFromBoardRect, offsetKeepingPivot, scaleFromHandle } from '../core/boardCards';
  import fontUrl from 'pretendard/dist/public/static/Pretendard-Bold.otf?url';
  import { wallPlaneOf } from '../core/wallPlane';
  import type { Font } from 'opentype.js';
  import type { StageRenderer } from '../render/scene';
  import { app } from '../state.svelte';
  import { defaultProductFor } from '../core/catalog';
  import { assetUrl, imageSize, putAsset, StorageLimitError } from '../assets';
  import { displayUrl } from '../photoDisplay';
  import { prepareUpload } from '../photoPrep';
  import { formatBytes } from '../core/format';
  import { fitRect, toScreen, type Viewport } from '../core/viewport';
  import { loadRoomView, saveRoomView } from '../core/roomView';
  import { formatCombo, matchAction, type Action } from '../core/keymap';
  import type { Pt } from '../core/homography';
  import type { ShapeKind } from '../core/model';

  // 이 기기에서 마지막에 보던 확대·위치로 시작 (2026-10-25 "뷰도 떠날때 위치로") — 리스트 탭에 갔다 와도, 다시 열어도. 없으면 처음 열 때 전체 보기
  const remembered = app.room ? loadRoomView(app.room).viewport : undefined;
  let viewport: Viewport = $state(remembered ?? { x: 80, y: 80, zoom: 0.5 });
  let canvas: InfiniteCanvas;
  let urls: Record<string, string> = $state({});
  let fitted = !!remembered;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const v = { x: viewport.x, y: viewport.y, zoom: viewport.zoom }, room = app.room;
    if (!room || !fitted) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveRoomView(room, { viewport: v }), 250);
  });

  // 이 프로젝트에 사진이 있었다고 기억 (2026-10-25) — 다음에 열 때 동기화 전엔 빈 화면 대신 로딩
  $effect(() => { if (app.room && app.photos.length) { try { localStorage.setItem(`ganpanda.hadPhotos.${app.room}`, '1'); } catch { /* 저장 못 해도 됨 */ } } });
  // 사진 에셋 URL 지연 로딩 (못 받았던 에셋이 나중에 오면 assetEpoch 가 바뀌어 다시 요청)
  $effect(() => {
    void app.assetEpoch;
    for (const p of app.photos) {
      if (urls[p.assetId]) continue;
      displayUrl(p.assetId, { w: p.w, h: p.h }).then((u) => { if (u) urls[p.assetId] = u; }); // 줄인 사진 (휴대폰 메모리) — 크기를 알려 주면 줄인 크기로만 디코딩
    }
  });

  // 처음 열 때 사진 전체가 보이도록
  $effect(() => {
    if (fitted || !app.ready || !app.photos.length) return;
    fitted = true;
    fitAll();
  });

  // 리스트에서 사진에 올린 뒤: 그 사진을 화면에 맞춘다
  $effect(() => {
    const r = app.reveal;
    if (!r || !canvas) return; // 캔버스가 붙기 전이면 붙은 뒤에
    // 맞춤은 요청(reveal)이 바뀔 때 한 번만 — 사진이 바뀔 때(이름 탭·언두 등) 다시 끌려가지 않게 (2026-10-22 "언두할때 링크된 사진이 포커싱됨다")
    untrack(() => revealTo(r));
  });
  function revealTo(r: NonNullable<typeof app.reveal>) {
    const p = app.photos.find((x) => x.id === r.photoId);
    if (!p || !canvas) return;
    let { w, h } = canvas.size();
    // 톡 창이 열려 있으면 가려지지 않는 쪽에 맞춘다 (데스크톱 오른쪽 · 휴대폰 아래, 2026-10-22)
    const talkEl = app.talkOpen ? document.querySelector('[data-testid="talk-panel"]') : null;
    if (talkEl) { const b = talkEl.getBoundingClientRect(); if (b.top > h * 0.3) h = Math.max(160, b.top - 50); else w = Math.max(200, b.left); }
    const s = p.width / p.w;
    const target = r.objectId ? app.objects.find((o) => o.id === r.objectId) : null;
    const pin = r.pinId ? app.pins.find((x) => x.id === r.pinId) : null;
    const pts = target ? target.quad : pin ? [[pin.x, pin.y]] : null;
    if (pts?.length) {
      // 톡 링크 (2026-10-22): 그 사인물·번호를 화면 가운데에 크게 — 둘레를 넉넉히 띄운다
      const xs = pts.map((q) => p.x + q[0] * s), ys = pts.map((q) => p.y + q[1] * s);
      const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
      const m = Math.max(bw, bh, p.width * 0.15) * 0.6;
      viewport = fitRect({ x: Math.min(...xs) - m, y: Math.min(...ys) - m, w: bw + 2 * m, h: bh + 2 * m }, w, h, 20);
      return;
    }
    viewport = fitRect({ x: p.x, y: p.y - 40, w: p.width, h: p.width * (p.h / p.w) + 40 }, w, h, 40);
  }

  /** withCards: [전체 보기] 단추·단축키는 평면도 카드까지 (2026-10-20 — 카드 묶음이 화면 밖에 남았다). 처음 열 때·사진 올린 뒤는 사진만 */
  function fitAll(withCards = false) {
    if (!app.photos.length) return;
    const xs = app.photos.flatMap((p) => [p.x, p.x + p.width]);
    const ys = app.photos.flatMap((p) => [p.y, p.y + p.width * (p.h / p.w)]);
    if (withCards && bounds) { xs.push(bounds.x, bounds.x + bounds.w); ys.push(bounds.y, bounds.y + bounds.h); }
    const { w, h } = canvas.size();
    const x = Math.min(...xs), y = Math.min(...ys) - 60;
    viewport = fitRect({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }, w, h, 60);
    // 카드 묶음 아래 도구 줄(flat-label)과 하단 도구 막대 자리 — 화면 약 120px 를 더 비워 다시 맞춘다 (2026-10-22)
    if (withCards && bounds) {
      const bottom = Math.max(...ys) + 120 / viewport.zoom;
      viewport = fitRect({ x, y, w: Math.max(...xs) - x, h: bottom - y }, w, h, 60);
    }
  }


  // 사진 교체 (2026-10-21): 메뉴 [사진 교체] → 파일 고르기 → app.replacePhoto
  let replaceInput = $state<HTMLInputElement | null>(null);
  let replacingId: string | null = null;
  async function onReplaceFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    const id = replacingId;
    input.value = '';
    if (f && id) await app.replacePhoto(id, f);
  }

  // 파일 입력은 고른 뒤 값을 비운다 — 같은 파일을 다시 고르면 change 가 안 나던 문제 (2026-10-21 "사진 삭제후 같은 사진을 업로드하면 업로드가 안된다")
  /** 사진 올리기 (2026-10-24): 터치 기기는 [사진 찍기]·[앨범에서]를 따로 — 일부 안드로이드는 image/* + multiple 이면 카메라 없이 사진 선택기로 바로 간다 */
  const touchDevice = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let photoInput = $state<HTMLInputElement>();
  let cameraInput = $state<HTMLInputElement>();
  let photoMenu = $state(false);
  /** 사각 도구의 모양 고르기 자리 (화면 좌표 — 사각 단추 바로 위) */
  let rectBtn = $state<HTMLButtonElement>();
  let shapesAt = $state<{ x: number; y: number } | null>(null);
  $effect(() => {
    const on = (app.tool === 'rect' || app.tool === 'ellipse') && !!rectBtn;
    if (!on) { shapesAt = null; return; }
    const place = () => { const r = rectBtn!.getBoundingClientRect(); shapesAt = { x: r.left + r.width / 2, y: r.top - 6 }; };
    place();
    const bar = rectBtn!.closest('.tools');
    bar?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    return () => { bar?.removeEventListener('scroll', place); window.removeEventListener('resize', place); };
  });
  export async function addPhotos(files: FileList | File[]) {
    let i = 0;
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      let assetId: string;
      try {
        assetId = await putAsset(await prepareUpload(f)); // 긴 변 3200px 로 줄여 올린다 (2026-10-17 느린 기기·모바일 누락)
      } catch (e) {
        if (e instanceof StorageLimitError) {
          app.notice = `저장 용량 한도(${formatBytes(e.limitBytes)})를 넘어 "${f.name}"(${formatBytes(e.sizeBytes)})을 올릴 수 없습니다. 사용 중 ${formatBytes(e.usedBytes)}. 더 많은 용량이 필요하면 요금제를 올려 주세요.`;
          continue;
        }
        throw e;
      }
      const url = (await assetUrl(assetId))!;
      const { w, h } = await imageSize(url);
      const width = 1200;
      // 기존 사진 오른쪽에 이어 붙이기
      const right = app.photos.reduce((m, p) => Math.max(m, p.x + p.width + 120), 0);
      app.editBoundary();
      // 이름 = 프로젝트 이름_img_번호 (2026-10-20 "이미지 이름이 모두 같아" — 휴대폰 사진은 대개 image.jpg)
      const name = nextPhotoName(app.access.status === 'ok' ? app.access.projectName : '', app.project.allPhotos().map((p) => p.name));
      const pid = app.project.addPhoto({ name, assetId, w, h, x: right + i * 40, y: 0, width });
      app.editBoundary();
      void app.autoCameraOnAdd(pid); // 등록 즉시 자동 원근 (2026-10-19)
      i++;
    }
    fitted = false;
    queueMicrotask(fitAll);
  }

  function toPhotoFor(photoId: string) {
    return (cx: number, cy: number): Pt => {
      const p = app.project.photo(photoId)!;
      const w = canvas.clientToWorld(cx, cy);
      const s = p.w / p.width;
      return [(w.x - p.x) * s, (w.y - p.y) * s];
    };
  }

  function create(photoId: string, shape: ShapeKind, quad: Pt[], polygon?: Pt[]) {
    const n = app.signs.length + 1;
    app.editBoundary();
    // 원 = 진짜 타원 (2026-10-24 "라운드와 원은 다른것이다" — 전엔 모서리 50% 둥근 사각형, 2026-10-14 결정은 대체됨), 다각형 = 찍은 점
    // 소비자 견적 요청 모드(2026-10-21)는 종류를 모르니 간판(후렉스)으로 시작 — 참고 견적이 바로 나온다
    const id = app.project.addObject({ photoId, name: `사인물 ${n}`, shape, quad, sheetIds: [], ...(shape === 'polygon' && polygon ? { polygon } : {}), ...(app.consumer ? { productId: defaultProductFor('sign') } : {}) });
    app.editBoundary();
    app.selectedId = id;
    if (!app.drawContinuous) app.tool = 'select'; // 연속 그리기면 사각 도구 유지 (2026-10-24)
  }

  function onkey(e: KeyboardEvent) {
    if (app.settingsOpen || app.renderPhotoId || app.objectSettingsOpen || app.cameraPhotoId || app.view !== 'board') return;
    const t = e.target as HTMLElement;
    const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
    // Esc 는 고정: 입력 중이면 입력 종료, 아니면 선택 도구
    if (e.key === 'Escape') { if (typing) t.blur(); else app.tool = 'select'; return; }
    if (typing) return;
    const action = matchAction(app.keymap, e, app.isMac);
    if (action === 'toolPin') { app.tool = 'pin'; return; } // viewer 도 핀은 꽂을 수 있다
    if (!app.canEdit) return;
    if (action === 'undo') { e.preventDefault(); app.undo(); return; }
    if (action === 'redo') { e.preventDefault(); app.redo(); return; }
    // 복사·붙여넣기·복제 (2026-10-15 사용자: "카피 페이스트 복제등이 필요하다")
    if (action === 'copy') { if (app.copySelected()) e.preventDefault(); return; }
    if (action === 'paste') { if (app.clipboard) { e.preventDefault(); app.pasteClipboard(); } return; }
    if (action === 'duplicate') { e.preventDefault(); app.duplicateSelected(); return; }
    if (no3d && (action === 'toolMagic' || action === 'toolZone' || action === 'toolRect' || action === 'toolEllipse')) return; // 3D 단계에서는 그리기 도구 없음
    if (action === 'toolMagic') { app.tool = 'magic'; return; }
    if (action === 'toolZone') { app.tool = 'zone'; return; }
    if (action === 'deleteSelection' && app.zoneSel) { e.preventDefault(); app.deleteZoneSelection(); return; }
    if (action === 'gizmoMove') { app.tool = 'select'; app.gizmoMode = 'none'; return; } // W = 기본(면 직각 막대) — 이동 매니퓰레이터는 없앰 (2026-10-19)
    if (action === 'gizmoRotate' || action === 'gizmoScale') { app.tool = 'select'; app.gizmoMode = action === 'gizmoRotate' ? 'rotate' : 'scale'; return; } // 단추는 숨겼지만 단축키로는
    if (action === 'toolSelect') app.tool = 'select';
    else if (action === 'toolRect') app.tool = 'rect';
    else if (action === 'toolEllipse') { app.tool = 'rect'; app.drawShape = 'ellipse'; } // 원 = 사각 도구의 모양 (2026-10-24)
    else if (action === 'deleteSelection' && app.selectedId) {
      e.preventDefault();
      app.deleteSelection(); // 다중 선택이면 모두 (2026-10-17)
    }
  }

  /** 키보드 확대 기준: 선택한 사인물의 화면상 중심 */
  function zoomAnchor() {
    const o = app.selected;
    const p = o && app.photos.find((x) => x.id === o.photoId);
    if (!o || !p) return null;
    const s = p.width / p.w;
    const cx = o.quad.reduce((a, q) => a + q[0], 0) / 4, cy = o.quad.reduce((a, q) => a + q[1], 0) / 4;
    return toScreen(viewport, { x: p.x + cx * s, y: p.y + cy * s });
  }

  let dropping = $state(false);

  // ---------- 3D 단계: 사진마다 합성 결과(PNG)를 겹친다. 내용 키가 바뀐 사진만, 차례로 하나씩 (뷰어 하나 재사용) ----------
  let stageRenderer: StageRenderer | null = null;
  let stageFont: Font | null = null;
  let stagePumping = false;
  const stageQueue: string[] = [];
  async function pumpStage() {
    if (stagePumping) return;
    stagePumping = true;
    try {
      // three.js·폰트는 3D 단계를 처음 켤 때 내려받는다
      const [{ loadFont }, { StageRenderer }] = await Promise.all([import('../core/textShapes'), import('../render/scene')]);
      stageFont ??= await loadFont(fontUrl);
      while (stageQueue.length && app.stage === '3d') {
        const id = stageQueue.shift()!;
        const p = app.photos.find((x) => x.id === id);
        if (!p) continue;
        const key = app.stageKey(id);
        if (app.stageRenders[id]?.key === key) continue;
        const objs = app.objects.filter((o) => o.photoId === id);
        const plane = wallPlaneOf(objs, app.calibrations.get(id));
        if (!plane) { app.stageRenders[id] = { key, url: '' }; continue; } // 3D 벽면이 없는 사진은 원본 그대로
        stageRenderer ??= new StageRenderer();
        app.stageBusy++;
        try { app.stageRenders[id] = { key, url: await stageRenderer.render(p, objs, plane, app.sources, stageFont, app.estSize) }; }
        catch (e) { console.warn('3D 단계 합성 실패', e); app.stageRenders[id] = { key, url: '' }; }
        finally { app.stageBusy--; }
      }
    } finally { stagePumping = false; }
  }
  let stageTimer = 0;
  $effect(() => {
    if (app.stage !== '3d') { stageRenderer?.dispose(); stageRenderer = null; stageQueue.length = 0; return; }
    // 의존: 사진·사인물·카메라 (키 계산이 전부 읽는다)
    const stale = app.photos.filter((p) => app.stageRenders[p.id]?.key !== app.stageKey(p.id)).map((p) => p.id);
    if (!stale.length) return;
    clearTimeout(stageTimer);
    stageTimer = window.setTimeout(() => { for (const id of stale) if (!stageQueue.includes(id)) stageQueue.push(id); pumpStage(); }, 300);
  });
  // 3D 단계에서는 편집 도구를 쓰지 않는다
  // 데스크톱 Shift (2026-10-22 "시프트가 눌리면 다중 켜지고 시프트 때면 다중 꺼지게 버튼을 눌렀을때는 그 상태로"):
  // 선택 도구에서 Shift 를 누르는 동안만 켠다. 이미 단추로 켰으면 건드리지 않는다. 떼면 끄되 고른 것은 남긴다. 입력 칸 안에서는 무시
  let shiftHeld = false;
  function shiftDown(e: KeyboardEvent) {
    if (e.key !== 'Shift' || e.repeat || app.tool !== 'select' || app.multiMode) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.closest('input, textarea, select, [contenteditable="true"]'))) return;
    shiftHeld = true;
    app.multiMode = true; // 표시만 — 속성창·대화는 닫지 않는다 (Shift 조합 단축키를 누를 때도)
  }
  function shiftUp(e: KeyboardEvent) {
    if (e.key !== 'Shift' || !shiftHeld) return;
    shiftHeld = false;
    if (app.multiMode) app.setMultiMode(false, true);
  }
  function shiftReset() { if (shiftHeld) { shiftHeld = false; if (app.multiMode) app.setMultiMode(false, true); } }
  // [다중]은 선택 도구에서만 — 다른 도구를 고르면 꺼진다 (2026-10-22 "다중버튼 선택일때만 체크로 켜지고 다른 툴 선택하면 체크해제해줘")
  $effect(() => { if (app.tool !== 'select' && untrack(() => app.multiMode)) app.setMultiMode(false); });
  $effect(() => { if (app.stage === '3d' && app.tool !== 'select' && app.tool !== 'pin') app.tool = 'select'; });
  // 다른 도구를 고르면 연속 그리기 리셋 (2026-10-24)
  $effect(() => { if (app.tool !== 'rect' && app.tool !== 'ellipse') app.drawContinuous = false; });
  /** 3D 단계에서는 영역 그리기·존·자동 분리가 동작하지 않는다 → 도구 막대에서 흐리게 (2026-10-17 사용자: "3d에서는 툴바에서 작동하지 않는 기능이 있다. 해당 기능을 어둡게") */
  const no3d = $derived(app.stage === '3d');
  const NO3D = ' — 3D 단계에서는 사용할 수 없습니다 (원본·2D 에서)';

  // ---------- 평면 구역: 모든 사진 아래, 리스트 뷰와 같은 목록·배치(listX/listY mm × 축척 px/mm). 사인물(원본)마다 카드 하나 — 사진마다 중복되지 않는다 ----------
  const origin = $derived(flatOrigin(app.photos, 80, app.flatOffset));
  /** 평면 구역 전체 크기 (2026-10-17 사용자: "평면도 전체 사이즈 조절 가능하게"): 프로젝트 설정 flatScale. [−][+] 또는 오른쪽 아래 손잡이 끌기 */
  const k = $derived(app.flatScale);
  const bounds = $derived(flatBounds(origin, app.flatCards.map(({ o, w, h }) => ({ ...app.flatPlaced.get(o.id)!, w, h })), k));
  const flatCardsPlaced = () => app.flatCards.map(({ o, w, h }) => ({ ...app.flatPlaced.get(o.id)!, w, h }));
  /** 축척 바꾸기 — ✥(카드 묶음 왼쪽 위)가 피봇: 그 자리가 안 움직이게 flatOffset 도 같이 (2026-10-22 "피봇에 메인 컨트롤러 위치하게") */
  const setScale = (v: number, kOld = k, baseOffset = app.flatOffset, cards = flatCardsPlaced()) => {
    const kNew = Math.round(clampFlatScale(v) * 10000) / 10000;
    app.updateSettings({ flatScale: kNew, flatOffset: offsetKeepingPivot(baseOffset, cards, kOld, kNew) });
  };
  /** 왼쪽 위 손잡이: 평면 구역 전체 이동 (2026-10-17 사용자: "왼쪽 상단에도 버튼이 있으면 좋겠다. 이건 이동") → 설정 flatOffset */
  function moveDown(e: PointerEvent) {
    if (e.button !== 0 || !app.canEdit) return;
    e.stopPropagation();
    const start = canvas.clientToWorld(e.clientX, e.clientY);
    const base = { ...app.flatOffset };
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    // 끌면 구역 이동, 누르고 떼면(4px 안) 카드 배열 모드 켜기/끄기 (2026-10-20 "사진 배열 이동 버튼을 선택하면 카드 배열 활성화하고 전체 아웃라인 표시")
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      const w = canvas.clientToWorld(ev.clientX, ev.clientY); app.updateSettings({ flatOffset: { x: Math.round(base.x + w.x - start.x), y: Math.round(base.y + w.y - start.y) } });
    };
    const up = (ev: PointerEvent) => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); if (moved) app.editBoundary(); else if (ev.type === 'pointerup') app.toggleFlatArrange(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); // 두 손가락이 먼저 — 취소면 끝냄
  }
  // 상단 막대의 축척 −/+ (피봇 = ✥ 그대로)
  $effect(() => { const st = app.flatScaleStep; if (st) untrack(() => setScale(k * st.factor)); });
  function handleDown(e: PointerEvent) {
    if (e.button !== 0 || !app.canEdit) return;
    e.stopPropagation();
    const cards = flatCardsPlaced();
    const pivot = { x: bounds!.x, y: bounds!.y }, kBase = k, baseOffset = { ...app.flatOffset }; // 끄는 동안 피봇은 고정
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => { if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; moved = true; const w = canvas.clientToWorld(ev.clientX, ev.clientY); setScale(scaleFromHandle(pivot, cards, w.x), kBase, baseOffset, cards); };
    // 끌지 않고 떼면 ✥ 처럼 카드 배열 모드 켜기/끄기 (2026-10-23 "선택과 해제를 두 컨트롤러 모두에게")
    const up = (ev: PointerEvent) => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); if (moved) app.editBoundary(); else if (ev.type === 'pointerup') app.toggleFlatArrange(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  // ---------- 보드 빈 곳에 사인물 만들기 (사각 도구로 끌기) ----------
  let draft: { x0: number; y0: number; x1: number; y1: number } | null = $state(null);
  // ---------- 끌어서 다중 선택 (2026-10-23 "데스크탑에서 드래그로 다중선택" → "사인물카드와 사진의 사인물은 같이 선택할 이유가 없다 … 다른 사진의 사인물도 같이 선택되면 안된다.
  // 드래그로 먼저 영역에 잡힌 사인물 소속이 같은 것만"): 데스크톱 마우스 · 선택 도구 · 다중 모드([다중] 또는 Shift)일 때만. 아니면 빈 곳 끌기 = 화면 이동 그대로
  let marquee: { x0: number; y0: number; x1: number; y1: number } | null = $state(null);
  type Owner = { kind: 'shape'; photoId: string } | { kind: 'card' };
  /** 사각형 안에 완전히 든 것 (보드 좌표) */
  function caught(m: { x0: number; y0: number; x1: number; y1: number }) {
    const L = Math.min(m.x0, m.x1), R = Math.max(m.x0, m.x1), T = Math.min(m.y0, m.y1), B = Math.max(m.y0, m.y1);
    const inside = (x0: number, y0: number, x1: number, y1: number) => x0 >= L && x1 <= R && y0 >= T && y1 <= B;
    const shapes: { id: string; photoId: string }[] = [];
    for (const o of app.objects) {
      const p = app.photos.find((x) => x.id === o.photoId);
      if (!p || !o.quad.length) continue;
      const f = p.width / p.w, xs = o.quad.map((q) => p.x + q[0] * f), ys = o.quad.map((q) => p.y + q[1] * f);
      if (inside(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))) shapes.push({ id: o.id, photoId: o.photoId });
    }
    const cards: string[] = [];
    for (const { o, w, h } of app.flatCards) {
      const pl = app.flatPlaced.get(o.id);
      if (!pl) continue;
      const at = listToBoard(origin, pl.x, pl.y, k);
      if (inside(at.x, at.y, at.x + w * k, at.y + h * k)) cards.push(o.id);
    }
    return { shapes, cards };
  }
  function marqueeDown(e: PointerEvent, world: { x: number; y: number }): boolean {
    if (app.tool !== 'select' || !app.multiMode || e.pointerType !== 'mouse' || e.button !== 0) return false;
    marquee = { x0: world.x, y0: world.y, x1: world.x, y1: world.y };
    let owner: Owner | null = null; // 먼저 잡힌 것의 소속 — 그 뒤로는 이 소속만
    const move = (ev: PointerEvent) => {
      const w = canvas.clientToWorld(ev.clientX, ev.clientY);
      marquee = { ...marquee!, x1: w.x, y1: w.y };
      if (!owner) { const c = caught(marquee); owner = c.shapes.length ? { kind: 'shape', photoId: c.shapes[0].photoId } : c.cards.length ? { kind: 'card' } : null; }
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
      const m = marquee!; marquee = null;
      if (ev.type !== 'pointerup' || !owner) return;
      const c = caught(m);
      const ids = owner.kind === 'card' ? c.cards : c.shapes.filter((x) => x.photoId === (owner as { photoId: string }).photoId).map((x) => x.id);
      const kind = owner.kind;
      if (app.selectedId && app.selectionKind !== kind) app.selectObject(null); // 다른 종류가 골라져 있으면 새로 (섞지 않음)
      for (const id of ids) if (!app.selectionIds.includes(id)) app.selectObject(id, kind);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    return true;
  }

  function backgroundDown(_e: PointerEvent, world: { x: number; y: number }) {
    if (marqueeDown(_e, world)) return true;
    if (!app.multiMode) app.clearSelectionOnTap(_e); // 탭일 때만 푼다 — 팬·줌에는 선택 유지 (2026-10-22 "개별선택시 화면 팬이나 줌시 선택유지 되게"). 다중 선택 중에는 그대로
    if (!app.canEdit || (app.tool !== 'rect' && app.tool !== 'ellipse')) return false; // 보드 빈 곳 = 사진 없는 사각 사인물 (원·다각형도 사각으로)
    draft = { x0: world.x, y0: world.y, x1: world.x, y1: world.y };
    const move = (ev: PointerEvent) => { const w = canvas.clientToWorld(ev.clientX, ev.clientY); draft = { ...draft!, x1: w.x, y1: w.y }; };
    const cancel = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); draft = null; }; // 두 손가락이 먼저 — 그리던 사각은 버림
    window.addEventListener('pointercancel', cancel);
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
      const d = draft!; draft = null;
      const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      // 화면에서 조금만 끈 것은 만들지 않는다(화면 px — 축소된 보드에서는 보드 8칸이 1~2px이라 화면을 옮기려다 점 같은 사인물이 생겼다, 2026-10-24 "사인물 17이 없는데 요청에 있다고 나온다")
      const sw = w * viewport.zoom, sh = h * viewport.zoom; // 화면 px — 긴 변 24px(휴대폰 32px)·짧은 변 8px 이상 (얇은 띠 간판은 그릴 수 있게)
      if (Math.max(sw, sh) < (touchDevice ? 32 : 24) || Math.min(sw, sh) < 8) return;
      const at = boardToList(origin, Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), k);
      app.createStandalone(at.x, at.y, mmFromBoardRect(w, h, k));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return true;
  }
  // 평면도 카드 끌어 배치 → listX/listY (리스트 뷰에도 그대로)
  let cardDrag: { id: string; dx: number; dy: number } | null = null;
  /** 진행 중인 카드 끌기 정리 (pointerup 이 오지 않은 채 남은 끌기를 다음 끌기 전에 끝낸다) */
  let endCardDrag: (() => void) | null = null;
  /**
   * 카드 끌기 (2026-10-19 사용자: "정면도들이 이동시 블로킹이 될 때가 있어"): ① pointercancel·창 blur 로도 끝낸다(터치·트랙패드가 제스처를 가로채면 pointerup 이 안 와
   * 끌기가 남았다) ② 함께 끌 카드 중 평면도 자리가 없는 것은 뺀다(좌표가 NaN 이 되어 멈췄다) ③ 이동은 프레임마다 한 번, 카드 여러 장을 한 트랜잭션으로(움직일 때마다 카드마다 문서에 써서 버벅였다)
   */
  function cardDown(e: PointerEvent, o: typeof app.objects[number]) {
    if (e.button !== 0) return;
    // 터치: 안 고른 카드는 탭(손 뗌)으로 고르기만, 고른 뒤 다시 끌어야 옮긴다 (2026-10-24 "사인물 이동은 터치에서는 선택 터치업 이후에 다시 드래그에서 작동하게"). 두 손가락 핀치가 되도록 위로 흘린다
    if (e.pointerType === 'touch' && !e.shiftKey && !app.multiMode && !app.selectionIds.includes(o.id)) { panThrough(e); app.whenTap(e, () => app.selectObject(o.id, 'card')); return; }
    e.stopPropagation();
    // Shift+클릭: 평면도 카드도 다중 선택에 더하기/빼기 (2026-10-17 사용자: "정면도는 다중 선택이 안돼") — 끌기는 하지 않는다
    if (e.shiftKey || app.multiMode) { app.toggleSelect(o.id, 'card'); return; }
    // 선택에 든 카드를 끌면 선택 전체가 함께 움직인다 (2026-10-17 "정면도들을 다중선택하고 이동하게")
    const group = app.cardDragIds(o.id);
    if (group.length === 1) app.selectObject(o.id, 'card');
    if (!app.canEdit || app.flatLocked) return; // 고정 (2026-10-23): 고르기만, 끌지 않음
    endCardDrag?.();
    const w = canvas.clientToWorld(e.clientX, e.clientY);
    const p = app.flatPlaced.get(o.id);
    if (!p) return;
    const at = listToBoard(origin, p.x, p.y, k);
    // Alt/Option + 끌기: 평면도 카드도 제자리에 복사해서 복사본을 끈다 (2026-10-17)
    const id = (group.length === 1 && e.altKey ? app.duplicateInPlace() : null) ?? o.id;
    const base = (group.length === 1 ? [id] : group).flatMap((gid) => { const g = app.flatPlaced.get(gid); return g ? [{ id: gid, x: g.x, y: g.y }] : []; });
    cardDrag = { id, dx: w.x - at.x, dy: w.y - at.y };
    app.editBoundary();
    app.freezeFlatLayout(); // 다른 카드가 따라 밀리지 않게 지금 자리에 고정 (같은 ⌘Z 묶음)
    const pointerId = e.pointerId;
    let last: { x: number; y: number } | null = null, frame = 0;
    const apply = () => {
      frame = 0;
      if (!cardDrag || !last) return;
      const l = boardToList(origin, last.x - cardDrag.dx, last.y - cardDrag.dy, k);
      const ddx = l.x - p.x, ddy = l.y - p.y;
      app.project.batch(() => { for (const b of base) app.project.updateObject(b.id, { listX: b.x + ddx, listY: b.y + ddy }); });
    };
    const move = (ev: PointerEvent) => {
      if (!cardDrag || ev.pointerId !== pointerId) return;
      last = canvas.clientToWorld(ev.clientX, ev.clientY);
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const end = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); window.removeEventListener('blur', end);
      if (frame) { cancelAnimationFrame(frame); apply(); } // 마지막 자리 반영
      cardDrag = null; endCardDrag = null; app.editBoundary();
    };
    const onUp = (ev: PointerEvent) => { if (ev.pointerId === pointerId) end(); };
    endCardDrag = end;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp); window.addEventListener('blur', end);
  }

  // 자동 분리 도구를 고르면 모델·사진 분석을 미리 시작한다
  $effect(() => {
    if (app.tool === 'magic') for (const p of app.photos) app.prepareSegment(p.id);
    else app.clearHoverSegment();
  });

  // 내 커서를 다른 접속자에게 (world 좌표, 50ms 간격)
  let cursorTimer = 0;
  function sendCursor(e: PointerEvent) {
    if (cursorTimer) return;
    cursorTimer = window.setTimeout(() => {
      cursorTimer = 0;
      app.setCursor(canvas.clientToWorld(e.clientX, e.clientY));
    }, 50);
  }
  const hint = (a: Action) => app.keymap[a].map((c) => formatCombo(c, app.isMac)).join(', ') || '없음';
</script>

<svelte:window onkeydown={(e) => { shiftDown(e); onkey(e); }} onkeyup={shiftUp} onblur={shiftReset} />

<div
  class="board"
  role="region"
  aria-label="사진 보드"
  class:dropping
  ondragover={(e) => { e.preventDefault(); dropping = true; }}
  ondragleave={() => (dropping = false)}
  ondrop={(e) => { e.preventDefault(); dropping = false; if (app.canEdit && e.dataTransfer?.files) addPhotos(e.dataTransfer.files); }}
  onpointermove={sendCursor}
  onpointerleave={() => app.setCursor(null)}
>
  <InfiniteCanvas
    bind:this={canvas}
    bind:viewport
    testid="board-canvas"
    onfit={() => fitAll(true)}
    {zoomAnchor}
    onbackgrounddown={backgroundDown}
    cursor={app.canEdit && (app.tool === 'rect' || app.tool === 'ellipse') ? 'crosshair' : 'default'}
  >
    {#each app.photos as p (p.id)}
      <PhotoZone
        photo={p}
        url={urls[p.assetId]}
        zoom={viewport.zoom}
        objects={app.objects.filter((o) => o.photoId === p.id)}
        measures={app.measures}
        selectedId={app.selectionKind === 'card' ? null : app.selectedId}
        sameIds={app.sameAsSelected}
        tool={app.stage === '3d' ? (app.tool === 'pin' ? 'pin' : 'select') : app.canEdit || app.tool === 'pin' ? app.tool : 'select'}
        overlay={app.stage === '3d' ? app.stageRenders[p.id]?.url || undefined : undefined}
        twoD={app.stage === '2d' && !app.safeMode}
        onduplicate={(id) => { app.selectObject(id); return app.duplicateInPlace(); }}
        calib={app.calibrations.get(p.id)}
        gizmoPx={app.gizmoSize}
        editable={app.canEdit}
        unread={app.unread}
        pins={app.visiblePins.filter((x) => x.photoId === p.id)}
        selectedPinId={app.selectedPinId}
        oncreatepin={(x, y) => app.createPin(p.id, x, y)}
        onselectpin={(id) => app.selectPin(id)}
        onpinpatch={(id, p) => app.project.updatePin(id, p)}
        onbubble={(id, bubble) => app.project.updateObject(id, { bubble })}
        onpinmoveend={() => app.editBoundary()}
        segmentState={app.embeddedPhotos[p.id]}
        hoverPolygon={app.hoverSegment?.photoId === p.id ? app.hoverSegment.polygon : null}
        onmagicenter={() => app.prepareSegment(p.id)}
        onmagichover={(x, y) => app.segmentAt(p.id, x, y)}
        onmagicleave={() => app.clearHoverSegment()}
        onmagicclick={() => app.createFromSegment()}
        zoneSel={app.zoneSel?.photoId === p.id ? { zone: app.zoneSel.zone, vertex: app.zoneSel.vertex } : undefined}
        oncreatezone={(zone) => app.addZone(p.id, zone)}
        onselectzone={(zone, vertex) => (zone === null ? app.selectZone(null) : app.selectZone(p.id, zone, vertex))}
        onmovezonevertex={(zone, i, pt) => app.moveZoneVertex(p.id, zone, i, pt)}
        onzonemoveend={() => app.editBoundary()}
        onaddzonevertex={(zone, edge, pt) => app.addZoneVertex(p.id, zone, edge, pt)}
        toPhoto={toPhotoFor(p.id)}
        oncreate={(shape, quad, polygon) => create(p.id, shape, quad, polygon)}
        onselect={(id, add) => (add && id ? app.toggleSelect(id) : app.selectObject(id))}
        onchat={(id) => app.openChat(id)}
        multiIds={app.photoHighlightIds}
        ontap={() => { if (app.compact) { const first = app.photoSigns(p.id)[0]; if (first) app.selectObject(first.id); } }}
        onbox={(id, patch) => { app.project.updateObject(id, patch); app.editBoundary(); }}
        onquad={(id, quad) => { app.project.updateObject(id, { quad }); app.editBoundary(); }}
        onmove={(dx, dy) => app.project.updatePhoto(p.id, { x: p.x + dx, y: p.y + dy })}
        onrender={() => (app.renderPhotoId = p.id)}
        oncamera={() => app.openCamera(p.id)}
        oncameraauto={app.canEdit ? async () => { if (!(await app.autoMatchCamera(p.id))) { app.notice = '크기를 넣은 사인물이 없고 사진에서 뚜렷한 직선도 찾지 못했습니다. 사인물에 가로·세로를 넣거나 옵션에서 축 선을 직접 놓으세요.'; app.openCamera(p.id); } } : undefined}
        cameraBusy={app.cameraBusy}
        cameraSet={app.cameras.has(p.id)}
        threeD={app.threeDOk(p.id) ? 'ok' : 'none'}
        showWarnings={app.warnMeasure}
        ondelete={async () => { if (await askConfirm(`"${p.name}" 사진과 사인물을 삭제할까요?`)) { app.editBoundary(); app.project.removePhoto(p.id); app.editBoundary(); } }}
        onreplace={app.canEdit ? () => { replacingId = p.id; replaceInput?.click(); } : undefined}
        onadjust={app.canEdit ? () => (app.adjustPhotoId = p.id) : undefined}
      />
    {/each}
    <!-- 평면 구역: 리스트 뷰와 같은 배치. 사인물(원본)마다 카드 하나, 끌어서 배치 (2026-10-15) -->
    {#if app.flatCards.length}
      <!-- 글·단추(재정렬·간격·고정·축척·완료)는 상단 헤더 막대로 (2026-10-23 "글과 버튼들을 상단 헤더의 창으로 이동") — App.svelte flat-bar -->
      {#if bounds && app.canEdit && app.flatArrange}
        <div class="flat-outline" data-testid="flat-outline" style:left="{bounds.x}px" style:top="{bounds.y}px" style:width="{bounds.w}px" style:height="{bounds.h}px" style:border-width="{2 / viewport.zoom}px"></div>
      {/if}
      {#if bounds && app.canEdit}
        <div class="flat-handle move" data-testid="flat-move" role="button" tabindex="-1" aria-label="평면 구역 이동" class:on={app.flatArrange} title="끌어서 평면 구역 전체 이동 · 누르면 카드 배열(재정렬·간격)" style:left="{bounds.x}px" style:top="{bounds.y}px" style:transform="translate(-50%, -50%) scale({1 / viewport.zoom})" onpointerdown={moveDown}>✥</div>
        <div class="flat-handle" data-testid="flat-handle" role="slider" tabindex="-1" aria-label="평면 구역 전체 크기" aria-valuenow={Math.round((k / 0.1) * 100)} title="끌어서 평면 구역 전체 크기" style:left="{bounds.x + bounds.w}px" style:top="{bounds.y + bounds.h}px" style:transform="translate(-50%, -50%) scale({1 / viewport.zoom})" onpointerdown={handleDown}></div>
      {/if}
    {/if}
    {#each app.flatCards as { o, w, h, placeholder } (o.id)}
      {@const p = app.flatPlaced.get(o.id)!}
      {@const at = listToBoard(origin, p.x, p.y, k)}
      {@const photo = app.photos.find((x) => x.id === o.photoId)}
      <BoardCard {o} x={at.x} y={at.y} w={w * k} h={h * k} mmW={w} mmH={h} {photo} {placeholder} zoom={viewport.zoom} selected={app.selectionKind === 'shape' && (app.selectedId === o.id || app.sameAsSelected.includes(o.id))} multi={app.selectionKind === 'card' && app.selectionIds.includes(o.id)} standalone={!o.photoId} linked={app.objects.some((x) => x.sameAs === o.id)} onpointerdown={(e) => cardDown(e, o)} />
    {/each}
    {#if marquee}
      <div class="draft marquee" data-testid="marquee" style:left="{Math.min(marquee.x0, marquee.x1)}px" style:top="{Math.min(marquee.y0, marquee.y1)}px" style:width="{Math.abs(marquee.x1 - marquee.x0)}px" style:height="{Math.abs(marquee.y1 - marquee.y0)}px" style:border-width="{1 / viewport.zoom}px"></div>
    {/if}
    {#if draft}
      <div class="draft" data-testid="board-draft" style:left="{Math.min(draft.x0, draft.x1)}px" style:top="{Math.min(draft.y0, draft.y1)}px" style:width="{Math.abs(draft.x1 - draft.x0)}px" style:height="{Math.abs(draft.y1 - draft.y0)}px"></div>
    {/if}
    {#each app.peers as p (p.name)}
      {#each p.cursors as c, i (i)}
        <div class="cursor" data-testid="peer-cursor" style:left="{c.x}px" style:top="{c.y}px" style:transform="scale({1 / viewport.zoom})" style:--c={p.color}>
          <svg width="16" height="18" viewBox="0 0 16 18"><path d="M1 1l14 6-6 2-3 8z" fill="var(--c)" stroke="#fff" stroke-width="1.2"/></svg>
          <span>{p.name}</span>
        </div>
      {/each}
    {/each}
    {#snippet overlay()}
      <!-- 휴대폰 조작 안내 (2026-10-24) — 터치 기기에서 처음 한 번, [다시 보지 않기] -->
      {#if app.ready}<TouchHelp />{/if}
      {#if app.stage === '3d' && app.stageBusy}
        <div class="ai-status" data-testid="stage-status">3D 합성 중… ({app.stageBusy})</div>
      {/if}
      {#if app.tool === 'magic' && app.segmentStatus !== 'ready'}
        <div class="ai-status" data-testid="ai-status" data-status={app.segmentStatus}>
          {#if app.segmentStatus === 'error'}AI 모델을 불러오지 못했습니다. {app.segmentError}
          {:else}AI 모델 불러오는 중… (처음 한 번, 약 14MB){/if}
        </div>
      {/if}
      {#if app.ready && !app.photos.length && !app.boardSettled}
        <!-- 동기화 전 (2026-10-25 "미리 상태를 저장했다가 로딩시 스피너"): 사진이 있던 프로젝트는 빈 화면 대신 로딩 -->
        <div class="empty loading" data-testid="board-loading"><span class="spin"></span><p>{app.hadPhotos ? '사진을 불러오는 중…' : '불러오는 중…'}</p>{#if app.sync === 'offline' || app.sync === 'connecting'}<small>서버에 연결하는 중입니다</small>{/if}</div>
      {:else if app.ready && !app.photos.length && app.canEdit}
        <div class="empty" data-testid="photo-empty">
          <p>건물 사진을 올려 시작하세요</p>
          {#if touchDevice}
            <!-- 휴대폰: 카메라와 앨범을 따로 (2026-10-24 "어떤 안드로이드 기계의 경우엔 사진라이브러로 바로 이동해 사진을 찍을 수 없게") -->
            <div class="pick2"><button class="btn primary" data-testid="photo-camera" onclick={() => cameraInput?.click()}>📷 사진 찍기</button><button class="btn" data-testid="photo-album" onclick={() => photoInput?.click()}>🖼 앨범에서</button></div>
          {:else}
            <button class="btn primary" data-testid="photo-add" onclick={() => photoInput?.click()}>사진 추가</button>
          {/if}
          <small>또는 사진을 여기로 끌어다 놓으세요</small>
        </div>
      {/if}
  {#if app.flatArrange && app.canEdit && app.flatCards.length && !(app.multi.length && !app.compact)}<FlatBar />{/if}
        {#if app.multi.length && app.canEdit && !app.compact}
    <!-- 다중 선택 작업 막대 (2026-10-17 사용자: "다중선택 시 작동 버튼 나오게 삭제, 복사, 마지막 선택 구성으로 맞추기") -->
    <div class="multibar" data-testid="multi-bar">
      <span class="cnt" data-testid="multi-count">{app.selectionIds.length}개 선택</span>
      <MultiSize />
      <!-- 재질복제·크기 적용은 [마지막 사인물 ▾] 메뉴로 (2026-10-24, 2026-10-23 "재질복제"는 "구성 적용"으로) -->
      <MultiLast />
      <button class="btn small" data-testid="multi-duplicate" title="각각 바로 옆에 복제" onclick={() => app.duplicateSelection()}>복사</button>
      <button class="btn small danger" data-testid="multi-delete" onclick={() => app.deleteSelection()}>삭제</button>
    </div>
  {/if}
<!-- 사진 교체 파일 고르기 (2026-10-21, 도구 막대 밖 — 막대 순서 테스트) -->
<input data-testid="photo-replace-input" type="file" accept="image/*" hidden bind:this={replaceInput} onchange={onReplaceFile} />
<!-- 사진 올리기 입력 (2026-10-24): 앨범(여러 장) · 카메라(capture — 사진 선택기가 카메라를 안 보여 주는 안드로이드에서도 바로 촬영) -->
<input data-testid="photo-input" type="file" accept="image/*" multiple hidden bind:this={photoInput} onchange={(e) => { const fs = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; addPhotos(fs); }} />
<input data-testid="photo-camera-input" type="file" accept="image/*" capture="environment" hidden bind:this={cameraInput} onchange={(e) => { const fs = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; addPhotos(fs); }} />
<div class="tools" role="toolbar">
        {#if app.canEdit}
          <!-- 순서 (2026-10-20 사용자: "하단 툴바 위치를 변경한다. 자동은 삭제 존,undo,redo, 사각,원(타원으로 변경), 사진, 전체보기"): 선택·말풍선(목록에 없어 앞에 둠) | 존·↶·↷·사각·타원·사진·전체 보기. 자동(AI)은 단추를 빼고 단축키 A 만 -->
          <button data-testid="tool-select" class:on={app.tool === 'select'} title="선택 ({hint('toolSelect')})" onclick={() => (app.tool = 'select')}>↖<span class="lbl"> 선택</span></button>
          <!-- 다중 선택은 [선택] 옆 (2026-10-22 "다중선택을 선택옆으로 이동해주고") — 켜 두면 탭할 때마다 더하기/빼기, 끄거나 ✕ 로 끝 -->
          {#if app.tool === 'rect' || app.tool === 'ellipse'}
          <!-- 사각 도구에서는 [다중] 자리가 [연속]: 켜면 그린 뒤에도 사각 도구 유지, 다른 도구를 고르면 꺼짐 (2026-10-24 "사각툴을 켜면 다중버튼은 연속으로변경하고 계속 사각툴이 유지되게 그리고 다른 툴이 선택되면 리셋") -->
          <button data-testid="tool-continuous" class:on={app.drawContinuous} title={app.drawContinuous ? '연속 그리기 끄기' : '연속 그리기 — 그린 뒤에도 사각 도구 유지'} onclick={() => (app.drawContinuous = !app.drawContinuous)}>{app.drawContinuous ? '✓ ' : ''}연속</button>
          {:else}
            <button data-testid="tool-multi" class:on={app.multiMode} title={app.multiMode ? '다중 선택 끄기' : '다중 선택 — 누를 때마다 더하기/빼기'} onclick={() => { if (shiftHeld) { shiftHeld = false; return; } /* Shift 로 켠 채 누르면 켠 상태로 고정 */ if (!app.multiMode) app.tool = 'select'; app.setMultiMode(!app.multiMode); }}>{app.multiMode ? '✓ ' : ''}다중</button>
          {/if}
          {#if !app.consumer}<!-- 소비자 견적 요청 모드(2026-10-21)에는 말풍선·존이 없다 -->
          <!-- 말풍선 단추는 상단 [톡]으로 (2026-10-22 "툴의 말풍선은 톡으로 변경한다") — 위치 번호는 톡의 📍 또는 단축키 -->
          <span class="sep"></span>
          <button data-testid="tool-zone" class:on={app.tool === 'zone'} disabled={no3d} title="작업 존 ({hint('toolZone')}){no3d ? NO3D : ''}" onclick={() => (app.tool = 'zone')}>▱<span class="lbl"> 존</span></button>
          {/if}
          <button data-testid="undo" title="실행 취소 ({hint('undo')})" disabled={!app.canUndo} onclick={() => app.undo()}><svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg></button>
          <button data-testid="redo" title="다시 실행 ({hint('redo')})" disabled={!app.canRedo} onclick={() => app.redo()}><svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg></button>
          <!-- 사각 아이콘 = 정사각, 다른 아이콘과 같은 선 두께 (2026-10-24) -->
          <button class="file" bind:this={rectBtn} data-testid="tool-rect" class:on={app.tool === 'rect' || app.tool === 'ellipse'} disabled={no3d} title="사각 영역 ({hint('toolRect')}){no3d ? NO3D : ''}" onclick={() => (app.tool = 'rect')}><svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="1.5" /></svg><span class="lbl"> 사각</span></button>
          <button class="file" data-testid="tool-photo" title="사진 추가" onclick={() => (touchDevice ? (photoMenu = !photoMenu) : photoInput?.click())}><svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5z" /><circle cx="12" cy="13" r="3.5" /></svg><span class="lbl"> 사진</span></button>
          {#if photoMenu}
            <div class="photo-menu" data-testid="photo-menu">
              <button data-testid="photo-menu-camera" onclick={() => { photoMenu = false; cameraInput?.click(); }}>📷 사진 찍기</button>
              <button data-testid="photo-menu-album" onclick={() => { photoMenu = false; photoInput?.click(); }}>🖼 앨범에서</button>
            </div>
          {/if}
        {:else}
          <span class="readonly">보기·대화만 가능</span>
        {/if}
        <button data-testid="zoom-fit" title="전체 보기 ({hint('zoomFit')})" onclick={() => fitAll(true)}><svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg></button>
        <span class="zoom" data-testid="zoom-label">{Math.round(viewport.zoom * 100)}%</span>
      </div>
      <!-- 모양 고르기는 도구 막대 밖(휴대폰 막대는 가로로 넘겨 위로 나간 것이 잘린다), 사각 단추 바로 위 -->
          {#if (app.tool === 'rect' || app.tool === 'ellipse') && !no3d && shapesAt}
            <!-- 사각 도구의 모양: 사각 · 원(진짜 타원 — 라운드는 모서리 설정) · 다각형 (2026-10-24 "원 툴은 거의 사용하지 않는다. 사각에서 원, 다각형을 선택할 수 있게") -->
            <div class="draw-shapes" data-testid="draw-shapes" role="group" aria-label="그릴 모양" style:left="{shapesAt?.x ?? 0}px" style:top="{shapesAt?.y ?? 0}px">
              <button data-testid="draw-shape-rect" class:on={app.drawShape === 'rect'} title="사각" onclick={() => (app.drawShape = 'rect')}><svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="1.5" /></svg></button>
              <button data-testid="draw-shape-ellipse" class:on={app.drawShape === 'ellipse'} title="원 ({hint('toolEllipse')})" onclick={() => (app.drawShape = 'ellipse')}><svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="7.5" /></svg></button>
              <button data-testid="draw-shape-polygon" class:on={app.drawShape === 'polygon'} title="다각형 — 점을 차례로, 첫 점을 다시 누르거나 두 번 누르면 완성" onclick={() => (app.drawShape = 'polygon')}><svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4 L20 10 L17 19.5 L7 19.5 L4 10 Z" /></svg></button>
            </div>
          {/if}
    {/snippet}
  </InfiniteCanvas>
</div>

<style>
  .board { position: absolute; inset: 0; }
  .cursor { position: absolute; transform-origin: 0 0; pointer-events: none; display: flex; align-items: flex-start; gap: 2px; z-index: 3; }
  .cursor span { background: var(--c); color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 4px; white-space: nowrap; margin-top: 10px; }
  .board.dropping { outline: 3px dashed var(--accent); outline-offset: -6px; }
  .draft { position: absolute; border: 1px dashed var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); pointer-events: none; }
  .flat-outline { position: absolute; border: 2px dashed var(--accent); border-radius: 6px; pointer-events: none; box-sizing: content-box; margin: -8px 0 0 -8px; padding: 8px; z-index: 2; }
  .flat-handle.move.on { outline: 2px solid #fff; }
  .flat-handle { position: absolute; width: 14px; height: 14px; border-radius: 3px; background: var(--accent); border: 2px solid var(--accent-ink); cursor: nwse-resize; z-index: 3; }
  .flat-handle.move { width: 18px; height: 18px; cursor: move; display: grid; place-items: center; font-size: 12px; line-height: 1; color: var(--accent-ink); }
  .empty {
    position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 12px;
    color: var(--muted); pointer-events: none;
  }
  .empty > * { pointer-events: auto; }
  .empty.loading { pointer-events: none; color: var(--muted); }
  .spin { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--accent); animation: board-spin 0.9s linear infinite; }
  @keyframes board-spin { to { transform: rotate(360deg); } }
  .empty p { font-size: 16px; color: var(--text); margin: 0; }
  .pick2 { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  .photo-menu { position: absolute; z-index: 20; display: flex; flex-direction: column; gap: 4px; padding: 6px; margin-top: 4px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); }
  .photo-menu button { white-space: nowrap; padding: 8px 12px; text-align: left; }
  .multibar {
    position: absolute; left: 50%; bottom: 76px; transform: translateX(-50%); z-index: 6;
    display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 12px;
    background: var(--panel); border: 1px solid var(--accent); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4); white-space: nowrap;
  }
  .multibar .cnt { font-size: 12px; color: var(--accent); font-weight: 700; margin-right: 4px; }
  .tools {
    position: absolute; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%);
    display: flex; align-items: center; gap: 4px; padding: 5px; border-radius: 12px;
    background: var(--panel); border: 1px solid var(--line); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }
  .tools button, .tools .file {
    background: none; border: 0; color: var(--text); padding: 7px 11px; border-radius: 8px; font: inherit; font-size: 13px; cursor: pointer;
  }
  .tools button:hover, .tools .file:hover { background: var(--hover); }
  .tools button.on { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
  .tools button:disabled { opacity: 0.35; cursor: default; }
  .draw-shapes { position: fixed; z-index: 30; transform: translate(-50%, -100%); display: flex; gap: 4px; padding: 4px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); }
  .draw-shapes button { background: none; border: 0; color: var(--text); padding: 6px 9px; border-radius: 8px; cursor: pointer; }
  .draw-shapes button:hover { background: var(--hover); }
  .draw-shapes button.on { background: var(--accent); color: var(--accent-ink); }
  .draw-shapes .ico { display: block; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .tools .file.on { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
  .tools .ico { display: block; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .tools .file { display: inline-flex; flex-direction: row; align-items: center; gap: 4px; } /* 전역 label 은 세로 배치 — 아이콘 옆에 글자 */
  .ai-status { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px 14px; font-size: 13px; z-index: 4; }
  .ai-status[data-status='error'] { border-color: var(--danger); }
  .readonly { color: var(--muted); font-size: 12px; padding: 7px 11px; }
  .sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
  .zoom { color: var(--muted); font-size: 12px; min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
  .tools button, .tools .file { white-space: nowrap; }
  /* 휴대폰 폭: 아이콘만, 화면 폭에 맞춰 가로 스크롤 */
  @media (max-width: 720px) {
    .tools { left: 8px; right: 8px; bottom: 8px; transform: none; overflow-x: auto; justify-content: flex-start; gap: 2px; scrollbar-width: none; }
    .tools .lbl, .tools .zoom { display: none; }
    .tools button, .tools .file { padding: 9px 10px; font-size: 15px; }
    /* 아이콘이 같은 너비로 자리를 나누고 구분선은 없앰 (2026-10-20 "툴바 아이콘 모바일에서 균등하게 자리 가지게해주고 구분은 제거") */
    .tools button, .tools .file { flex: 1 1 0; min-width: 0; padding: 9px 0; display: flex; align-items: center; justify-content: center; }
    .tools .sep { display: none; }
    .empty p { font-size: 15px; text-align: center; padding: 0 16px; }
  }
</style>
