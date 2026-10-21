// 프로젝트 문서 = Yjs CRDT. 오프라인·실시간 협업 모두 같은 모델로 동작한다.
import * as Y from 'yjs';
import { isSpecField, specOf } from './link';
import type { Attachment, DesignSource, Message, Photo, Pin, ProjectSettings, SignObject } from './model';

import { mapObjectPts, mapPhotoPts, mapPinPts, type PtMap } from './photoEdit';

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
  readonly sources: Y.Map<Y.Map<unknown>>;
  /** 단가표·설치비·추가 항목 (키별 JSON 값) */
  readonly settingsMap: Y.Map<unknown>;
  /** 모든 대화를 한 배열에 — 키별 배열을 동시 생성하면 한쪽이 유실되므로 */
  readonly messages: Y.Array<Message>;

  constructor(doc = new Y.Doc()) {
    this.doc = doc;
    this.photos = doc.getMap('photos');
    this.objects = doc.getMap('objects');
    this.pins = doc.getMap('pins');
    this.sources = doc.getMap('sources');
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

  /** 사진 px 좌표를 쓰는 모든 것(존·축 선·영역·말풍선)을 한 번에 옮긴다 — 이미지 조절·교체 (2026-10-21, core/photoEdit.ts) */
  transformPhotoPts(id: string, f: PtMap, photoPatch: Partial<Fields<Photo>> = {}) {
    const p = this.photo(id);
    if (!p) return;
    this.doc.transact(() => {
      this.updatePhoto(id, { ...mapPhotoPts(p, f), ...photoPatch });
      for (const o of this.objectsOf(id)) if (o.quad.length) this.updateObject(o.id, mapObjectPts(o, f));
      for (const pin of this.pinsOf(id)) this.updatePin(pin.id, mapPinPts(pin, f));
    });
  }

  removePhoto(id: string) {
    this.doc.transact(() => {
      for (const o of this.objectsOf(id)) this.removeObject(o.id);
      for (const p of this.pinsOf(id)) this.removePin(p.id);
      this.photos.delete(id);
    });
  }

  // ---------- 디자인 소스 ----------

  addSource(s: Omit<DesignSource, 'id' | 'createdAt'>): string {
    const id = uid();
    this.sources.set(id, toYMap({ ...s, id, createdAt: Date.now() }));
    return id;
  }

  updateSource(id: string, patch: Partial<Pick<DesignSource, 'x' | 'y' | 'name'>>) {
    this.patch(this.sources.get(id), patch);
  }

  source(id: string) {
    const m = this.sources.get(id);
    return m ? fromYMap<DesignSource>(m) : undefined;
  }

  allSources(): DesignSource[] {
    return [...this.sources.values()].map((m) => fromYMap<DesignSource>(m)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  /** 소스를 지우면 그 소스를 입힌 사인물의 매핑을 푼다 (이력은 남김) */
  removeSource(id: string) {
    this.doc.transact(() => {
      for (const o of this.allObjects()) if (o.design?.sourceId === id) this.updateObject(o.id, { design: undefined });
      this.sources.delete(id);
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

  addPin(p: Pick<Pin, 'photoId' | 'x' | 'y' | 'author'> & Partial<Pick<Pin, 'to'>>): string {
    const id = uid();
    const number = this.pinsOf(p.photoId).length + 1;
    this.pins.set(id, toYMap({ ...p, id, createdAt: Date.now(), resolved: false, number }));
    return id;
  }

  updatePin(id: string, patch: Partial<Pick<Pin, 'x' | 'y' | 'resolved' | 'to' | 'bx' | 'by'>>) {
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

  /** 연결된 영역(sameAs)의 규격 변경은 원본으로, 위치·기준 체크는 자기 것으로 */
  /** 여러 변경을 한 트랜잭션으로 (끄는 동안 카드 여러 장 — 동기화·재계산 한 번, 2026-10-19) */
  batch(fn: () => void) { this.doc.transact(fn); }

  updateObject(id: string, patch: Partial<Fields<SignObject>>) {
    const m = this.objects.get(id);
    const masterId = m?.get('sameAs') as string | undefined;
    const master = masterId ? this.objects.get(masterId) : undefined;
    if (!master || 'sameAs' in patch) { this.patch(m, patch); return; } // 연결 자체의 변경은 자기 것
    const own: Record<string, unknown> = {}, spec: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) (isSpecField(k) ? spec : own)[k] = v;
    this.doc.transact(() => { this.patch(m, own); this.patch(master, spec); });
  }

  // ---------- 여러 사진의 같은 사인물 ----------

  /** id 영역을 masterId 사인물과 같은 것으로. 연결된 영역에 연결하면 그 원본으로, 자기 연결 영역들은 따라온다 */
  linkObject(id: string, masterId: string) {
    const target = this.object(masterId);
    if (!target || masterId === id) return;
    const root = target.sameAs && this.objects.has(target.sameAs) ? target.sameAs : masterId;
    if (root === id) return;
    this.doc.transact(() => {
      this.patch(this.objects.get(id), { sameAs: root });
      for (const c of this.allObjects()) if (c.sameAs === id) this.patch(this.objects.get(c.id), { sameAs: root });
    });
  }

  /** 연결 해제: 그 시점의 원본 규격을 복사해 독립 사인물로 */
  unlinkObject(id: string) {
    const o = this.object(id);
    const master = o?.sameAs ? this.object(o.sameAs) : undefined;
    this.patch(this.objects.get(id), { ...(master ? specOf(master) : {}), sameAs: undefined });
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

  /** 삭제. 원본이면 첫 연결 영역이 새 원본이 되고(규격·대화 승계) 나머지는 그쪽으로 */
  removeObject(id: string) {
    this.doc.transact(() => {
      const o = this.object(id);
      const copies = o ? this.allObjects().filter((c) => c.sameAs === id) : [];
      if (o && copies.length) {
        const heir = copies[0].id;
        this.patch(this.objects.get(heir), { ...specOf(o), sameAs: undefined });
        for (const c of copies.slice(1)) this.patch(this.objects.get(c.id), { sameAs: heir });
        const arr = this.messages.toArray();
        for (let i = arr.length - 1; i >= 0; i--) if (arr[i].objectId === id) { this.messages.delete(i, 1); this.messages.insert(i, [{ ...arr[i], objectId: heir }]); }
      }
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

  /** 메시지 하나 지우기 (2026-10-18 사용자: "말풍선 안의 이전 녹음을 지울 수가 없다") — 대화·코멘트·음성 메모 모두. 없으면 false */
  removeMessage(id: string): boolean {
    const i = this.messages.toArray().findIndex((m) => m.id === id);
    if (i < 0) return false;
    this.messages.delete(i, 1);
    return true;
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
