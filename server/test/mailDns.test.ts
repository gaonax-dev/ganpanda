// 메일 DNS 점검 (2026-10-22 "서비스 시작하고 이런 상황이 벌어지면 심각하다")
import { afterEach, describe, expect, it } from 'vitest';
import { assessMailDns, setDnsFetch } from '../src/mailDns';
import { api } from './helpers';

afterEach(() => setDnsFetch(null));
const doh = (spf: string[], dmarc: string[]) => setDnsFetch(async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const name = new URL(url).searchParams.get('name') ?? '';
  const recs = name.startsWith('_dmarc.') ? dmarc : spf;
  return new Response(JSON.stringify({ Answer: recs.map((data) => ({ data: `"${data}"` })) }), { headers: { 'content-type': 'application/json' } });
});

describe('평가', () => {
  it('SPF 없음 + DMARC reject/quarantine = 위험, SPF 있으면 괜찮음, DMARC 없으면 스팸함 위험만', () => {
    expect(assessMailDns([], ['v=DMARC1; p=reject;'])).toMatchObject({ spf: false, dmarc: 'reject', danger: true });
    expect(assessMailDns([], ['v=DMARC1; p=quarantine'])).toMatchObject({ danger: true });
    expect(assessMailDns(['v=spf1 include:_spf.mx.cloudflare.net ~all'], ['v=DMARC1; p=reject;'])).toMatchObject({ spf: true, dmarc: 'reject', danger: false, detail: 'ok' });
    expect(assessMailDns([], [])).toMatchObject({ spf: false, dmarc: 'missing', danger: false });
    expect(assessMailDns(['v=spf1 -all'], ['v=DMARC1; p=none'])).toMatchObject({ dmarc: 'none', danger: false });
  });
});

describe('/api/health', () => {
  it('메일 DNS 가 위험하면 503 (외부 모니터가 알리게), 아니면 200', async () => {
    doh([], ['v=DMARC1; p=reject;']);
    const bad = await api('/api/health');
    expect(bad.status).toBe(503);
    expect(await bad.json()).toMatchObject({ ok: false, mail: { danger: true } });
    doh(['v=spf1 include:_spf.mx.cloudflare.net ~all'], ['v=DMARC1; p=reject;']);
    const good = await api('/api/health');
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ ok: true, mail: { danger: false } });
  });
});
