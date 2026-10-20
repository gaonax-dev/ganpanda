# 백업과 복원

## 요약
2026-10-21 사용자: "우리는 백업이 되고 있는가?" → "클라우드플레어에 백업하는게 좋을 것 같아 그리고 사용자가 직접 이전 상태로 돌리는 것도 유료에 도입하면 어떨까?" → "그 순서대로 진행해줘".
Cloudflare 안의 **따로 된 백업 버킷**(R2 `ganpanda-backup`, 바인딩 `BACKUP`)에 매시간 조금씩 받는다. 사진 버킷·D1·프로젝트 방과 따로라, 하나를 실수로 지워도 다른 쪽에서 되살린다. (계정 하나에 모두 있다는 위험은 남는다 — 규모가 커지면 다른 서비스에 사본을 하나 더 두는 것을 검토)

## 상태
구현됨 — `server/src/backup.ts`(예약 작업), `server/src/admin.ts`(운영자 복원 API), `server/src/restoreSql.ts`·`server/scripts/d1-restore.ts`(D1), `Room.backupState/markBackedUp/exportState/seedFrom/revertTo`. 테스트 `server/test/backup.test.ts`, `server/test/restore.test.ts`.

## 무엇을 어떻게 (매시간 17분, `wrangler.jsonc` `triggers.crons`)
| 대상 | 백업 파일 | 언제 |
|---|---|---|
| D1 (계정·프로젝트 목록·초대·멤버·단가·요청 등) | `d1/<YYYY-MM-DD>.json.gz` | 하루 한 번. 로그인 세션·토큰·실패 기록·소셜 로그인 상태는 뺀다(복원 뒤 다시 로그인) |
| 프로젝트 문서 (사진 배치·사인물·말풍선·대화·설정) | `rooms/<프로젝트>/<YYYY-MM-DD>.bin` (Yjs 전체 상태) | 마지막 백업 뒤 바뀐 방만, 그날 날짜 파일을 덮어씀. 한 번에 200개씩 차례(커서 `state/rooms-cursor`) |
| 사진·디자인·첨부·요청 사진 | 같은 키(내용 해시) | 올라올 때 함께 넣고(`index.ts`), 예전 것은 매시간 200개씩 채움(커서 `state/assets-cursor`). AI 모델 파일(`models/`)은 뺀다 |
| 정리 | — | 하루 한 번: 30일(`RETAIN_DAYS`) 지난 날짜 파일과 되돌리기 직전 저장(`r-<시각>`) 삭제. 사용자가 직접 저장한 버전(`m-<시각>`)은 남긴다 |

Cloudflare 자체 보호도 있다: D1 은 최근 30일 시점 복원(Time Travel), SQLite Durable Object 도 30일 시점 복구 기능이 있다(코드로 불러야 함). 위 백업은 그와 별개로, 지워져도 남는 사본이다.

## 처음 한 번 (배포 전)
```
cd server
npx wrangler r2 bucket create ganpanda-backup
npx wrangler secret put ADMIN_TOKEN        # 운영자 복원 API 비밀값 (길고 무작위로)
npm run deploy
```

## 복원 절차

### 프로젝트 하나 (문서가 망가졌거나 잃어버림)
1. 백업 파일 고르기: `npx wrangler r2 object list ganpanda-backup --prefix rooms/<프로젝트>/` (날짜별)
2. 되돌리기:
```
curl -X POST https://sync.ganpanda.co.kr/api/admin/restore \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"project":"<프로젝트>","key":"rooms/<프로젝트>/<날짜>.bin","mode":"revert"}'
```
   - `revert`: 지금 내용(사진·사인물·말풍선·디자인 소스·설정)을 백업 내용으로 바꾼다. **대화는 남긴다.** 접속 중인 사람에게도 바로 반영. 설정 `restored` 에 누가·언제·어느 파일로.
   - `merge`: 방이 비었거나 다른(새) 프로젝트 자리에 백업을 그대로 합친다(대화 포함).
3. 사진이 없어졌으면 아래 "사진".

### 사진 (사진 버킷에서 파일이 사라짐)
```
curl -X POST https://sync.ganpanda.co.kr/api/admin/restore-assets \
  -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' -d '{}'
```
응답 `{copied, cursor}` — `cursor` 가 null 이 아니면 `{"cursor":"..."}` 로 다시 부른다(한 번에 300개). 사진 버킷에 없는 것만 복사.

### D1 (계정·프로젝트 목록)
- **30일 안**: Cloudflare Time Travel 이 가장 쉽다 — `npx wrangler d1 time-travel info ganpanda`, `npx wrangler d1 time-travel restore ganpanda --timestamp <ISO 시각>`.
- **백업 파일로**: 
```
npx wrangler r2 object get ganpanda-backup/d1/<날짜>.json.gz --file d1.json.gz
node scripts/d1-restore.ts d1.json.gz > restore.sql      # 표마다 INSERT OR REPLACE
npx wrangler d1 execute ganpanda --remote --file restore.sql
```
  빠진 행은 되살리고 있는 행은 백업 값으로 바꾼다(그 뒤에 생긴 행은 남는다). DB 를 통째로 잃었으면 먼저 `npx wrangler d1 migrations apply ganpanda --remote` 로 표를 만든 뒤.

## 시험 복원
- 자동: `server/test/restore.test.ts` — 백업 → 빈 방에 merge, 백업 뒤 바꾼 방을 revert(대화는 남음), 백업에만 있는 사진 되돌리기, D1 백업 → SQL.
- 운영(배포 뒤 한 번): 시험 프로젝트를 만들고 사인물 하나 → 다음 정각 17분 뒤 `rooms/<id>/<오늘>.bin` 이 생겼는지 확인 → 사인물을 지우고 위 `revert` → 사인물이 돌아오는지 확인.

## 사용자 버전 기록·되돌리기 (3단계, 유료)
같은 백업 파일을 사용자가 직접 쓴다 (`server/src/versions.ts`, 앱 `VersionsDialog.svelte`, 상단 [버전] — 편집 권한, 데스크톱).
- **버전** = `rooms/<프로젝트>/` 의 `<날짜>.bin`(매시간 자동, 그날 마지막) · `m-<시각>.bin`(**[지금 상태 저장]**, 이름 붙일 수 있음) · `r-<시각>.bin`(되돌리기 직전 자동 저장).
- **보관(보이는 기간)**: 무료 없음(`402 plan_required` → 요금제 안내), 베이직 최근 7일, 프로 최근 30일 + 직접 저장은 계속 (`plans.ts` `versionDays`·`manualForever`). 기간 밖 버전은 목록에 없고 되돌릴 수 없다(403). 보기 초대(고객)는 403.
- **[되돌리기]**: 확인 → 지금 상태를 `r-` 로 남기고(되돌린 것도 다시 되돌림) 그 버전이 쓰는 사진이 없으면 백업에서 되살린 뒤 `Room.revertTo` — 사진·사인물·말풍선·디자인 소스·설정이 바뀌고 **대화는 그대로**. 설정 `restored` 로 함께 보는 모두에게 "○○님이 이전 버전으로 되돌렸습니다" 안내.
- **[새 프로젝트로]**(소유자): 지금 작업은 두고 그 버전으로 새 프로젝트 "<이름> (<시각> 버전)".
- 미리 보기는 아직 없다 — [새 프로젝트로]로 꺼내 보면 된다.
- 테스트: `server/test/versions.test.ts`, `tests/e2e/versions.spec.ts`.

