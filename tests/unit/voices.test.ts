import { describe, expect, it } from 'vitest';
import { voiceCounts, voicesOf } from '../../src/lib/core/voices';
import { unreadByObject } from '../../src/lib/core/unread';
import type { Message } from '../../src/lib/core/model';

const m = (over: Partial<Message>): Message => ({ id: Math.random().toString(36).slice(2), objectId: 'a', author: '김', text: '', kind: 'chat', ts: 1, ...over });

describe('음성 메모 (2026-10-18: 대화와 따로)', () => {
  const list = [m({ kind: 'voice', ts: 5 }), m({ kind: 'chat', ts: 6 }), m({ kind: 'voice', ts: 9 }), m({ kind: 'voice', objectId: 'b', ts: 2 })];
  it('사인물의 음성 메모만, 최신 먼저', () => {
    expect(voicesOf(list, 'a').map((x) => x.ts)).toEqual([9, 5]);
    expect(voicesOf(list, 'zzz')).toEqual([]);
  });
  it('사인물별 개수', () => {
    expect(voiceCounts(list)).toEqual({ a: 2, b: 1 });
  });
  it('안 읽은 대화 수에는 음성 메모를 세지 않는다 (말풍선과 섞지 않음)', () => {
    expect(unreadByObject(list, {}, '나')).toEqual({ a: 1 });
  });
});
