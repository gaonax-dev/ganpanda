<!--
  간판 속성 맨 위 3D 뷰어 (2026-10-31 사용자: "현재 오브젝트를 조합한 3d 뷰가 최상단에 놓인다"): 지금 구성 그대로 사인물 전체(입체 보기와 같은 그리기 — renderSpecOf + buildSign).
  closeUp = 고른 요소로 다가가기(프레임 등 — 채널은 키트 미리보기가 대신). 그릴 수 없으면(치수·구성 없음) 안내
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { loadEnvironment, roomEnvironment } from '../sim/env';
  import type { Font } from 'opentype.js';
  import fontUrl from 'pretendard/dist/public/static/Pretendard-Bold.otf?url';
  import { app } from '../state.svelte';
  import type { SignObject } from '../core/model';
  import { specFromObject } from '../core/letter3d';
  import { componentOf } from '../core/components';
  import { loadFont } from '../core/textShapes';
  import { buildChannel, buildSign, type BuiltSign } from '../sim/signs';
  import { ENV_DAY, SUN_DAY } from '../sim/viewer';
  import { renderSpecOf } from '../core/render';
  import { loadItemImages } from '../render/itemImages';

  /** focusPart: 그 구성 요소만 남기고 나머지(다른 구성 요소·프레임)는 숨겨 가까이 본다 (2026-10-31 "구성(채널)을 누르면 다른 사인물은 사라지고 채널만 클로즈업") */
  let { obj, closeUp = false, focusPart = null }: { obj: SignObject; closeUp?: boolean; focusPart?: string | null } = $props();
  let host: HTMLDivElement;
  let font: Font | null = null;
  let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls;
  let built: BuiltSign | null = null;
  let wall: THREE.Mesh, sun: THREE.DirectionalLight;
  let ready = $state(false), empty = $state(false);
  let size = { w: 1000, h: 400 };
  /** 지금 보이는 구성 요소 id 들 (확인용) */
  let visibleParts = $state('');
  /** 다가갈 범위 — 전체 또는 남긴 요소 (mm, 사인물 중심 기준) */
  let focusBox: THREE.Box3 | null = null;
  /** 카메라 이동 목표 — 루프가 0.28초 동안 부드럽게 옮긴다 ("쓱" 다가가기, 뷰어를 다시 만들지 않고) */
  let camGoal: { pos: THREE.Vector3; target: THREE.Vector3; from: { pos: THREE.Vector3; target: THREE.Vector3 }; t0: number } | null = null;
  const CAM_MS = 280;

  $effect(() => {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.NeutralToneMapping;
    host.appendChild(renderer.domElement);
    renderer.domElement.dataset.testid = 'sign-view-canvas';
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcfdbe8);
    scene.environment = roomEnvironment(renderer);
    scene.environmentIntensity = ENV_DAY;
    void loadEnvironment(renderer).then((tex) => { if (tex && scene) scene.environment = tex; });
    camera = new THREE.PerspectiveCamera(36, 1, 10, 1e5);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    sun = new THREE.DirectionalLight(0xffffff, SUN_DAY); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun, new THREE.HemisphereLight(0xdde8ff, 0x8a7a66, 1));
    wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xd9cfc0, roughness: 0.9 }));
    wall.receiveShadow = true;
    scene.add(wall);
    // frame() 은 closeUp·focusPart(프롭)를 읽는다 — 이 만들기 effect 안에서 그냥 부르면 그 프롭이 바뀔 때마다 effect 가 다시 돌아 렌더러를 통째로 다시 만들었다
    // (요소를 누르면 카메라가 다가가는 대신 화면이 새로 그려지는 "리프레시", 2026-10-31). untrack 으로 끊는다
    const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); untrack(frame); };
    const ro = new ResizeObserver(resize); ro.observe(host); untrack(resize);
    let raf = 0;
    const loop = () => {
      if (camGoal) {
        const k = Math.min(1, (performance.now() - camGoal.t0) / CAM_MS), e = 1 - Math.pow(1 - k, 3);
        camera.position.lerpVectors(camGoal.from.pos, camGoal.pos, e);
        controls.target.lerpVectors(camGoal.from.target, camGoal.target, e);
        if (k >= 1) camGoal = null;
      }
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop);
    };
    loop();
    loadFont(fontUrl).then((f) => { font = f; void untrack(rebuild); }).catch(() => (empty = true));
    return () => { cancelAnimationFrame(raf); ro.disconnect(); built?.dispose(); controls.dispose(); renderer.dispose(); host.innerHTML = ''; };
  });

  const composed = $derived(obj.parts && obj.widthMm && obj.heightMm ? renderSpecOf(obj, { cx: 0, cy: 0, w: obj.widthMm, h: obj.heightMm }) : null);
  $effect(() => { void obj.text; void obj.widthMm; void obj.heightMm; void obj.productId; void obj.parts; void obj.options; void obj.letter3d; if (font) void rebuild(); });
  $effect(() => { void closeUp; void focusPart; applyFocus(); frame(); });

  let token = 0;
  async function rebuild() {
    const my = ++token;
    const comp = composed;
    const base = specFromObject(obj);
    const cp = obj.parts?.find((p) => componentOf(p.kind).look3d && p.items.some((i) => i.kind === 'text' && (i.text ?? '').trim()));
    const spec = comp ?? (base && cp ? { ...base, ...componentOf(cp.kind).look3d!(cp) } : base);
    if (!spec || !font) { empty = !spec; ready = !spec ? false : ready; return; }
    const images = comp?.faceItems ? await loadItemImages(obj, app.sources) : undefined;
    if (my !== token || !font) return;
    built?.group.removeFromParent(); built?.dispose();
    built = comp ? buildSign(comp, font, 'Pretendard, sans-serif', undefined, images) : buildChannel(spec, font);
    built.setNight(false);
    scene.add(built.group);
    size = { w: comp ? comp.widthMm : built.measured.widthMm, h: spec.heightMm };
    const span = Math.max(size.w, size.h);
    wall.geometry.dispose(); wall.geometry = new THREE.PlaneGeometry(size.w * 2 + 2000, size.h * 4 + 1000);
    wall.position.set(0, 0, -1);
    sun.position.set(-span * 0.4, span * 0.9, span * 0.8); sun.target.position.set(0, 0, 0); scene.add(sun.target);
    const cam = sun.shadow.camera; cam.left = cam.bottom = -span; cam.right = cam.top = span; cam.near = 1; cam.far = span * 4; cam.updateProjectionMatrix();
    empty = false; ready = true;
    applyFocus();
    frame();
  }

  /** 요소만 남기기: partId 가 붙은 글자 그룹은 고른 것만, 표시 없는 메시(상자·프레임·앞면 그림)는 요소를 골랐을 때 숨긴다 */
  function applyFocus() {
    if (!built) return;
    const shown = new Set<string>();
    const tagged = (o: THREE.Object3D): string | null => { let p: THREE.Object3D | null = o; while (p && p !== built!.group) { if (typeof p.userData.partId === 'string') return p.userData.partId; p = p.parent; } return null; };
    built.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pid = tagged(m);
      const on = !focusPart || pid === focusPart;
      m.visible = on;
      if (on && pid) shown.add(pid);
    });
    visibleParts = [...shown].sort().join(' ');
    const box = new THREE.Box3();
    built.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible && m.userData.part !== 'glow') box.expandByObject(m); });
    focusBox = focusPart && !box.isEmpty() ? box : null;
  }

  /** 사인물 전체가 들어오게 — 다가가기면 절반 거리, 살짝 옆에서 */
  function frame() {
    if (!camera) return;
    let { w, h } = size;
    let cx = 0, cy = 0;
    if (focusBox) { const s = focusBox.getSize(new THREE.Vector3()), c = focusBox.getCenter(new THREE.Vector3()); w = Math.max(200, s.x); h = Math.max(200, s.y); cx = c.x; cy = c.y; }
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    // 요소를 골랐으면 그 요소 범위에 맞춘 거리가 곧 클로즈업 — 더 줄이면 글자 안으로 들어간다 (2026-10-31 확인: "카페"가 "페"만 보였다)
    const dist = Math.max(w / 2 / Math.tan(hfov / 2), (h * 1.4) / 2 / Math.tan(vfov / 2)) * (focusBox ? 1.25 : closeUp ? 0.55 : 1.15);
    const pos = new THREE.Vector3(cx + dist * (closeUp ? 0.3 : 0.18), cy + h * 0.2, dist), target = new THREE.Vector3(cx, cy, 0);
    camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
    if (!controls || !ready) { camera.position.copy(pos); controls?.target.copy(target); camGoal = null; return; } // 처음·크기 바뀜은 바로
    camGoal = { pos, target, from: { pos: camera.position.clone(), target: controls.target.clone() }, t0: performance.now() };
  }
</script>

<div class="view" bind:this={host} data-testid="sign-view" data-ready={ready ? 'true' : undefined} data-close={closeUp || undefined} data-focus={focusPart ?? undefined} data-visible-parts={visibleParts}></div>
{#if empty}<p class="hint empty" data-testid="sign-view-empty">가로·세로 치수와 구성을 넣으면 3D 로 보입니다</p>{/if}

<style>
  .view { position: absolute; inset: 0; }
  .view :global(canvas) { display: block; width: 100%; height: 100%; touch-action: none; }
  .empty { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; }
</style>
