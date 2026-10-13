import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYMAP, comboFromEvent, findConflicts, formatCombo, matchAction, mergeKeymap, type KeyLike,
} from '../../src/lib/core/keymap';

const ev = (code: string, mods: Partial<KeyLike> = {}, key = ''): KeyLike => ({
  code, key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods,
});

describe('키 조합 인식', () => {
  it('글자는 물리 키 기준 — 한글 입력 상태(ㄱ)에서도 R 로 인식', () => {
    expect(comboFromEvent(ev('KeyR', {}, 'ㄱ'), true)).toBe('R');
  });

  it('Mod = 맥에서는 ⌘, 그 외에서는 Ctrl', () => {
    expect(comboFromEvent(ev('Equal', { metaKey: true }), true)).toBe('Mod+=');
    expect(comboFromEvent(ev('Equal', { ctrlKey: true }), false)).toBe('Mod+=');
    expect(comboFromEvent(ev('Equal', { ctrlKey: true }), true)).toBe('Ctrl+=');
  });

  it('수식키 순서는 Mod, Ctrl, Alt, Shift 로 고정', () => {
    expect(comboFromEvent(ev('KeyZ', { metaKey: true, shiftKey: true, altKey: true }), true)).toBe('Mod+Alt+Shift+Z');
  });

  it('숫자패드 +/- 는 일반 +/- 와 같게 취급', () => {
    expect(comboFromEvent(ev('NumpadAdd', { metaKey: true }), true)).toBe('Mod++');
    expect(comboFromEvent(ev('NumpadSubtract', { metaKey: true }), true)).toBe('Mod+-');
  });

  it('수식키만 누른 상태는 조합이 아니다', () => {
    expect(comboFromEvent(ev('ShiftLeft', { shiftKey: true }), true)).toBeNull();
  });
});

describe('기본 단축키 (xlpop 과 동일한 화면 조작)', () => {
  const mac = true;
  it('⌘ = / ⌘ ⇧ = / ⌘ + 확대, ⌘ - 축소, ⌘ 0 화면 맞춤', () => {
    expect(matchAction(DEFAULT_KEYMAP, ev('Equal', { metaKey: true }), mac)).toBe('zoomIn');
    expect(matchAction(DEFAULT_KEYMAP, ev('Equal', { metaKey: true, shiftKey: true }), mac)).toBe('zoomIn');
    expect(matchAction(DEFAULT_KEYMAP, ev('NumpadAdd', { metaKey: true }), mac)).toBe('zoomIn');
    expect(matchAction(DEFAULT_KEYMAP, ev('Minus', { metaKey: true }), mac)).toBe('zoomOut');
    expect(matchAction(DEFAULT_KEYMAP, ev('Digit0', { metaKey: true }), mac)).toBe('zoomFit');
  });

  it('맥에서 ⌃(Control)로도 확대·축소 (xlpop 은 ctrlKey || metaKey)', () => {
    expect(matchAction(DEFAULT_KEYMAP, ev('Equal', { ctrlKey: true }), mac)).toBe('zoomIn');
    expect(matchAction(DEFAULT_KEYMAP, ev('Minus', { ctrlKey: true }), mac)).toBe('zoomOut');
    expect(matchAction(DEFAULT_KEYMAP, ev('Digit0', { ctrlKey: true }), mac)).toBe('zoomFit');
  });

  it('도구와 삭제', () => {
    expect(matchAction(DEFAULT_KEYMAP, ev('KeyV'), mac)).toBe('toolSelect');
    expect(matchAction(DEFAULT_KEYMAP, ev('KeyR'), mac)).toBe('toolRect');
    expect(matchAction(DEFAULT_KEYMAP, ev('KeyO'), mac)).toBe('toolEllipse');
    expect(matchAction(DEFAULT_KEYMAP, ev('Delete'), mac)).toBe('deleteSelection');
    expect(matchAction(DEFAULT_KEYMAP, ev('Backspace'), mac)).toBe('deleteSelection');
  });

  it('스페이스는 이동(누르고 있기)', () => {
    expect(matchAction(DEFAULT_KEYMAP, ev('Space'), mac)).toBe('panHold');
  });

  it('등록되지 않은 조합은 null', () => {
    expect(matchAction(DEFAULT_KEYMAP, ev('KeyQ'), mac)).toBeNull();
  });
});

describe('사용자 설정', () => {
  it('바꾼 단축키로 동작하고 이전 키는 동작하지 않는다', () => {
    const km = { ...DEFAULT_KEYMAP, toolRect: ['B'] };
    expect(matchAction(km, ev('KeyB'), true)).toBe('toolRect');
    expect(matchAction(km, ev('KeyR'), true)).toBeNull();
  });

  it('저장된 설정에 없는 동작은 기본값으로 채우고, 모르는 동작은 버린다', () => {
    const km = mergeKeymap({ toolRect: ['B'], removedAction: ['X'] });
    expect(km.toolRect).toEqual(['B']);
    expect(km.zoomIn).toEqual(DEFAULT_KEYMAP.zoomIn);
    expect('removedAction' in km).toBe(false);
  });

  it('손상된 설정은 기본값', () => {
    expect(mergeKeymap('garbage')).toEqual(DEFAULT_KEYMAP);
    expect(mergeKeymap({ toolRect: 'B' })).toEqual(DEFAULT_KEYMAP);
  });

  it('같은 키를 두 동작에 지정하면 충돌로 알려준다', () => {
    const km = { ...DEFAULT_KEYMAP, toolRect: ['V'] };
    expect(findConflicts(km)).toEqual([{ combo: 'V', actions: ['toolSelect', 'toolRect'] }]);
    expect(findConflicts(DEFAULT_KEYMAP)).toEqual([]);
  });
});

describe('표시', () => {
  it('맥은 기호, 그 외는 이름', () => {
    expect(formatCombo('Mod+Shift+=', true)).toBe('⌘ ⇧ =');
    expect(formatCombo('Mod+Shift+=', false)).toBe('Ctrl Shift =');
    expect(formatCombo('Space', true)).toBe('Space');
  });
});
