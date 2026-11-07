// PDF 레이어별 벡터 (2026-11-07 사용자: "pdf를 직접 편집가능하다면 굿이 path를 따로 둘 이유가 없고 연결된 pdf를 통해 path를 추출해 바로 연결 후 3d로 구현할 수 있겠는데" → 레이어로 고르기)
import { describe, expect, it } from 'vitest';
import { layerSvg, pdfLayerVectors, PDF_OPS } from '../../src/lib/core/pdfVectors';

const O = PDF_OPS;
const D = { moveTo: 0, lineTo: 1, curveTo: 2, quad: 3, close: 4 };
const rect = (x: number, y: number, w: number, h: number) => new Float32Array([D.moveTo, x, y, D.lineTo, x + w, y, D.lineTo, x + w, y + h, D.lineTo, x, y + h, D.close]);
const names: Record<string, string> = { oc1: '받은 이미지', oc2: '디자인', oc3: '채널' };
const ocName = (id: unknown) => names[String(id)] ?? null;
const view: [number, number, number, number] = [0, 0, 200, 100]; // 페이지 200×100pt

describe('pdfLayerVectors — 그리기 명령을 따라 레이어(OC)별로 채운 경로만', () => {
  it('레이어별로 모으고, 페이지 좌표(위 → 아래)로, 짝홀 채우기 구분, 선만 있는 경로·클립은 뺀다', () => {
    const fn = [O.beginMarkedContentProps, O.constructPath, O.endMarkedContent, O.beginMarkedContentProps, O.constructPath, O.constructPath, O.constructPath, O.endMarkedContent];
    const args = [['OC', 'oc2'], [O.fill, [rect(0, 0, 200, 100)], null], [], ['OC', { type: 'OCG', id: 'oc3' }], [O.eoFill, [rect(10, 20, 30, 40)], null], [O.stroke, [rect(0, 0, 5, 5)], null], [O.endPath, [rect(0, 0, 1, 1)], null], []];
    const L = pdfLayerVectors(fn, args, ocName, view);
    expect(L.get('디자인')!.paths).toEqual([{ d: 'M0,100L200,100L200,0L0,0Z', evenOdd: false }]);
    expect(L.get('채널')!.paths).toEqual([{ d: 'M10,80L40,80L40,40L10,40Z', evenOdd: true }]);
    expect(L.get('채널')!.marks).toBe(2); // 채움 + 선
  });
  it('변환(cm)·저장/복원·그룹(Form) 행렬을 적용하고, 곡선도', () => {
    const fn = [O.beginMarkedContentProps, O.save, O.transform, O.paintFormXObjectBegin, O.constructPath, O.paintFormXObjectEnd, O.restore, O.constructPath, O.endMarkedContent];
    const curve = new Float32Array([D.moveTo, 0, 0, D.curveTo, 1, 2, 3, 4, 5, 6, D.quad, 7, 8, 9, 10, D.close]);
    const args = [['OC', 'oc3'], [], [2, 0, 0, 2, 10, 10], [[1, 0, 0, 1, 5, 0], null], [O.fill, [curve], null], [], [], [O.fill, [rect(0, 0, 1, 1)], null], []];
    const p = pdfLayerVectors(fn, args, ocName, view).get('채널')!.paths;
    // (x,y) → Form(+5,0) → cm(×2, +10) → 페이지 위 → 아래(100 - y)
    expect(p[0].d).toBe('M20,90C22,86 26,82 30,78Q34,74 38,70Z');
    expect(p[1].d).toBe('M0,100L1,100L1,99L0,99Z'); // 복원 뒤 원래 좌표
  });
  it('글자(윤곽선 아님)·그림·레이어 밖 내용도 센다 — 비었는지·윤곽선 안내용', () => {
    const fn = [O.beginMarkedContentProps, O.showText, O.endMarkedContent, O.beginMarkedContentProps, O.paintImageXObject, O.endMarkedContent, O.constructPath];
    const args = [['OC', 'oc3'], [[]], [], ['OC', 'oc1'], ['img'], [], [O.fill, [rect(0, 0, 1, 1)], null]];
    const L = pdfLayerVectors(fn, args, ocName, view);
    expect(L.get('채널')).toMatchObject({ texts: 1, marks: 1, paths: [] });
    expect(L.get('받은 이미지')!.marks).toBe(1);
    expect(L.get('')!.paths).toHaveLength(1); // 레이어 없는 내용
  });
});

describe('layerSvg — 레이어 벡터 → SVG (3D 입체 svgShapes 가 읽는 모양)', () => {
  it('viewBox = 페이지(pt), 채운 경로, 짝홀 규칙', () => {
    const svg = layerSvg([{ d: 'M0,0L1,0L1,1Z', evenOdd: true }, { d: 'M2,2L3,2L3,3Z', evenOdd: false }], 200, 100);
    expect(svg).toContain('viewBox="0 0 200 100"');
    expect(svg).toContain('<path d="M0,0L1,0L1,1Z" fill="#000" fill-rule="evenodd"/>');
    expect(svg).toContain('<path d="M2,2L3,2L3,3Z" fill="#000"/>');
  });
});
