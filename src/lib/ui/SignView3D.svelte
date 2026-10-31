<!--
  간판 속성 맨 위 3D 뷰어 (2026-10-31 사용자: "현재 오브젝트를 조합한 3d 뷰가 최상단에 놓인다"): 지금 구성 그대로 사인물 전체(입체 보기와 같은 그리기 — renderSpecOf + buildSign).
  closeUp = 고른 요소로 다가가기(프레임 등 — 채널은 키트 미리보기가 대신). 그릴 수 없으면(치수·구성 없음) 안내
-->
<script lang="ts">
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

  let { obj, closeUp = false }: { obj: SignObject; closeUp?: boolean } = $props();
  let host: HTMLDivElement;
  let font: Font | null = null;
  let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls;
  let built: BuiltSign | null = null;
  let wall: THREE.Mesh, sun: THREE.DirectionalLight;
  let ready = $state(false), empty = $state(false);
  let size = { w: 1000, h: 400 };

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
    const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); frame(); };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    loadFont(fontUrl).then((f) => { font = f; void rebuild(); }).catch(() => (empty = true));
    return () => { cancelAnimationFrame(raf); ro.disconnect(); built?.dispose(); controls.dispose(); renderer.dispose(); host.innerHTML = ''; };
  });

  const composed = $derived(obj.parts && obj.widthMm && obj.heightMm ? renderSpecOf(obj, { cx: 0, cy: 0, w: obj.widthMm, h: obj.heightMm }) : null);
  $effect(() => { void obj.text; void obj.widthMm; void obj.heightMm; void obj.productId; void obj.parts; void obj.options; void obj.letter3d; if (font) void rebuild(); });
  $effect(() => { void closeUp; frame(); });

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
    frame();
  }

  /** 사인물 전체가 들어오게 — 다가가기면 절반 거리, 살짝 옆에서 */
  function frame() {
    if (!camera) return;
    const { w, h } = size;
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = Math.max(w / 2 / Math.tan(hfov / 2), (h * 1.4) / 2 / Math.tan(vfov / 2)) * (closeUp ? 0.55 : 1.15);
    camera.position.set(dist * (closeUp ? 0.35 : 0.18), h * 0.2, dist);
    controls?.target.set(0, 0, 0);
    camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
  }
</script>

<div class="view" bind:this={host} data-testid="sign-view" data-ready={ready ? 'true' : undefined} data-close={closeUp || undefined}></div>
{#if empty}<p class="hint empty" data-testid="sign-view-empty">가로·세로 치수와 구성을 넣으면 3D 로 보입니다</p>{/if}

<style>
  .view { position: absolute; inset: 0; }
  .view :global(canvas) { display: block; width: 100%; height: 100%; touch-action: none; }
  .empty { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; }
</style>
