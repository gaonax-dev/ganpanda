// 장면을 버릴 때 그림 캔버스를 바로 비운다 (2026-10-29 사용자: 아이폰 "3d는 화면 팬에서 … 반복에서 나타났음", 안드로이드·맥 크롬은 괜찮음).
// texture.dispose() 는 GPU 쪽만 놓는다 — 사인물 앞면·빛 번짐 캔버스(최대 1536px ≈ 9MB)는 가비지 수거 때까지 남고, 아이폰은 그게 늦다.
import type * as THREE from 'three';

const isCanvas = (x: unknown): x is { width: number; height: number } =>
  !!x && typeof (x as { getContext?: unknown }).getContext === 'function' && typeof (x as { width?: unknown }).width === 'number';

/** root 아래 메시 재질의 텍스처 그림이 캔버스면 크기를 0 으로 (dispose 와 함께 부른다) */
export function releaseTextures(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      for (const v of Object.values(mat)) {
        const img = (v as THREE.Texture | null)?.isTexture ? (v as THREE.Texture).image : undefined;
        if (isCanvas(img)) { img.width = 0; img.height = 0; }
      }
    }
  });
}
