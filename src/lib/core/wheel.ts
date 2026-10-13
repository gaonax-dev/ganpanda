// 휠 입력 판별 — xlpop CanvasViewport 와 같은 규칙
// · Ctrl+휠, 트랙패드 핀치(ctrlKey=true) → 확대·축소
// · 마우스 휠(wheelDeltaY 가 ±120 배수, 가로 이동 없음) → 확대·축소
// · 트랙패드 두 손가락 스크롤 → 이동

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  /** 비표준(Chromium·WebKit). 마우스 휠 노치 판별용 */
  wheelDeltaY?: number;
}

export type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number };

/** Windows: 터치패드 핀치는 감도를 높이고 마우스 휠은 낮춘다 */
const PINCH_ZOOM_SENSITIVITY = 2;
const WHEEL_ZOOM_SENSITIVITY = 0.2;
const MIN_FACTOR = 0.1;

export function wheelIntent(e: WheelLike, isWindows: boolean): WheelIntent {
  const wd = e.wheelDeltaY;
  const isMouseWheel = wd !== undefined && wd !== 0 && wd % 120 === 0 && Math.abs(e.deltaX) === 0;
  if (!e.ctrlKey && !isMouseWheel) return { kind: 'pan', dx: -e.deltaX, dy: -e.deltaY };
  const base = e.deltaMode === 0 ? 0.005 : 0.1;
  const sens = !isWindows ? base
    : Math.abs(e.deltaY) < 50 ? base * PINCH_ZOOM_SENSITIVITY
    : base * WHEEL_ZOOM_SENSITIVITY;
  return { kind: 'zoom', factor: Math.max(MIN_FACTOR, 1 - e.deltaY * sens) };
}

export const isMacPlatform = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
export const isWindowsPlatform = () => typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent);
