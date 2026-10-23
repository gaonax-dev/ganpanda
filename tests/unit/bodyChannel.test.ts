import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { CATALOG, CHANNEL_OPTIONS, productsOf, signParts } from '../../src/lib/core/catalog';
import { optionGroupsFor } from '../../src/lib/core/options';
import { quoteObject } from '../../src/lib/core/quote';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { renderSpecOf } from '../../src/lib/core/render';
import { specFromObject } from '../../src/lib/core/letter3d';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const keys = (o: SignObject) => optionGroupsFor(o).flatMap((g) => g.fields.map((f) => f.key));
const place = { cx: 4500, cy: 4200, w: 9000, h: 1000 };

describe('간판 = 몸통 + 채널 옵션 (2026-10-15 사용자: "몸통 선택과 채널 선택을 조합하는 경우가 많다. 선택을 분리, 채널은 옵션으로")', () => {
  it('간판 종류 목록은 몸통만: 보드들 + 몸통 없음(벽면 직접 부착). 채널 제품은 목록에 없다', () => {
    const ids = productsOf('sign').map((p) => p.id);
    expect(ids).toContain('board-galva');
    expect(ids).toContain('body-none');
    expect(ids.some((id) => id.startsWith('ch-'))).toBe(false);
    expect(CATALOG.find((p) => p.id === 'body-none')!.unit).toBe('none');
  });
  it('채널 옵션: 없음/전광/후광/전후광/갈바 에폭시 → 채널 제품 id', () => {
    expect(CHANNEL_OPTIONS.map((c) => c.id)).toEqual(['ch-front', 'ch-halo', 'ch-both', 'ch-galva', 'ch-acrylic', 'ch-bulb']); // 통아크릴·벌브 (2026-10-15 한울)
    expect(signParts(obj({ productId: 'board-galva', options: { channel: '전광 채널' } }))).toEqual({ bodyId: 'board-galva', channelId: 'ch-front', scashiId: null });
    expect(signParts(obj({ productId: 'board-galva' }))).toEqual({ bodyId: 'board-galva', channelId: null, scashiId: null });
    // 옛 데이터(채널 제품을 종류로 저장)는 몸통 없음 + 그 채널로 읽는다
    expect(signParts(obj({ productId: 'ch-halo' }))).toEqual({ bodyId: 'body-none', channelId: 'ch-halo', scashiId: null });
  });
  it('옵션: 몸통 옵션 + 채널 선택, 채널을 고르면 채널 종류·LED 색·도색·글자 높이가 따라온다', () => {
    expect(keys(obj({ productId: 'board-galva' }))).toEqual(['frameMat', 'framePaintSystem', 'form', 'perforation', 'light', 'paintSystem', 'channel', 'scashi'] /* 상단 조명은 구성 요소로 (2026-10-19) */); // 2026-10-15 분류 재정리, 레이저 타공·내부 조명 2026-10-17: 프레임 재질, 스카시 부착 (간접조명은 2026-10-16 상단 조명으로)
    expect(keys(obj({ productId: 'board-galva', options: { channel: '전광 채널' } }))).toEqual(['frameMat', 'framePaintSystem', 'form', 'perforation', 'light', 'paintSystem', 'channel', 'chType', 'chBuild', 'chDepth', 'chLight', 'ledColor', 'font', 'chSideMat', 'bodySystem', 'chFinish', 'chFace', 'faceSystem', 'chHeight', 'chFrame', 'capSystem', 'bracket', 'scashi'] /* 상단 조명은 구성 요소로 (2026-10-19) */); // 채널 조합 (2026-10-15 한울), 앞면 색(시트)·캡(트림) 색 2026-10-17, 몸통 마감·점등 2026-10-23
    expect(keys(obj({ productId: 'board-galva', options: { channel: '갈바 에폭시 채널 (비조명)' } }))).not.toContain('ledColor');
    expect(keys(obj({ productId: 'body-none' }))).toEqual(['channel', 'scashi'] /* 상단 조명은 구성 요소로 (2026-10-19) */);
  });
  it('견적: 몸통 ㎡ 줄 + 채널 자·cm 줄 (글자 높이 옵션, 없으면 간판 높이). 몸통 없음은 채널 줄만', () => {
    const o = obj({ name: 'A', productId: 'board-galva', widthMm: 3000, heightMm: 600, text: '간판다', options: { channel: '전광 채널', chHeight: '400' } });
    const lines = quoteObject(o, DEFAULT_PRICES);
    expect(lines).toHaveLength(2);
    expect(lines[0].label).toContain('갈바');
    expect(lines[1].label).toContain('전광 채널');
    expect(lines[1].amount).toBe(Math.round((3 * 40 * DEFAULT_PRICES.products['ch-front']) / 1000) * 1000);
    const none = quoteObject(obj({ name: 'B', productId: 'body-none', widthMm: 3000, heightMm: 600, text: '간판다', options: { channel: '후광 채널' } }), DEFAULT_PRICES);
    expect(none).toHaveLength(1);
    expect(none[0].amount).toBe(Math.round((3 * 60 * DEFAULT_PRICES.products['ch-halo']) / 1000) * 1000);
  });
  it('3D: 몸통 + 채널 + 문구 = 상자 위에 입체 글자(letters), 몸통 없음 + 채널 = 글자만, 채널 없음 = 상자', () => {
    const combo = renderSpecOf(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600, text: '간판다', options: { channel: '후광 채널', chHeight: '400' } }), place)!;
    expect(combo.kind).toBe('lightbox');
    expect(combo.letters).toMatchObject({ text: '간판다', lighting: 'halo', heightMm: 400 });
    const only = renderSpecOf(obj({ productId: 'body-none', text: '간판다', options: { channel: '전광 채널' } }), place)!;
    expect(only.kind).toBe('channel'); expect(only.lighting).toBe('front');
    expect(renderSpecOf(obj({ productId: 'board-galva', text: '간판다' }), place)!.letters).toBeUndefined();
    // 입체 보기(3D 글자)는 채널이 있을 때
    expect(specFromObject(obj({ productId: 'board-galva', heightMm: 600, text: '간판다', options: { channel: '전광 채널' } }))?.lighting).toBe('front');
    expect(specFromObject(obj({ productId: 'board-galva', heightMm: 600, text: '간판다' }))).toBeNull();
  });
});
