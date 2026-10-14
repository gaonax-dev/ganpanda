<!-- 사진별 카메라 설정 상태 (사진 보드 왼쪽 위): 설정 여부·초점거리·경고 → [카메라 설정] -->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { Photo } from '../core/model';

  let { photo }: { photo: Photo } = $props();
  const cam = $derived(app.cameras.get(photo.id));
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
</script>

<div class="cam" data-testid="camera-panel">
  <header>
    <b>카메라 · {photo.name}</b>
    <span class="status" data-testid="camera-status" data-status={cam ? 'set' : 'none'}>{cam ? '설정됨' : '설정 없음'}</span>
  </header>
  {#if cam}
    <small>초점거리 {fmt(cam.f)}px{#if photo.camera?.ref} · 기준 {fmt(photo.camera.ref.mm)}mm{/if}{#if photo.camera?.z} · 깊이 축{/if}</small>
    {#each cam.warnings as w, i (i)}<p class="warn">⚠ {w}</p>{/each}
  {:else}
    <small>벽의 가로·세로 선 두 쌍과 기준 길이로 사진의 원근을 잡으면 모든 사인물의 치수를 추정하고 실사에 씁니다. 없으면 치수를 입력한 첫 사인물로 대신합니다.</small>
  {/if}
  {#if app.canEdit}
    <div class="actions">
      <button class="btn small primary" data-testid="camera-open" onclick={() => app.openCamera(photo.id)}>카메라 설정</button>
      {#if cam}<button class="btn small" data-testid="camera-clear" onclick={() => app.clearCamera(photo.id)}>지우기</button>{/if}
    </div>
  {/if}
</div>

<style>
  .cam { position: absolute; left: 12px; top: 12px; width: 280px; z-index: 4; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
  header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
  .status { font-size: 11px; color: var(--muted); }
  .status[data-status='set'] { color: var(--ok); }
  small { color: var(--muted); font-size: 11px; line-height: 1.4; }
  .warn { color: var(--warn); font-size: 12px; margin: 0; }
  .actions { display: flex; gap: 6px; }
</style>
