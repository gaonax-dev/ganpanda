// 윤곽의 원본 채움색 (#rrggbb, 2026-11-07 "추출한 패스의 컬러는 원본에 따르게 해야됨") — three Shape 에 자리가 없어 따로.
// SVG 해석(vectorShapes, SVGLoader)과 나눠 둔다: 3D(sim/signs)가 색만 읽으려고 SVGLoader 를 첫 화면 번들에 끌어오지 않게
import type * as THREE from 'three';

const SHAPE_COLOR = new WeakMap<THREE.Shape, string>();
export const shapeColor = (s: THREE.Shape): string | undefined => SHAPE_COLOR.get(s);
export const setShapeColor = (s: THREE.Shape, c: string) => void SHAPE_COLOR.set(s, c);
