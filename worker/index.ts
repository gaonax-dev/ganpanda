// 앱 워커: 정적 에셋 앞에서 /assets/*·/env/* 만 거친다 (wrangler.jsonc run_worker_first). 나머지 경로는 에셋 서비스가 바로 낸다.
import { isFallbackHtml } from './guard';

interface Env { ASSETS: { fetch(req: Request): Promise<Response> } }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const r = await env.ASSETS.fetch(req);
    if (isFallbackHtml(new URL(req.url).pathname, r.headers.get('content-type'))) {
      return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' } });
    }
    return r;
  },
};
