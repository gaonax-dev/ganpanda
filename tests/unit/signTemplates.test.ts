import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { SIGN_TEMPLATES, templatesFor } from '../../src/lib/core/signTemplates';
import { categoryOf } from '../../src/lib/core/catalog';
import { partsOf } from '../../src/lib/core/parts';
import { surfaceOf } from '../../src/lib/core/components';
import { presetOf } from '../../src/lib/core/partPresets';

// 완성품 퀵 (2026-10-23 사용자: "퀵에서는 간판을 선택하고 사진중에 하나를 선택 … 해당 상황은 완전제품이다 … 완성된 상태에 따라 글자가 2가지 3가지가 될수 있어.
// 그냥 이전의 완성품 구성에 변경 가능한 필드를 하나씩 대입해서 완성하는 거이야. 중간에 멈추면 거기까지 완성이다.")
const blank = (o: Partial<SignObject> = {}): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, productId: 'board-flex', ...o });
const run = (o: SignObject, patch: Partial<SignObject>): SignObject => ({ ...o, ...patch });

describe('완성품 퀵', () => {
  it('간판 분류의 완성품 = 채널 15종 사진 (지금은 채널만)', () => {
    const ts = templatesFor('sign');
    expect(ts).toHaveLength(15);
    expect(ts[0].img).toBe('/channel-types/01.webp');
    expect(templatesFor('banner')).toEqual([]);
    expect(SIGN_TEMPLATES.every((t) => t.group === 'sign')).toBe(true);
  });

  it('고르면 완성품 구성이 통째로: 몸통 없음 + 그 채널 묶음 + 글자 하나 (분류는 간판 그대로)', () => {
    const t = templatesFor('sign').find((x) => x.label === '캡 전후광 채널')!;
    const o = run(blank({ heightMm: 600 }), t.apply(blank({ heightMm: 600 })));
    expect(o.productId).toBe('body-none');
    expect(categoryOf(o)).toBe('sign');
    const ps = partsOf(o);
    expect(ps).toHaveLength(1);
    expect(presetOf(ps[0])?.label).toBe('캡 전후광 채널');
    expect(ps[0].items).toHaveLength(1);
    expect(ps[0].items[0]).toMatchObject({ kind: 'text', text: '간판' });
    expect(ps[0].items[0].h).toBeCloseTo(480); // 간판 높이의 80%
  });

  it('바꿀 칸: 색(완성품에 있는 것만) → 글자 내용. 칸을 채우면 그 자리만 바뀐다', () => {
    const t = templatesFor('sign').find((x) => x.label === '캡 전후광 채널')!;
    let o = run(blank(), t.apply(blank()));
    const slots = t.slots(o);
    expect(slots.map((s) => s.label)).toEqual(['몸통(옆면)색', '글자(앞면)색', '캡색', '글자']);
    expect(slots.map((s) => s.kind)).toEqual(['color', 'color', 'color', 'text']);
    expect(slots[1].read(o)).toMatch(/^#/); // 빨강
    o = run(o, slots[1].write(o, '#00aa00'));
    expect(surfaceOf(partsOf(o)[0]).face).toBe('#00aa00');
    o = run(o, slots[3].write(o, '간판다'));
    expect(partsOf(o)[0].items[0].text).toBe('간판다');
    expect(slots[3].read(o)).toBe('간판다');
    // 미러 마감 완성품은 몸통 색 칸이 없다
    const mirror = templatesFor('sign').find((x) => x.label === '오사이 용접 채널')!;
    expect(mirror.slots(run(blank(), mirror.apply(blank()))).map((s) => s.label)).not.toContain('몸통(옆면)색');
  });

  it('완성품을 고른 뒤 글자가 여러 개면 칸도 글자 1·2…', () => {
    const t = templatesFor('sign')[0];
    let o = run(blank(), t.apply(blank()));
    const p = partsOf(o)[0];
    o = { ...o, parts: [{ ...p, items: [...p.items, { ...p.items[0], id: 't2', text: '둘째' }] }], layers: undefined };
    expect(t.slots(o).filter((s) => s.kind === 'text').map((s) => s.label)).toEqual(['글자 1', '글자 2']);
  });
});
