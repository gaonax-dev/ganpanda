// 기기별 프로젝트 화면 기억 (2026-10-25 사용자: "기기별로 사용자 설정을 기록해서 다시 돌아올때 해당 셋팅으로 돌아오게 해줘
// 헤더 텝의 상태를 돌아왔을때 복원하고 뷰도 떠날때 위치로") — 작업 탭 + 보드의 확대·위치. localStorage 'ganpanda.roomView.<프로젝트>'
import { ZOOM_MAX, ZOOM_MIN, type Viewport } from './viewport';

export type WorkTab = 'measure' | '2d' | '3d' | 'design' | 'list';
const TABS: readonly WorkTab[] = ['measure', '2d', '3d', 'design', 'list'];

export interface RoomView { tab?: WorkTab; viewport?: Viewport }

export const roomViewKey = (room: string) => `ganpanda.roomView.${room}`;

/** 저장된 JSON → 믿을 수 있는 값만 (모르는 탭·깨진 숫자·범위 밖 확대는 버림) */
export function parseRoomView(s: string | null): RoomView {
  let raw: unknown;
  try { raw = s ? JSON.parse(s) : null; } catch { return {}; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: RoomView = {};
  if (typeof r.tab === 'string' && (TABS as readonly string[]).includes(r.tab)) out.tab = r.tab as WorkTab;
  const v = r.viewport as Record<string, unknown> | undefined;
  if (v && typeof v === 'object') {
    const { x, y, zoom } = v;
    if (typeof x === 'number' && typeof y === 'number' && typeof zoom === 'number' && Number.isFinite(x) && Number.isFinite(y) && zoom >= ZOOM_MIN && zoom <= ZOOM_MAX) out.viewport = { x, y, zoom };
  }
  return out;
}

export function loadRoomView(room: string): RoomView {
  try { return parseRoomView(localStorage.getItem(roomViewKey(room))); } catch { return {}; }
}
/** 일부만 고친다 (탭만, 뷰포트만) */
export function saveRoomView(room: string, patch: RoomView) {
  try { localStorage.setItem(roomViewKey(room), JSON.stringify({ ...loadRoomView(room), ...patch })); } catch { /* 저장 못 해도 됨 */ }
}
