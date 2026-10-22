import { describe, expect, it } from 'vitest';
import { newPart } from '../../src/lib/core/parts';
import { componentOf } from '../../src/lib/core/components';
import { addLayer, inferScashiType, STACK_DEFAULT_T } from '../../src/lib/core/stack';
import { partOptionFields } from '../../src/lib/core/options';

// 2026-10-22 사용자: "스카시는 아직도 고무 스카시가 기본으로 나온다. 우선 스카시라는 허상에 재료나 구성을 추가해야한다. 고무를 사용하고 철판을 레이어로 올리고 그런데 컷팅이 스카시에 붙어서 하위 재료가 모두 적용된다."
describe('빈 스카시 — 재료를 올려 만든다', () => {
  it('새 스카시는 종류·재료 층 없이 시작한다 (종류를 정해 만들면 전처럼 기본 묶음)', () => {
    const p = newPart('scashi');
    expect(p.type).toBe('');
    expect(p.stack).toEqual([]);
    expect(componentOf('scashi').spec(p)).toBe('스카시 (재료 없음)');
    expect(newPart('scashi', 'ch-rubber').stack).toHaveLength(2);
  });

  it('재료를 아래부터 올린다 — 고무 위에 철판, 컷팅은 스카시에 붙어 모든 층에', () => {
    let p = newPart('scashi');
    p = { ...p, stack: addLayer(addLayer(p.stack!, { material: 'rubber', thickness: STACK_DEFAULT_T.rubber }, 'top'), { material: 'iron', thickness: STACK_DEFAULT_T.iron }, 'top'), options: { cut: 'laser' } };
    expect(p.stack!.map((l) => l.material)).toEqual(['rubber', 'iron']);
    expect(componentOf('scashi').depthMm(p, {} as never)).toBeCloseTo(21.5);
    expect(componentOf('scashi').spec(p)).toBe('스카시 (고무 20T + 철판 1.5T · 레이저 컷팅 — 모든 층)');
    expect(partOptionFields(p).some((f) => f.key === 'cut')).toBe(true);
  });

  it('견적 종류는 올린 재료로 정한다: 티타늄이 있으면 티타늄 스카시, 가장 두꺼운 층이 아크릴이면 아크릴, 그 밖은 고무', () => {
    const L = (material: string, thickness: number) => ({ id: material, material, thickness });
    expect(inferScashiType([L('rubber', 20), L('iron', 1.5)])).toBe('ch-rubber');
    expect(inferScashiType([L('iron', 1.5), L('rubber', 10), L('titan', 1.2)])).toBe('sc-titan');
    expect(inferScashiType([L('acrylic', 8)])).toBe('ch-scashi');
    expect(inferScashiType([])).toBeNull();
  });
});
