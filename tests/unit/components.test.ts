// 구성 요소 레지스트리 (레이어 구조 0단계, 2026-10-18): 종류마다 모듈 하나 — 코어·UI·3D 는 종류 이름으로 분기하지 않는다
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COMPONENTS, componentOf, componentKinds } from '../../src/lib/core/components';
import { newItem, newPart, partLabel, partSpecOf, sheetTargets, layerOrder, PART_KIND_LABEL, PART_TYPES } from '../../src/lib/core/parts';
import { PART_COLOR } from '../../src/lib/core/partsLayout';
import { partOptionFields } from '../../src/lib/core/options';
import { quoteObject } from '../../src/lib/core/quote';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import type { SignObject } from '../../src/lib/core/model';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });

describe('레지스트리', () => {
  it('채널·스카시·시트 세 종류, 이름·색·세부 종류·옵션 스키마를 모듈이 가진다', () => {
    expect(componentKinds()).toEqual(['channel', 'scashi', 'sheet', 'light', 'molding', 'pole', 'led']); // 상단 조명·몰딩·지주·LED 모듈 (2026-10-19)
    for (const c of COMPONENTS) {
      expect(c.label).toBeTruthy(); expect(c.color).toMatch(/^#/); expect(c.types.length).toBeGreaterThan(0);
      expect(componentOf(c.kind)).toBe(c);
      expect(partOptionFields(newPart(c.kind)).length).toBeGreaterThan(0);
    }
    expect(() => componentOf('neon')).toThrow();
  });
  it('호환 표(PART_KIND_LABEL·PART_TYPES·PART_COLOR)는 레지스트리에서 나온다', () => {
    expect(PART_KIND_LABEL).toEqual({ channel: '채널', scashi: '스카시', sheet: '시트', light: '상단 조명', molding: '몰딩', pole: '지주', led: 'LED 모듈' });
    expect(PART_TYPES.sheet.map((t) => t.id)).toEqual(['sh-print', 'sh-cut']);
    expect(PART_COLOR.channel).toBe(componentOf('channel').color);
  });
  it('새 구성 요소는 모듈의 init 으로 (시트는 프레임 면에)', () => {
    expect(newPart('sheet').on).toBe('frame');
    expect(newPart('channel').on).toBeUndefined();
    expect(newPart('scashi', 'sc-titan').type).toBe('sc-titan');
  });
  it('이름·구성내역·올릴 곳·층은 모듈이 정한다', () => {
    const ch = newPart('channel', 'ch-halo'), sc = newPart('scashi', 'ch-rubber'), sh = newPart('sheet', 'sh-print');
    expect(partLabel(ch)).toBe('후광 채널'); expect(partSpecOf(ch)).toBe('후광 채널');
    expect(partSpecOf(sh)).toBe('UV 출력 돔보컷팅 완컷');
    expect(componentOf('scashi').host).toBeUndefined(); // 스카시 위에는 못 올린다
    expect(sheetTargets([ch, sc, sh], sh).map((t) => t.id)).toEqual(['frame', ch.id]);
    expect(layerOrder([ch, sh, sc]).map((p) => p.kind)).toEqual(['sheet', 'channel', 'scashi']);
  });
  it('3D 규칙: 채널·스카시는 밀어내기(두께·조명·도색 키), 시트는 평면', () => {
    const o = obj({ letter3d: { depthMm: 120, faceColor: '#fff', sideColor: '#000', letterSpacing: 0 } });
    const ch = newPart('channel', 'ch-front'), sc = newPart('scashi', 'ch-scashi'), sh = newPart('sheet', 'sh-cut');
    sc.options = { thickness: '8T' };
    expect(componentOf('channel').extrude).toBe(true); expect(componentOf('channel').depthMm(ch, o)).toBe(120); expect(componentOf('channel').lighting(ch)).toBe('front');
    expect(componentOf('scashi').depthMm(sc, o)).toBe(8); expect(componentOf('scashi').lighting(sc)).toBe('none'); expect(componentOf('scashi').paint.face).toBe('paint');
    expect(componentOf('sheet').extrude).toBe(false); expect(componentOf('sheet').depthMm(sh, o)).toBe(0); expect(componentOf('sheet').paint.face).toBe('sheet');
  });
  it('견적 줄은 모듈의 price 로 — 금액·문구는 전과 같다', () => {
    const P = DEFAULT_PRICES;
    const ch = newPart('channel', 'ch-front'); ch.items = [{ ...newItem('text'), text: '간판다', h: 400 }];
    const sh = newPart('sheet', 'sh-print');
    const lines = quoteObject(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600, parts: [sh, ch] }), P);
    expect(lines.map((l) => l.key)).toEqual([`o:body`, `o:part:${ch.id}`, `o:part:${sh.id}`]); // 입체 먼저, 시트 뒤 (전과 같은 순서)
    expect(lines[1].detail).toBe(`3자 × 높이 400mm × ${P.products['ch-front'].toLocaleString('ko-KR')}원/자·cm`);
    expect(lines[2].amount).toBe(Math.round((1.8 * P.sheets['sh-print']) / 1000) * 1000);
  });
});

// 종류 이름 분기가 레지스트리 밖에 남지 않게 지키는 테스트 (허용 목록: 분류·채널 전용 UI 의 "채널 찾기"처럼 종류 자체를 뜻하는 곳)
describe('종류 이름 분기 금지 (레지스트리 밖)', () => {
  const ALLOWED: Record<string, number> = {
    'core/catalog.ts': 3, // categoryOf·signParts: 분류 판정 (시트 분류·첫 채널·첫 스카시)
    'core/parts.ts': 3, // partKindsFor·categoryPatch 의 시트 분류 판정, 옛 데이터 변환
    'core/letter3d.ts': 1, // 입체 보기 = 채널 글자
    'core/render.ts': 2, // 옛 형식(letters) 의 첫 채널·스카시
    'core/quickSpec.ts': 2, // 빠른 설정의 채널 칩 (채널 전용 UI)
    'core/specText.ts': 6, // 사양 글의 채널·스카시 항목(SpecItem.kind — 구성 요소 종류 비교가 아님) + 배치 적용의 시트 레이어 찾기 (2026-10-19)
    'ui/ObjectSettingsDialog.svelte': 2, // 칩에서 열 때 채널 탭
    'core/terms.ts': 5, // 사양 글 항목(SpecItem.kind 'channel'·'scashi')의 공급사 용어 힌트·용어집 동의어 — 구성 요소 종류 비교가 아님 (2026-10-19)
  };
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  it('src/lib 에서 kind === \'채널|스카시|시트\' 비교는 허용 목록 안에서만', () => {
    const root = join(__dirname, '../../src/lib');
    const re = /(?<!spec)\.kind\s*[!=]==\s*'(channel|scashi|sheet)'/g; // spec.kind 는 3D 사양(channel|lightbox)이라 제외
    const found: Record<string, number> = {};
    for (const f of walk(root)) {
      if (f.includes('/core/components/')) continue;
      const n = (readFileSync(f, 'utf8').match(re) ?? []).length;
      if (n) found[f.slice(root.length + 1)] = n;
    }
    for (const [f, n] of Object.entries(found)) expect(n, `${f}: 종류 분기 ${n}곳 — 레지스트리(core/components)로`).toBeLessThanOrEqual(ALLOWED[f] ?? 0);
  });
});
