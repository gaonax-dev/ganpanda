// 사인물·카드·존에서 시작한 한 손가락 터치를 보드 이동(팬)으로 넘긴다 (2026-10-24 사용자: "한손가락 팬이 잘되게하려고 터치 후에 사인물 이동할 수 있게 했는데 사인물 위에서 터치 드래그하면 팬이 안된다")
// 표시된 이벤트는 InfiniteCanvas 가 빈 곳처럼 팬을 시작하되, 빈 곳 동작(선택 해제·사각 그리기)은 하지 않는다
const marked = new WeakSet<Event>();
export const panThrough = (e: Event) => { marked.add(e); };
export const isPanThrough = (e: Event) => marked.has(e);
