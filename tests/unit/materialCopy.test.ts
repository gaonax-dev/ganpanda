import { describe, expect, it } from 'vitest';
import { materialPatch } from '../../src/lib/core/parts';
import type { SignObject, SignPart } from '../../src/lib/core/model';

// 2026-10-23 사용자: "다중선택 메뉴에서 정리는 선택해제 그리고 재질복제(마지막선택 사인물의 재질로 일관변경 단 사이즈는 유지)" → "두께도 같이 변경"
const sign = (o: Partial<SignObject>): SignObject => ({ id: 'x', photoId: 'p', name: 'n', shape: 'rect', quad: [], sheetIds: [], ...o } as SignObject);
const ch = (items: SignPart['items'], options: SignPart['options'] = {}): SignPart => ({ id: 'ch' + items.length, kind: 'channel', type: 'ch-front', options, items });

describe('재질복제', () => {
  const src = sign({ productId: 'board-galva', options: { paintSystem: '기본색', paintCode: '검정' }, sheetIds: ['sh-cut'], depthMm: 120, letter3d: { depthMm: 90 } as never, widthMm: 3000, heightMm: 600, text: '원본',
    parts: [{ ...ch([{ id: 't', kind: 'text', text: '원본', x: 1000, y: 100, h: 300 }], { bodySystem: '직접', bodyCode: '#ff0000' }), stack: [{ id: 'l', material: 'galva', thickness: 1.2 }] }] });

  it('종류·옵션·시트·두께는 마지막 선택 것으로, 가로·세로·이름·문구는 그대로', () => {
    const dst = sign({ productId: 'board-flex', widthMm: 1500, heightMm: 300, depthMm: 60, name: '대상', text: '대상' });
    const p = materialPatch(src, dst);
    expect(p).toMatchObject({ productId: 'board-galva', options: { paintCode: '검정' }, sheetIds: ['sh-cut'], depthMm: 120, letter3d: { depthMm: 90 } });
    for (const k of ['widthMm', 'heightMm', 'name', 'text', 'quad']) expect(p).not.toHaveProperty(k);
  });

  it('구성 요소: 재료·옵션은 원본, 글자·그림은 대상 것을 유지 — 대상에 없으면 원본 것을 대상 크기에 맞춰', () => {
    const dst = sign({ widthMm: 1500, heightMm: 300, parts: [ch([{ id: 'd', kind: 'text', text: '대상글자', x: -200, y: 0, h: 150 }])] });
    const [p] = materialPatch(src, dst).parts!;
    expect(p).toMatchObject({ kind: 'channel', type: 'ch-front', options: { bodyCode: '#ff0000' }, stack: [{ material: 'galva' }] });
    expect(p.items).toEqual([{ id: 'd', kind: 'text', text: '대상글자', x: -200, y: 0, h: 150 }]);
    const empty = sign({ widthMm: 1500, heightMm: 300 });
    const [q] = materialPatch(src, empty).parts!;
    expect(q.items[0]).toMatchObject({ text: '원본', x: 500, y: 50, h: 150 }); // 절반 크기
  });
});
