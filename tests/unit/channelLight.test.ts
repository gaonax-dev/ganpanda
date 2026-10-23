import { describe, expect, it } from 'vitest';
import type { SignObject, SignPart } from '../../src/lib/core/model';
import { componentOf } from '../../src/lib/core/components';
import { partOptionFields } from '../../src/lib/core/options';
import { renderSpecOf } from '../../src/lib/core/render';
import { CHANNEL_PRESETS } from '../../src/lib/core/channelLibrary';
import { insidePoints, spacedPoints } from '../../src/lib/sim/bulbs';

// 채널 빛 L3 (2026-10-23 "계속 진행해줘"): 점등/비조명 · 일체형 측면 발광 · 벌브 전구 · 까치발 받침
const ch = (type: string, options: Record<string, string | boolean> = {}): SignPart => ({ id: 'c', kind: 'channel', type, options, items: [] });
const keys = (p: SignPart) => partOptionFields(p).map((f) => f.key);
const obj = (p: SignPart): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, productId: 'board-galva', widthMm: 3000, heightMm: 600,
  parts: [{ ...p, items: [{ id: 't', kind: 'text', text: 'G', x: 0, y: 0, h: 400 }] }] });
const item = (p: SignPart) => renderSpecOf(obj(p), place)!.letterItems![0];
const place = { cx: 4500, cy: 4200, w: 9000, h: 1000 };

describe('채널 빛', () => {
  it('점등/비조명: 전광·후광·전후광에서 고르고, 비조명이면 빛도 LED 층도 LED 색 칸도 없다', () => {
    expect(keys(ch('ch-front'))).toContain('chLight');
    expect(keys(ch('ch-halo'))).toContain('chLight');
    expect(keys(ch('ch-galva'))).not.toContain('chLight'); // 원래 비조명
    expect(keys(ch('ch-front', { chLight: '비조명' }))).not.toContain('ledColor');
    const c = componentOf('channel');
    expect(c.lighting(ch('ch-front', { chLight: '비조명' }))).toBe('none');
    expect(c.lighting(ch('ch-front'))).toBe('front');
    expect(c.stack!(ch('ch-front', { chLight: '비조명' })).map((l) => l.material)).not.toContain('led');
    expect(item(ch('ch-both', { chLight: '비조명' })).backLit).toBeUndefined();
    expect(item(ch('ch-halo', { chLight: '비조명' })).haloColor).toBeUndefined();
  });

  it('일체형 = 앞면과 옆면이 함께 빛난다, 벌브 = 전구 간격', () => {
    expect(item(ch('ch-front', { chType: '일체형' })).sideLit).toBe(true);
    expect(item(ch('ch-front', { chType: '일체형', chLight: '비조명' })).sideLit).toBeUndefined();
    expect(item(ch('ch-front')).sideLit).toBeUndefined();
    expect(item(ch('ch-bulb', { chBulbPitch: '50mm' })).bulbPitchMm).toBe(50);
    expect(item(ch('ch-bulb')).bulbPitchMm).toBe(70); // 기본
    expect(item(ch('ch-bulb', { ledColor: '전구색' })).haloColor).toBe('#ffcf8a'); // 번짐 = 전구 빛
    expect(item(ch('ch-front')).bulbPitchMm).toBeUndefined();
  });

  it('라이브러리: 13 오사이 용접은 비조명, 남은 미지원 사양 없음', () => {
    expect(CHANNEL_PRESETS.find((p) => p.no === 13)!.options.chLight).toBe('비조명');
    expect(CHANNEL_PRESETS.filter((p) => p.gap)).toEqual([]);
  });

  it('글자 안 격자 점 (전구·까치발 자리): 구멍 빼고, 가장자리에서 떨어져서', () => {
    const sq = (s: number, o = 0): [number, number][] => [[o, o], [s + o, o], [s + o, s + o], [o, s + o]];
    const pts = insidePoints([sq(100)], 20, 5);
    expect(pts.length).toBeGreaterThan(9);
    for (const [x, y] of pts) { expect(x).toBeGreaterThanOrEqual(5); expect(x).toBeLessThanOrEqual(95); expect(y).toBeGreaterThanOrEqual(5); expect(y).toBeLessThanOrEqual(95); }
    const ring = insidePoints([sq(100), sq(40, 30)], 10, 3); // 가운데 구멍
    expect(ring.length).toBeGreaterThan(0);
    for (const [x, y] of ring) expect(x > 30 && x < 70 && y > 30 && y < 70).toBe(false);
    expect(insidePoints([sq(10)], 50, 0).length).toBe(1); // 작은 글자도 하나는 (가운데)
  });

  it('전구 자리: 획 가운데부터, 서로 간격 이상 떨어져 촘촘히 (가는 획에도 줄지어)', () => {
    const bar: [number, number][] = [[0, 0], [500, 0], [500, 80], [0, 80]]; // 가로 획 500 × 80
    const pts = spacedPoints([bar], 70, 20);
    expect(pts.length).toBeGreaterThanOrEqual(6);
    for (const [, y] of pts) expect(Math.abs(y - 40)).toBeLessThan(15); // 가운데 줄
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])).toBeGreaterThanOrEqual(69.9);
  });
});
