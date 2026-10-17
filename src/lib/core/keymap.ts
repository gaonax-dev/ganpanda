// 단축키: 물리 키(code) 기준 조합 문자열. 한글 입력 상태에서도 같은 키로 인식된다.
// 조합 형식: "Mod+Shift+R" — Mod = 맥 ⌘ / 그 외 Ctrl. 수식키 순서 Mod, Ctrl, Meta, Alt, Shift.

export type Action =
  | 'zoomIn' | 'zoomOut' | 'zoomFit' | 'panHold'
  | 'toolSelect' | 'toolRect' | 'toolEllipse' | 'toolPin' | 'toolMagic' | 'toolZone'
  | 'gizmoMove' | 'gizmoRotate' | 'gizmoScale'
  | 'deleteSelection' | 'undo' | 'redo' | 'copy' | 'paste' | 'duplicate';

export type Keymap = Record<Action, string[]>;

export interface KeyLike {
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** 설정 화면 표시 순서와 이름 */
export const ACTIONS: { id: Action; label: string; group: '화면' | '도구' | '편집' }[] = [
  { id: 'zoomIn', label: '확대', group: '화면' },
  { id: 'zoomOut', label: '축소', group: '화면' },
  { id: 'zoomFit', label: '전체 보기 (화면 맞춤)', group: '화면' },
  { id: 'panHold', label: '화면 이동 (누른 채 드래그)', group: '화면' },
  { id: 'toolSelect', label: '선택 도구', group: '도구' },
  { id: 'toolRect', label: '사각 영역', group: '도구' },
  { id: 'toolEllipse', label: '원형 영역', group: '도구' },
  { id: 'toolPin', label: '말풍선 (위치 코멘트)', group: '도구' },
  { id: 'toolMagic', label: '자동 분리 (AI)', group: '도구' },
  { id: 'toolZone', label: '작업 존', group: '도구' },
  { id: 'gizmoMove', label: '매니퓰레이터: 이동', group: '도구' },
  { id: 'gizmoRotate', label: '매니퓰레이터: 회전', group: '도구' },
  { id: 'gizmoScale', label: '매니퓰레이터: 크기', group: '도구' },
  { id: 'deleteSelection', label: '선택한 사인물 삭제', group: '편집' },
  { id: 'undo', label: '실행 취소', group: '편집' },
  { id: 'redo', label: '다시 실행', group: '편집' },
  { id: 'copy', label: '사인물 복사', group: '편집' },
  { id: 'paste', label: '사인물 붙여넣기', group: '편집' },
  { id: 'duplicate', label: '사인물 복제', group: '편집' },
];

/** xlpop 캔버스와 같은 화면 조작 */
export const DEFAULT_KEYMAP: Keymap = {
  // 맥에서는 ⌃ 조합도 허용 (xlpop: ctrlKey || metaKey). PC 에서는 Ctrl = Mod 이므로 영향 없음
  zoomIn: ['Mod+=', 'Mod+Shift+=', 'Mod++', 'Ctrl+=', 'Ctrl+Shift+='],
  zoomOut: ['Mod+-', 'Ctrl+-'],
  zoomFit: ['Mod+0', 'Ctrl+0'],
  panHold: ['Space'],
  // QWER = 선택·이동·회전·크기 (2026-10-15 사용자: "qwer 선택,이동,회전,크기", Unity·Blender 와 같은 배치). 사각 영역은 R → T
  toolSelect: ['V', 'Q'],
  toolRect: ['T'],
  toolEllipse: ['O'],
  toolPin: ['P'],
  toolMagic: ['A'],
  toolZone: ['Z'],
  gizmoMove: ['W'],
  gizmoRotate: ['E'],
  gizmoScale: ['R'],
  deleteSelection: ['Delete', 'Backspace'],
  undo: ['Mod+Z'],
  redo: ['Mod+Shift+Z', 'Mod+Y'],
  copy: ['Mod+C'],
  paste: ['Mod+V'],
  duplicate: ['Mod+D'],
};

const PUNCT: Record<string, string> = {
  Equal: '=', Minus: '-', NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/',
  BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/', Semicolon: ';',
  Quote: "'", Backquote: '`', Backslash: '\\',
};
const MODIFIER_CODES = /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$|^CapsLock$|^Fn/;

function keyToken(e: KeyLike): string | null {
  const { code } = e;
  if (MODIFIER_CODES.test(code)) return null;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^(Digit|Numpad)\d$/.test(code)) return code.slice(-1);
  if (PUNCT[code]) return PUNCT[code];
  if (code) return code; // Space, Escape, Delete, Backspace, Enter, ArrowUp, F1 …
  return e.key.length === 1 ? e.key.toUpperCase() : e.key || null;
}

export function comboFromEvent(e: KeyLike, isMac: boolean): string | null {
  const key = keyToken(e);
  if (!key) return null;
  const mods: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) mods.push('Mod');
  if (isMac && e.ctrlKey) mods.push('Ctrl');
  if (!isMac && e.metaKey) mods.push('Meta');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  return [...mods, key].join('+');
}

export function matchAction(km: Keymap, e: KeyLike, isMac: boolean): Action | null {
  const combo = comboFromEvent(e, isMac);
  if (!combo) return null;
  for (const { id } of ACTIONS) if (km[id].includes(combo)) return id;
  return null;
}

/** 저장된 설정(알 수 없는 형식 포함)을 기본값과 합친다 */
export function mergeKeymap(saved: unknown): Keymap {
  const out = { ...DEFAULT_KEYMAP };
  if (!saved || typeof saved !== 'object') return out;
  for (const { id } of ACTIONS) {
    const v = (saved as Record<string, unknown>)[id];
    if (Array.isArray(v) && v.every((s) => typeof s === 'string')) out[id] = v as string[];
  }
  return out;
}

export function findConflicts(km: Keymap): { combo: string; actions: Action[] }[] {
  const by = new Map<string, Action[]>();
  for (const { id } of ACTIONS) for (const c of km[id]) by.set(c, [...(by.get(c) ?? []), id]);
  return [...by].filter(([, a]) => a.length > 1).map(([combo, actions]) => ({ combo, actions }));
}

const MAC_SYMBOL: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' };
const PC_NAME: Record<string, string> = { Mod: 'Ctrl', Meta: 'Win' };

export function formatCombo(combo: string, isMac: boolean): string {
  return combo
    .split('+')
    .map((p, i, a) => (p === '' && i === a.length - 1 ? '+' : p)) // "Mod++" → [Mod, '', ''] 처리
    .filter((p, i, a) => !(p === '' && i < a.length - 1))
    .map((p) => (isMac ? MAC_SYMBOL[p] : PC_NAME[p]) ?? p)
    .join(' ');
}
