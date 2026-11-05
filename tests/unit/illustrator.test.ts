// 일러스트레이터 왕복 (2026-11-05 사용자: "대지를 다시 구성한다는건 이후에 일러스트에서 내보내고 이것을 간판다에서 연결하는 악순을 피하려는 거지" →
// "가장 나이스한건 일러스트 플러그인을 개발하고 우리 포맷을 일러스트에서 재구성하는 거야" → "현재는 최신버전")
import { describe, expect, it } from 'vitest';
import { artboardName, idFromArtboardName, illustratorPackage, illustratorScale, jsxWithData, matchArtboards, xmpArtboardIds } from '../../src/lib/core/illustrator';

describe('illustratorPackage — 카드 배치(mm)를 대지로', () => {
  const cards = [
    { id: 'a', name: '정면 간판', x: 1000, y: 500, w: 3000, h: 600 },
    { id: 'b', name: '돌출', x: 4500, y: 500, w: 600, h: 900 },
  ];
  it('왼쪽 위 카드를 원점으로 옮기고, 전체 크기·축척을 적는다 (5.5m 이하 = 1:1)', () => {
    const p = illustratorPackage({ project: '테스트 매장', cards });
    expect(p.format).toBe('ganpanda-illustrator');
    expect(p.scale).toBe(1);
    expect(p.cards[0]).toMatchObject({ id: 'a', name: '정면 간판', x: 0, y: 0, w: 3000, h: 600 });
    expect(p.cards[1]).toMatchObject({ x: 3500, y: 0 });
    expect(p.width).toBe(4100); expect(p.height).toBe(900);
  });
  it('전체가 5.5m 를 넘으면 1:10 (일러스트 대지 한도 약 5.78m)', () => {
    expect(illustratorScale(5500, 900)).toBe(1);
    expect(illustratorScale(9000, 900)).toBe(0.1);
    expect(illustratorScale(800, 60000)).toBe(0.01);
  });
});

describe('대지 이름 = "이름 #id"', () => {
  it('만들고 되읽는다 — 이름에 #이 있어도 마지막 #뒤가 id', () => {
    expect(artboardName('정면 #1 간판', 'k9_X-2')).toBe('정면 #1 간판 #k9_X-2');
    expect(idFromArtboardName('정면 #1 간판 #k9_X-2')).toBe('k9_X-2');
    expect(idFromArtboardName('대지 1')).toBeNull();
  });
});

describe('xmpArtboardIds — 저장한 .ai(PDF 호환)의 XMP 에서 대지 순서대로 사인물 id', () => {
  it('요소·속성 두 형식, 빈 칸은 null', () => {
    expect(xmpArtboardIds('<x:xmpmeta><rdf:Description xmlns:ganpanda="http://ns.ganpanda.co.kr/1.0/"><ganpanda:artboards>a|b||c</ganpanda:artboards></rdf:Description></x:xmpmeta>')).toEqual(['a', 'b', null, 'c']);
    expect(xmpArtboardIds('<rdf:Description ganpanda:artboards="a|b"/>')).toEqual(['a', 'b']);
    expect(xmpArtboardIds('<rdf:Description/>')).toBeNull();
    expect(xmpArtboardIds(undefined)).toBeNull();
  });
});

describe('matchArtboards — 페이지(대지) ↔ 사인물', () => {
  const signs = [{ id: 'a', w: 3000, h: 600 }, { id: 'b', w: 600, h: 900 }, { id: 'c', w: 600, h: 900 }];
  it('XMP 짝이 있고 페이지 수가 같으면 그대로 (없는 사인물 id 는 빼고)', () => {
    const r = matchArtboards([{ w: 1, h: 1 }, { w: 1, h: 1 }, { w: 1, h: 1 }], signs, ['b', 'zzz', 'a']);
    expect(r).toEqual([{ page: 0, id: 'b' }, { page: 2, id: 'a' }]);
  });
  it('짝 정보가 없으면 대지 크기(mm, 1:1 또는 1:10)로 — 같은 크기는 순서대로, 크기가 안 맞는 페이지는 뺀다', () => {
    const r = matchArtboards([{ w: 300, h: 60 }, { w: 60, h: 90 }, { w: 60, h: 90 }, { w: 123, h: 45 }], signs, null);
    expect(r).toEqual([{ page: 0, id: 'a' }, { page: 1, id: 'b' }, { page: 2, id: 'c' }]);
  });
  it('XMP 짝의 페이지 수가 다르면(대지를 더하고 보내기 없이 저장) 크기로', () => {
    const r = matchArtboards([{ w: 3000, h: 600 }, { w: 600, h: 900 }], signs, ['a', 'b', 'c']);
    expect(r).toEqual([{ page: 0, id: 'a' }, { page: 1, id: 'b' }]);
  });
});

describe('jsxWithData — 스크립트 앞에 데이터 한 줄', () => {
  it('데이터는 JSON 리터럴(ExtendScript 에서 그대로 객체), 줄 구분 문자는 이스케이프', () => {
    const s = jsxWithData('alert(GANPANDA_DATA.project);', { project: 'a b' });
    expect(s.startsWith('var GANPANDA_DATA = {"project":"a\\u2028b"};\n')).toBe(true);
    expect(s.endsWith('alert(GANPANDA_DATA.project);')).toBe(true);
  });
});
