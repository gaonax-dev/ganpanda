import { mount } from 'svelte';
import './style.css';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });
document.getElementById('splash')?.remove(); // 앱이 붙으면 정적 로딩 표시 제거
export default app;
