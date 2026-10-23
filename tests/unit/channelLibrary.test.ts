import { describe, expect, it } from 'vitest';
import { CHANNEL_PRESETS } from '../../src/lib/core/channelLibrary';
import { applyPreset, presetOf } from '../../src/lib/core/partPresets';
import { newPart } from '../../src/lib/core/parts';
import { partOptionFields } from '../../src/lib/core/options';
import { componentOf } from '../../src/lib/core/components';
import type { SignObject } from '../../src/lib/core/model';

// 채널 라이브러리 (2026-10-23 사용자: "간판 선택하고 채널 나오면 사용자들이 퀵으로 선택하고 여기에서 디테일을 추가하거나 빼는 방향")
describe('채널 라이브러리', () => {
  it('15종, 번호·썸네일·채널 종류 — 채널 레지스트리의 빠른 선택', () => {
    expect(CHANNEL_PRESETS).toHaveLength(15);
    expect(componentOf('channel').presets).toBe(CHANNEL_PRESETS);
    expect(CHANNEL_PRESETS.map((p) => p.no)).toEqual([...Array(15)].map((_, i) => i + 1));
    const types = new Set(componentOf('channel').types.map((t) => t.id));
    for (const p of CHANNEL_PRESETS) {
      expect(types.has(p.type)).toBe(true);
      expect(p.img).toBe(`/channel-types/${String(p.no).padStart(2, '0')}.webp`);
    }
  });

  it('묶음의 옵션은 모두 그 채널 편집기에 보이는 칸이고 값도 고를 수 있는 값 — 고른 뒤 세부를 더하고 뺀다', () => {
    for (const pr of CHANNEL_PRESETS) {
      const part = applyPreset(newPart('channel'), pr);
      const fields = partOptionFields(part);
      for (const [k, v] of Object.entries(pr.options)) {
        const f = fields.find((x) => x.key === k && (x.kind !== 'select' || x.values!.some((o) => o.id === v)));
        expect(f, `${pr.label}: ${k}=${String(v)}`).toBeTruthy();
      }
    }
  });

  it('적용: 종류·옵션은 묶음으로 바꾸고 글자·올린 곳·id 는 그대로, 저장된 재료 층은 새 종류의 기본 묶음으로', () => {
    const o = { letter3d: { depthMm: 80 } } as unknown as SignObject;
    const p = { ...newPart('channel', 'ch-front'), options: { ledColor: '빨강' }, items: [{ id: 't', kind: 'text' as const, text: 'G', x: 0, y: 0, h: 300 }] };
    const halo = CHANNEL_PRESETS.find((x) => x.no === 9)!;
    const a = applyPreset(p, halo, o);
    expect(a.id).toBe(p.id);
    expect(a.items).toEqual(p.items);
    expect(a.type).toBe('ch-halo');
    expect(a.options).toEqual(halo.options);
    expect(a.stack).toBeUndefined(); // 저장된 층이 없으면 그대로 (깊이로 보인다)
    const b = applyPreset({ ...p, stack: componentOf('channel').presetStack!('ch-front', o) }, halo, o);
    expect(b.stack!.map((l) => l.material)).toEqual(['acrylic', 'led', 'galva', 'galva']);
  });

  it('지금 채널이 어느 묶음 그대로인지 (세부를 고치면 없음)', () => {
    const pr = CHANNEL_PRESETS.find((x) => x.no === 7)!;
    const a = applyPreset(newPart('channel'), pr);
    expect(presetOf(a)?.no).toBe(7);
    expect(presetOf({ ...a, options: { ...a.options, ledColor: 'RGB' } })).toBeNull();
  });
});
