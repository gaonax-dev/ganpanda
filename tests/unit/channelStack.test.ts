import { describe, expect, it } from 'vitest';
import { componentOf } from '../../src/lib/core/components';
import { defaultChannelStack, stackLabel } from '../../src/lib/core/stack';
import { newPart } from '../../src/lib/core/parts';
import { crossSection } from '../../src/lib/core/crossSection';
import type { SignObject } from '../../src/lib/core/model';

const mats = (s: { material: string }[]) => s.map((l) => l.material);
const sum = (s: { thickness: number }[]) => s.reduce((t, l) => t + l.thickness, 0);

// 재료 조합 S2 (2026-10-22 "진행해줘"): 채널도 재료 층 — 뒷판 · LED · 옆판(몸통) · 앞판, 두께 합 = 채널 깊이
describe('채널 재료 층', () => {
  it('종류별 기본 묶음 (뒤 → 앞), 두께 합 = 깊이', () => {
    expect(mats(defaultChannelStack('ch-front', 80))).toEqual(['galva', 'led', 'alu', 'acrylic']);
    expect(mats(defaultChannelStack('ch-halo', 80))).toEqual(['acrylic', 'led', 'galva', 'galva']);
    expect(mats(defaultChannelStack('ch-galva', 80))).toEqual(['galva', 'galva', 'galva']);
    expect(mats(defaultChannelStack('ch-acrylic', 60))).toEqual(['led', 'acrylic']);
    for (const t of ['ch-front', 'ch-halo', 'ch-both', 'ch-galva', 'ch-acrylic', 'ch-bulb']) expect(sum(defaultChannelStack(t, 80))).toBeCloseTo(80);
  });

  it('LED 는 두께 없이 이름만', () => {
    expect(stackLabel(defaultChannelStack('ch-front', 80))).toBe('갈바 1.2T + LED + 알루미늄 75.8T + 아크릴 3T');
  });

  it('재료 층을 저장하지 않은 채널은 3D 깊이 그대로(그릴 때 그 깊이의 기본 묶음), 저장하면 깊이 = 두께 합', () => {
    const o = { letter3d: { depthMm: 100 } } as unknown as SignObject;
    const n = newPart('channel', 'ch-front');
    expect(n.stack).toBeUndefined();
    expect(componentOf('channel').depthMm(n, o)).toBe(100);
    expect(componentOf('channel').stack!(n, o).length).toBe(4);
    expect(sum(componentOf('channel').stack!(n, o))).toBeCloseTo(100);
    const saved = { ...n, stack: defaultChannelStack('ch-front', 80) };
    expect(componentOf('channel').depthMm(saved, o)).toBeCloseTo(80);
  });

  it('단면: 채널이 재료 층으로 쌓인다', () => {
    const o = { id: 's', photoId: 'p', name: 's', shape: 'rect', quad: [], sheetIds: [], widthMm: 3000, heightMm: 800, depthMm: 60, productId: 'board-galva',
      parts: [{ ...newPart('channel', 'ch-front'), items: [] }] } as unknown as SignObject;
    expect(crossSection(o).tiers[0].items[0].layers.map((l) => l.label)).toEqual(['갈바', 'LED', '알루미늄', '아크릴']);
  });
});
