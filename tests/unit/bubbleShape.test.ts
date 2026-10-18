// 말풍선 모양·꼭지 추적 (2026-10-18 사용자: "말풍선에 대략의 내용을 표시하고 꼭지를 따로 지정", "꼭지 위치는 자연스럽게 풍선과 연결", "꼭지점 위치의 사인물을 최대한 추적")
import { describe, expect, it } from 'vitest';
import type { Pin, SignObject } from '../../src/lib/core/model';
import { BUBBLE_RATIO, bodySize, bubbleLayout, bubblePath, edgePoint, roundedRectPath, tailTriangle, textWidth, wrapLines } from '../../src/lib/core/bubbleShape';
import { objectAtPoint, pinsOnObject } from '../../src/lib/core/bubbleTarget';

const body = { cx: 100, cy: 100, w: 80, h: 30 };
describe('꼬리는 몸통 중심→꼭지 방향의 변에서 나온다', () => {
  it('아래쪽 꼭지 → 아랫변, 오른쪽 꼭지 → 오른변, 몸통 안이면 꼬리 없음', () => {
    expect(edgePoint(body, [100, 200])).toEqual([100, 115]);
    expect(edgePoint(body, [300, 100])).toEqual([140, 100]);
    expect(edgePoint(body, [105, 103])).toBeNull();
  });
  it('밑변은 변을 따라 ±half, 안쪽으로 inset; 모서리 근처면 변 안으로 당긴다', () => {
    const t = tailTriangle(body, [100, 200], 6, 3)!;
    expect(t[1]).toEqual([100, 200]);
    expect(t[0]).toEqual([94, 112]); expect(t[2]).toEqual([106, 112]);
    const near = tailTriangle(body, [139, 300], 6, 3)!; // 아랫변 오른쪽 끝 근처
    expect(near[2][0]).toBeLessThanOrEqual(140);
    expect(tailTriangle(body, [100, 100], 6, 3)).toBeNull();
  });
  it('글 폭·몸통 크기·둥근 상자 경로', () => {
    expect(textWidth('간판', 10)).toBe(20);
    expect(textWidth('ab', 10)).toBeCloseTo(11.2);
    expect(bodySize('', 10).w).toBe(24);
    expect(bodySize('가나다라마', 10).w).toBe(50 + 14);
    expect(roundedRectPath(body, 5)).toMatch(/^M65 85 H135 Q140 85 140 90/);
  });
});

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [100, 0], [100, 50], [0, 50]], sheetIds: [], createdAt: 0, ...o });
describe('꼭지 → 사인물 추적', () => {
  const big = obj({ id: 'big' });
  const small = obj({ id: 'small', quad: [[10, 10], [40, 10], [40, 30], [10, 30]] });
  const other = obj({ id: 'other', photoId: 'p2' });
  it('외곽선 안의 사인물, 겹치면 작은 것, 다른 사진은 제외', () => {
    expect(objectAtPoint([big, small, other], 'p', [20, 20])!.id).toBe('small');
    expect(objectAtPoint([big, small, other], 'p', [80, 40])!.id).toBe('big');
    expect(objectAtPoint([big, small, other], 'p', [200, 200])).toBeNull();
    expect(objectAtPoint([other], 'p', [20, 20])).toBeNull();
  });
  it('원형·다각형 외곽선도', () => {
    const ell = obj({ id: 'e', shape: 'ellipse' });
    expect(objectAtPoint([ell], 'p', [50, 25])!.id).toBe('e');
    expect(objectAtPoint([ell], 'p', [2, 2])).toBeNull(); // 사각 모서리는 타원 밖
    const poly = obj({ id: 'g', shape: 'polygon', polygon: [[0, 0], [100, 0], [0, 50]] });
    expect(objectAtPoint([poly], 'p', [10, 10])!.id).toBe('g');
    expect(objectAtPoint([poly], 'p', [90, 45])).toBeNull();
  });
  it('사인물을 가리키는 말풍선들', () => {
    const pin = (id: string, x: number, y: number): Pin => ({ id, photoId: 'p', x, y, author: 'a', createdAt: 0, resolved: false, number: 1 });
    expect(pinsOnObject([pin('a', 20, 20), pin('b', 80, 40), pin('c', 500, 500)], [big, small], big).map((p) => p.id)).toEqual(['b']);
    expect(pinsOnObject([pin('a', 20, 20)], [big, small], small).map((p) => p.id)).toEqual(['a']);
  });
});

// 2026-10-18 사용자: "가로3 세로2 비율 유지, 여러 줄, 표시 글자 수 리밋과 말줄임표. 풍선과 꼭지 아웃라인을 이어주고"
describe('3:2 몸통 · 여러 줄 · 말줄임표', () => {
  it('wrapLines: 공백에서 나누고, 긴 한글은 글자 단위, 줄 수를 넘기면 마지막 줄에 …', () => {
    expect(wrapLines('두께 150으로 갈까요', 10, 80)).toEqual(['두께 150으로', '갈까요']);
    expect(wrapLines('가나다라마바사아자차', 10, 50)).toEqual(['가나다라마', '바사아자차']);
    const cut = wrapLines('가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허', 10, 50, 3);
    expect(cut).toHaveLength(3);
    expect(cut[2].endsWith('…')).toBe(true);
    expect(textWidth(cut[2], 10)).toBeLessThanOrEqual(50);
  });
  it('bubbleLayout: 항상 가로:세로 = 3:2, 짧은 글은 1줄, 길면 줄을 늘리고 최대 3줄', () => {
    for (const t of ['', '#1', '나: 두께 150으로 갈까요', '나: 아주 긴 글이 여기에 들어가면 세 줄까지 늘어나고 그래도 넘치면 말줄임표가 붙습니다 정말로']) {
      const l = bubbleLayout(t, 10);
      expect(l.w / l.h).toBeCloseTo(BUBBLE_RATIO, 5);
      expect(l.lines.length).toBeLessThanOrEqual(3);
    }
    expect(bubbleLayout('#1', 10).lines).toEqual(['#1']);
    expect(bubbleLayout('나: 두께 150으로 갈까요 어떨까요', 10).lines.length).toBeGreaterThan(1);
  });
  it('bubblePath: 한 획, 꼭지 좌표를 지나고, 꼭지가 안이면 꼬리 없음', () => {
    const b = { cx: 100, cy: 100, w: 90, h: 60 };
    const d = bubblePath(b, [100, 200], 7, 7);
    expect(d.startsWith('M')).toBe(true);
    expect((d.match(/M/g) ?? []).length).toBe(1);
    expect(d).toContain('L100 200');
    expect(bubblePath(b, [100, 100], 7, 7)).not.toContain('L100 100');
    expect(bubblePath(b, [300, 100], 7, 7)).toContain('L300 100'); // 오른쪽 변
  });
});
