<!-- 사업자 정보 푸터 (2026-10-23 결제사 홈페이지 심사 — 상호·대표자·사업자등록번호·통신판매업·사업장주소·대표전화) + 요금제·약관·환불·개인정보 링크. 값은 core/company.ts -->
<script lang="ts">
  import { paymentsShown } from '../auth';
  import { COMPANY, ftcUrl } from '../core/company';
</script>

<footer class="site-footer" data-testid="site-footer">
  <nav>{#if paymentsShown()}<a href="/pricing">요금제</a>{/if}<a href="/terms">이용약관</a><a href="/refund">환불 정책</a><a href="/privacy"><b>개인정보처리방침</b></a></nav>
  <p><b>{COMPANY.name}</b> · 대표자 {COMPANY.representative} · 사업자등록번호 {COMPANY.bizNo} <a href={ftcUrl()} target="_blank" rel="noopener">사업자정보 확인</a></p>
  <p>통신판매업 신고번호 {COMPANY.mailOrderNo} · 주소 {COMPANY.address}</p>
  <p>대표전화 {COMPANY.phone} · 이메일 <a href="mailto:{COMPANY.email}">{COMPANY.email}</a></p>
</footer>

<style>
  .site-footer { margin-top: 40px; padding: 16px 0 24px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.7; }
  .site-footer p { margin: 2px 0; }
  .site-footer nav { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-bottom: 8px; font-size: 13px; }
  .site-footer a { color: inherit; }
</style>
