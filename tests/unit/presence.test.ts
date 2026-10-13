import { describe, expect, it } from 'vitest';
import { colorFor, peersFrom, type PresenceState } from '../../src/lib/core/presence';

describe('접속자 색', () => {
  it('같은 이름이면 항상 같은 색, 팔레트 안의 값', () => {
    expect(colorFor('제작자')).toBe(colorFor('제작자'));
    expect(colorFor('제작자')).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('다른 이름은 대체로 다른 색', () => {
    const set = new Set(['제작자', '고객', '디자이너', '사장님', '현장'].map(colorFor));
    expect(set.size).toBeGreaterThanOrEqual(4);
  });
});

describe('접속자 목록', () => {
  const states = new Map<number, PresenceState | Record<string, never>>([
    [1, { name: '제작자', color: '#111111', cursor: { x: 10, y: 20 } }],
    [2, { name: '고객', color: '#222222' }],
    [3, { name: '고객', color: '#222222', cursor: { x: 1, y: 2 } }], // 같은 사람의 두 번째 탭
    [4, {}], // 아직 상태를 보내지 않은 접속 → 표시하지 않음
    [5, { name: '', color: '#555555' }], // 이름을 비워 둔 접속 → "손님"
  ]);

  it('나를 제외하고, 같은 이름은 한 사람으로 합친다', () => {
    const peers = peersFrom(states, 1);
    expect(peers.map((p) => p.name)).toEqual(['고객', '손님']);
  });

  it('커서는 탭별로 모두 유지된다', () => {
    const [p] = peersFrom(states, 1);
    expect(p.cursors).toEqual([{ x: 1, y: 2 }]);
  });

  it('상태를 보내지 않은 접속은 목록에 없고, 이름이 빈 접속은 "손님"', () => {
    const peers = peersFrom(states, 99);
    expect(peers.filter((p) => p.name === '손님')).toHaveLength(1);
    expect(peers).toHaveLength(3);
  });
});
