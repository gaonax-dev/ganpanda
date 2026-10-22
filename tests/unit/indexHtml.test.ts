import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// 2026-10-22 사용자(아이폰 크롬): "측면간판에 스카시 올렸는데 단쌓기에서 보이다 사라져", "2d에서도 나타났다 사라진다. 모바일에서만"
// 원인: iOS WebKit 이 열고 잠시 뒤 전화번호처럼 보이는 글자("010-2344-6788")를 전화 링크로 바꾸면서 SVG 글자가 사라진다 → 자동 인식 끔
describe('index.html', () => {
  it('iOS 전화번호·주소·날짜·메일 자동 인식을 끈다 (SVG 글자가 링크로 바뀌어 사라지지 않게)', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/<meta name="format-detection" content="telephone=no, date=no, address=no, email=no"/);
  });
});
