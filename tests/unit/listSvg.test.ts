import { describe, expect, it } from 'vitest';
import { cardsBounds, listSvg, type SvgCard } from '../../src/lib/core/listSvg';

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

// 일러스트레이터 내보내기 (2026-10-17 사용자: "리스트가 일러스트로 내보내기 되는가?" → "비율, 윤곽선은 옵션으로")
import { readFileSync } from 'node:fs';
import { fontFromBuffer } from '../../src/lib/core/textShapes';
import { outlineRenderer } from '../../src/lib/core/svgText';
import { partsSvg } from '../../src/lib/core/partsLayout';

describe('SVG 내보내기 옵션: 비율·글자 윤곽선', () => {
  const cards = [{ id: 'a', name: '정면 간판', x: 0, y: 0, w: 3000, h: 600, lines: ['갈바 간판'], amount: '1,000원' }];
  it('scale 을 주면 A4 가 아니라 그 비율의 용지 크기 (실물 1:1 = 카드 mm 그대로 + 여백·라벨 공간)', () => {
    const svg = listSvg({ title: 't', cards, scale: 1 });
    expect(svg).not.toContain('width="297mm"');
    const m = svg.match(/<svg[^>]*width="([\d.]+)mm" height="([\d.]+)mm"[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
    expect(Number(m[1])).toBeGreaterThan(3000);
    expect(Number(m[1])).toBeLessThan(3100);
    expect(Number(m[2])).toBeGreaterThan(600);
    expect(m[1]).toBe(m[3]); // viewBox = 용지 mm (일러에서 mm 그대로)
    expect(svg).toContain('축척 1:1');
    // 카드 사각이 실물 폭
    expect(svg).toMatch(/<rect[^>]*width="3000\.00"/);
    const tenth = listSvg({ title: 't', cards, scale: 0.1 });
    expect(tenth).toContain('축척 1:10');
    expect(tenth).toMatch(/<rect[^>]*width="300\.00"/);
  });
  it('고정 비율에서 카드보다 넓은 라벨은 용지 오른쪽을 넘지 않는다', () => {
    const wide: SvgCard[] = [{ id: 'a', name: '출입문', x: 0, y: 0, w: 300, h: 1800, lines: ['재질 시트 단색 커팅 완컷 보조시트 코팅 유광'], amount: '12,000원' }];
    const pageWOf = (cards: SvgCard[]) => Number(listSvg({ title: 't', cards, scale: 0.1 }).match(/width="([\d.]+)mm"/)![1]);
    const short = [{ ...wide[0], lines: [], amount: undefined }];
    expect(pageWOf(short)).toBeLessThan(90); // 카드 30mm + 여백
    expect(pageWOf(wide)).toBeGreaterThan(pageWOf(short) + 20); // 라벨 폭만큼 넓어짐 (한글 20자 ≈ 52mm)
  });
  it('글자 윤곽선: 모든 글자가 <path> 로 바뀌고 <text> 가 없다 (폰트 없는 일러에서도 같은 모양)', () => {
    const font = fontFromBuffer(readFileSync('node_modules/pretendard/dist/public/static/Pretendard-Bold.otf').buffer.slice(0) as ArrayBuffer);
    const svg = listSvg({ title: '한울 전개도', cards, text: outlineRenderer(font) });
    expect(svg).not.toContain('<text');
    expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(5); // 제목·축척·치수 둘·이름·사양·금액
    expect(svg).toContain('fill="#2f8bff"'); // 치수 색 유지
  });
  it('구성 요소 글자도 윤곽선으로, 상자 폭에 맞춰 늘이고 줄임', () => {
    const font = fontFromBuffer(readFileSync('node_modules/pretendard/dist/public/static/Pretendard-Bold.otf').buffer.slice(0) as ArrayBuffer);
    const items = [{ id: 'i', partKind: 'channel' as const, kind: 'text' as const, text: '간판', color: '#ff6b5e', x: 100, y: 100, w: 1000, h: 300 }];
    const svg = partsSvg(items, () => undefined, 0, 0, outlineRenderer(font));
    expect(svg).not.toContain('<text');
    expect(svg).toMatch(/<path [^>]*transform="[^"]*scale\(/);
    expect(svg).toContain('fill="#ff6b5e"');
  });
});
