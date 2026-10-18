// 사양 글 → 배치·중첩 (2026-10-19, docs/features/spec-vocabulary.md V4 / composition-layers 0절): 따옴표 글자·로고·위치어·줄 나눔·"채널 위에 시트"
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { applySpecItems, parseSpecText } from '../../src/lib/core/specText';
import { partsOf } from '../../src/lib/core/parts';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });

describe('배치 어휘 해석', () => {
  it('따옴표 글자 + 높이 + 위치어 → 글자 객체 항목 (채널에), 로고 + 크기 + 위치어 → 그림 자리 항목 (시트에)', () => {
    const items = parseSpecText('갈바 3000x600 전광채널 "카페" 450 왼쪽 로고 300 오른쪽', obj({}));
    const text = items.find((i) => i.kind === 'place' && i.item === 'text');
    expect(text).toMatchObject({ kind: 'place', item: 'text', text: '카페', h: 450, where: 'left', into: 'channel' });
    const logo = items.find((i) => i.kind === 'place' && i.item === 'image');
    expect(logo).toMatchObject({ kind: 'place', item: 'image', h: 300, where: 'right', into: 'sheet' });
    expect(items.some((i) => i.kind === 'note')).toBe(false); // 다 알아봤다
    expect(text!.label).toBe('글자 "카페" 450mm 왼쪽 (채널)');
  });
  it('"N줄"은 글을 /·공백으로 나눠 줄마다 글자 객체, 위에서 아래로', () => {
    const items = parseSpecText('"바로바로 / 정육점" 2줄 400 가운데', obj({ productId: 'board-galva' }));
    const lines = items.filter((i) => i.kind === 'place' && i.item === 'text');
    expect(lines.map((l) => (l as { text: string }).text)).toEqual(['바로바로', '정육점']);
    expect(lines.map((l) => (l as { line?: number }).line)).toEqual([0, 1]);
  });
  it('스카시를 말했으면 글자는 스카시에, "채널 위에 시트"면 시트가 채널 앞면에', () => {
    const sc = parseSpecText('포맥스 고무스카시 "OPEN" 200', obj({}));
    expect(sc.find((i) => i.kind === 'place')).toMatchObject({ item: 'text', into: 'scashi' });
    const on = parseSpecText('갈바 전광채널 "카페" 채널 위에 UV시트 로고 300', obj({}));
    expect(on.find((i) => i.kind === 'place' && i.item === 'image')).toMatchObject({ into: 'sheet', on: 'channel' });
    expect(on.some((i) => i.kind === 'note')).toBe(false);
  });
});

describe('배치 적용: 자리가 계산되어 레이어 트리·거울에 들어간다', () => {
  it('왼쪽 글자·오른쪽 로고가 간판 크기에 맞게 놓이고, 시트는 채널 앞면에', () => {
    const o = obj({ productId: 'board-galva' });
    const items = parseSpecText('3000x600 전광채널 "카페" 450 왼쪽 채널 위에 UV시트 로고 300 오른쪽', o);
    const patch = applySpecItems(o, items);
    const next = { ...o, ...patch } as SignObject;
    expect(next.widthMm).toBe(3000);
    const parts = partsOf(next);
    const ch = parts.find((p) => p.kind === 'channel')!, sh = parts.find((p) => p.kind === 'sheet')!;
    expect(ch.type).toBe('ch-front');
    expect(ch.items[0]).toMatchObject({ kind: 'text', text: '카페', h: 450 });
    expect(ch.items[0].x).toBeLessThan(-500); // 왼쪽 (−1500 + 여백 + 상자 절반)
    expect(sh.on).toBe(ch.id); // 채널 앞면
    expect(sh.items[0]).toMatchObject({ kind: 'image', h: 300, w: 300 });
    expect(sh.items[0].x).toBeGreaterThan(500); // 오른쪽
    expect(next.layers!.find((l) => l.id === ch.id)!.children.some((c) => c.id === sh.id)).toBe(true); // 트리에서도 채널의 자식
  });
  it('2줄은 위·아래로 쌓이고 가운데', () => {
    const o = obj({ productId: 'board-galva', widthMm: 3000, heightMm: 900, parts: [] });
    const items = parseSpecText('전광채널 "바로바로 / 정육점" 2줄 300 가운데', o);
    const next = { ...o, ...applySpecItems(o, items) } as SignObject;
    const ch = partsOf(next).find((p) => p.kind === 'channel')!;
    expect(ch.items.map((i) => [i.text, i.x])).toEqual([['바로바로', 0], ['정육점', 0]]);
    expect(ch.items[0].y).toBeGreaterThan(ch.items[1].y); // 첫 줄이 위
  });
  it('이미 채널이 있으면 그 채널에 글자를 더한다 (새 채널을 만들지 않음)', () => {
    const o = obj({ productId: 'board-galva', widthMm: 3000, heightMm: 900 });
    const first = { ...o, ...applySpecItems(o, parseSpecText('후광채널 "카페" 400', o)) } as SignObject;
    const second = { ...first, ...applySpecItems(first, parseSpecText('"OPEN" 200 아래', first)) } as SignObject;
    const chs = partsOf(second).filter((p) => p.kind === 'channel');
    expect(chs).toHaveLength(1);
    expect(chs[0].items.map((i) => i.text)).toEqual(['카페', 'OPEN']);
    expect(chs[0].items[1].y).toBeLessThan(0); // 아래
  });
});
