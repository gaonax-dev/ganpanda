// 프로젝트에 올린 구운 AO (2026-11-10 사용자: "모바일에서는 굽지않고(기기확인) 데스크탑 앱에서만 굽게 … 변하지 않으면 계속 사용하게").
// 데스크톱 앱이 구운 그림을 에셋으로 올리고 키 → 에셋 id 를 프로젝트 문서(`ao`)에 둔다. 다른 기기(휴대폰·브라우저)는 굽지 않고 받아 쓴다.
// 프로젝트를 열 때 state 가 정한다 — 3D 코드(three)를 state 에 끌어들이지 않으려고 따로 둔 작은 모듈 → render/aoBake.ts
import { canBakeAOOn } from './core/aoBake';

export type AoStore = { get(key: string): string | undefined; set(key: string, assetId: string): void };
let current: AoStore | null = null;
export function setAoStore(s: AoStore | null) { current = s; }
export const aoStore = () => current;
/** 이 기기가 AO 를 굽는가 — 데스크톱 앱만 */
export const canBakeAO = () => typeof navigator !== 'undefined' && canBakeAOOn(navigator.userAgent, navigator.maxTouchPoints ?? 0);

/** 프로젝트의 AO 를 뒤에서 받아 쓸 수 있게 되면 알린다 (여럿이 이어 오면 한 번에, 0.5초) — state 가 굽지 않는 기기의 3D 그림 키를 바꿔 다시 그린다 */
const loadedHandlers: (() => void)[] = [];
let loadedTimer: ReturnType<typeof setTimeout> | null = null;
export function onAoLoaded(f: () => void) { loadedHandlers.push(f); }
export function aoLoaded() {
  if (loadedTimer) return;
  loadedTimer = setTimeout(() => { loadedTimer = null; for (const f of loadedHandlers) f(); }, 500);
}
