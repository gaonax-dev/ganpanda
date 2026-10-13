import { describe, expect, it } from 'vitest';
import { wheelIntent, type WheelLike } from '../../src/lib/core/wheel';

const w = (o: Partial<WheelLike>): WheelLike => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, wheelDeltaY: undefined, ...o });

describe('휠 판별 (xlpop CanvasViewport 와 동일)', () => {
  it('마우스 휠(wheelDeltaY 가 120 배수, 가로 이동 없음) → 확대·축소', () => {
    const r = wheelIntent(w({ deltaY: 100, wheelDeltaY: -120 }), false);
    expect(r.kind).toBe('zoom');
    // 아래로 굴리면 축소: 1 - 100 × 0.005 = 0.5
    expect(r.kind === 'zoom' && r.factor).toBeCloseTo(0.5);
  });

  it('Ctrl+휠 / 트랙패드 핀치 → 확대·축소', () => {
    const r = wheelIntent(w({ deltaY: -10, ctrlKey: true }), false);
    expect(r.kind === 'zoom' && r.factor).toBeCloseTo(1.05);
  });

  it('트랙패드 두 손가락 스크롤 → 이동', () => {
    expect(wheelIntent(w({ deltaX: 12, deltaY: 3.5 }), false)).toEqual({ kind: 'pan', dx: -12, dy: -3.5 });
  });

  it('줄 단위 스크롤(deltaMode 1)은 감도 0.1', () => {
    const r = wheelIntent(w({ deltaY: 3, deltaMode: 1, ctrlKey: true }), false);
    expect(r.kind === 'zoom' && r.factor).toBeCloseTo(0.7);
  });

  it('Windows: 핀치는 감도 2배, 마우스 휠은 0.2배', () => {
    const pinch = wheelIntent(w({ deltaY: -10, ctrlKey: true }), true);
    expect(pinch.kind === 'zoom' && pinch.factor).toBeCloseTo(1.1);
    const wheel = wheelIntent(w({ deltaY: 100, wheelDeltaY: -120 }), true);
    expect(wheel.kind === 'zoom' && wheel.factor).toBeCloseTo(0.9);
  });

  it('배율이 0 이하로 떨어지지 않는다', () => {
    const r = wheelIntent(w({ deltaY: 1000, ctrlKey: true }), false);
    expect(r.kind === 'zoom' && r.factor).toBeGreaterThan(0);
  });
});
