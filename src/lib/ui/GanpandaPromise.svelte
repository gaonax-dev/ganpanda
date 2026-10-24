<!-- 간판다로 진행하면 (2026-10-24 사용자: "핵심은 고객이 간판다로 사인물 공사를 진행하는 것에대한 증거와 원활한 켜뮤니케이션을 보장하다고 알리는쪽이 좋을 거 같아")
  — 간판다 밖 거래를 막는 대신, 간판다로 진행할 이유(기록 = 증거, 한곳에서 소통)를 가게 사장에게 알린다 -->
<script lang="ts">
  let { compact = false }: { compact?: boolean } = $props();
</script>

<aside class="promise" class:compact data-testid="ganpanda-promise">
  <b>간판다로 진행하면</b>
  <ul>
    <li><span>📋</span><span><b>기록이 증거가 됩니다</b> — 요청서·치수·견적·제안·진행 동의가 날짜와 함께 남아, 시공 뒤 문제가 생겨도 무엇을 약속했는지 바로 확인할 수 있습니다.</span></li>
    <li><span>💬</span><span><b>소통이 한곳에</b> — 사인물마다 질문·답변·사진이 이어지고, 간판집과 바로 이야기합니다.</span></li>
  </ul>
  {#if !compact}<p>간판다 밖에서 따로 진행한 거래는 이 기록과 보호를 받을 수 없습니다.</p>{/if}
</aside>

<style>
  .promise { border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.5; }
  .promise ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .promise li { display: flex; gap: 8px; }
  .promise p { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
  .compact { font-size: 12px; }
</style>
