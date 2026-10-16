// 사인물 분류 재정리 (2026-10-15 사용자: "간판,시트,스카시,포맥스,현수막,라이트패널,액자,어닝 / 프레임스타일:후렉스,갈바,트러스트,파이프간접 / 후렉스: 단면,양면 /
// 프레임 재질(후렉스제외):스텐,알루미늄,철,천 / 스카시: 고무, 티타늄, 아크릴 (두께,재질, 도색컬러코드) / 시트: uv실사(흰색,회색), 단색(재질)시트,안개 /
// 시트커팅: 돔보(uv실사), 커팅(단색,재질시트) / 포멕스:uv시트부착 / 어닝: 고정형,접이식(수동,자동, 펼침, 제작사, 천코드,핸들좌우,핸들길이)"
// 답: "1. 간판옵션이다. 그리고 스카시도 부착된다 2. 돌출, 알루미늄 복합판, 몸통 없음, 지주, 전광판 간판에 있고 사인미러는 따로
// 3. 트러스트는 체널을 잡는 프레임보다 가느다란 프레임(용어가 틀렸다면 수정해줘, 텐션 천 간판) 4 어닝 벽에서 나오는 길이, 직접입력 5 그래 그런데 액자에 나무틀 패브릭도")
import { partKindsFor } from '../../src/lib/core/parts';
import { partsOf } from '../../src/lib/core/parts';
import { partOptionFields } from '../../src/lib/core/options';
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { optionGroupsFor } from '../../src/lib/core/options';
import { CATEGORY_GROUPS, SHEETS, categoryOf, defaultProductFor, productById, productsOf, signParts, sheetsForPicker } from '../../src/lib/core/catalog';
import { DEFAULT_PRICES } from '../../src/lib/core/pricing';
import { quoteObject } from '../../src/lib/core/quote';
import { renderSpecOf } from '../../src/lib/core/render';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
// 스카시 분류의 두께·재질·도색은 스카시 구성 요소에 (2026-10-16 겹침 정리)
const fields = (o: SignObject) => [...optionGroupsFor(o).flatMap((g) => g.fields), ...(['ch-rubber', 'sc-titan', 'ch-scashi'].includes(o.productId ?? '') ? partOptionFields(partsOf(o)[0]) : [])];
const keys = (o: SignObject) => fields(o).map((f) => f.key);
const values = (o: SignObject, k: string) => fields(o).find((f) => f.key === k)?.values?.map((v) => v.id);
const ids = (g: Parameters<typeof productsOf>[0]) => productsOf(g).map((p) => p.id);

describe('분류 9개', () => {
  it('간판 · 시트 · 스카시 · 포맥스 · 현수막 · 라이트패널 · 액자 · 어닝 · 사인미러', () => {
    expect(CATEGORY_GROUPS.map((g) => g.label)).toEqual(['간판', '시트', '스카시', '포맥스', '현수막', '라이트패널', '액자', '어닝', '사인미러']);
  });
  it('분류마다 종류와 기본 종류', () => {
    expect(ids('sign')).toEqual(['board-flex', 'board-galva', 'board-truss', 'board-pipe', 'board-protrude', 'board-acp', 'board-pole', 'board-ledsign', 'board-reface', 'board-air', 'body-none']);
    expect(ids('scashi')).toEqual(['ch-rubber', 'sc-titan', 'ch-scashi']);
    expect(ids('foamex')).toEqual(['board-foamex']);
    expect(ids('banner')).toEqual(['banner']);
    expect(ids('lightpanel')).toEqual(['board-lightpanel', 'board-fabric']);
    expect(ids('frame')).toEqual(['board-acrylic', 'frame-plain', 'frame-wood']);
    expect(ids('awning')).toEqual(['board-awning']);
    expect(ids('mirror')).toEqual(['board-mirror']);
    expect(defaultProductFor('foamex')).toBe('board-foamex');
    expect(defaultProductFor('frame')).toBe('board-acrylic');
    expect(categoryOf(obj({ productId: 'board-mirror' }))).toBe('mirror');
    expect(categoryOf(obj({ productId: 'board-foamex' }))).toBe('foamex');
  });
  it('새 종류의 이름·단가', () => {
    expect(productById('board-truss')!.name).toBe('트러스 (얇은 프레임)');
    expect(productById('board-pipe')!.name).toBe('파이프 간접');
    expect(productById('banner')!.name).toBe('현수막');
    expect(productById('frame-wood')!.name).toBe('나무틀 패브릭 액자');
    for (const id of ['board-truss', 'board-pipe', 'banner', 'frame-plain', 'frame-wood']) expect(DEFAULT_PRICES.products[id]).toBeGreaterThan(0);
  });
});

describe('간판', () => {
  it('후렉스: 단면/양면 (프레임 재질 없음)', () => {
    expect(values(obj({ productId: 'board-flex' }), 'sides')).toEqual(['단면', '양면']);
    expect(keys(obj({ productId: 'board-flex' }))).not.toContain('frameMat');
  });
  it('후렉스 외 프레임 스타일: 프레임 재질 스텐 / 알루미늄 / 철 / 텐션 천', () => {
    for (const id of ['board-galva', 'board-truss', 'board-pipe']) expect(values(obj({ productId: id }), 'frameMat')).toEqual(['스텐', '철', '알루미늄', '텐션 천']);
  });
  it('간판 옵션: 채널 + 스카시 부착 (고르면 두께·재질·도색)', () => {
    const o = obj({ productId: 'board-galva' });
    expect(keys(o)).toEqual(expect.arrayContaining(['channel', 'scashi']));
    expect(values(o, 'scashi')).toEqual(['없음', '고무 스카시', '티타늄 스카시', '아크릴 스카시']);
    expect(keys(o)).not.toContain('scThick');
    const s = obj({ productId: 'board-galva', options: { scashi: '고무 스카시' } });
    expect(keys(s)).toEqual(expect.arrayContaining(['scThick', 'scMaterial', 'scPaintSystem'])); // 도색 객체: 코드·광택은 색상 체계를 고른 뒤 (2026-10-16)
    expect(values(s, 'scThick')).toEqual(['10T', '20T', '30T', '50T']);
  });
  it('스카시 부착은 견적에 스카시 줄, 3D 에 비조명 입체 글자', () => {
    const s = obj({ productId: 'body-none', widthMm: 3000, heightMm: 600, text: '간판다', options: { scashi: '아크릴 스카시', scThick: '10T' } });
    expect(signParts(s).scashiId).toBe('ch-scashi');
    expect(quoteObject(s, DEFAULT_PRICES).some((l) => l.label.includes('아크릴 스카시'))).toBe(true);
    const spec = renderSpecOf(s, { cx: 0, cy: 0, w: 3000, h: 600 } as never)!;
    expect(spec.kind).toBe('channel'); expect(spec.lighting).toBe('none'); expect(spec.depthMm).toBe(10);
  });
});

describe('스카시: 두께 · 재질 · 도색 컬러코드', () => {
  for (const [id, th] of [['ch-rubber', ['10T', '20T', '30T', '50T']], ['sc-titan', ['1.2T', '10T', '20T']], ['ch-scashi', ['3T', '5T', '8T', '10T']]] as const) {
    it(id, () => {
      const o = obj({ productId: id });
      expect(keys(o).filter((k) => ['thickness', 'material', 'paintSystem'].includes(k))).toEqual(['thickness', 'material', 'paintSystem']); // 도색 객체: 코드·광택은 색상 체계를 고른 뒤 (2026-10-16)
      expect(values(o, 'thickness')).toEqual(th);
    });
  }
});

describe('시트: UV 실사(흰색/회색) · 단색(재질) · 안개, 커팅은 종류에 따라 (돔보 / 커팅)', () => {
  it('고르는 목록은 세 가지, 이름에 커팅 방식', () => {
    expect(sheetsForPicker().map((s) => s.name)).toEqual(['UV 실사 (돔보 커팅)', '단색·재질 시트 (커팅)', '안개 시트 (커팅)']);
  });
  it('UV 실사: 바탕 흰색/회색, 단색: 재질', () => {
    expect(values(obj({ sheetIds: ['sh-print'] }), 'base')).toEqual(['흰색', '회색']);
    expect(values(obj({ sheetIds: ['sh-cut'] }), 'sheetMat')).toEqual(['단색', '반사', '투명', '메탈', '홀로그램']);
  });
  it('옛 시트(원웨이·반사·투명)는 그대로 읽힌다', () => {
    expect(SHEETS.map((s) => s.id)).toEqual(expect.arrayContaining(['sh-perf', 'sh-reflect', 'sh-trans']));
  });
});

describe('포맥스 · 현수막 · 라이트패널 · 액자 · 어닝', () => {
  it('포맥스: UV 시트 부착 = 시트 구성 요소 (2026-10-16 조합형·중복 정리)', () => {
    expect(partKindsFor(obj({ productId: 'board-foamex' }))).toContain('sheet');
    expect(keys(obj({ productId: 'board-foamex' }))).not.toContain('uvSheet');
  });
  it('현수막: 출력 · 추가 마감', () => {
    const o = obj({ productId: 'banner' });
    expect(values(o, 'print')).toEqual(['일반', '솔벤']);
    expect(keys(o)).toEqual(expect.arrayContaining(['stitch', 'endStitch', 'join', 'band']));
  });
  it('액자: 프레임 액자(프레임색) · 나무틀 패브릭(나무색·패브릭 출력)', () => {
    expect(values(obj({ productId: 'frame-plain' }), 'frameColor')).toEqual(['실버', '화이트', '블랙']);
    expect(values(obj({ productId: 'frame-wood' }), 'wood')).toEqual(['원목', '화이트', '블랙', '월넛']);
  });
  it('어닝: 고정형/접이식, 접이식이면 작동(수동/자동), 수동이면 핸들 좌우·길이, 공통 펼침(mm)·제작사·천 코드(직접 입력)', () => {
    const fixed = obj({ productId: 'board-awning' });
    expect(values(fixed, 'form')).toEqual(['고정형', '접이식']);
    expect(keys(fixed)).toEqual(['form', 'reach', 'maker', 'fabricCode']);
    const fold = obj({ productId: 'board-awning', options: { form: '접이식' } });
    expect(keys(fold)).toEqual(['form', 'drive', 'handleSide', 'handleLength', 'reach', 'maker', 'fabricCode']);
    expect(keys(obj({ productId: 'board-awning', options: { form: '접이식', drive: '자동' } }))).not.toContain('handleSide');
    expect(fields(fixed).find((f) => f.key === 'maker')!.kind).toBe('text');
  });
});
