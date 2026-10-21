// 없는 번들 경로에 index.html 이 200 + 1년 캐시로 내려오던 문제 (2026-10-21 "모바일 계속 로딩중" → "css가 깨진 상태")
import { describe, expect, it } from 'vitest';
import { isFallbackHtml } from '../../worker/guard';

describe('정적 에셋 지킴이', () => {
  it('/assets·/env 경로에 HTML 이 돌아오면 대체 응답 → 404 로', () => {
    expect(isFallbackHtml('/assets/index-abc.js', 'text/html; charset=utf-8')).toBe(true);
    expect(isFallbackHtml('/assets/index-abc.css', 'text/html')).toBe(true);
    expect(isFallbackHtml('/env/studio.hdr', 'text/html')).toBe(true);
  });
  it('진짜 에셋은 그대로, 앱 경로의 HTML 도 그대로', () => {
    expect(isFallbackHtml('/assets/index-abc.js', 'text/javascript')).toBe(false);
    expect(isFallbackHtml('/assets/index-abc.css', 'text/css')).toBe(false);
    expect(isFallbackHtml('/', 'text/html')).toBe(false);
    expect(isFallbackHtml('/login', 'text/html')).toBe(false);
    expect(isFallbackHtml('/assets/x.js', null)).toBe(false);
  });
});
