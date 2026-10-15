// 사인물 복사·붙여넣기·복제 (2026-10-15 사용자: "카피 페이스트 복제등이 필요하다")
import { describe, expect, it } from 'vitest';
import { clipOf, pastedObject } from '../../src/lib/core/clipboard';
import type { SignObject } from '../../src/lib/core/model';

const photo = { id: 'p1', w: 4000, h: 3000 };
const sign = (o: Partial<SignObject> = {}): SignObject => ({
  id: 's1', photoId: 'p1', name: '간판', shape: 'rect', quad: [[1000, 1000], [2000, 1000], [2000, 1400], [1000, 1400]], sheetIds: ['sh-cut'], createdAt: 1,
  productId: 'board-flex', widthMm: 4000, heightMm: 900, depthMm: 150, text: '바로바로', options: { sides: '양면' }, note: '배선 왼쪽',
  design: { sourceId: 'src1', page: 0, crop: { x: 0, y: 0, w: 10, h: 10 } } as SignObject['design'], designHistory: [], listX: 10, listY: 20, faceAxis: 'x', ...o,
});
const has = (ids: string[]) => (id: string) => ids.includes(id);

describe('복사: 규격·모양을 담고, 위치·연결·이력은 담지 않는다', () => {
  it('규격(종류·치수·문구·옵션·메모·디자인)과 모양(외곽선·둥글기)을 담는다', () => {
    const c = clipOf(sign(), undefined, photo);
    expect(c.fields).toMatchObject({ name: '간판', productId: 'board-flex', widthMm: 4000, heightMm: 900, depthMm: 150, text: '바로바로', options: { sides: '양면' }, note: '배선 왼쪽', sheetIds: ['sh-cut'], shape: 'rect' });
    expect(c.fields.quad).toHaveLength(4);
    for (const k of ['id', 'createdAt', 'photoId', 'sameAs', 'listX', 'listY', 'designHistory']) expect(k in c.fields).toBe(false);
  });
  it('다른 사진의 같은 사인물(연결)을 복사하면 원본 규격으로, 연결은 끊긴 새 사인물', () => {
    const master = sign({ id: 'm', name: '원본', widthMm: 5000 });
    const c = clipOf(sign({ id: 'c', name: '원본', sameAs: 'm', widthMm: undefined }), master, photo);
    expect(c.fields.widthMm).toBe(5000);
    expect('sameAs' in c.fields).toBe(false);
  });
});

describe('붙여넣기', () => {
  const c = clipOf(sign(), undefined, photo);
  it('같은 사진: 이름에 "복사", 조금 비켜(사진 폭의 3% × 몇 번째) 놓고, 정면 축도 그대로', () => {
    const a = pastedObject(c, photo, 1, has(['src1']));
    expect(a.photoId).toBe('p1');
    expect(a.name).toBe('간판 복사');
    expect(a.quad[0]).toEqual([1120, 1120]);
    expect(pastedObject(c, photo, 2, has(['src1'])).quad[0]).toEqual([1240, 1240]);
    expect(a.faceAxis).toBe('x');
    expect(a.design?.sourceId).toBe('src1');
  });
  it('크기가 다른 사진: 비율대로 옮기고, 정면 축·박스 방향은 그 사진의 것이 아니라 뺀다', () => {
    const a = pastedObject(c, { id: 'p2', w: 2000, h: 1500 }, 0, has(['src1']));
    expect(a.quad[0]).toEqual([500, 500]);
    expect(a.faceAxis).toBeUndefined();
  });
  it('사진 밖으로 나가면 안으로 들여 놓는다', () => {
    const edge = clipOf(sign({ quad: [[3500, 2600], [3990, 2600], [3990, 2990], [3500, 2990]] }), undefined, photo);
    const a = pastedObject(edge, photo, 3, has([]));
    expect(Math.max(...a.quad.map((p) => p[0]))).toBeLessThanOrEqual(4000);
    expect(Math.max(...a.quad.map((p) => p[1]))).toBeLessThanOrEqual(3000);
  });
  it('디자인 소스가 없는 프로젝트에 붙이면 디자인은 뺀다', () => {
    expect(pastedObject(c, photo, 1, has([])).design).toBeUndefined();
  });
});
