// 사업자등록증 사본 읽기 (2026-10-21): Workers AI 바인딩(wrangler.jsonc ai.binding)과 로컬 가짜 스위치
interface Env {
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  /** 'fake' = 로컬·E2E 가짜 결과 (.dev.vars) */
  DOC_SCAN?: string;
}
