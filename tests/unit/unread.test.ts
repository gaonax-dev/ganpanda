import { describe, expect, it } from 'vitest';
import { markSeen, shouldNotify, unreadByObject, type SeenMap } from '../../src/lib/core/unread';
import type { Message } from '../../src/lib/core/model';

const m = (id: string, objectId: string, author: string, ts: number): Message => ({ id, objectId, author, text: id, kind: 'chat', ts });
const msgs = [m('1', 'A', '고객', 100), m('2', 'A', '나', 110), m('3', 'A', '고객', 120), m('4', 'B', '고객', 130), m('5', 'B', '나', 140)];

describe('안 읽은 메시지', () => {
  it('내가 마지막으로 본 시각 이후에 남이 보낸 메시지만 센다', () => {
    const seen: SeenMap = { A: 100 };
    expect(unreadByObject(msgs, seen, '나')).toEqual({ A: 1, B: 1 });
  });

  it('본 적 없는 사인물은 남이 보낸 메시지 전부, 내 메시지는 제외', () => {
    expect(unreadByObject(msgs, {}, '나')).toEqual({ A: 2, B: 1 });
    expect(unreadByObject(msgs, {}, '고객')).toEqual({ A: 1, B: 1 });
  });

  it('보면 그 사인물의 마지막 메시지 시각으로 기록된다 (더 이른 시각으로 되돌아가지 않음)', () => {
    let seen: SeenMap = { A: 500 };
    seen = markSeen(seen, 'A', msgs);
    expect(seen.A).toBe(500);
    seen = markSeen(seen, 'B', msgs);
    expect(seen.B).toBe(140);
    expect(unreadByObject(msgs, seen, '나')).toEqual({});
  });
});

describe('알림 여부', () => {
  const msg = m('9', 'A', '고객', 999);
  it('남이 보낸 메시지이고, 그 대화를 보고 있지 않을 때만', () => {
    expect(shouldNotify(msg, { me: '나', viewingObjectId: 'B', hidden: false })).toBe(true);
    expect(shouldNotify(msg, { me: '나', viewingObjectId: 'A', hidden: false })).toBe(false);
    expect(shouldNotify(msg, { me: '고객', viewingObjectId: 'B', hidden: false })).toBe(false);
  });
  it('탭이 숨겨져 있으면 보고 있던 대화라도 알린다', () => {
    expect(shouldNotify(msg, { me: '나', viewingObjectId: 'A', hidden: true })).toBe(true);
  });
});
