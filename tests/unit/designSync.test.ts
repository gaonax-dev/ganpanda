// 디자인 싱크 받기 검토 (2026-11-06 사용자: "받은 다음 사진보드에서 연결상태 확인 후 확정 버튼으로 파일연결 누락이나 새로 생긴 경우 처리방안 필요")
import { describe, expect, it } from 'vitest';
import { planArtboards, planBundle, SYNC_ACTIONS } from '../../src/lib/core/designSync';

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
