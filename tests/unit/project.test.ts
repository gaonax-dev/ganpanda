import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Project } from '../../src/lib/core/project';

const photo = { name: '정면', assetId: 'a1', w: 1600, h: 1100, x: 0, y: 0, width: 1600 };
const quad = [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][];

describe('프로젝트 문서 (Yjs)', () => {
  it('사진·오브젝트 추가/수정/조회', () => {
    const p = new Project();
    const pid = p.addPhoto(photo);
    const oid = p.addObject({ photoId: pid, name: '간판1', shape: 'rect', quad, sheetIds: [] });
    p.updateObject(oid, { widthMm: 3000 });
    expect(p.objectsOf(pid)).toHaveLength(1);
    expect(p.object(oid)!.widthMm).toBe(3000);
    expect(p.object(oid)!.name).toBe('간판1');
  });

  it('사진을 지우면 그 사진의 오브젝트와 대화도 지워진다', () => {
    const p = new Project();
    const pid = p.addPhoto(photo);
    const oid = p.addObject({ photoId: pid, name: 'x', shape: 'rect', quad, sheetIds: [] });
    p.addMessage(oid, '나', '안녕하세요');
    p.removePhoto(pid);
    expect(p.allObjects()).toEqual([]);
    expect(p.messagesOf(oid)).toEqual([]);
  });

  it('오브젝트별 대화가 시간순으로 쌓인다', () => {
    const p = new Project();
    const oid = p.addObject({ photoId: 'p', name: 'x', shape: 'rect', quad, sheetIds: [] });
    p.addMessage(oid, '고객', '사이즈 확인 부탁드려요');
    p.addMessage(oid, '제작자', '가로 3m 맞습니다', 'comment');
    const m = p.messagesOf(oid);
    expect(m.map((x) => x.text)).toEqual(['사이즈 확인 부탁드려요', '가로 3m 맞습니다']);
    expect(m[1].kind).toBe('comment');
  });

  it('변경 알림', () => {
    const p = new Project();
    let n = 0;
    const off = p.onChange(() => n++);
    p.addPhoto(photo);
    off();
    p.addPhoto(photo);
    expect(n).toBe(1);
  });

  it('두 사용자가 동시에 편집해도 같은 상태로 수렴한다', () => {
    const a = new Project();
    const oid = a.addObject({ photoId: 'p', name: 'x', shape: 'rect', quad, sheetIds: [] });
    const b = new Project();
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    // 동시 편집: 서로 다른 필드 수정 + 각자 메시지
    a.updateObject(oid, { widthMm: 3000 });
    b.updateObject(oid, { heightMm: 900 });
    a.addMessage(oid, 'A', '가로 3m');
    b.addMessage(oid, 'B', '세로 0.9m');
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc));
    for (const p of [a, b]) {
      expect(p.object(oid)).toMatchObject({ widthMm: 3000, heightMm: 900 });
      expect(p.messagesOf(oid)).toHaveLength(2);
    }
    expect(a.messagesOf(oid)).toEqual(b.messagesOf(oid));
  });
});

describe('위치 코멘트(핀)', () => {
  const pin = { photoId: 'p', x: 120, y: 340, author: '고객' };

  it('추가·조회·이동·해결', () => {
    const p = new Project();
    const pid = p.addPhoto(photo);
    const id = p.addPin({ ...pin, photoId: pid });
    expect(p.pinsOf(pid)).toHaveLength(1);
    expect(p.pin(id)).toMatchObject({ x: 120, y: 340, author: '고객', resolved: false });
    expect(p.pin(id)!.number).toBe(1);
    p.updatePin(id, { x: 200, resolved: true });
    expect(p.pin(id)).toMatchObject({ x: 200, y: 340, resolved: true });
  });

  it('번호는 사진 안에서 만든 순서대로 1부터', () => {
    const p = new Project();
    const pid = p.addPhoto(photo);
    const a = p.addPin({ ...pin, photoId: pid });
    const b = p.addPin({ ...pin, photoId: pid });
    expect(p.pin(a)!.number).toBe(1);
    expect(p.pin(b)!.number).toBe(2);
  });

  it('핀을 지우면 그 핀의 대화도, 사진을 지우면 핀도 지워진다', () => {
    const p = new Project();
    const pid = p.addPhoto(photo);
    const a = p.addPin({ ...pin, photoId: pid });
    const b = p.addPin({ ...pin, photoId: pid });
    p.addMessage(a, '고객', '여기 간판 자리요');
    p.removePin(a);
    expect(p.messagesOf(a)).toEqual([]);
    expect(p.pinsOf(pid)).toHaveLength(1);
    p.removePhoto(pid);
    expect(p.allPins()).toEqual([]);
    expect(p.messagesOf(b)).toEqual([]);
  });
});
