// 배포 뒤 스모크 테스트 (2026-10-22): 앱 첫 화면 · 없는 에셋 404 · 서버 헬스(메일 DNS 포함) · 로그인 공급자. 하나라도 틀리면 종료 코드 1
const APP = process.env.SMOKE_APP ?? 'https://ganpanda.co.kr';
const SYNC = process.env.SMOKE_SYNC ?? 'https://sync.ganpanda.co.kr';
let bad = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK ' : 'BAD'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) bad++; };
const get = async (url) => { try { const r = await fetch(url, { headers: { 'cache-control': 'no-store' } }); return { r, text: await r.text() }; } catch (e) { return { r: null, text: String(e) }; } };

const home = await get(`${APP}/?smoke=${Date.now()}`);
check('앱 첫 화면 200 + 번들 링크', !!home.r && home.r.status === 200 && /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(home.text), home.r ? String(home.r.status) : home.text);
const missing = await get(`${APP}/assets/index-smoke-${Date.now()}.css`);
check('없는 에셋은 404 (HTML 200 이면 휴대폰 캐시 사고)', !!missing.r && missing.r.status === 404, missing.r ? `${missing.r.status} ${missing.r.headers.get('cache-control')}` : missing.text);
const health = await get(`${SYNC}/api/health`);
let mail = '';
try { const j = JSON.parse(health.text); mail = j.mail ? `SPF ${j.mail.spf ? '있음' : '없음'} · DMARC ${j.mail.dmarc} · ${j.mail.detail}` : ''; } catch { /* 본문이 JSON 이 아님 */ }
check('서버 헬스 200 (메일 DNS 포함)', !!health.r && health.r.status === 200, health.r ? `${health.r.status} ${mail}` : health.text);
const prov = await get(`${SYNC}/api/auth/providers`);
check('카카오 로그인 공급자', !!prov.r && prov.r.status === 200 && prov.text.includes('kakao'), prov.text.slice(0, 80));
console.log(bad ? `\n${bad}개 실패` : '\n모두 정상');
process.exit(bad ? 1 : 0);
