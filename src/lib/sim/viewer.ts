// 사진 배경 + 복원된 카메라 + 벽면 평면 위 간판 렌더링
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CameraPose } from '../core/homography';

const bgVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const bgFragment = /* glsl */ `
uniform sampler2D map;
uniform float brightness;
uniform vec3 tint;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(map, vUv).rgb;
  gl_FragColor = vec4(c * brightness * tint, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * 메인 카메라(격자·그림자 면, 레이어 0)로 한 번 그리고, 사인물마다 **자기 카메라**(자기 영역의 호모그래피)로 그 레이어만 덧그린다.
 * 사진의 카메라 설정이 벽과 어긋나거나(예: 바닥 평면으로 잡힘) 사인물이 그 평면의 지평선 너머라도, 사인물은 항상 그린 자리에 보인다
 * (2026-10-14 운영 프로젝트 점검: 측면 사진의 사인물이 바닥 평면 기준 "카메라 뒤"로 잘려 안 보였음)
 */
class SignsPass extends Pass {
  constructor(private scene: THREE.Scene, private main: THREE.Camera, private signs: { camera: THREE.Camera; layer: number }[]) { super(); this.needsSwap = false; }
  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    this.main.layers.set(0);
    renderer.render(this.scene, this.main);
    for (const s of this.signs) {
      renderer.clearDepth();
      s.camera.layers.set(s.layer);
      renderer.render(this.scene, s.camera);
    }
    renderer.autoClear = auto;
  }
}

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 10, 1e6);
  readonly signsRoot = new THREE.Group();
  private bgScene = new THREE.Scene();
  private bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bgMat: THREE.ShaderMaterial;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private hemi = new THREE.HemisphereLight(0xdde8ff, 0x8a7a66, 1.0);
  private wallShadow: THREE.Mesh;
  private grid = new THREE.Group();
  private selection = new THREE.Box3Helper(new THREE.Box3(), 0x2f8bff);
  /** 사인물별 카메라 (레이어 1..) */
  private signCameras: { camera: THREE.Camera; layer: number }[] = [];
  private wall = { w: 1, h: 1 };
  night = false;
  private dirty = true;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);

    this.bgMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, brightness: { value: 1 }, tint: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: bgVertex, fragmentShader: bgFragment, depthWrite: false, depthTest: false,
    });
    this.bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat));

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 2;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.wallShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ opacity: 0.38, depthWrite: false }),
    );
    this.wallShadow.receiveShadow = true;
    this.scene.add(this.wallShadow, this.grid, this.signsRoot, this.selection);
    this.selection.visible = false;

    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(this.bgScene, this.bgCamera));
    this.composer.addPass(new SignsPass(this.scene, this.camera, this.signCameras));
    // 조명·그림자는 모든 레이어에
    this.sun.layers.enableAll(); this.hemi.layers.enableAll(); this.sun.shadow.camera.layers.enableAll();
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.35, 1.0);
    this.bloom.enabled = false;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const loop = () => {
      if (this.dirty) { this.dirty = false; this.composer.render(); }
      requestAnimationFrame(loop);
    };
    loop();
  }

  invalidate() { this.dirty = true; }

  setPhoto(img: HTMLImageElement | HTMLCanvasElement) {
    const old = this.bgMat.uniforms.map.value as THREE.Texture | null;
    old?.dispose();
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.bgMat.uniforms.map.value = tex;
    this.invalidate();
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.invalidate();
  }

  /**
   * 사인물 그룹에 자기 카메라를 붙인다 (P·pose = 그 사인물 영역의 투영). 레이어 1부터 순서대로 — 최대 31개, 넘으면 메인 카메라(레이어 0)로
   * 깊이 범위는 corners(벽면 mm) 의 깊이에서 정한다
   */
  addSignCamera(group: THREE.Object3D, P: number[], pose: CameraPose, corners: [number, number][]) {
    const idx = this.signCameras.length + 1;
    if (idx > 31) { group.traverse((o) => o.layers.set(0)); return; }
    group.traverse((o) => o.layers.set(idx));
    const cam = new THREE.PerspectiveCamera();
    this.configureCamera(cam, P, pose, corners.map(([x, y]) => [x, y] as [number, number]));
    this.signCameras.push({ camera: cam, layer: idx });
    this.invalidate();
  }

  clearSignCameras() { this.signCameras.length = 0; }

  /** P(3×4)·pose 를 카메라에 적용: 위치·회전은 포즈, 정점 변환은 P 와 똑같은 클립 행렬 */
  private configureCamera(cam: THREE.PerspectiveCamera, P: number[], pose: CameraPose, pts: [number, number][]) {
    const { R, t, imgW, imgH } = pose;
    const view = new THREE.Matrix4().set(R[0], R[1], R[2], t[0], -R[3], -R[4], -R[5], -t[1], -R[6], -R[7], -R[8], -t[2], 0, 0, 0, 1);
    view.invert().decompose(cam.position, cam.quaternion, cam.scale);
    cam.updateMatrixWorld();
    const depths = pts.map(([x, y]) => P[8] * x + P[9] * y + P[11]).filter((d) => d > 0);
    const dmin = Math.max(1e-6, Math.min(...depths) * 0.2), dmax = Math.max(...depths) * 5;
    const a = (dmax + dmin) / (dmax - dmin), b = (-2 * dmax * dmin) / (dmax - dmin);
    const row = (i: number) => [P[i * 4], P[i * 4 + 1], P[i * 4 + 2], P[i * 4 + 3]];
    const P0 = row(0), P1 = row(1), P2 = row(2);
    const m = new THREE.Matrix4().set(
      (2 / imgW) * P0[0] - P2[0], (2 / imgW) * P0[1] - P2[1], (2 / imgW) * P0[2] - P2[2], (2 / imgW) * P0[3] - P2[3],
      -(2 / imgH) * P1[0] + P2[0], -(2 / imgH) * P1[1] + P2[1], -(2 / imgH) * P1[2] + P2[2], -(2 / imgH) * P1[3] + P2[3],
      a * P2[0], a * P2[1], a * P2[2], a * P2[3] + b,
      P2[0], P2[1], P2[2], P2[3],
    );
    cam.projectionMatrix.copy(m).multiply(cam.matrixWorld);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }

  /**
   * 벽면 호모그래피에 정확히 맞는 3×4 투영(wallPlane.projectionFromPlane)을 Three 카메라에 적용.
   * 카메라 위치·회전은 셰이딩용으로 복원 포즈를 쓰고, 정점 변환은 projectionMatrix = M·matrixWorld 로 P 와 똑같게 맞춘다
   */
  applyProjection(P: number[], pose: CameraPose, wallW: number, wallH: number) {
    const { imgW, imgH } = pose;
    this.applyPose(pose, wallW, wallH); // 위치·회전·그림자·격자
    // 깊이 범위: 벽면 상자의 모서리 깊이에서
    const depths = [[0, 0], [wallW, 0], [wallW, wallH], [0, wallH]].map(([x, y]) => P[8] * x + P[9] * y + P[11]).filter((d) => d > 0);
    // 깊이는 H 정규화(h33=1) 때문에 ~1 근처의 단위 없는 값 — mm 가 아니므로 바닥값을 두면 안 된다 (두면 전부 near 에 잘림)
    const dmin = Math.max(1e-6, Math.min(...depths) * 0.2), dmax = Math.max(...depths) * 5;
    const a = (dmax + dmin) / (dmax - dmin), b = (-2 * dmax * dmin) / (dmax - dmin);
    // 클립 = [ (2/W)·P0 − P2 ; −(2/H)·P1 + P2 ; a·P2 + b ; P2 ]  (NDC x 오른쪽, y 위, z = a + b/깊이)
    const row = (i: number) => [P[i * 4], P[i * 4 + 1], P[i * 4 + 2], P[i * 4 + 3]];
    const P0 = row(0), P1 = row(1), P2 = row(2);
    const m = new THREE.Matrix4().set(
      (2 / imgW) * P0[0] - P2[0], (2 / imgW) * P0[1] - P2[1], (2 / imgW) * P0[2] - P2[2], (2 / imgW) * P0[3] - P2[3],
      -(2 / imgH) * P1[0] + P2[0], -(2 / imgH) * P1[1] + P2[1], -(2 / imgH) * P1[2] + P2[2], -(2 / imgH) * P1[3] + P2[3],
      a * P2[0], a * P2[1], a * P2[2], a * P2[3] + b,
      P2[0], P2[1], P2[2], P2[3],
    );
    this.camera.updateMatrixWorld();
    this.camera.projectionMatrix.copy(m).multiply(this.camera.matrixWorld);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.invalidate();
  }

  /** homography 로 복원한 포즈를 Three 카메라에 적용 */
  applyPose(pose: CameraPose, wallW: number, wallH: number) {
    const { R, t, f, imgW, imgH } = pose;
    // OpenCV 카메라(y 아래, z 앞) → Three 카메라(y 위, z 뒤) : diag(1,-1,-1)
    const view = new THREE.Matrix4().set(
      R[0], R[1], R[2], t[0],
      -R[3], -R[4], -R[5], -t[1],
      -R[6], -R[7], -R[8], -t[2],
      0, 0, 0, 1,
    );
    view.invert().decompose(this.camera.position, this.camera.quaternion, this.camera.scale);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(imgH / 2 / f));
    this.camera.aspect = imgW / imgH;
    // 주점이 중앙이 아니면(크롭 사진) 광축 중심의 가상 프레임에서 보이는 영역만 그린다
    if (pose.pp) this.camera.setViewOffset(imgW, imgH, imgW / 2 - pose.pp[0], imgH / 2 - pose.pp[1], imgW, imgH); else this.camera.clearViewOffset();
    const dist = this.camera.position.length() + Math.max(wallW, wallH) * 4;
    this.camera.near = 10;
    this.camera.far = dist * 4;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    this.wall = { w: wallW, h: wallH };
    this.wallShadow.scale.set(wallW * 3, wallH * 3, 1);
    this.wallShadow.position.set(wallW / 2, wallH / 2, 0);
    this.buildGrid();
    this.placeSun();
    this.invalidate();
  }

  private buildGrid() {
    this.grid.clear();
    const { w, h } = this.wall;
    const step = 1000;
    const pts: number[] = [];
    for (let x = 0; x <= w + 1e-6; x += step) pts.push(x, 0, 0, x, h, 0);
    for (let y = 0; y <= h + 1e-6; y += step) pts.push(0, y, 0, w, y, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x33ddff, transparent: true, opacity: 0.55 })));
    const border = new THREE.BufferGeometry().setFromPoints(
      [[0, 0], [w, 0], [w, h], [0, h], [0, 0]].map(([x, y]) => new THREE.Vector3(x, y, 0)),
    );
    this.grid.add(new THREE.Line(border, new THREE.LineBasicMaterial({ color: 0xffcc00 })));
    // 원점 축 — 가로 X 빨강, 높이 Z 파랑(위), 세로 Y 초록(벽 밖 = −Y 쪽을 그림) 과 1m 정육면체: 카메라가 맞는지 눈으로 확인
    const axis = (to: [number, number, number], color: number) => {
      const g2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...to)]);
      this.grid.add(new THREE.Line(g2, new THREE.LineBasicMaterial({ color, linewidth: 2 })));
    };
    axis([step, 0, 0], 0xff4d4d); axis([0, step, 0], 0x4da3ff); axis([0, 0, step], 0x3ddc84);
    const cube = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(step, step, step)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    cube.position.set(step / 2, step / 2, step / 2);
    this.grid.add(cube);
  }

  showGrid(v: boolean) { this.grid.visible = v; this.invalidate(); }

  private placeSun() {
    const { w, h } = this.wall;
    const span = Math.max(w, h) * 1.5;
    this.sun.position.set(w / 2 - span * 0.35, h / 2 + span * 0.8, span * 0.6);
    this.sun.target.position.set(w / 2, h / 2, 0);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -span;
    cam.right = cam.top = span;
    cam.near = 1;
    cam.far = span * 4;
    cam.updateProjectionMatrix();
  }

  setNight(night: boolean) {
    this.night = night;
    this.bgMat.uniforms.brightness.value = night ? 0.2 : 1;
    (this.bgMat.uniforms.tint.value as THREE.Color).setRGB(night ? 0.75 : 1, night ? 0.82 : 1, night ? 1.2 : 1);
    this.sun.intensity = night ? 0 : 2.2;
    this.hemi.intensity = night ? 0.08 : 1.0;
    this.scene.environmentIntensity = night ? 0.12 : 1;
    (this.wallShadow.material as THREE.ShadowMaterial).opacity = night ? 0 : 0.38;
    this.bloom.enabled = night;
    this.invalidate();
  }

  setSelection(obj: THREE.Object3D | null) {
    this.selection.visible = !!obj;
    if (obj) {
      obj.updateMatrixWorld(true);
      const mesh = obj.children.find((c) => c.userData.signId) ?? obj;
      this.selection.box.setFromObject(mesh);
    }
    this.invalidate();
  }

  /** 화면 좌표(px, host 기준) → 벽면(z=0) 위 mm 좌표 */
  pickWall(px: number, py: number): THREE.Vector3 | null {
    const ray = this.ray(px, py);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit) ? hit : null;
  }

  pickSign(px: number, py: number): string | null {
    const hits = this.ray(px, py).intersectObjects(this.signsRoot.children, true);
    const h = hits.find((x) => x.object.userData.signId);
    return h ? (h.object.userData.signId as string) : null;
  }

  /** 벽 좌표(mm) → 화면 좌표(px) */
  toScreen(p: THREE.Vector3): [number, number] {
    const v = p.clone().project(this.camera);
    const el = this.renderer.domElement;
    return [((v.x + 1) / 2) * el.clientWidth, ((1 - v.y) / 2) * el.clientHeight];
  }

  private ray(px: number, py: number) {
    const el = this.renderer.domElement;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((px / el.clientWidth) * 2 - 1, -(py / el.clientHeight) * 2 + 1), this.camera);
    return rc;
  }

  /** 원본 사진 해상도로 렌더링해 PNG 로 반환 */
  exportPng(imgW: number, imgH: number): string {
    const el = this.renderer.domElement;
    const prev = { w: el.clientWidth, h: el.clientHeight, dpr: this.renderer.getPixelRatio() };
    const k = Math.min(1, 4096 / Math.max(imgW, imgH));
    const grid = this.grid.visible, sel = this.selection.visible;
    this.grid.visible = this.selection.visible = false;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.round(imgW * k), Math.round(imgH * k), false);
    this.composer.setPixelRatio(1);
    this.composer.setSize(Math.round(imgW * k), Math.round(imgH * k));
    this.composer.render();
    const url = el.toDataURL('image/png');
    this.grid.visible = grid; this.selection.visible = sel;
    this.renderer.setPixelRatio(prev.dpr);
    this.resize(prev.w, prev.h);
    return url;
  }
}
