<!-- 주문 정보 (프로젝트에 저장): 주문자·업체·연락처·배송/시공·주소·납기·요청사항. 주문서 머리에 들어간다 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { DELIVERY_LABEL, type DeliveryType, type OrderInfo } from '../core/order';

  const o = $derived<OrderInfo>(app.settings.order ?? {});
  const ro = $derived(!app.canEdit);
  const set = (patch: Partial<OrderInfo>) => app.updateSettings({ order: { ...o, ...patch } });
  const close = () => (app.orderOpen = false);
</script>

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="주문 정보" data-testid="order-dialog">
    <header><h2>주문 정보</h2><button class="icon" data-testid="close-order" title="닫기" onclick={close}>✕</button></header>
    <div class="body">
      <div class="grid2">
        <label>주문자명<input data-testid="order-customer" value={o.customer ?? ''} disabled={ro} oninput={(e) => set({ customer: e.currentTarget.value })} /></label>
        <label>업체명<input data-testid="order-company" value={o.company ?? ''} disabled={ro} oninput={(e) => set({ company: e.currentTarget.value })} /></label>
        <label>연락처<input data-testid="order-phone" type="tel" value={o.phone ?? ''} placeholder="010-0000-0000" disabled={ro} oninput={(e) => set({ phone: e.currentTarget.value })} /></label>
        <label>납기 희망일<input data-testid="order-due" type="date" value={o.dueDate ?? ''} disabled={ro} oninput={(e) => set({ dueDate: e.currentTarget.value || undefined })} /></label>
      </div>
      <label>배송·시공
        <select data-testid="order-delivery" value={o.delivery ?? ''} disabled={ro} onchange={(e) => set({ delivery: (e.currentTarget.value || undefined) as DeliveryType | undefined })}>
          <option value="">선택</option>
          {#each Object.entries(DELIVERY_LABEL) as [id, label] (id)}<option value={id}>{label}</option>{/each}
        </select>
      </label>
      <label>배송·시공지 주소<input data-testid="order-address" value={o.address ?? ''} disabled={ro} oninput={(e) => set({ address: e.currentTarget.value })} /></label>
      <label>추가 요청사항<textarea data-testid="order-notes" rows="3" value={o.notes ?? ''} placeholder="배선 위치, 현장 설치 환경, 특수 가공 등" disabled={ro} oninput={(e) => set({ notes: e.currentTarget.value })}></textarea></label>
      <p class="hint">사인물마다의 사양(종류·옵션·치수·문구·디자인)은 사인물 설정에서, 파일은 [디자인 파일] 화면에서 올립니다. 주문서는 사인물 리스트의 [주문서]에서 봅니다.</p>
    </div>
    <footer><span class="sp"></span><button class="btn small primary" onclick={close}>닫기</button></footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100dvh - 64px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  h2 { flex: 1; margin: 0; font-size: 16px; }
  .body { overflow: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
  label { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); white-space: nowrap; } /* 라벨 왼쪽·입력 오른쪽 (2026-10-18) */
  label > input, label > select, label > textarea { flex: 1; min-width: 0; white-space: normal; }
  label:has(textarea) { align-items: flex-start; }
  .hint { color: var(--muted); font-size: 11px; margin: 0; }
  footer { display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--line); }
  .sp { flex: 1; }
</style>
