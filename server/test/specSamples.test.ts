// 사양 글 표본 (2026-10-18 "메모로 전환하는 글만 모아서")
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { json, login } from './helpers';

describe('POST /api/spec-samples', () => {
  it('로그인한 계정이 못 알아본 글을 보내면 저장된다', async () => {
    const s = await login(`spec-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const r = await json('/api/spec-samples', { text: '갈바 3000x600 전광채널 카페 로고는 왼쪽 아래', leftover: '로고는 왼쪽 아래', recognized: ['종류: 갈바', '사이즈 3000×600'], productId: 'board-galva' }, s);
    expect(r.status).toBe(201);
    const row = await env.DB.prepare('SELECT text, leftover, recognized, product_id FROM spec_samples ORDER BY created_at DESC LIMIT 1').first<{ text: string; leftover: string; recognized: string; product_id: string }>();
    expect(row).toMatchObject({ leftover: '로고는 왼쪽 아래', product_id: 'board-galva' });
    expect(JSON.parse(row!.recognized)).toEqual(['종류: 갈바', '사이즈 3000×600']);
  });
  it('로그인 필요, 글이 없거나 길면 400', async () => {
    expect((await json('/api/spec-samples', { text: 'a', leftover: 'a' })).status).toBe(401);
    const s = await login(`spec2-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect((await json('/api/spec-samples', { text: 'a', leftover: '' }, s)).status).toBe(400);
    expect((await json('/api/spec-samples', { text: 'a'.repeat(301), leftover: 'a' }, s)).status).toBe(400);
    expect((await json('/api/spec-samples', { text: 'a', leftover: 'a', recognized: 'nope' }, s)).status).toBe(400);
  });
});
