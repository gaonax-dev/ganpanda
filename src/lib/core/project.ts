// 프로젝트 문서 = Yjs CRDT. 오프라인·실시간 협업 모두 같은 모델로 동작한다.
import * as Y from 'yjs';
import type { Attachment, Message, Photo, Pin, ProjectSettings, SignObject } from './model';

type Fields<T> = Omit<T, 'id'>;
const uid = () => crypto.randomUUID();

/** 엔티티 하나 = 중첩 Y.Map (필드 단위 병합 → 동시 편집 시 다른 필드가 덮어써지지 않음) */
function toYMap(o: object): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(o)) if (v !== undefined) m.set(k, v);
  return m;
}
const fromYMap = <T>(m: Y.Map<unknown>) => m.toJSON() as T;

export class Project {
  readonly doc: Y.Doc;
  readonly photos: Y.Map<Y.Map<unknown>>;
  readonly objects: Y.Map<Y.Map<unknown>>;
  readonly pins: Y.Map<Y.Map<unknown>>;
  /** 단가표·설치비·추가 항목 (키별 JSON 값) */
  readonly settingsMap: Y.Map<unknown>;
  /** 모든 대화를 한 배열에 — 키별 배열을 동시 생성하면 한쪽이 유실되므로 */
  readonly messages: Y.Array<Message>;

  constructor(doc = new Y.Doc()) {
    this.doc = doc;
    this.photos = doc.getMap('photos');
    this.objects = doc.getMap('objects');
    this.pins = doc.getMap('pins');
    this.settingsMap = doc.getMap('settings');
    this.messages = doc.getArray('messages');
  }

  addPhoto(p: Fields<Photo>): string {
    const id = uid();
    this.photos.set(id, toYMap({ ...p, id }));
    return id;
  }

  updatePhoto(id: string, patch: Partial<Fields<Photo>>) {
    this.patch(this.photos.get(id), patch);
  }

  photo(id: string) {
    const m = this.photos.get(id);
    return m ? fromYMap<Photo>(m) : undefined;
  }

  allPhotos(): Photo[] {
    return [...this.photos.values()].map((m) => fromYMap<Photo>(m));
  }

  removePhoto(id: string) {
    this.doc.transact(() => {
      for (const o of this.objectsOf(id)) this.removeObject(o.id);
      for (const p of this.pinsOf(id)) this.removePin(p.id);
      this.photos.delete(id);
    });
  }

  // ---------- 프로젝트 설정 ----------

  settings(): ProjectSettings {
    return this.settingsMap.toJSON() as ProjectSettings;
  }

  updateSettings(patch: Partial<ProjectSettings>) {
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) this.settingsMap.delete(k); else this.settingsMap.set(k, JSON.parse(JSON.stringify(v)));
      }
    });
  }

  // ---------- 위치 코멘트(핀) ----------

  addPin(p: Pick<Pin, 'photoId' | 'x' | 'y' | 'author'>): string {
    const id = uid();
    const number = this.pinsOf(p.photoId).length + 1;
    this.pins.set(id, toYMap({ ...p, id, createdAt: Date.now(), resolved: false, number }));
    return id;
  }

  updatePin(id: string, patch: Partial<Pick<Pin, 'x' | 'y' | 'resolved'>>) {
    this.patch(this.pins.get(id), patch);
  }

  pin(id: string) {
    const m = this.pins.get(id);
    return m ? fromYMap<Pin>(m) : undefined;
  }

  allPins(): Pin[] {
    return [...this.pins.values()].map((m) => fromYMap<Pin>(m)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  pinsOf(photoId: string) {
    return this.allPins().filter((p) => p.photoId === photoId);
  }

  removePin(id: string) {
    this.doc.transact(() => {
      this.pins.delete(id);
      this.deleteMessagesOf(id);
    });
  }

  addObject(o: Omit<Fields<SignObject>, 'createdAt'>): string {
    const id = uid();
    this.objects.set(id, toYMap({ ...o, id, createdAt: Date.now() }));
    return id;
  }

  updateObject(id: string, patch: Partial<Fields<SignObject>>) {
    this.patch(this.objects.get(id), patch);
  }

  object(id: string) {
    const m = this.objects.get(id);
    return m ? fromYMap<SignObject>(m) : undefined;
  }

  allObjects(): SignObject[] {
    return [...this.objects.values()]
      .map((m) => fromYMap<SignObject>(m))
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  objectsOf(photoId: string) {
    return this.allObjects().filter((o) => o.photoId === photoId);
  }

  removeObject(id: string) {
    this.doc.transact(() => {
      this.objects.delete(id);
      this.deleteMessagesOf(id);
    });
  }

  private deleteMessagesOf(objectId: string) {
    const arr = this.messages.toArray();
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i].objectId === objectId) this.messages.delete(i, 1);
  }

  addMessage(objectId: string, author: string, text: string, kind: Message['kind'] = 'chat', attachments?: Attachment[]) {
    this.messages.push([{ id: uid(), objectId, author, text, kind, ts: Date.now(), ...(attachments?.length ? { attachments } : {}) }]);
  }

  allMessages(): Message[] {
    return this.messages.toArray();
  }

  messagesOf(objectId: string): Message[] {
    return this.messages.toArray().filter((m) => m.objectId === objectId);
  }

  onChange(cb: () => void): () => void {
    const h = () => cb();
    this.doc.on('update', h);
    return () => this.doc.off('update', h);
  }

  private patch(m: Y.Map<unknown> | undefined, patch: object) {
    if (!m) return;
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) m.delete(k); else m.set(k, v);
      }
    });
  }
}
