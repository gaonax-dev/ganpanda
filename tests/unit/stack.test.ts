// 재료 층 (2026-10-21 사용자: "스카시 선택하면 고무를 선택했다 하고 여기에 기본은 얇은 철판인데 어떤 경우는 고무만 사용하잖아. 나는 이때 결합된 상태로 제공하고 필요한 상태를 추가하고 싶은 거야
// 시트나 페인트를, 사실 페인트는 어디든 쓸 수 있거든" → "스카시부터 진행해줘")
import { describe, expect, it } from 'vitest';
import { addLayer, defaultStack, finishLabel, removeLayer, setFinish, stackDepth, stackFromLegacy, stackLabel, surfaceOf, STACK_MATERIALS } from '../../src/lib/core/stack';
import { componentOf } from '../../src/lib/core/components';
import { newPart, partsOf } from '../../src/lib/core/parts';
import { quoteObject } from '../../src/lib/core/quote';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import type { SignObject } from '../../src/lib/core/model';

describe('기본 묶음', () => {
  it('고무 스카시 = 철판 1.5T 밑판 + 고무 20T, 아크릴 스카시 = 아크릴 8T 하나, 티타늄 = 철판 + 고무 10T + 티타늄판 1.2T (확인 필요)', () => {
    expect(defaultStack('ch-rubber').map((l) => [l.material, l.thickness, l.role])).toEqual([['iron', 1.5, 'base'], ['rubber', 20, 'body']]);
    expect(defaultStack('ch-scashi').map((l) => [l.material, l.thickness])).toEqual([['acrylic', 8]]);
    expect(defaultStack('sc-titan').map((l) => [l.material, l.thickness])).toEqual([['iron', 1.5], ['rubber', 10], ['titan', 1.2]]);
    expect(STACK_MATERIALS.map((m) => m.id)).toContain('rubber');
  });
  it('두께 = 층 두께의 합, 문구 = "철판 1.5T + 고무 20T"', () => {
    const s = defaultStack('ch-rubber');
    expect(stackDepth(s)).toBe(21.5);
    expect(stackLabel(s)).toBe('철판 1.5T + 고무 20T');
  });
});

describe('층 빼기·더하기·마감', () => {
  it('철판을 빼면 고무만, 다시 밑판을 더하면 맨 아래', () => {
    const s = defaultStack('ch-rubber');
    const only = removeLayer(s, s[0].id);
    expect(stackLabel(only)).toBe('고무 20T');
    const back = addLayer(only, { material: 'iron', thickness: 2, role: 'base' }, 'bottom');
    expect(stackLabel(back)).toBe('철판 2T + 고무 20T');
    const face = addLayer(only, { material: 'alu', thickness: 1, role: 'face' }, 'top');
    expect(stackLabel(face)).toBe('고무 20T + 알루미늄 1T');
  });
  it('마감은 어느 층의 앞면·옆면에도: 시트는 종류, 도색은 옵션 접두사(색은 options 에서 읽음)', () => {
    const s = defaultStack('ch-rubber');
    const withSheet = setFinish(s, s[1].id, 'face', { kind: 'sheet', ref: 'sh-cut' });
    const withPaint = setFinish(withSheet, s[1].id, 'side', { kind: 'paint', ref: `${s[1].id}.side` });
    const opts = { [`${s[1].id}.sideSystem`]: '기본색', [`${s[1].id}.sideCode`]: '검정' };
    expect(finishLabel(withPaint[1], 'face', opts)).toBe('재질 시트');
    expect(finishLabel(withPaint[1], 'side', opts)).toBe('도색 검정');
    expect(surfaceOf(withPaint, opts)).toMatchObject({ faceSheet: 'sh-cut', side: '#141414' });
    expect(stackLabel(withPaint, opts)).toBe('철판 1.5T + 고무 20T · 앞면 재질 시트 · 옆면 도색 검정');
  });
});

describe('옛 스카시 옵션 → 재료 층 (normalize)', () => {
  it('두께 30T·재질 "시트 부착"·도색 흰색 → 철판 + 고무 30T(앞면 시트), 도색은 top 층 앞면·몸통 옆면에 접두사 paint 로', () => {
    const s = stackFromLegacy('ch-rubber', { thickness: '30T', material: '시트 부착', paintSystem: '기본색', paintCode: '흰색' });
    expect(stackLabel(s)).toBe('철판 1.5T + 고무 30T');
    expect(s[1].face).toEqual({ kind: 'sheet', ref: 'sh-cut' });
    expect(s[1].side).toEqual({ kind: 'paint', ref: 'paint' });
  });
  it('재질 "칼라 알루미늄"은 알루미늄 1T 면판, "아크릴 전면판"은 아크릴 3T 면판, "없음"은 면판 없음', () => {
    expect(stackLabel(stackFromLegacy('ch-rubber', { material: '칼라 알루미늄' }))).toBe('철판 1.5T + 고무 20T + 알루미늄 1T');
    expect(stackLabel(stackFromLegacy('ch-rubber', { material: '아크릴 전면판' }))).toBe('철판 1.5T + 고무 20T + 아크릴 3T');
    expect(stackLabel(stackFromLegacy('ch-rubber', { material: '없음' }))).toBe('철판 1.5T + 고무 20T');
  });
  it('종류 모듈: 저장된 스카시를 읽으면 stack 이 채워지고, 두께·칩·구성내역이 층을 따른다', () => {
    const sc = newPart('scashi', 'ch-rubber');
    expect(sc.stack).toBeDefined(); // 새로 만들 때 기본 묶음
    const c = componentOf('scashi');
    const o = { options: {} } as SignObject;
    expect(c.depthMm(sc, o)).toBe(21.5);
    const legacy = c.normalize!({ id: 'x', kind: 'scashi', type: 'ch-scashi', options: { thickness: '5T' }, items: [] });
    expect(legacy.stack?.map((l) => l.thickness)).toEqual([5]);
    expect(c.depthMm(legacy, o)).toBe(5);
    expect(c.spec(legacy)).toBe('아크릴 스카시 (아크릴 5T)');
    const only = { ...sc, stack: removeLayer(sc.stack!, sc.stack![0].id) };
    expect(c.chip(only).text).toBe('고무 20T');
  });
  it('partsOf 가 옛 사인물의 스카시에도 stack 을 채운다', () => {
    const o = { id: 'o', name: 's', quad: [], sheetIds: [], productId: 'board-galva', parts: [{ id: 'p', kind: 'scashi', type: 'ch-rubber', options: { thickness: '20T' }, items: [] }] } as unknown as SignObject;
    expect(partsOf(o)[0].stack?.length).toBe(2);
  });
});

describe('견적·2D/3D 색', () => {
  const sign = (sc: ReturnType<typeof newPart>): SignObject => ({ id: 'o', name: '간판', quad: [], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 600, parts: [sc] } as unknown as SignObject);
  it('기본 묶음의 견적은 전과 같다(종류 단가). 앞면 시트를 더하면 시트 줄이 더해지고, 철판을 빼면 줄 이름에 (철판 없음)', () => {
    const sc = newPart('scashi', 'ch-rubber');
    sc.items = [{ id: 'i', kind: 'text', text: '간판다', x: 0, y: 0, h: 300 }];
    const base = quoteObject(sign(sc), DEFAULT_PRICES);
    expect(base.filter((l) => l.amount > 0)).toHaveLength(2); // 몸통 + 스카시
    const withSheet = { ...sc, stack: setFinish(sc.stack!, sc.stack![1].id, 'face', { kind: 'sheet', ref: 'sh-cut' }) };
    const q = quoteObject(sign(withSheet), DEFAULT_PRICES);
    expect(q.filter((l) => l.amount > 0)).toHaveLength(3);
    expect(q.find((l) => l.label.includes('앞면 시트'))!.amount).toBeGreaterThan(0);
    const only = { ...sc, stack: removeLayer(sc.stack!, sc.stack![0].id) };
    expect(quoteObject(sign(only), DEFAULT_PRICES).find((l) => l.label.includes('스카시'))!.label).toContain('철판 없음');
  });
  it('앞면 색 = 맨 위 층 앞면 도색, 옆면 색 = 옆면 도색 (surface)', () => {
    const sc = newPart('scashi', 'ch-rubber');
    const top = sc.stack![1];
    sc.options = { paintSystem: '기본색', paintCode: '흰색', [`${top.id}.sideSystem`]: '기본색', [`${top.id}.sideCode`]: '검정' };
    sc.stack = setFinish(setFinish(sc.stack!, top.id, 'face', { kind: 'paint', ref: 'paint' }), top.id, 'side', { kind: 'paint', ref: `${top.id}.side` });
    expect(componentOf('scashi').surface!(sc)).toEqual({ face: '#f4f4f2', side: '#141414' });
  });
});
