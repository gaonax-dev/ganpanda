// 빠른 설정 (2026-10-17 사용자: "현재설정창과 퀵설정으로 만들수 있을까? 사이즈 아래에 갈바 흰색 / 체널 갈색 / 후광4000k")
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { applyQuick, quickSpecOf } from '../../src/lib/core/quickSpec';
import { NAMED_COLORS, PAINT_SYSTEMS, colorHex } from '../../src/lib/core/materials';
import { optionGroupsFor, partOptionFields } from '../../src/lib/core/options';
import { newPart } from '../../src/lib/core/parts';
import { describeOptions } from '../../src/lib/core/options';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });

describe('기본색 도색 (색 이름으로 바로)', () => {
  it('색상 체계에 기본색이 있고, 고르면 컬러코드 대신 색 이름 선택', () => {
    expect(PAINT_SYSTEMS).toEqual(['도색 없음', '기본색', '직접', 'PANTONE', 'RAL', 'KCC']);
    expect(NAMED_COLORS.map((c) => c.label)).toEqual(['흰색', '검정', '회색', '진회색', '갈색', '빨강', '파랑', '노랑', '초록', '금색', '은색']);
    expect(colorHex('갈색')).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorHex('없는색')).toBeNull();
    const fields = optionGroupsFor(obj({ productId: 'board-galva', options: { paintSystem: '기본색' } })).flatMap((g) => g.fields);
    const code = fields.find((f) => f.key === 'paintCode')!;
    expect(code.kind).toBe('select');
    expect(code.values!.map((v) => v.id)).toContain('흰색');
    const ral = optionGroupsFor(obj({ productId: 'board-galva', options: { paintSystem: 'RAL' } })).flatMap((g) => g.fields).find((f) => f.key === 'paintCode')!;
    expect(ral.kind).toBe('text');
  });
  it('LED 색에 색온도 표기 (값은 그대로)', () => {
    const led = partOptionFields(newPart('channel', 'ch-halo')).find((f) => f.key === 'ledColor')!;
    expect(led.values!.find((v) => v.id === '주백색')!.label).toBe('주백색 (4000K)');
    expect(led.values!.find((v) => v.id === '백색')!.label).toBe('백색 (5700K)');
    expect(led.values!.find((v) => v.id === '전구색')!.label).toBe('전구색 (3000K)');
  });
});

describe('빠른 설정 읽기 (quickSpecOf)', () => {
  it('갈바 흰색 · 후광 채널 갈색 · 주백색(4000K)', () => {
    const ch = newPart('channel', 'ch-halo'); ch.options = { bodySystem: '기본색', bodyCode: '갈색', ledColor: '주백색' };
    const o = obj({ productId: 'board-galva', options: { paintSystem: '기본색', paintCode: '흰색' }, parts: [ch] });
    expect(quickSpecOf(o)).toEqual({
      body: { productId: 'board-galva', name: '갈바', color: '흰색', paintKey: 'paint' },
      channel: { partId: ch.id, type: 'ch-halo', name: '후광 채널', color: '갈색' },
      led: { value: '주백색', label: '주백색 (4000K)', kelvin: '4000K' },
    });
  });
  it('도색 없음·채널 없음이면 null, RAL 코드는 "RAL 9005" 로', () => {
    const o = obj({ productId: 'board-galva', options: { paintSystem: 'RAL', paintCode: '9005' } });
    const q = quickSpecOf(o);
    expect(q.body).toMatchObject({ name: '갈바', color: 'RAL 9005' });
    expect(q.channel).toBeNull();
    expect(q.led).toBeNull();
    expect(quickSpecOf(obj({ productId: 'board-flex' })).body).toMatchObject({ name: '후렉스', color: null, paintKey: 'face' }); // 후렉스는 바탕색(컬러 피커, 2026-10-17)
  });
  it('옛 사인물(채널 옵션)도 읽는다', () => {
    const o = obj({ productId: 'board-galva', options: { channel: '전광 채널', ledColor: '백색' }, text: '간판' });
    expect(quickSpecOf(o).channel).toMatchObject({ type: 'ch-front', name: '전광 채널', color: null });
    expect(quickSpecOf(o).led).toMatchObject({ kelvin: '5700K' });
  });
});

describe('빠른 설정 적용 (applyQuick → 사인물 패치)', () => {
  it('몸통 색: 기본색 + 색 이름, 없음이면 도색 없음', () => {
    const o = obj({ productId: 'board-galva' });
    expect(applyQuick(o, { bodyColor: '흰색' }).options).toMatchObject({ paintSystem: '기본색', paintCode: '흰색' });
    expect(applyQuick(obj({ productId: 'board-galva', options: { paintSystem: '기본색', paintCode: '흰색' } }), { bodyColor: null }).options).toMatchObject({ paintSystem: '도색 없음' });
  });
  it('채널: 없으면 구성 요소를 만들고(옛 옵션은 정리), 종류·색·LED 를 넣고, 3D 색도 맞춘다', () => {
    const o = obj({ productId: 'board-galva', options: { channel: '전광 채널', ledColor: '백색' }, text: '간판' });
    const p = applyQuick(o, { channelType: 'ch-halo', channelColor: '갈색', led: '주백색' });
    expect(p.parts).toHaveLength(1);
    expect(p.parts![0]).toMatchObject({ kind: 'channel', type: 'ch-halo', options: { bodySystem: '기본색', bodyCode: '갈색', ledColor: '주백색' } });
    expect(p.parts![0].items[0]).toMatchObject({ kind: 'text', text: '간판' }); // 옛 문구는 글자 객체로
    expect(p.options).not.toHaveProperty('channel');
    expect(p.letter3d).toMatchObject({ sideColor: colorHex('갈색'), faceColor: colorHex('갈색') }); // 후광: 앞면도 도색
    const front = applyQuick(obj({ productId: 'board-galva', parts: [newPart('channel', 'ch-front')] }), { channelColor: '검정' });
    expect(front.letter3d!.sideColor).toBe(colorHex('검정'));
    expect(front.letter3d!.faceColor).not.toBe(colorHex('검정')); // 전광: 앞면은 LED 면
  });
  it('채널 없음으로 바꾸면 채널 구성 요소가 빠진다 (시트는 프레임 면으로)', () => {
    const ch = newPart('channel', 'ch-front'); const sh = newPart('sheet', 'sh-print'); sh.on = ch.id;
    const p = applyQuick(obj({ productId: 'board-galva', parts: [ch, sh] }), { channelType: null });
    expect(p.parts!.map((x) => x.kind)).toEqual(['sheet']);
    expect(p.parts![0].on).toBe('frame');
  });
  it('요약에 색이 읽히는 말로 나온다', () => {
    const ch = newPart('channel', 'ch-halo'); ch.options = { bodySystem: '기본색', bodyCode: '갈색', ledColor: '주백색' };
    const o = obj({ productId: 'board-galva', options: { paintSystem: '기본색', paintCode: '흰색' }, parts: [ch] });
    const s = describeOptions(o);
    expect(s).toEqual(expect.arrayContaining(['기본색', '흰색', '갈색', '주백색']));
  });
});
