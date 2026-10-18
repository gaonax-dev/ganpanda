// 조합형 4단계: 정면도에서 정한 객체 위치를 3D·평면도 카드·PDF·사진 합성에 반영 (2026-10-16 사용자: "4단계 진행해")
import { describe, expect, it } from 'vitest';
import type { SignObject, SignPart } from '../../src/lib/core/model';
import { PART_COLOR, layoutParts, partsSvg } from '../../src/lib/core/partsLayout';
import { renderSpecOf } from '../../src/lib/core/render';
import { listSvg } from '../../src/lib/core/listSvg';
import { TEXT_CHAR_ASPECT } from '../../src/lib/core/frontView';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const channel: SignPart = { id: 'c', kind: 'channel', type: 'ch-front', items: [
  { id: 't1', kind: 'text', text: '바로바로', x: -1500, y: 100, h: 600 },
  { id: 't2', kind: 'text', text: '정육점', x: 1800, y: -200, h: 300 },
] };
const scashi: SignPart = { id: 's', kind: 'scashi', type: 'ch-rubber', options: { thickness: '20T' }, items: [{ id: 't3', kind: 'text', text: 'SINCE', x: 0, y: 350, h: 100 }] };
const sheet: SignPart = { id: 'h', kind: 'sheet', type: 'sh-print', on: 'frame', items: [{ id: 'i1', kind: 'image', image: { assetId: 'a1', name: 'logo.png' }, x: -2700, y: 0, h: 400, w: 400 }] };
const sign = obj({ productId: 'board-galva', widthMm: 6000, heightMm: 900, parts: [channel, scashi, sheet] });

describe('객체 배치 (사인물 mm → 그릴 곳, 왼쪽 위 기준·y 아래)', () => {
  it('사인물 6000×900 을 600×90 에 그리면 1/10, 중심 기준을 왼쪽 위 기준으로', () => {
    const l = layoutParts(sign, 6000, 900, 600, 90);
    expect(l.map((x) => x.id)).toEqual(['i1', 't1', 't2', 't3']); // 시트(아래)부터, 입체 글자는 뒤에 (layerOrder, 2026-10-17)
    const t1 = l.find((x) => x.id === 't1')!;
    const w = 4 * 600 * TEXT_CHAR_ASPECT / 10;
    expect(t1).toMatchObject({ partKind: 'channel', kind: 'text', text: '바로바로', color: PART_COLOR.channel });
    expect(t1.w).toBeCloseTo(w);
    expect(t1.h).toBeCloseTo(60);
    expect(t1.x).toBeCloseTo(300 - 150 - w / 2);
    expect(t1.y).toBeCloseTo(45 - 10 - 30);
  });
  it('치수가 없으면 배치하지 않는다 (위치 기준이 없음)', () => {
    expect(layoutParts(obj({ parts: [channel] }), 0, 0, 100, 100)).toEqual([]);
  });
  it('옛 사인물(parts 없음)은 배치하지 않는다 — 문구는 가운데 하나라 위치 정보가 없음', () => {
    expect(layoutParts(obj({ productId: 'board-galva', text: '간판', options: { channel: '전광 채널' }, widthMm: 3000, heightMm: 600 }), 3000, 600, 300, 60)).toEqual([]);
  });
  it('SVG 조각: 글자는 상자 폭에 맞춘 text, 그림은 image (주소가 있을 때만)', () => {
    const svg = partsSvg(layoutParts(sign, 6000, 900, 600, 90), (l) => (l.id === 'i1' ? 'data:image/png;base64,AA' : undefined));
    expect(svg).toContain('>바로바로</text>');
    expect(svg).toMatch(/textLength="[\d.]+"/);
    expect(svg).toContain('xlink:href="data:image/png;base64,AA" href="data:image/png;base64,AA"'); // 일러스트레이터는 xlink:href 만 읽는다 (2026-10-18)
    expect(svg).toContain(`fill="${PART_COLOR.channel}"`);
  });
});

describe('3D·사진 합성 사양 (renderSpecOf)', () => {
  const place = { cx: 0, cy: 0, w: 3000, h: 450 }; // 입력 치수의 절반 크기로 그려진 자리
  it('채널·스카시 글자는 객체마다 자기 자리에 입체로 (그린 자리 비율로 줄임), 구성 요소별 두께·조명', () => {
    const s = renderSpecOf(sign, place)!;
    expect(s.kind).toBe('lightbox');
    expect(s.letters).toBeUndefined();
    expect(s.letterItems).toEqual([
      expect.objectContaining({ text: '바로바로', x: -750, y: 50, heightMm: 300, lighting: 'front', depthMm: 80 }),
      expect.objectContaining({ text: '정육점', x: 900, y: -100, heightMm: 150, lighting: 'front' }),
      expect.objectContaining({ text: 'SINCE', x: 0, y: 175, heightMm: 50, lighting: 'none', depthMm: 20 }),
    ]);
  });
  it('그림·시트 객체는 상자 앞면에 그린다 (가로·세로도 자리 비율로)', () => {
    const s = renderSpecOf(sign, place)!;
    expect(s.faceItems).toEqual([{ id: 'i1', kind: 'image', x: -1350, y: 0, w: 200, h: 200, color: PART_COLOR.sheet }]);
  });
  it('몸통 없음 + 구성 요소 글자 = 상자 없이 글자만 (bodyless), 자리 그대로', () => {
    const s = renderSpecOf(obj({ productId: 'body-none', widthMm: 6000, heightMm: 900, parts: [channel] }), place)!;
    expect(s.bodyless).toBe(true);
    expect(s.letterItems).toHaveLength(2);
  });
  it('글자 객체가 비었으면 입체 글자 없음', () => {
    const empty: SignPart = { ...channel, items: [{ id: 'e', kind: 'text', text: ' ', x: 0, y: 0, h: 300 }] };
    expect(renderSpecOf(obj({ productId: 'board-galva', widthMm: 6000, heightMm: 900, parts: [empty] }), place)!.letterItems).toBeUndefined();
  });
});

describe('전개도 PDF (listSvg) 에 객체', () => {
  it('카드에 객체 SVG 조각을 카드 축척으로 넣는다', () => {
    const svg = listSvg({ title: 't', cards: [{ id: 'o', name: 'A', x: 0, y: 0, w: 6000, h: 900, lines: [], items: layoutParts(sign, 6000, 900, 6000, 900) }] });
    expect(svg).toContain('data-items="o"');
    expect(svg).toContain('>바로바로</text>');
  });
});
