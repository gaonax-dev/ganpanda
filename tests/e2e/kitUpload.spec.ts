// 채널 키트 올리기 → 초안 미리보기 → 공개 (2026-10-31 사용자: "블랜더에서 간판다로 모델 생성해서 보낼수 있는 플러그인" → "운영자만, 초안 공개 2단계로 진행해줘").
// 애드온이 하는 일(파일 해시 이름으로 올리고 초안 목록)을 API 로 흉내 — 운영자가 /ops 채널 키트에서 미리 보고 공개하면 모두가 서버 키트를 쓴다
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { apiLogin, SERVER } from './helpers';

const KEY = 'e2e-kit';
const DIR = 'public/channel-models';
type M = { variants: { file: string; lightmaps: Record<'day' | 'night', { letters: string; wall: string }> }[] };

async function uploadKit(request: import('@playwright/test').APIRequestContext) {
  const mf = JSON.parse(readFileSync(`${DIR}/manifest.json`, 'utf8')) as M;
  const rename = new Map<string, string>();
  const files = mf.variants.flatMap((v) => [v.file, v.lightmaps.day.letters, v.lightmaps.day.wall, v.lightmaps.night.letters, v.lightmaps.night.wall]);
  for (const f of files) {
    const b = readFileSync(`${DIR}/${f}`);
    const name = `${createHash('sha256').update(b).digest('hex')}.${f.split('.').pop()}`;
    rename.set(f, name);
    const r = await request.put(`${SERVER}/api/kit/files/${name}`, { data: b, headers: { authorization: `Bearer ${KEY}` } });
    expect(r.status()).toBe(200);
  }
  const variants = mf.variants.map((v) => ({ ...v, file: rename.get(v.file), lightmaps: Object.fromEntries((['day', 'night'] as const).map((m) => [m, { ...v.lightmaps[m], letters: rename.get(v.lightmaps[m].letters), wall: rename.get(v.lightmaps[m].wall) }])) }));
  const r = await request.post(`${SERVER}/api/kit/draft`, { data: { letter: 'G', variants }, headers: { authorization: `Bearer ${KEY}` } });
  expect(r.status()).toBe(200);
  return (await r.json()).version as number;
}
const kitOf = (page: Page) => page.evaluate(async () => { const p = '/src/lib/render/kitView.ts'; const { loadKitManifest, resetKitManifest } = await import(/* @vite-ignore */ p); resetKitManifest(); const m = await loadKitManifest(); return { source: m?.source, version: m?.version }; });
const login = async (page: Page, s: string) => { await page.goto('/'); await page.evaluate((x) => { localStorage.clear(); localStorage.setItem('ganpanda.session', x); localStorage.setItem('ganpanda.touchHelp', 'off'); }, s); await page.goto('/'); };

test('애드온이 초안을 올리면 운영자만 미리 보고 [공개] — 그 뒤 모두가 서버 키트, 업로드 키 없이는 못 올린다', async ({ page, request }) => {
  expect((await request.put(`${SERVER}/api/kit/files/${'0'.repeat(64)}.glb`, { data: Buffer.from('x') })).status()).toBe(401);
  const v = await uploadKit(request);
  // 운영자: /ops → 채널 키트
  await login(page, await apiLogin(request, 'op@example.com'));
  await page.goto('/ops');
  await page.getByTestId('ops-tab-kit').click();
  const sec = page.getByTestId('kit-ops');
  await expect(sec.getByTestId('kit-draft')).toHaveText(String(v));
  await sec.getByTestId('kit-preview-toggle').click();
  expect(await kitOf(page)).toEqual({ source: 'draft', version: v });
  // 일반 사용자는 초안을 못 본다 (공개 전)
  const otherCtx = await page.context().browser()!.newContext(); // 저장소를 따로 — 같은 창 묶음이면 운영자 로그인을 덮는다
  const other = await otherCtx.newPage();
  await login(other, await apiLogin(request));
  await other.evaluate(() => localStorage.setItem('ganpanda.kitDraft', '1')); // 켜도
  expect((await kitOf(other)).source).not.toBe('draft');
  // 공개
  page.once('dialog', (d) => void d.accept()); // 브라우저는 확인 창이 native confirm
  await sec.getByTestId('kit-publish').click();
  await expect(sec.getByTestId('kit-published')).toHaveText(String(v));
  expect(await kitOf(other)).toEqual({ source: 'server', version: v });
  await otherCtx.close();
});
