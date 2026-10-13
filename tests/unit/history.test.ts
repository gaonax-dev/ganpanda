import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Project } from '../../src/lib/core/project';
import { createHistory } from '../../src/lib/core/history';

const quad = [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][];
const obj = (photoId = 'p') => ({ photoId, name: '간판', shape: 'rect' as const, quad, sheetIds: [] });

describe('실행 취소·다시 실행 (내 편집만)', () => {
  it('사인물 추가 → 취소하면 사라지고 → 다시 실행하면 돌아온다', () => {
    const p = new Project();
    const h = createHistory(p, { captureTimeout: 0 });
    p.addObject(obj());
    expect(h.canUndo()).toBe(true);
    h.undo();
    expect(p.allObjects()).toHaveLength(0);
    expect(h.canRedo()).toBe(true);
    h.redo();
    expect(p.allObjects()).toHaveLength(1);
  });

  it('다른 사람의 변경(원격 업데이트)은 취소되지 않는다', () => {
    const a = new Project();
    const h = createHistory(a, { captureTimeout: 0 });
    const b = new Project();
    b.addObject(obj());
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc), 'remote');
    expect(a.allObjects()).toHaveLength(1);
    expect(h.canUndo()).toBe(false);
    h.undo();
    expect(a.allObjects()).toHaveLength(1);
  });

  it('짧은 간격의 연속 변경(드래그)은 한 번에 되돌린다', () => {
    const p = new Project();
    const h = createHistory(p, { captureTimeout: 1000 });
    const id = p.addObject(obj());
    h.stopCapturing(); // 추가와 이동을 분리
    for (let i = 1; i <= 5; i++) p.updateObject(id, { quad: quad.map(([x, y]) => [x + i, y] as [number, number]) });
    h.undo();
    expect(p.object(id)!.quad[0]).toEqual([0, 0]);
    expect(p.allObjects()).toHaveLength(1);
  });

  it('대화는 취소 대상이 아니다', () => {
    const p = new Project();
    const h = createHistory(p, { captureTimeout: 0 });
    p.addMessage('o', '나', '안녕');
    expect(h.canUndo()).toBe(false);
  });

  it('사진·핀도 되돌린다', () => {
    const p = new Project();
    const h = createHistory(p, { captureTimeout: 0 });
    const pid = p.addPhoto({ name: 'a', assetId: 'x', w: 10, h: 10, x: 0, y: 0, width: 10 });
    p.addPin({ photoId: pid, x: 1, y: 1, author: '나' });
    h.undo();
    expect(p.allPins()).toHaveLength(0);
    h.undo();
    expect(p.allPhotos()).toHaveLength(0);
  });
});
