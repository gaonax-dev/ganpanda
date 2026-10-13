// 실행 취소·다시 실행: Yjs UndoManager 로 "내 편집"만 되돌린다.
// 원격 변경(동기화 서버·IndexedDB)은 다른 origin 으로 들어오므로 추적되지 않는다. 대화(messages)는 대상에서 제외.
import * as Y from 'yjs';
import type { Project } from './project';

export interface History {
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  /** 이후 변경을 새 묶음으로 (드래그 끝 등) */
  stopCapturing(): void;
  /** 되돌릴 수 있는 상태가 바뀔 때 */
  onChange(cb: () => void): () => void;
  destroy(): void;
}

export function createHistory(project: Project, opts: { captureTimeout?: number } = {}): History {
  const um = new Y.UndoManager([project.photos, project.objects, project.pins], {
    captureTimeout: opts.captureTimeout ?? 500,
    trackedOrigins: new Set([null]), // Project 메서드는 origin 없이 변경한다
  });
  return {
    undo: () => { um.undo(); },
    redo: () => { um.redo(); },
    canUndo: () => um.canUndo(),
    canRedo: () => um.canRedo(),
    stopCapturing: () => um.stopCapturing(),
    onChange(cb) {
      const events = ['stack-item-added', 'stack-item-popped', 'stack-cleared'] as const;
      events.forEach((e) => um.on(e, cb));
      return () => events.forEach((e) => um.off(e, cb));
    },
    destroy: () => um.destroy(),
  };
}
