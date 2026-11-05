// @vitest-environment happy-dom
// 일러스트 패스 → 입체 윤곽 (2026-11-05 사용자: "일러스트 패스로 입체 사인물이 가능한가?" → "내가 디자이너야 사인물에 각각의 디자인이 연결되어야해 … 일러스트 레이어를 생성하고 이걸 내보내서 자동으로 간판다에서 보여질 수 있게")
import { describe, expect, it } from 'vitest';
import { svgShapes } from '../../src/lib/core/vectorShapes';

// 대지 = 300×100pt, 안에 사각형(10,10 ~ 110,90)과 구멍 있는 'O'(원 안에 원) — 일러스트 SVG 내보내기 모양
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" width="300" height="100">
  <rect x="10" y="10" width="100" height="80" style="fill:#e00"/>
  <path fill-rule="evenodd" d="M200,10 A40,40 0 1,1 199.9,10 Z M200,30 A20,20 0 1,0 200.1,30 Z" fill="#00f"/>
  <path d="M0,0 L300,100" stroke="#000" fill="none"/>
</svg>`;

describe('svgShapes — SVG(대지 크기) → 사인물 상자 mm 의 윤곽 (가운데 원점, 위 +)', () => {
  it('채운 패스만, 구멍은 구멍으로, 대지를 상자(3000×1000mm)에 맞춘다', () => {
    const shapes = svgShapes(SVG, { w: 3000, h: 1000 });
    expect(shapes.length).toBe(2); // 사각형 + O (선만 있는 패스는 뺀다)
    const pts = (s: (typeof shapes)[number]) => s.getPoints(8);
    const rect = shapes.find((s) => s.holes.length === 0)!;
    const xs = pts(rect).map((p) => p.x), ys = pts(rect).map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-1400, 0); // (10/300)·3000 − 1500
    expect(Math.max(...xs)).toBeCloseTo(-400, 0);
    expect(Math.max(...ys)).toBeCloseTo(400, 0); // 위 +: 500 − (10/100)·1000
    expect(Math.min(...ys)).toBeCloseTo(-400, 0);
    const o = shapes.find((s) => s.holes.length === 1)!;
    expect(o).toBeTruthy();
  });
  it('viewBox 가 없으면 width·height, 채운 것이 없으면 빈 배열', () => {
    expect(svgShapes('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect x="0" y="0" width="100" height="50"/></svg>', { w: 200, h: 100 }).length).toBe(1);
    expect(svgShapes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0,0 L10,10" stroke="#000" fill="none"/></svg>', { w: 1, h: 1 })).toEqual([]);
  });
});
