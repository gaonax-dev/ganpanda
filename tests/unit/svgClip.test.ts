// 편집 층(SVG) 잘라 그리기 (2026-11-04 사용자: "맥 앱에서 줌인을 많이 들어가면 컨트롤로와 글자 해상도가 깨진다"):
// 사진 전체 크기의 SVG 가 확대되면 실제 화면 픽셀로 수만 px — WebKit(GPU) 층 상한을 넘어 해상도를 낮춰 그린다 → 보이는 부분(+여유)만 그린다
import { describe, expect, it } from 'vitest';
import { svgClip, SVG_MAX_PX } from '../../src/lib/core/svgClip';

const photo = { x: 100, y: 50, width: 1200, height: 800 }; // 보드 world 단위
const px = { w: 6000, h: 4000 }; // 사진 원본 px (world 1 = 5px)
const screen = { w: 1400, h: 900 };

describe('svgClip', () => {
  it('층이 상한보다 작으면 자르지 않는다 (null)', () => {
    expect(SVG_MAX_PX).toBe(4096);
    expect(svgClip(photo, px, { x: 0, y: 0, zoom: 1 }, screen, 2)).toBeNull(); // 1200×2 = 2400
  });
  it('크게 확대하면 화면에 보이는 부분 + 여유(화면 한 장)만 — 사진 px, 사진 안으로', () => {
    // zoom 12: 화면 왼쪽 위 = world (100 + 600/... ) — 사진 가운데쯤을 본다
    const zoom = 12, cx = 700, cy = 450; // 보는 가운데 world
    const vp = { x: screen.w / 2 - cx * zoom, y: screen.h / 2 - cy * zoom, zoom };
    const c = svgClip(photo, px, vp, screen, 2)!;
    expect(c).not.toBeNull();
    // 보이는 world 범위 [cx ± 700/12, cy ± 450/12] 가 들어 있어야
    const toPx = (wx: number, wy: number) => [((wx - photo.x) / photo.width) * px.w, ((wy - photo.y) / photo.height) * px.h];
    const [a0, b0] = toPx(cx - 700 / zoom, cy - 450 / zoom), [a1, b1] = toPx(cx + 700 / zoom, cy + 450 / zoom);
    expect(c.x).toBeLessThanOrEqual(a0); expect(c.y).toBeLessThanOrEqual(b0);
    expect(c.x + c.w).toBeGreaterThanOrEqual(a1); expect(c.y + c.h).toBeGreaterThanOrEqual(b1);
    // 크기는 화면 세 장 이내 → 층 픽셀이 상한 근처
    expect((c.w / px.w) * photo.width * zoom).toBeLessThanOrEqual(screen.w * 3 + 1);
    expect((c.h / px.h) * photo.height * zoom).toBeLessThanOrEqual(screen.h * 3 + 1);
    expect(c.x).toBeGreaterThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(px.w); expect(c.y + c.h).toBeLessThanOrEqual(px.h);
  });
  it('조금 끌어도(화면 반 장 안) 같은 자르기 — 끄는 동안 층을 매번 다시 만들지 않게', () => {
    const zoom = 12, vp = (cx: number) => ({ x: screen.w / 2 - cx * zoom, y: screen.h / 2 - 450 * zoom, zoom });
    expect(svgClip(photo, px, vp(703), screen, 2)).toEqual(svgClip(photo, px, vp(703 + 10 / zoom), screen, 2));
  });
  it('사진이 화면 밖이면 빈 자르기 (w·h 0)', () => {
    const c = svgClip(photo, px, { x: -100000, y: 0, zoom: 12 }, screen, 2)!;
    expect(c.w * c.h).toBe(0);
  });
});
