import { describe, expect, it } from 'vitest';
import type { SignObject, SignPart } from '../../src/lib/core/model';
import { componentOf } from '../../src/lib/core/components';
import { partOptionFields } from '../../src/lib/core/options';
import { renderSpecOf } from '../../src/lib/core/render';
import { CHANNEL_PRESETS } from '../../src/lib/core/channelLibrary';

// 채널 옵션 보강 L2 (2026-10-23 "진행해" — 채널 라이브러리 다음): 몸통 마감 · 띄움 거리 · 뒤판 · 단차 높이 · 갈바 앞면 · 벌브 간격
const ch = (type: string, options: Record<string, string | boolean> = {}): SignPart => ({ id: 'c', kind: 'channel', type, options, items: [] });
const keys = (p: SignPart) => partOptionFields(p).map((f) => f.key);
const obj = (p: SignPart): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, productId: 'board-galva', widthMm: 3000, heightMm: 600,
  parts: [{ ...p, items: [{ id: 't', kind: 'text', text: 'G', x: 0, y: 0, h: 400 }] }] });
const place = { cx: 4500, cy: 4200, w: 9000, h: 1000 };
const item = (p: SignPart) => renderSpecOf(obj(p), place)!.letterItems![0];

describe('채널 옵션 보강', () => {
  it('몸통 마감: 도장이 아니면 몸통 도색 칸은 없다', () => {
    expect(keys(ch('ch-front'))).toContain('chFinish');
    expect(keys(ch('ch-front'))).toContain('bodySystem');
    expect(keys(ch('ch-front', { chFinish: '미러' }))).not.toContain('bodySystem');
    expect(keys(ch('ch-galva'))).not.toContain('chFinish');
  });

  it('띄움 거리는 까치발일 때, 뒤판은 후광·전후광, 단차 높이는 캡 단차, 갈바 앞면은 갈바, 벌브 간격은 벌브', () => {
    expect(keys(ch('ch-halo'))).not.toContain('chStandoff');
    expect(keys(ch('ch-halo', { bracket: true }))).toContain('chStandoff');
    expect(keys(ch('ch-halo'))).toContain('chBack');
    expect(keys(ch('ch-both'))).toContain('chBack');
    expect(keys(ch('ch-front'))).not.toContain('chBack');
    expect(keys(ch('ch-front', { chType: '캡 단차(아크릴)' }))).toContain('chStep');
    expect(keys(ch('ch-front'))).not.toContain('chStep');
    expect(keys(ch('ch-galva'))).toContain('chGalvaFace');
    expect(keys(ch('ch-front'))).not.toContain('chGalvaFace');
    expect(keys(ch('ch-bulb'))).toContain('chBulbPitch');
    expect(keys(ch('ch-both'))).not.toContain('chDouble'); // 옛 "양면 (돌출용)" — 양면 = 전후광 (2026-10-23)
  });

  it('캡 단차 높이 = 앞판(아크릴) 두께, 합은 그대로 깊이', () => {
    const o = { letter3d: { depthMm: 80 } } as unknown as SignObject;
    const s = componentOf('channel').stack!(ch('ch-front', { chType: '캡 단차(아크릴)', chStep: '20' }), o);
    expect(s.at(-1)).toMatchObject({ material: 'acrylic', thickness: 20 });
    expect(s.reduce((t, l) => t + l.thickness, 0)).toBeCloseTo(80);
  });

  it('3D: 마감 · 띄움 거리 · 뒤판 색 · 전후광 후광', () => {
    expect(item(ch('ch-front', { chFinish: '미러' }))).toMatchObject({ finish: 'mirror' });
    expect(item(ch('ch-front', { chFinish: '헤어라인' }))).toMatchObject({ finish: 'hairline' });
    const gold = item(ch('ch-front', { chFinish: '티타늄 골드' }));
    expect(gold.finish).toBe('mirror');
    expect(gold.sideColor).toBe('#c9a24a');
    expect(item(ch('ch-front')).finish).toBeUndefined();
    expect(item(ch('ch-halo', { bracket: true })).standoffMm).toBe(30); // 까치발 기본
    expect(item(ch('ch-halo', { bracket: true, chStandoff: '50' })).standoffMm).toBe(50);
    expect(item(ch('ch-halo')).standoffMm).toBeUndefined();
    expect(item(ch('ch-both')).backLit).toBe(true);
    expect(item(ch('ch-front')).backLit).toBeUndefined();
    expect(item(ch('ch-both', { chBack: '앞면과 같게', faceSystem: '기본색', faceCode: '빨강' })).haloColor).toMatch(/^#/);
    expect(item(ch('ch-both', { faceSystem: '기본색', faceCode: '빨강', ledColor: '전구색' })).haloColor).toBe('#ffcf8a'); // 벽 빛 = LED 색 (앞면 빨강이어도)
    expect(item(ch('ch-halo', { ledColor: '전구색' })).haloColor).toBe('#ffcf8a');
    expect(item(ch('ch-front')).haloColor).toBeUndefined();
  });

  it('라이브러리 묶음이 새 옵션을 쓴다 (없던 사양이 줄어든다)', () => {
    const by = (n: number) => CHANNEL_PRESETS.find((p) => p.no === n)!;
    expect(by(1).options.chGalvaFace).toBe('도장');
    expect(by(10).options.chGalvaFace).toBe('에폭시');
    expect(by(2).options.chFinish).toBe('헤어라인');
    expect(by(13).options.chFinish).toBe('미러');
    expect(by(14).options.chFinish).toBe('티타늄 골드');
    expect(by(8).options.chStep).toBeTruthy();
    for (const n of [5, 6, 7, 9]) expect(by(n).options.chStandoff).toBeTruthy();
    expect(CHANNEL_PRESETS.filter((p) => p.gap).map((p) => p.no)).toEqual([]); // 측면 발광도 L3 에서 (2026-10-23)
  });
});
