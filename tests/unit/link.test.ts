import { describe, expect, it } from 'vitest';
import { Project } from '../../src/lib/core/project';
import { copiesOf, resolveLinks } from '../../src/lib/core/link';
import { quoteProject } from '../../src/lib/core/quote';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';

const quad = [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][];
const quad2 = [[5, 5], [20, 6], [19, 15], [6, 14]] as [number, number][];

function setup() {
  const p = new Project();
  const front = p.addPhoto({ name: '정면', assetId: 'a1', w: 1600, h: 1100, x: 0, y: 0, width: 1600 });
  const side = p.addPhoto({ name: '측면', assetId: 'a2', w: 1600, h: 1100, x: 0, y: 0, width: 1600 });
  const master = p.addObject({ photoId: front, name: '메인 간판', shape: 'rect', quad, sheetIds: ['sh-print'], widthMm: 4000, heightMm: 1000, productId: 'board-acp', text: '간판다' });
  const copy = p.addObject({ photoId: side, name: '사인물 2', shape: 'rect', quad: quad2, sheetIds: [] });
  return { p, front, side, master, copy };
}

describe('여러 사진의 같은 사인물 (sameAs 연결)', () => {
  it('연결하면 규격(이름·종류·치수·문구·시트)은 원본 것, 위치(사진·영역)는 자기 것', () => {
    const { p, master, copy, side } = setup();
    p.linkObject(copy, master);
    const all = resolveLinks(p.allObjects());
    const c = all.find((o) => o.id === copy)!;
    expect(c.sameAs).toBe(master);
    expect(c.name).toBe('메인 간판');
    expect(c.widthMm).toBe(4000); expect(c.productId).toBe('board-acp'); expect(c.text).toBe('간판다'); expect(c.sheetIds).toEqual(['sh-print']);
    expect(c.photoId).toBe(side); expect(c.quad).toEqual(quad2);
    expect(copiesOf(master, all).map((o) => o.id)).toEqual([copy]);
  });

  it('연결된 영역의 규격을 고치면 원본이 바뀌고, 위치·기준 체크는 자기 것만 바뀐다', () => {
    const { p, master, copy } = setup();
    p.linkObject(copy, master);
    p.updateObject(copy, { widthMm: 4200, text: '간판다 카페', refV: true, quad });
    expect(p.object(master)!.widthMm).toBe(4200);
    expect(p.object(master)!.text).toBe('간판다 카페');
    expect(p.object(master)!.refV).toBeUndefined();
    expect(p.object(copy)!.refV).toBe(true);
    expect(p.object(copy)!.quad).toEqual(quad);
  });

  it('견적·리스트에는 원본 하나만 (연결된 영역은 제외)', () => {
    const { p, master, copy } = setup();
    p.linkObject(copy, master);
    const all = resolveLinks(p.allObjects());
    const signs = all.filter((o) => !o.sameAs);
    expect(signs.map((o) => o.id)).toEqual([master]);
    const q = quoteProject(signs, DEFAULT_PRICES);
    expect(q.lines.filter((l) => l.objectId === copy)).toHaveLength(0);
  });

  it('연결된 영역에 연결하면 그 원본으로 바로 연결된다 (사슬 없음)', () => {
    const { p, master, copy, side } = setup();
    p.linkObject(copy, master);
    const third = p.addObject({ photoId: side, name: '사인물 3', shape: 'rect', quad, sheetIds: [] });
    p.linkObject(third, copy);
    expect(p.object(third)!.sameAs).toBe(master);
  });

  it('연결 해제하면 그 시점의 규격을 복사해 독립 사인물이 된다', () => {
    const { p, master, copy } = setup();
    p.linkObject(copy, master);
    p.unlinkObject(copy);
    const c = p.object(copy)!;
    expect(c.sameAs).toBeUndefined();
    expect(c.name).toBe('메인 간판'); expect(c.widthMm).toBe(4000);
    p.updateObject(copy, { widthMm: 1 });
    expect(p.object(master)!.widthMm).toBe(4000);
  });

  it('원본을 지우면 첫 연결 영역이 원본이 되고 대화도 넘어간다', () => {
    const { p, master, copy, side } = setup();
    p.linkObject(copy, master);
    const third = p.addObject({ photoId: side, name: '사인물 3', shape: 'rect', quad, sheetIds: [] });
    p.updateObject(third, { createdAt: Date.now() + 1000 }); // 같은 ms 에 만들어져도 copy 가 먼저
    p.linkObject(third, master);
    p.addMessage(master, '제작자', '안녕하세요');
    p.removeObject(master);
    expect(p.object(copy)!.sameAs).toBeUndefined();
    expect(p.object(copy)!.name).toBe('메인 간판');
    expect(p.object(third)!.sameAs).toBe(copy);
    expect(p.messagesOf(copy)).toHaveLength(1);
    expect(p.messagesOf(master)).toHaveLength(0);
  });

  it('원본이 없어진 연결은 독립 영역으로 본다', () => {
    const { p, copy } = setup();
    p.updateObject(copy, { sameAs: 'ghost' });
    const c = resolveLinks(p.allObjects()).find((o) => o.id === copy)!;
    expect(c.sameAs).toBeUndefined();
    expect(c.name).toBe('사인물 2');
  });
});
