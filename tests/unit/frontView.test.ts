// 조합형 3단계: 설정 창 안 정면도 편집기의 계산 (2026-10-16 사용자: 정면도 편집기는 "2" — 설정 창 안에 따로)
import { describe, expect, it } from 'vitest';
import type { PartItem } from '../../src/lib/core/model';
import { TEXT_CHAR_ASPECT, alignBox, frameBox, itemBox, resizeItem, snapMove, viewOf } from '../../src/lib/core/frontView';

const item = (o: Partial<PartItem>): PartItem => ({ id: 'i', kind: 'text', x: 0, y: 0, h: 300, ...o });

describe('객체 상자 (간판 중앙 기준 mm, 위 +)', () => {
  it('글자: 가로 = 글자수 × 높이 × 글자 비율 (공백 제외)', () => {
    expect(itemBox(item({ text: '바로 바로', h: 600, x: 100, y: -50 }))).toEqual({ x: 100, y: -50, w: 4 * 600 * TEXT_CHAR_ASPECT, h: 600 });
  });
  it('글자: 가로를 직접 넣었으면 그 값, 빈 글자는 한 글자 폭', () => {
    expect(itemBox(item({ text: 'AB', w: 500 })).w).toBe(500);
    expect(itemBox(item({ text: '' })).w).toBe(300 * TEXT_CHAR_ASPECT);
  });
  it('그림: 가로가 없으면 높이와 같은 정사각', () => {
    expect(itemBox(item({ kind: 'image', h: 400 }))).toEqual({ x: 0, y: 0, w: 400, h: 400 });
    expect(itemBox(item({ kind: 'image', h: 400, w: 1000 })).w).toBe(1000);
  });
  it('프레임 = 사인물 가로×세로, 중앙 0', () => {
    expect(frameBox({ widthMm: 6000, heightMm: 900 })).toEqual({ x: 0, y: 0, w: 6000, h: 900 });
  });
});

describe('화면 변환', () => {
  it('프레임과 객체가 모두 여백 안에 들어가는 축척, 중앙 정렬, y 는 뒤집힘', () => {
    const v = viewOf({ x: 0, y: 0, w: 6000, h: 900 }, [], 480, 200, 20);
    expect(v.scale).toBeCloseTo(440 / 6000);
    expect(v.toView([0, 0])).toEqual([240, 100]);
    expect(v.toView([3000, 450])[0]).toBeCloseTo(460);
    expect(v.toView([3000, 450])[1]).toBeCloseTo(100 - 450 * v.scale);
    const [x, y] = v.toMm(v.toView([1234, -321]));
    expect(x).toBeCloseTo(1234);
    expect(y).toBeCloseTo(-321);
  });
  it('프레임 밖으로 나간 객체도 보이게 범위를 넓힌다', () => {
    // 범위 -500 ~ 2000 (가로 2500mm) 를 가운데에
    const v = viewOf({ x: 0, y: 0, w: 1000, h: 1000 }, [{ x: 1500, y: 0, w: 1000, h: 100 }], 400, 400, 0);
    expect(v.scale).toBeCloseTo(400 / 2500);
    expect(v.toView([750, 0])).toEqual([200, 200]);
  });
  it('치수가 없으면 기본 프레임 (축척 0 이 되지 않게)', () => {
    expect(viewOf({ x: 0, y: 0, w: 0, h: 0 }, [], 400, 200, 0).scale).toBeGreaterThan(0);
  });
});

describe('끌 때 붙기 (스냅)', () => {
  const frame = { x: 0, y: 0, w: 6000, h: 900 };
  it('가까우면 프레임 중앙선에 붙고 안내선을 돌려준다', () => {
    const r = snapMove({ x: 30, y: -20, w: 1000, h: 300 }, frame, [], 50);
    expect([r.x, r.y]).toEqual([0, 0]);
    expect(r.guides).toEqual([{ axis: 'x', at: 0 }, { axis: 'y', at: 0 }]);
  });
  it('객체 왼쪽 끝이 프레임 왼쪽 끝에, 위 끝이 프레임 위 끝에 붙는다', () => {
    const r = snapMove({ x: -2480, y: 290, w: 1000, h: 300 }, frame, [], 50);
    expect([r.x, r.y]).toEqual([-2500, 300]);
  });
  it('다른 객체의 중앙·끝에도 붙는다', () => {
    const r = snapMove({ x: 1210, y: -400, w: 400, h: 100 }, frame, [{ x: 1200, y: 100, w: 800, h: 300 }], 50);
    expect(r.x).toBe(1200);
    expect(r.guides).toContainEqual({ axis: 'x', at: 1200 });
  });
  it('멀면 그대로 (mm 정수로 반올림)', () => {
    const r = snapMove({ x: 812.4, y: -233.6, w: 100, h: 100 }, frame, [], 50);
    expect([r.x, r.y, r.guides]).toEqual([812, -234, []]);
  });
});

describe('정렬', () => {
  const frame = { x: 0, y: 0, w: 6000, h: 900 };
  const b = { x: 700, y: 100, w: 1000, h: 300 };
  it('왼쪽·가운데·오른쪽, 위·가운데·아래 (프레임 기준)', () => {
    expect(alignBox(b, frame, 'left')).toEqual({ x: -2500, y: 100 });
    expect(alignBox(b, frame, 'center')).toEqual({ x: 0, y: 100 });
    expect(alignBox(b, frame, 'right')).toEqual({ x: 2500, y: 100 });
    expect(alignBox(b, frame, 'top')).toEqual({ x: 700, y: 300 });
    expect(alignBox(b, frame, 'middle')).toEqual({ x: 700, y: 0 });
    expect(alignBox(b, frame, 'bottom')).toEqual({ x: 700, y: -300 });
  });
});

describe('크기 바꾸기 (비율 유지)', () => {
  it('높이를 바꾸면 가로가 있는 객체는 같은 비율로', () => {
    expect(resizeItem(item({ kind: 'image', h: 400, w: 1000 }), 200)).toEqual({ h: 200, w: 500 });
  });
  it('가로가 없으면 높이만, 너무 작게는 안 됨 (최소 10mm), mm 정수', () => {
    expect(resizeItem(item({ h: 300 }), 451.6)).toEqual({ h: 452 });
    expect(resizeItem(item({ h: 300 }), 2)).toEqual({ h: 10 });
  });
});
