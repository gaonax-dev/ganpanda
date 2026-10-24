<!--
  휴대폰 조작 안내 (2026-10-24 사용자: "처음 시작할때 화면 이동을 두손가락 이동, 핀치줌을 간단하게 화면위에 보여주게하고 다시 안보기 표시도"):
  터치 기기에서 보드에 들어오면 한 번(페이지마다) — [확인]은 이번만, [다시 보지 않기]를 켜고 닫으면 이 기기에서는 다시 안 나온다(localStorage)
-->
<script module lang="ts">
  /** 이번 페이지에서 이미 닫음 (보기 전환마다 다시 뜨지 않게) */
  let closedThisPage = false;
</script>

<script lang="ts">
  const KEY = 'ganpanda.touchHelp';
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const off = (() => { try { return localStorage.getItem(KEY) === 'off'; } catch { return false; } })();
  let open = $state(touch && !off && !closedThisPage);
  let never = $state(false);
  function close() {
    if (never) { try { localStorage.setItem(KEY, 'off'); } catch { /* 저장 불가 */ } }
    closedThisPage = true;
    open = false;
  }
</script>

{#if open}
  <div class="touch-help" data-testid="touch-help" role="dialog" aria-label="화면 조작 안내">
    <b>화면 조작</b>
    <ul>
      <li><span class="ic">✌️</span> <b>두 손가락으로 끌기</b> — 화면 이동</li>
      <li><span class="ic">🤏</span> <b>두 손가락 벌리기·모으기</b> — 확대·축소</li>
      <li><span class="ic">☝️</span> <b>한 손가락</b> — 선택·그리기·조절점 끌기</li>
    </ul>
    <div class="row">
      <label><input type="checkbox" data-testid="touch-help-never" bind:checked={never} /> 다시 보지 않기</label>
      <button class="btn small primary" data-testid="touch-help-ok" onclick={close}>확인</button>
    </div>
  </div>
{/if}

<style>
  .touch-help { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); z-index: 40; width: min(320px, calc(100% - 32px)); padding: 12px 14px; border-radius: 12px; background: var(--panel); color: var(--text); border: 1px solid var(--line); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); font-size: 13px; }
  ul { list-style: none; margin: 8px 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .ic { display: inline-block; width: 1.6em; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  label { display: flex; flex-direction: row; align-items: center; gap: 6px; color: var(--muted); white-space: nowrap; }
  label input { width: auto; margin: 0; }
</style>
