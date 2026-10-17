// 사양 글 → 칩 (2026-10-17 사용자: "사이즈 작성하고 다음줄에 텍스트로 사용자가 입력하면 퀵설정과 같은 요소가 생성되게",
// "글은 해당 내용을 대화상자에서 체킹하고 적용하면 없어지게")
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { applySpecItems, parseSpecText } from '../../src/lib/core/specText';
import { quickSpecOf } from '../../src/lib/core/quickSpec';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const kinds = (t: string) => parseSpecText(t).map((i) => `${i.kind}:${'value' in i ? i.value : 'id' in i ? i.id : 'w' in i ? `${i.w}×${i.h}` : 'mm' in i ? i.mm : i.label}`);

describe('사양 글 해석 (사전 매칭, 결정적)', () => {
  it('갈바 흰색 채널 갈색 후광 4000K → 몸통·몸통 색·채널·채널 색·LED', () => {
    expect(kinds('갈바 흰색 채널 갈색 후광 4000K')).toEqual(['product:board-galva', 'bodyColor:흰색', 'channel:ch-halo', 'channelColor:갈색', 'led:주백색']);
  });
  it('별칭: 플렉스=후렉스, 백색·화이트=흰색, 블랙=검정, 포멕스=포맥스, 3000k=전구색, 5700k·6500k=백색', () => {
    expect(kinds('플렉스 백색')).toEqual(['product:board-flex', 'bodyColor:흰색']);
    expect(kinds('포멕스 블랙 3000k')).toEqual(['product:board-foamex', 'bodyColor:검정', 'led:전구색']);
    expect(kinds('화이트 6500K')).toEqual(['bodyColor:흰색', 'led:백색']);
  });
  it('"채널"만 쓰면 전광 채널, 채널 뒤의 색은 채널 색, 색 하나만 있으면 몸통 색', () => {
    expect(kinds('갈바 채널 빨강')).toEqual(['product:board-galva', 'channel:ch-front', 'channelColor:빨강']);
    expect(kinds('갈바 흰색')).toEqual(['product:board-galva', 'bodyColor:흰색']);
    expect(kinds('흰색 갈색')).toEqual(['bodyColor:흰색', 'channelColor:갈색']); // 둘째 색은 채널
  });
  it('사이즈·두께도 읽는다: 3000x600, 3000×600, 10T', () => {
    expect(kinds('3000x600 포맥스 10T')).toEqual(['size:3000×600', 'product:board-foamex', 'thick:10']);
    const size = parseSpecText('3,000 × 600').find((i) => i.kind === 'size');
    expect(size).toMatchObject({ kind: 'size', w: 3000, h: 600 });
  });
  it('못 알아본 말은 메모 하나로 (요청사항에 넣을 수 있게), 빈 글은 빈 목록', () => {
    const items = parseSpecText('갈바 급함, 기존 간판 철거');
    expect(items.map((i) => i.kind)).toEqual(['product', 'note']);
    expect(items[1]).toMatchObject({ kind: 'note', text: '급함 기존 간판 철거' });
    expect(parseSpecText('  ')).toEqual([]);
  });
  it('항목마다 사람이 읽는 라벨', () => {
    expect(parseSpecText('갈바 흰색 후광 4000K').map((i) => i.label)).toEqual(['몸통: 갈바', '몸통 색: 흰색', '채널: 후광 채널', 'LED: 주백색 (4000K)']);
  });
});

describe('체크한 항목만 적용 (applySpecItems)', () => {
  it('전부 적용: 종류·색·채널·LED·사이즈·두께·메모', () => {
    const o = obj({ productId: 'board-flex' });
    const items = parseSpecText('갈바 흰색 채널 갈색 후광 4000K 3000x600 급함');
    const p = applySpecItems(o, items);
    const next = { ...o, ...p } as SignObject;
    expect(next.productId).toBe('board-galva');
    expect(next.widthMm).toBe(3000); expect(next.heightMm).toBe(600);
    expect(next.note).toBe('급함');
    const q = quickSpecOf(next);
    expect(q.body).toMatchObject({ name: '갈바', color: '흰색' });
    expect(q.channel).toMatchObject({ type: 'ch-halo', color: '갈색' });
    expect(q.led).toMatchObject({ kelvin: '4000K' });
  });
  it('체크를 뺀 항목은 적용하지 않는다, 메모는 기존 요청사항 뒤에 붙는다', () => {
    const o = obj({ productId: 'board-galva', note: '배선 왼쪽' });
    const items = parseSpecText('흰색 후광 급함');
    const p = applySpecItems(o, items.filter((i) => i.kind !== 'channel'));
    expect(p.parts).toBeUndefined();
    expect(p.options).toMatchObject({ paintSystem: '기본색', paintCode: '흰색' });
    expect(p.note).toBe('배선 왼쪽\n급함');
  });
  it('다른 분류의 종류(포맥스)를 적으면 분류도 바뀐다', () => {
    const o = obj({ productId: 'board-galva', options: { form: '돌출형' } });
    const p = applySpecItems(o, parseSpecText('포맥스 흰색'));
    expect(p.productId).toBe('board-foamex');
    expect(p.options).toMatchObject({ paintSystem: '기본색', paintCode: '흰색' });
    expect(p.options).not.toHaveProperty('form'); // 분류가 바뀌면 옛 옵션은 비움
  });
});
