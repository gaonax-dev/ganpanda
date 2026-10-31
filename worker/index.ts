// 앱 워커: 정적 에셋 앞에서 모든 경로를 거친다 (wrangler.jsonc run_worker_first "/*").
// (1) 서비스 차단 (2026-10-31 사용자: "법적문제가 있다. 웹에서 접근을 차단한다." → "모든 정보를 못보게 해"): SERVICE_BLOCKED=1 이면 모든 경로에 빈 503(캐시 없음, 정보 없음) — 해제는 "" 로 바꿔 배포.
// (2) 없는 /assets·/env 경로가 index.html(200, 1년 캐시)로 내려와 휴대폰이 깨지던 문제 → 404 (2026-10-21, worker/guard.ts)
import { isFallbackHtml } from './guard';

interface Env { ASSETS: { fetch(req: Request): Promise<Response> }; SERVICE_BLOCKED?: string }

// 안내에 아무 정보도 두지 않는다 (2026-10-31 "모든 정보를 못보게 해" → 2: 서비스명·문의 메일도 없음). 검색엔진 수집 제외
const BLOCKED_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>503</title><style>html,body{margin:0;height:100%;background:#0f1115}</style></head><body></body></html>`;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // "앱만 열어줘" (2026-10-31): 설치한 앱(Tauri)은 User-Agent 에 Ganpanda-App/ — 그 요청만 통과, 브라우저는 안내만
    if (env.SERVICE_BLOCKED === '1' && !(req.headers.get('user-agent') ?? '').includes('Ganpanda-App/')) {
      return new Response(BLOCKED_HTML, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '3600' } });
    }
    const r = await env.ASSETS.fetch(req);
    if (isFallbackHtml(new URL(req.url).pathname, r.headers.get('content-type'))) {
      return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' } });
    }
    return r;
  },
};
