import { mount } from 'svelte';
import './style.css';
import App from './App.svelte';
import { installPageZoomReset } from './lib/pageZoom';
import { cssMissing, healedHref } from './lib/core/cssHeal';

installPageZoomReset(); // 휴대폰: 입력을 마치면 페이지 확대를 1배로 (2026-10-21)
const app = mount(App, { target: document.getElementById('app')! });
document.getElementById('splash')?.remove(); // 앱이 붙으면 정적 로딩 표시 제거
// 꾸밈 자가 복구 (2026-10-21): 캐시에 HTML 이 CSS 로 저장된 휴대폰 — 전역 변수가 없으면 같은 CSS 를 새 주소로 다시 단다 (core/cssHeal.ts)
if (cssMissing(getComputedStyle(document.documentElement).getPropertyValue('--bg'))) {
  for (const l of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))) {
    const n = document.createElement('link'); n.rel = 'stylesheet'; n.href = healedHref(l.href, Date.now()); document.head.appendChild(n);
  }
}
export default app;
