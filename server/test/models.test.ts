import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';

describe('모델 파일 제공 (/api/models/*)', () => {
  it('R2 의 models/ 아래 파일을 공개·장기 캐시로 내려준다 (자격 불필요)', async () => {
    await env.ASSETS.put('models/slimsam/config.json', '{"a":1}', { httpMetadata: { contentType: 'application/json' } });
    await env.ASSETS.put('models/slimsam/onnx/x.onnx', new Uint8Array([1, 2, 3]));
    const r = await exports.default.fetch('http://sync/api/models/slimsam/config.json');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('{"a":1}');
    expect(r.headers.get('cache-control')).toContain('immutable');
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    const o = await exports.default.fetch('http://sync/api/models/slimsam/onnx/x.onnx');
    expect(o.status).toBe(200);
    expect(o.headers.get('content-type')).toBe('application/octet-stream');
    expect(new Uint8Array(await o.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('없는 파일 404, 경로 탈출 400', async () => {
    expect((await exports.default.fetch('http://sync/api/models/slimsam/nope.json')).status).toBe(404);
    expect((await exports.default.fetch('http://sync/api/models/../assets/x')).status).toBe(400);
    expect((await exports.default.fetch('http://sync/api/models/slimsam/%2e%2e/x')).status).toBe(400);
  });
});
