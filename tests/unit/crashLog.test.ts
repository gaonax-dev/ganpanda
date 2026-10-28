import { describe, expect, it } from 'vitest';
import { CrashLog, CRASH_GAP_MS } from '../../src/lib/crashLog';

// 2026-10-29 진단 기록: 아이폰이 웹 화면을 다시 열 때(메모리 초과) 직전 상태를 남겨 다음에 보여 준다
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe('진단 기록 (crashLog)', () => {
  it('정상 종료(pagehide) 없이 곧 다시 열리면 직전 기록을 보여 준다', () => {
    const s = mem();
    let now = 1000;
    const a = new CrashLog(s, () => now);
    a.set('board', { stage: '3d', zoom: 0.05 });
    a.event('실시간 3D 짓기 시작 핀볼1');
    a.flush();
    now += 3000; // 다시 열림
    const b = new CrashLog(s, () => now);
    const last = b.previous();
    expect(last).not.toBeNull();
    expect(last!.state.board).toEqual({ stage: '3d', zoom: 0.05 });
    expect(last!.events.at(-1)!.msg).toBe('실시간 3D 짓기 시작 핀볼1');
    b.dismiss();
    expect(new CrashLog(s, () => now).previous()).toBeNull();
  });
  it('정상 종료면 보여 주지 않는다', () => {
    const s = mem();
    let now = 1000;
    const a = new CrashLog(s, () => now);
    a.set('board', { stage: '2d' }); a.flush(); a.clean();
    now += 2000;
    expect(new CrashLog(s, () => now).previous()).toBeNull();
  });
  it('오래 지나 다시 열면(앱을 쓸어 닫음 등) 보여 주지 않는다', () => {
    const s = mem();
    let now = 1000;
    const a = new CrashLog(s, () => now);
    a.set('board', { stage: '2d' }); a.flush();
    now += CRASH_GAP_MS + 1;
    expect(new CrashLog(s, () => now).previous()).toBeNull();
  });
  it('최근 사건은 30개까지만', () => {
    const s = mem();
    const a = new CrashLog(s, () => 1);
    for (let i = 0; i < 50; i++) a.event('e' + i);
    a.flush();
    const b = new CrashLog(s, () => 2);
    expect(b.previous()!.events.length).toBe(30);
    expect(b.previous()!.events.at(-1)!.msg).toBe('e49');
  });
});
