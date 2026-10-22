import { describe, expect, it } from 'vitest';
import { TEAM_ROOM, memberLabel, roomKey, roomIdOf, visibleRooms, talkUnread, canSeeTalkMessage, addRef, refLabel } from '../../src/lib/core/talk';
import type { Message, TalkRoom } from '../../src/lib/core/model';

// 멤버는 아이디로 연결, 화면은 닉네임 (2026-10-22 "닉은 사용하는데 아이디로 연결하라는 거지")
const room = (id: string, memberIds: string[], createdById = 'u-boss'): TalkRoom => ({ id, name: id, memberIds, memberNames: {}, createdById, createdBy: '사장', createdAt: 1 });
const msg = (objectId: string, author: string, ts: number): Message => ({ id: `${objectId}${ts}`, objectId, author, text: 'x', kind: 'chat', ts });

describe('톡방 (2026-10-22)', () => {
  it('톡 메시지는 objectId 가 talk:<방> — 방 id 를 되돌린다', () => {
    expect(roomKey('abc')).toBe('talk:abc');
    expect(roomIdOf('talk:abc')).toBe('abc');
    expect(roomIdOf('sign1')).toBeNull();
  });

  it('회사 멤버 방은 언제나 맨 앞, 회사 쪽(편집 권한)만 본다', () => {
    const rooms = [room('r1', ['u-cus'])];
    expect(visibleRooms(rooms, 'u-boss', true).map((r) => r.id)).toEqual([TEAM_ROOM.id, 'r1']);
    expect(visibleRooms(rooms, 'u-cus', false).map((r) => r.id)).toEqual(['r1']);
  });

  it('이름이 바뀌어도 아이디로 남는다', () => {
    const rooms = [room('r1', ['u-cus'])];
    expect(visibleRooms(rooms, 'u-cus', false).map((r) => r.id)).toEqual(['r1']);
    expect(memberLabel(rooms[0], 'u-cus', { 'u-cus': '새이름' })).toBe('새이름');
    expect(memberLabel({ ...rooms[0], memberNames: { 'u-cus': '옛이름' } }, 'u-cus', {})).toBe('옛이름');
  });

  it('만든 사람과 멤버만 방을 본다', () => {
    const rooms = [room('r1', ['u-staff'], 'u-boss'), room('r2', ['u-cus'], 'u-staff')];
    expect(visibleRooms(rooms, 'u-staff', true).map((r) => r.id)).toEqual([TEAM_ROOM.id, 'r1', 'r2']);
    expect(visibleRooms(rooms, 'u-boss', true).map((r) => r.id)).toEqual([TEAM_ROOM.id, 'r1']);
    expect(visibleRooms(rooms, 'u-x', false)).toEqual([]);
  });

  it('보이는 방의 메시지만 알린다 — 사인물 대화는 그대로', () => {
    const rooms = [room('r1', ['u-staff'])];
    expect(canSeeTalkMessage(msg('talk:r1', '사장', 1), rooms, 'u-staff', true)).toBe(true);
    expect(canSeeTalkMessage(msg('talk:r1', '사장', 1), rooms, 'u-cus', false)).toBe(false);
    expect(canSeeTalkMessage(msg('talk:team', '사장', 1), rooms, 'u-cus', false)).toBe(false);
    expect(canSeeTalkMessage(msg('sign1', '사장', 1), rooms, 'u-cus', false)).toBe(true);
  });

  it('방별 안 읽은 수 — 보이는 방만 합한다', () => {
    const rooms = [room('r1', ['u-staff']), room('r2', ['u-cus'])];
    const unread = { 'talk:r1': 2, 'talk:r2': 5, 'talk:team': 1, sign1: 3 };
    expect(talkUnread(unread, rooms, 'u-staff', true)).toEqual({ total: 3, byRoom: { team: 1, r1: 2 } });
  });

  it('사인물·사진 링크는 한 번만 붙는다', () => {
    const a = addRef([], { kind: 'object', id: 'o1', label: '간판' });
    expect(addRef(a, { kind: 'object', id: 'o1', label: '간판' })).toBe(a);
    expect(addRef(a, { kind: 'photo', id: 'p1', label: '사진 1' })).toHaveLength(2);
    expect(refLabel({ kind: 'photo', id: 'p1', label: '정면' })).toBe('📷 정면');
    expect(refLabel({ kind: 'object', id: 'o1', label: '간판' })).toBe('🔗 간판');
    expect(refLabel({ kind: 'pin', id: 'n', label: '#3' })).toBe('📍 #3');
  });
});

import { Project } from '../../src/lib/core/project';
describe('Project 톡방', () => {
  it('방을 만들고, 링크가 붙은 메시지를 보낸다', () => {
    const p = new Project();
    const id = p.addTalk({ name: '고객 상담', memberIds: ['u-cus'], memberNames: { 'u-cus': '고객' }, createdById: 'u-boss', createdBy: '사장' });
    expect(p.allTalks()).toMatchObject([{ id, name: '고객 상담', memberIds: ['u-cus'], createdById: 'u-boss' }]);
    p.addMessage(`talk:${id}`, '사장', '이거 보세요', 'chat', [], [{ kind: 'object', id: 'o1', label: '간판' }], 'u-boss');
    expect(p.messagesOf(`talk:${id}`)[0]).toMatchObject({ refs: [{ kind: 'object', id: 'o1', label: '간판' }], authorId: 'u-boss' });
    p.updateTalk(id, { name: '상담', memberIds: ['u-cus', 'u-staff'] });
    expect(p.allTalks()[0]).toMatchObject({ name: '상담', memberIds: ['u-cus', 'u-staff'] });
  });
});

import { countByObject } from '../../src/lib/core/unread';
describe('말풍선 숫자 (2026-10-22)', () => {
  it('대상별 대화 수 — 음성 메모·승인 기록은 세지 않는다', () => {
    const m = (objectId: string, kind: Message['kind']): Message => ({ id: Math.random().toString(), objectId, author: 'a', text: 'x', kind, ts: 1 });
    expect(countByObject([m('o1', 'chat'), m('o1', 'comment'), m('o1', 'voice'), m('project', 'approval'), m('p1', 'chat')])).toEqual({ o1: 2, p1: 1 });
  });
});
