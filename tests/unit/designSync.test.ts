// 디자인 싱크 받기 검토 (2026-11-06 사용자: "받은 다음 사진보드에서 연결상태 확인 후 확정 버튼으로 파일연결 누락이나 새로 생긴 경우 처리방안 필요")
import { describe, expect, it } from 'vitest';
import { defaultLayerPart, planArtboards, planBundle, SYNC_ACTIONS } from '../../src/lib/core/designSync';

const signs = [
  { id: 'a', w: 3000, h: 600, hasDesign: false },
  { id: 'b', w: 600, h: 900, hasDesign: true },
  { id: 'c', w: 1200, h: 400, hasDesign: false },
];

describe('planArtboards — 대지 ↔ 사인물', () => {
  it('짝 정보(XMP): 짝 = 연결(디자인 있으면 바뀜), 짝 없는 대지 = 새로 생김(새 사인물로), 파일에 없는 사인물 = 누락(기존 유지)', () => {
    const pages = [{ w: 300, h: 60 }, { w: 60, h: 90 }, { w: 200, h: 50 }];
    const rows = planArtboards(pages, ['a', 'b', null], signs);
    expect(rows.find((r) => r.signId === 'a')).toMatchObject({ status: 'link', action: 'apply', page: 0 });
    expect(rows.find((r) => r.signId === 'b')).toMatchObject({ status: 'update', action: 'apply', page: 1 });
    // 새 대지: 실물 크기 = 짝지은 대지 축척(1:10)으로
    expect(rows.find((r) => r.status === 'new')).toMatchObject({ action: 'create', page: 2, w: 2000, h: 500 });
    expect(rows.find((r) => r.signId === 'c')).toMatchObject({ status: 'missing', action: 'keep' });
  });
  it('짝 정보의 id 가 지워진 사인물이거나 겹치면 새로 생김', () => {
    const rows = planArtboards([{ w: 3000, h: 600 }, { w: 3000, h: 600 }, { w: 500, h: 500 }], ['a', 'a', 'gone'], signs);
    expect(rows.filter((r) => r.status === 'new').map((r) => r.page)).toEqual([1, 2]);
  });
  it('짝 정보 없음(코렐·다른 PDF): 크기로 짝, 우연히 맞은 기존 디자인은 덮지 않음(기존 유지), 남는 대지는 건너뜀, 누락은 따지지 않음', () => {
    const rows = planArtboards([{ w: 3000, h: 600 }, { w: 600, h: 900 }, { w: 10, h: 10 }], null, signs);
    expect(rows.find((r) => r.signId === 'a')).toMatchObject({ status: 'link', action: 'apply' });
    expect(rows.find((r) => r.signId === 'b')).toMatchObject({ status: 'update', action: 'keep' });
    expect(rows.find((r) => r.page === 2)).toMatchObject({ status: 'new', action: 'skip' });
    expect(rows.some((r) => r.status === 'missing')).toBe(false);
  });
  it('상태마다 고를 수 있는 처리', () => {
    expect(SYNC_ACTIONS.link).toEqual(['apply', 'skip']);
    expect(SYNC_ACTIONS.update).toEqual(['apply', 'keep']);
    expect(SYNC_ACTIONS.new).toEqual(['create', 'skip']);
    expect(SYNC_ACTIONS.missing).toEqual(['keep', 'unlink']);
  });
});

describe('planBundle — 일러스트 묶음(.ganpanda) ↔ 사인물 (2026-11-06 정의)', () => {
  // "디자인은 대지 이름별로 이미지로 변환해 사인물 카드에 바로 적용한다. path는 대지 이름을 통해 사인물을 찾고 해당 구성물의 path에 사용자가 연결한다"
  const signs = [
    { id: 'a', hasDesign: false, pathParts: ['ch'] },
    { id: 'b', hasDesign: true, pathParts: ['ch2', 'sc2'] },
    { id: 'c', hasDesign: false, pathParts: [] },
  ];
  it('디자인 = 바로 입힘, path = 구성물(채널·스카시)이 하나면 그것, 여럿이면 사용자가 고름, 묶음에 없는 사인물은 누락', () => {
    const rows = planBundle([{ sign: 'a', part: 'design' }, { sign: 'a', part: 'path' }, { sign: 'b', part: 'path' }, { sign: 'x', part: 'design' }], signs);
    expect(rows.find((r) => r.signId === 'a')).toMatchObject({ status: 'link', action: 'apply', design: true, path: true, pathPart: 'ch', pathParts: ['ch'] });
    // path 만 — 디자인은 그대로라 "연결"
    expect(rows.find((r) => r.signId === 'b')).toMatchObject({ status: 'link', action: 'apply', design: false, path: true, pathPart: '', pathParts: ['ch2', 'sc2'] });
    expect(rows.find((r) => r.signId === 'x')).toMatchObject({ status: 'new', action: 'skip', actions: ['skip'] });
    expect(rows.find((r) => r.signId === 'c')).toMatchObject({ status: 'missing', action: 'keep' });
  });
  it('빈(투명) 디자인은 넣지 않고 표시 — path 가 없으면 줄 기본 처리는 건너뛰기 (2026-11-07 핀볼: 받은 디자인 PNG 가 모두 투명)', () => {
    const rows = planBundle([{ sign: 'a', part: 'design', blank: true }, { sign: 'b', part: 'design', blank: true }, { sign: 'b', part: 'path' }], signs);
    expect(rows.find((r) => r.signId === 'a')).toMatchObject({ design: false, designBlank: true, action: 'skip', status: 'link' });
    expect(rows.find((r) => r.signId === 'b')).toMatchObject({ design: false, designBlank: true, path: true, action: 'apply' });
  });
  it('디자인이 있던 사인물에 새 디자인 = 바뀜', () => {
    expect(planBundle([{ sign: 'b', part: 'design' }], signs)[0]).toMatchObject({ status: 'update', action: 'apply', design: true, path: false });
  });
  it('예전 묶음(바탕 frame·구성 요소 id)도 읽는다 — frame = 디자인, 구성 요소 id 는 그 구성 요소로', () => {
    const r = planBundle([{ sign: 'a', part: 'frame' }, { sign: 'a', part: 'ch' }, { sign: 'a', part: 'nope' }], signs).find((x) => x.signId === 'a')!;
    expect(r).toMatchObject({ design: true, parts: ['ch'] });
  });
});

// PDF 하나로 왕복 (2026-11-07 "연결된 pdf를 통해 path를 추출해 바로 연결 후 3d로" → 레이어로 고르기)
describe('planArtboards + PDF 레이어 — 대지 페이지의 레이어 벡터를 구성물에', () => {
  const signs = [{ id: 'a', w: 3000, h: 600, hasDesign: false, parts: [{ id: 'ch', kind: 'channel', label: '전광 채널' }, { id: 'sc', kind: 'scashi', label: '아크릴 스카시' }] }];
  it('벡터가 있는 레이어만 줄에, 이름으로 구성물을 미리 고름(채널·스카시·구성물 이름), 모르면 안 고름', () => {
    const rows = planArtboards([{ w: 3000, h: 600 }], ['a'], signs, [{ layers: [
      { name: '디자인', paths: 3, texts: 0 }, { name: '채널', paths: 2, texts: 0 }, { name: '아크릴 스카시', paths: 1, texts: 0 }, { name: '로고', paths: 4, texts: 0 }, { name: '빈 레이어', paths: 0, texts: 0 },
    ] }]);
    const r = rows.find((x) => x.signId === 'a')!;
    expect(r.layers!.map((l) => l.name)).toEqual(['디자인', '채널', '아크릴 스카시', '로고']);
    expect(r.layerParts).toEqual({ 디자인: '', 채널: 'ch', '아크릴 스카시': 'sc', 로고: '' });
    expect(r.pathParts).toEqual(['ch', 'sc']);
  });
  it('"체널"(흔한 오타)도 채널로', () => {
    expect(defaultLayerPart('체널', [{ id: 'ch', kind: 'channel', label: '전광 채널' }])).toBe('ch');
  });
  it('윤곽선이 아닌 글자만 있는 레이어도 줄에(안내용), 빈 페이지면 디자인을 넣지 않음', () => {
    const r = planArtboards([{ w: 3000, h: 600 }], ['a'], signs, [{ blank: true, layers: [{ name: '채널', paths: 0, texts: 5 }] }]).find((x) => x.signId === 'a')!;
    expect(r.layers).toEqual([{ name: '채널', paths: 0, texts: 5 }]);
    expect(r.designBlank).toBe(true);
    expect(r.action).toBe('skip'); // 넣을 것이 없다
  });
});

// 2026-11-07 사용자: "다시 불렀을때 이전 연결을 유지할 수 있나?"
describe('planArtboards — 지난번 레이어 연결을 기억해 미리 고름', () => {
  const parts = [{ id: 'ch', kind: 'channel', label: '전광 채널' }, { id: 'sc', kind: 'scashi', label: '아크릴 스카시' }];
  const layers = [{ name: '체널', paths: 2, texts: 0 }, { name: '로고', paths: 3, texts: 0 }, { name: '디자인', paths: 5, texts: 0 }];
  it('기억한 연결(입체 안 함 포함)이 이름 추측보다 먼저, 없어진 구성물이면 이름 추측으로', () => {
    const signs = [{ id: 'a', w: 3000, h: 600, hasDesign: true, parts, layerLinks: { 체널: '', 로고: 'sc', 디자인: 'gone' } }];
    const r = planArtboards([{ w: 3000, h: 600 }], ['a'], signs, [{ layers }]).find((x) => x.signId === 'a')!;
    expect(r.layerParts).toEqual({ 체널: '', 로고: 'sc', 디자인: '' });
  });
});
