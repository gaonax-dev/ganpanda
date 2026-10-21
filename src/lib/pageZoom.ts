// 휴대폰 페이지 확대 되돌리기 — DOM 연결 (판단은 core/pageZoom.ts)
import { INPUT_SELECTOR, shouldResetZoom, withMaxScale1 } from './core/pageZoom';

/** 페이지 확대를 1배로: viewport meta 에 maximum-scale=1 을 잠깐 넣었다 뺀다 (iOS 사파리가 이때 배율을 맞춘다) */
export function resetPageZoom(doc: Document = document) {
  const meta = doc.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
  if (!meta) return;
  const original = meta.content;
  meta.content = withMaxScale1(original);
  setTimeout(() => { meta.content = original; }, 300); // 되돌려 두어 사용자의 핀치 확대는 계속 가능
}

/** 입력칸에서 포커스가 빠질 때(다른 입력칸으로 가는 게 아니면) 확대돼 있으면 되돌린다 */
export function installPageZoomReset(win: Window = window) {
  win.addEventListener('focusout', (e) => {
    const from = e.target as Element | null;
    if (!from?.matches?.(INPUT_SELECTOR)) return;
    const next = e.relatedTarget as Element | null;
    if (shouldResetZoom(win.visualViewport?.scale, !!next?.matches?.(INPUT_SELECTOR))) resetPageZoom(win.document);
  });
}
