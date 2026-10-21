// 휴대폰 페이지 확대 되돌리기 (2026-10-21 사용자: "모바일에서 입력기 등 사용으로 화면이 줌인된 후 입력을 마치면 다시 원래 줌으로 돌아오게")
// iOS 사파리는 글자 16px 미만 입력칸에 포커스하면 페이지를 확대하고 입력이 끝나도 그대로 둔다. 막는 건 style.css(터치 기기 입력칸 16px),
// 그래도 확대돼 있으면(날짜 입력기·사용자 핀치) 입력을 마칠 때 viewport meta 에 maximum-scale=1 을 잠깐 넣었다 빼서 1배로 되돌린다.
// 여기는 순수 판단·문자열만 — DOM 연결은 src/lib/pageZoom.ts

/** 입력을 마친 뒤 되돌려야 하나: 페이지가 확대돼 있고, 포커스가 다른 입력칸으로 옮겨 간 게 아닐 때 */
export function shouldResetZoom(scale: number | undefined, nextIsInput: boolean): boolean {
  return !nextIsInput && (scale ?? 1) > 1.01;
}

/** viewport meta content 에 maximum-scale=1 을 넣은 값 (있으면 바꾼다) */
export function withMaxScale1(content: string): string {
  const parts = content.split(',').map((s) => s.trim()).filter((s) => s && !/^maximum-scale\s*=/.test(s));
  return [...parts, 'maximum-scale=1'].join(', ');
}

export const INPUT_SELECTOR = 'input, select, textarea, [contenteditable]';
