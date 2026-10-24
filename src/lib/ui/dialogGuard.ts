// 입력 창 바깥 누르기 (2026-10-24 사용자: "로그인, 회원가입 등 사용자가 입력하는 필드있는 같은류의 창이 외부를 터치해도 꺼진다. x마크로만 끄게하던가 알림을 주던가"):
// 닫지 않고, 창의 ✕([data-close])를 흔들고 "✕ 를 눌러 닫아요" 를 잠깐 보여 준다 — 적던 내용이 사라지지 않게
export function nudgeClose(e: PointerEvent) {
  if (e.target !== e.currentTarget) return;
  const root = e.currentTarget as HTMLElement;
  const btn = root.querySelector<HTMLElement>('[data-close]');
  if (!btn) return;
  btn.dataset.nudge = '1';
  let hint = root.querySelector<HTMLElement>('[data-testid="close-hint"]');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.dataset.testid = 'close-hint';
    hint.textContent = '입력 중이라 바깥을 눌러도 닫지 않아요 — 오른쪽 위 ✕ 를 눌러 닫아요';
    btn.closest('[role="dialog"]')?.appendChild(hint);
  }
  clearTimeout(Number(root.dataset.nudgeTimer ?? 0));
  root.dataset.nudgeTimer = String(setTimeout(() => { delete btn.dataset.nudge; hint?.remove(); }, 2200));
}
