<!-- 입체 간판 미리보기 (4차): 문구를 3D 글자로, 주야간, 두께·색·자간, 폰트 기준 폭 → 치수 -->
<script lang="ts">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
  import type { Font } from 'opentype.js';
  import fontUrl from 'pretendard/dist/public/static/Pretendard-Bold.otf?url';
  import { app } from '../state.svelte';
  import type { SignObject } from '../core/model';
  import { DEFAULT_LETTER3D, specFromObject, type Letter3D } from '../core/letter3d';
  import { loadFont } from '../core/textShapes';
  import { buildChannel, buildSign, type BuiltSign } from '../sim/signs';
  import { renderSpecOf } from '../core/render';
  import { loadItemImages } from '../render/itemImages';

  let { obj }: { obj: SignObject } = $props();
  let host: HTMLDivElement;
  let night = $state(false);
  let widthMm = $state<number | null>(null);
  let status = $state('폰트 불러오는 중…');
  const ro = $derived(!app.canEdit);
  const l = $derived<Letter3D>({ ...DEFAULT_LETTER3D, ...(obj.letter3d ?? {}) });
  const update = (patch: Partial<Letter3D>) => { if (app.canEdit) app.project.updateObject(obj.id, { letter3d: { ...l, ...patch } }); };

  let font: Font | null = null;
  let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls;
  let built: BuiltSign | null = null;
  let wall: THREE.Mesh, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight;

  $effect(() => {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);
    renderer.domElement.dataset.testid = 'letter3d-canvas';
    scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    camera = new THREE.PerspectiveCamera(40, 1, 10, 1e5);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    hemi = new THREE.HemisphereLight(0xdde8ff, 0x8a7a66, 1);
    scene.add(sun, hemi);
    wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xd9cfc0, roughness: 0.9 }));
    wall.receiveShadow = true;
    scene.add(wall);
    const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro2 = new ResizeObserver(resize); ro2.observe(host); resize();
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    loadFont(fontUrl).then((f) => { font = f; status = ''; rebuild(); }).catch(() => (status = '폰트를 불러오지 못했습니다.'));
    return () => { cancelAnimationFrame(raf); ro2.disconnect(); built?.dispose(); renderer.dispose(); host.innerHTML = ''; };
  });

  // 사양이 바뀌면 다시 만든다
  $effect(() => { obj.text; obj.widthMm; obj.heightMm; obj.productId; obj.parts; l.depthMm; l.faceColor; l.sideColor; l.letterSpacing; if (font) rebuild(); });
  /** 조합형 (4단계, 2026-10-16): 정면도 배치 그대로 사인물 전체(상자 + 객체마다 입체 글자 + 앞면 그림) */
  const composed = $derived(obj.parts && obj.widthMm && obj.heightMm ? renderSpecOf(obj, { cx: 0, cy: 0, w: obj.widthMm, h: obj.heightMm }) : null);
  let token = 0;
  $effect(() => { applyNight(night); });

  async function rebuild() {
    const my = ++token;
    const comp = composed?.letterItems || composed?.faceItems ? composed : null;
    const spec = comp ?? specFromObject(obj);
    if (!spec || !font) return;
    const images = comp?.faceItems ? await loadItemImages(obj, app.sources) : undefined;
    if (my !== token || !font) return;
    built?.group.removeFromParent(); built?.dispose();
    built = comp ? buildSign(comp, font, 'Pretendard, sans-serif', undefined, images) : buildChannel(spec, font);
    scene.add(built.group);
    widthMm = comp ? null : built.measured.widthMm;
    const w = comp ? comp.widthMm : built.measured.widthMm, h = spec.heightMm;
    wall.geometry.dispose(); wall.geometry = new THREE.PlaneGeometry(w * 2 + 2000, h * 4 + 1000);
    wall.position.set(0, 0, -1);
    const span = Math.max(w, h);
    sun.position.set(-span * 0.4, span * 0.9, span * 0.8); sun.target.position.set(0, 0, 0); scene.add(sun.target);
    const cam = sun.shadow.camera; cam.left = cam.bottom = -span; cam.right = cam.top = span; cam.near = 1; cam.far = span * 4; cam.updateProjectionMatrix();
    frame(w, h);
    applyNight(night);
  }

  /** 글자 전체가 화면에 들어오도록 카메라 거리 계산 (가로·세로 화각 중 큰 쪽) */
  function frame(w: number, h: number) {
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = Math.max((w / 2) / Math.tan(hfov / 2), (h * 1.6) / 2 / Math.tan(vfov / 2)) * 1.25;
    camera.position.set(dist * 0.18, h * 0.25, dist); controls.target.set(0, 0, 0);
    camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
  }

  function applyNight(n: boolean) {
    if (!scene) return;
    scene.background = new THREE.Color(n ? 0x0b0d12 : 0xcfdbe8);
    scene.environmentIntensity = n ? 0.1 : 1;
    sun.intensity = n ? 0 : 2.2; hemi.intensity = n ? 0.08 : 1;
    (wall.material as THREE.MeshStandardMaterial).color.set(n ? 0x3a3630 : 0xd9cfc0);
    built?.setNight(n);
  }

  function savePng() {
    renderer.render(scene, camera);
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = `${obj.name}_입체_${night ? '야간' : '주간'}.png`;
    a.click();
  }

  function applyWidth() {
    if (widthMm && app.canEdit) { app.editBoundary(); app.project.updateObject(obj.id, { widthMm: Math.round(widthMm / 10) * 10 }); app.editBoundary(); }
  }
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
</script>

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) app.letter3dOpen = false; }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="입체 간판">
    <header>
      <h2>입체 간판 · {obj.name}</h2>
      <span class="seg"><button class:on={!night} onclick={() => (night = false)}>주간</button><button data-testid="letter3d-night" class:on={night} onclick={() => (night = true)}>야간</button></span>
      <button class="icon" data-testid="close-letter3d" title="닫기" onclick={() => (app.letter3dOpen = false)}>✕</button>
    </header>
    <div class="body">
      <div class="view" bind:this={host}>{#if status}<div class="status">{status}</div>{/if}</div>
      <aside>
        {#if composed?.letterItems || composed?.faceItems}
        <div class="measure" data-testid="letter3d-composed">
          <small>정면도 배치 그대로</small>
          <b>{fmt(obj.widthMm ?? 0)} × {fmt(obj.heightMm ?? 0)} mm</b>
          <small>입체 글자 {composed.letterItems?.length ?? 0}개{composed.faceItems ? ` · 앞면 ${composed.faceItems.length}개` : ''} — 위치·높이는 사인물 설정의 정면도에서</small>
        </div>
        {:else}
        <div class="measure">
          <small>폰트 기준 전체 폭</small>
          <b data-testid="letter3d-width">{widthMm ? `약 ${fmt(widthMm)} mm` : '계산 중…'}</b>
          {#if !ro}<button class="btn small" data-testid="letter3d-apply-width" disabled={!widthMm} onclick={applyWidth}>가로 치수에 적용</button>{/if}
          <small>글자 높이 {fmt(obj.heightMm ?? 0)} mm · {obj.text}</small>
        </div>
        {/if}
        <label>두께 (mm)<input data-testid="letter3d-depth" type="number" min="5" step="5" value={l.depthMm} disabled={ro} oninput={(e) => update({ depthMm: Math.max(5, Number(e.currentTarget.value) || 5) })} /></label>
        <label>자간<input type="number" step="0.01" value={l.letterSpacing} disabled={ro} oninput={(e) => update({ letterSpacing: Number(e.currentTarget.value) || 0 })} /></label>
        <div class="grid2">
          <label>{obj.productId === 'ch-halo' ? 'LED 색' : '면 색'}<input type="color" value={l.faceColor} disabled={ro} oninput={(e) => update({ faceColor: e.currentTarget.value })} /></label>
          <label>{obj.productId === 'ch-halo' ? '몸체 색' : '옆면 색'}<input type="color" value={l.sideColor} disabled={ro} oninput={(e) => update({ sideColor: e.currentTarget.value })} /></label>
        </div>
        <p class="hint">마우스로 돌려 보고(드래그), 휠로 확대합니다. 전광·후광은 야간에 발광합니다.</p>
        <button class="btn" onclick={savePng}>PNG 저장</button>
      </aside>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(1000px, calc(100vw - 32px)); height: min(640px, calc(100vh - 48px)); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 15px; flex: 1; }
  header .icon { margin-left: 0; }
  .body { flex: 1; display: grid; grid-template-columns: 1fr 240px; min-height: 0; }
  .view { position: relative; min-height: 0; }
  .view :global(canvas) { display: block; width: 100%; height: 100%; }
  .status { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); pointer-events: none; }
  aside { border-left: 1px solid var(--line); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
  .measure { display: flex; flex-direction: column; gap: 4px; background: var(--input); border-radius: 10px; padding: 10px; }
  .measure b { font-size: 16px; color: var(--accent); }
  .measure small { color: var(--muted); font-size: 11px; }
</style>
