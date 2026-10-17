// 한울상사(hanwoolcorp.co.kr) 조합형 주문 구성 (2026-10-15 사용자: "여기에서 사인물 나중에 주문할거야… 조합형으로 주문 가능하게… 현재 사인물 설정 구성해줘")
// 조합 = 종류(몸통) + 소재·두께 + 가공 + 출력·마감 + 조명 + 채널(입체 글자) + 설치·부속
import { thickPresetsFor } from '../../src/lib/core/catalog';
import { partsOf } from '../../src/lib/core/parts';
import { partOptionFields } from '../../src/lib/core/options';
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { optionGroupsFor } from '../../src/lib/core/options';
import { CATEGORY_GROUPS, productById, productsOf, signParts, CHANNEL_OPTIONS } from '../../src/lib/core/catalog';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { quoteObject } from '../../src/lib/core/quote';
import { lightingOf } from '../../src/lib/core/letter3d';
import { renderSpecOf } from '../../src/lib/core/render';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
// 스카시 분류의 두께·재질·도색은 스카시 구성 요소에 (2026-10-16 겹침 정리)
const fields = (o: SignObject) => [...optionGroupsFor(o).flatMap((g) => g.fields), ...(['ch-rubber', 'sc-titan', 'ch-scashi'].includes(o.productId ?? '') ? partOptionFields(partsOf(o)[0]) : [])];
const keys = (o: SignObject) => fields(o).map((f) => f.key);
const values = (o: SignObject, k: string) => fields(o).find((f) => f.key === k)?.values?.map((v) => v.id);

describe('간판 종류: 한울 제작 간판 분류', () => {
  const NEW = [
    ['board-lightpanel', '라이트패널', 'm2'], ['board-fabric', '패브릭 라이트박스', 'm2'], ['board-pole', '지주 간판', 'ea'],
    ['board-awning', '어닝', 'm2'], ['board-mirror', 'LED 사인미러', 'ea'], ['board-ledsign', '전광판', 'ea'], ['board-air', '에어간판', 'ea'],
  ] as const;
  it('새 종류가 분류에 있고 기본 단가가 있다 (분류는 2026-10-15 재정리)', () => {
    const ids = CATEGORY_GROUPS.flatMap((g) => productsOf(g.id)).map((p) => p.id);
    for (const [id, name, unit] of NEW) {
      expect(ids).toContain(id);
      expect(productById(id)).toMatchObject({ name, unit });
      expect(DEFAULT_PRICES.products[id]).toBeGreaterThan(0);
    }
  });
  it('이름 (2026-10-15 분류 재정리: 프레임 스타일 이름)', () => {
    expect(productById('board-flex')!.name).toBe('후렉스');
    expect(productById('board-galva')!.name).toBe('갈바');
    expect(productById('board-acrylic')!.name).toBe('아크릴 액자·현판');
  });
  it('개(ea) 단위는 치수 없이 1식 단가로 견적', () => {
    const [l] = quoteObject(obj({ productId: 'board-mirror' }), DEFAULT_PRICES);
    expect(l.amount).toBe(DEFAULT_PRICES.products['board-mirror']);
  });
  it('새 종류도 3D 에서 상자로 보인다', () => {
    for (const [id] of NEW) expect(renderSpecOf(obj({ productId: id }), { cx: 0, cy: 0, w: 1000, h: 500 } as never)?.kind).toBe('lightbox');
  });
});

describe('종류별 조합 옵션', () => {
  it('프레임 간판: 프레임 구조(일반 텐션/카바) · 출력(UV·솔벤 × 양면·단면)', () => {
    const o = obj({ productId: 'board-flex' });
    expect(values(o, 'frame')).toEqual(['일반 텐션', '카바']);
    expect(values(o, 'print')).toEqual(['UV 양면 출력', 'UV 단면 출력', '솔벤 양면 출력', '솔벤 단면 출력']);
  });
  it('갈바: 프레임 재질 (2026-10-15 분류 재정리)', () => {
    expect(values(obj({ productId: 'board-galva' }), 'frameMat')).toEqual(['스텐', '철', '알루미늄', '텐션 천']);
  });
  it('돌출 간판: 모양(사각/원형) · 몸체에 스텐', () => {
    const o = obj({ productId: 'board-protrude' });
    expect(values(o, 'shape')).toEqual(['사각', '원형']);
    expect(values(o, 'body')).toEqual(['갈바 도색', '스텐', '후렉스', '아크릴']);
  });
  it('라이트패널: 면 · SMPS 내장/외장 · 실내/옥외 방수 · 프레임색', () => {
    const o = obj({ productId: 'board-lightpanel' });
    expect(keys(o).slice(0, 4)).toEqual(['sides', 'smps', 'place', 'framePaintSystem']); // 프레임 색 = 컬러 피커 (2026-10-17)
  });
  it('패브릭 라이트박스: 확산바 · 설치', () => {
    expect(keys(obj({ productId: 'board-fabric' })).slice(0, 2)).toEqual(['diffuser', 'mount']);
  });
  it('지주 간판: 지주 종류 · 카바 · 조명', () => {
    const o = obj({ productId: 'board-pole' });
    expect(values(o, 'pole')).toEqual(['파이프 지주', '스텐 지주', '알미늄 지주', '갈바 지주', '갈바 사면 지주', '삼각기둥']);
    expect(values(o, 'cover')).toEqual(['없음', '스텐 카바', '갈바 카바']);
  });
  it('어닝: 고정형/접이식 (2026-10-15 분류 재정리)', () => {
    expect(values(obj({ productId: 'board-awning' }), 'form')).toEqual(['고정형', '접이식']);
  });
  it('LED 사인미러: 거울 · 프레임 · 프레임색 · LED 빛 (채널 없음)', () => {
    const o = obj({ productId: 'board-mirror' });
    expect(keys(o)).toEqual(['mirror', 'frame', 'framePaintSystem', 'led', 'faceSystem']); // 프레임 색 피커 + 바탕색 (2026-10-17)
    expect(values(o, 'led')).toEqual(['주광색 5700K', '전구색 4000K']);
  });
  it('전광판: 색 · 모듈 · 면 (채널 없음)', () => {
    const o = obj({ productId: 'board-ledsign' });
    expect(keys(o)).toEqual(['color', 'module', 'sides', 'framePaintSystem', 'faceSystem']); // 케이스 색 (2026-10-17)
    expect(values(o, 'module')).toEqual(['200mm', '240mm', '320mm']);
  });
  it('아크릴 액자·현판: 형태 · 소재 · 출력 레이어 · 전처리 · 부착 (액자 분류라 채널 없음, 두께는 치수 두께 — 2026-10-16 중복 정리)', () => {
    const o = obj({ productId: 'board-acrylic' });
    expect(keys(o)).toEqual(['form', 'material', 'layers', 'mount', 'faceSystem']);
    expect(keys(obj({ productId: 'board-acrylic', options: { layers: '컬러+화이트 (2레이어)' } }))).toContain('primer'); // 출력할 때만 전처리
    expect(values(o, 'form')).toEqual(['일반 판', '현판', '게시판', '액자', '번호판·층수·호수']);
    expect(values(o, 'layers')).toEqual(['출력 없음', '컬러 (1레이어)', '화이트 (1레이어)', '컬러+화이트 (2레이어)', '컬러+화이트+컬러 (3레이어)', '컬러+컬러 (2레이어)']);
  });
  it('포맥스: 두께 = 치수 두께 빠른 선택 (2026-10-16 "실측에 두께가 있어 포멕스 두께가 따로표시 중복")', () => {
    expect(thickPresetsFor('board-foamex')).toEqual([3, 5, 8, 10, 15, 20, 30]);
  });
});

describe('채널 (입체 글자) 조합', () => {
  const ch = (opts: Record<string, string | boolean>) => obj({ productId: 'board-galva', options: { channel: '전광 채널', ...opts } });
  it('채널 종류에 통아크릴·벌브, 채널 방식에 캡 단차(아크릴)', () => {
    expect(CHANNEL_OPTIONS.map((c) => c.label)).toEqual(expect.arrayContaining(['통아크릴 채널', '벌브 채널']));
    expect(values(ch({}), 'chType')).toEqual(['캡', '오싸이', '일체형', '캡 단차(아크릴)']);
    expect(signParts(ch({ channel: '통아크릴 채널' })).channelId).toBe('ch-acrylic');
    expect(lightingOf('ch-acrylic')).toBe('front'); expect(lightingOf('ch-bulb')).toBe('front');
  });
  it('캡·오싸이는 제작 방식(용접/타카), 입체 두께 80mm 기준 · 100mm(+10%)', () => {
    expect(values(ch({ chType: '캡' }), 'chBuild')).toEqual(['용접', '타카']);
    expect(keys(ch({ chType: '일체형' }))).not.toContain('chBuild');
    expect(values(ch({}), 'chDepth')).toEqual(['80mm (기준)', '100mm (+10%)']);
  });
  it('에폭시 채널: 입체 두께 25~80mm', () => {
    expect(values(ch({ channel: '갈바 에폭시 채널 (비조명)' }), 'chDepth')).toEqual(['25mm', '30mm', '35mm', '50mm', '60mm', '80mm']);
  });
  it('전후광은 양면(돌출용) 선택, 서체 기준, 알루미늄 채널 프레임(폭·색), 까치발', () => {
    expect(keys(ch({ channel: '전후광 채널' }))).toContain('chDouble');
    expect(keys(ch({}))).not.toContain('chDouble');
    expect(values(ch({}), 'font')).toEqual(['각고딕·영문고딕 (기준)', '명조·예서체 등 (상담)']);
    expect(values(ch({}), 'chFrame')).toEqual(['없음', '150폭', '200폭', '250폭', '300폭', '400폭']);
    expect(keys(ch({}))).not.toContain('chFramePaintSystem');
    expect(keys(ch({ chFrame: '200폭' }))).toContain('chFramePaintSystem'); // 채널 프레임 색 = 컬러 피커 (2026-10-17)
    expect(keys(ch({}))).toContain('bracket');
  });
});

describe('스카시·시트', () => {
  it('고무 스카시 표면: 칼라 알루미늄 · 수입 금색 · 수입 은색 · 시트 · 아크릴 · 없음', () => {
    expect(values(obj({ productId: 'ch-rubber' }), 'material')).toEqual(['칼라 알루미늄', '수입 금색', '수입 은색', '시트 부착', '아크릴 전면판', '없음']);
  });
  it('아크릴 스카시(레이저 커팅): 두께 3/5/8/10T · 한글/영문', () => {
    const o = obj({ productId: 'ch-scashi' });
    expect(values(o, 'thickness')).toEqual(['3T', '5T', '8T', '10T']);
    expect(values(o, 'script')).toEqual(['한글', '영문']);
  });
  it('UV 실사: 바탕(흰색/회색) · 잉크, 원웨이: 잉크 (2026-10-15 분류 재정리)', () => {
    const p = obj({ sheetIds: ['sh-print'] });
    expect(values(p, 'base')).toEqual(['흰색', '회색']);
    expect(values(p, 'ink')).toEqual(['UV', '솔벤트']);
    expect(keys(obj({ sheetIds: ['sh-perf'] }))).toContain('ink');
  });
});
