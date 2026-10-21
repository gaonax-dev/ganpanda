import { mount } from 'svelte';
import './style.css';
import App from './App.svelte';
import { installPageZoomReset } from './lib/pageZoom';

installPageZoomReset(); // 휴대폰: 입력을 마치면 페이지 확대를 1배로 (2026-10-21)
const app = mount(App, { target: document.getElementById('app')! });
document.getElementById('splash')?.remove(); // 앱이 붙으면 정적 로딩 표시 제거
export default app;
