// 확인·입력 창 (2026-10-25 사용자: "아이폰에서 사진 삭제가 안된다"): 앱(Tauri)의 웹뷰 엔진은 iOS·맥에서 confirm()·prompt() 를 지원하지 않아
// 확인이 즉시 "취소"로 끝났다 → 앱 안에서는 자체 대화 창(AskDialog.svelte), 브라우저에서는 그대로 native (e2e 는 native 대화를 쓴다)
import { inNativeApp } from '../auth';

export type Ask =
  | { kind: 'confirm'; message: string; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; message: string; value: string; resolve: (v: string | null) => void };

class AskState {
  current = $state<Ask | null>(null);
}
export const ask = new AskState();

/** confirm() 대신 — 앱 안이면 자체 창, 브라우저면 native. 열린 창이 있으면 그 창을 취소로 닫고 새로 연다 */
export function askConfirm(message: string): Promise<boolean> {
  if (!inNativeApp()) return Promise.resolve(confirm(message));
  return new Promise((resolve) => { closeCurrent(); ask.current = { kind: 'confirm', message, resolve }; });
}
/** prompt() 대신 */
export function askPrompt(message: string, value = ''): Promise<string | null> {
  if (!inNativeApp()) return Promise.resolve(prompt(message, value));
  return new Promise((resolve) => { closeCurrent(); ask.current = { kind: 'prompt', message, value, resolve }; });
}
function closeCurrent() {
  const c = ask.current;
  if (!c) return;
  ask.current = null;
  if (c.kind === 'confirm') c.resolve(false); else c.resolve(null);
}
/** 창의 단추가 부른다 */
export function answer(v: boolean | string | null) {
  const c = ask.current;
  if (!c) return;
  ask.current = null;
  if (c.kind === 'confirm') c.resolve(v === true); else c.resolve(typeof v === 'string' ? v : null);
}
