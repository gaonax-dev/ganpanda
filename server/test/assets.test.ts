import { describe, expect, it } from 'vitest';
import { exports } from 'cloudflare:workers';

async function idOf(bytes: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const put = (id: string, body: BodyInit, type = 'image/png') =>
  exports.default.fetch(`http://sync/api/assets/${id}`, { method: 'PUT', body, headers: { 'content-type': type } });

describe('에셋 (R2)', () => {
  it('업로드 후 같은 내용과 형식으로 내려받는다', async () => {
    const id = await idOf(png);
    expect((await put(id, png)).status).toBe(201);
    const r = await exports.default.fetch(`http://sync/api/assets/${id}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(png);
  });

  it('HEAD 로 존재 여부 확인', async () => {
    const bytes = new Uint8Array([1, 9, 9, 9]);
    const id = await idOf(bytes);
    expect((await exports.default.fetch(`http://sync/api/assets/${id}`, { method: 'HEAD' })).status).toBe(404);
    await put(id, bytes);
    expect((await exports.default.fetch(`http://sync/api/assets/${id}`, { method: 'HEAD' })).status).toBe(200);
  });

  it('내용과 해시가 다르면 거부 (400)', async () => {
    expect((await put('0'.repeat(32), png)).status).toBe(400);
  });

  it('이미지·PDF 외 형식은 거부 (415)', async () => {
    const bytes = new TextEncoder().encode('<script>alert(1)</script>');
    expect((await put(await idOf(bytes), bytes, 'text/html')).status).toBe(415);
  });

  it('너무 큰 파일은 거부 (413)', async () => {
    const big = new Uint8Array(30 * 1024 * 1024);
    expect((await put(await idOf(big), big)).status).toBe(413);
  });

  it('SVG 는 스크립트가 실행되지 않도록 격리해서 내려준다', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const id = await idOf(svg);
    await put(id, svg, 'image/svg+xml');
    const r = await exports.default.fetch(`http://sync/api/assets/${id}`);
    expect(r.headers.get('content-security-policy')).toContain('sandbox');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
