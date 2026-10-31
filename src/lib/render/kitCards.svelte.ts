// 채널 그림 카드 (2026-10-31): 묶음(프리셋)마다 키트 모델에 그 묶음의 색을 입혀 한 장씩 그린다 — 미리보기와 같은 WebGL 화면으로 차례로(아이폰 화면 하나),
// 그림은 기기에 저장(파생 그림 `k|…`, 키트 버전이 바뀌면 다시). 키트에 없는 묶음은 사진 그대로
import { getDerived, putDerived } from '../derivedImages';
import { fnv1a } from '../core/proposal';
import type { KitLook } from '../core/channelKit';
import { loadKitManifest } from './kitSource';
import type { KitView } from './kitView';

export interface KitCard { variant: string; look: KitLook }
/** 카드 그림 주소 (키 → blob URL) */
export const kitCards = $state<Record<string, string>>({});
export const cardKey = (c: KitCard) => fnv1a(JSON.stringify([c.variant, c.look]));

let busy: Promise<void> = Promise.resolve();
/** 아직 없는 카드를 그린다. 다 그리면 지금 보던 것을 다시 그리는 것은 호출자 몫 */
export function ensureKitCards(view: KitView, cards: KitCard[], size = { w: 240, h: 160 }): Promise<void> {
  busy = busy.then(async () => {
    const mf = await loadKitManifest();
    if (!mf) return;
    for (const c of cards) {
      const k = cardKey(c);
      if (kitCards[k]) continue;
      const dk = `k|${mf.version}|${k}`;
      const hit = await getDerived(dk);
      if (hit && 'blob' in hit) { kitCards[k] = URL.createObjectURL(hit.blob); continue; }
      const prev = view.size();
      view.setSize(size.w, size.h);
      if (!(await view.show(c.variant, c.look, false))) { view.setSize(prev.w, prev.h); continue; }
      const blob = await view.snapshot();
      view.setSize(prev.w, prev.h);
      if (!blob) continue;
      void putDerived(dk, { blob });
      kitCards[k] = URL.createObjectURL(blob);
    }
  }).catch(() => undefined);
  return busy;
}
