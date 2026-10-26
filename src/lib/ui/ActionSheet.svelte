<!-- 하단 시트 (2026-10-26 "사진을 클릭하면 나오는 리스트가 아이폰과 안드로이드가 다르다 … 이상한데에서 나온다 … 아이콘도 모던한걸로"):
  화면 맨 아래에 붙는 목록 + [취소] — 확대된 보드·가로 스크롤 막대 안에서 열어도 화면 기준으로 보이게 body 로 옮겨 그린다. 바깥을 누르면 닫힘 -->
<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';
  export interface SheetItem { id: string; label: string; sub?: string; icon: IconName; danger?: boolean; /** 기존 시험 id 를 그대로 쓸 때 */ testid?: string; onclick: () => void }
  let { items, title = '', testid, onclose }: { items: SheetItem[]; title?: string; testid: string; onclose: () => void } = $props();
  function portal(node: HTMLElement) { document.body.appendChild(node); return { destroy() { node.remove(); } }; }
</script>

<div class="backdrop" use:portal role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); onclose(); } }} onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}>
  <div class="sheet" role="menu" tabindex="-1" data-testid={testid}>
    {#if title}<div class="title">{title}</div>{/if}
    <div class="group">
      {#each items as it (it.id)}
        <button class="item" class:danger={it.danger} data-testid={it.testid ?? `sheet-item-${it.id}`} onclick={() => { onclose(); it.onclick(); }}>
          <span class="ic"><Icon name={it.icon} size={20} /></span>
          <span class="txt"><b>{it.label}</b>{#if it.sub}<small>{it.sub}</small>{/if}</span>
        </button>
      {/each}
    </div>
    <button class="cancel" data-testid="sheet-cancel" onclick={onclose}>취소</button>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 200; background: rgba(0, 0, 0, 0.45); display: flex; align-items: flex-end; justify-content: center; animation: fade 0.15s ease-out; }
  .sheet { width: min(440px, 100%); padding: 0 10px calc(10px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 8px; animation: up 0.18s ease-out; }
  .title { text-align: center; color: var(--muted); font-size: 12px; padding: 4px 0 0; }
  .group { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.35); }
  .item { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 14px; padding: 14px 16px; cursor: pointer; color: var(--text); }
  .item + .item { border-top: 1px solid var(--line); }
  .item:active, .item:hover { background: color-mix(in srgb, var(--text) 7%, transparent); }
  .ic { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); flex: none; }
  .danger .ic { background: rgba(239, 68, 68, 0.15); color: #f87171; }
  .danger b { color: #f87171; }
  .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .txt b { font-size: 15px; font-weight: 700; }
  .txt small { font-size: 12px; color: var(--muted); }
  .cancel { all: unset; box-sizing: border-box; text-align: center; padding: 14px; border-radius: 16px; background: var(--panel); border: 1px solid var(--line); font-size: 15px; font-weight: 700; cursor: pointer; color: var(--text); }
  @keyframes up { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
