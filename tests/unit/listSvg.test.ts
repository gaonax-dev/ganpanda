import { describe, expect, it } from 'vitest';
import { cardsBounds, listSvg } from '../../src/lib/core/listSvg';

describe('전개도 SVG (최종 출력 → PDF)', () => {
  const cards = [
    { id: 'a', name: '정면 간판', x: 0, y: 0, w: 3000, h: 600, lines: ['갈바 간판 + 전광 채널', '“간판다”'], amount: '1,200,000원' },
    { id: 'b', name: '출입문', x: 3600, y: 0, w: 1200, h: 2100, estimated: true, lines: ['시트 컷팅'], corner: 0.2, image: { href: 'data:image/png;base64,AAAA', pageW: 1000, pageH: 800, crop: { x: 100, y: 50, w: 400, h: 700 } } },
  ];
  it('A4 가로 한 장에 전부 들어가는 축척으로, 카드마다 사각·치수선·이름·사양·금액을 그린다', () => {
    const svg = listSvg({ title: '한울상사 사인물', subtitle: '2026-10-15', cards });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="297mm"');
    expect(svg).toContain('정면 간판');
    expect(svg).toContain('>3,000<'); // 가로 치수
    expect(svg).toContain('>600<');
    expect(svg).toContain('1,200 (추정)');
    expect(svg).toContain('갈바 간판 + 전광 채널');
    expect(svg).toContain('1,200,000원');
    expect(svg).toContain('<image'); // 디자인 이미지
    expect(svg).toContain('clip-path="url(#clip-b)"');
    expect(svg).toContain('&lt;'.length ? 'xlink' : '');
    // 전체 폭 4800mm 가 용지 안(297-여백)에 들어간다: 축척 < 1
    expect(svg).toMatch(/축척 1:\d+/);
  });
  it('문자는 이스케이프된다', () => {
    const svg = listSvg({ title: 'A & B <C>', cards: [{ id: 'x', name: '"q"', x: 0, y: 0, w: 100, h: 100, lines: [] }] });
    expect(svg).toContain('A &amp; B &lt;C&gt;');
    expect(svg).toContain('&quot;q&quot;');
  });
  it('경계: 카드가 없으면 기본 영역', () => {
    expect(cardsBounds([])).toEqual({ x: 0, y: 0, w: 1000, h: 1000 });
    expect(cardsBounds(cards)).toEqual({ x: 0, y: 0, w: 4800, h: 2100 });
  });
});
