# 데스크톱·모바일 앱 (Tauri 2)

2026-10-24 사용자: "데스크탑 모바일 앱 준비해" (같은 날의 "완성후에 진행할께"는 대체됨). 로드맵 D1~D4 → [../product/roadmap.md](../product/roadmap.md).

## 방식
- 앱은 **운영 사이트(https://ganpanda.co.kr)를 웹뷰에 연다**(`src-tauri/tauri.conf.json` `build.frontendDist`). 앱 안에 웹 번들을 넣지 않으므로 **웹을 배포하면 앱 내용도 같이 바뀐다** — 앱을 다시 배포하는 때는 Rust 쪽(이동 규칙·창·권한)이나 아이콘이 바뀔 때뿐. 개발(`cargo tauri dev`)은 로컬 vite(`http://localhost:5173`)를 연다.
- **카카오 로그인은 시스템 브라우저로**(2026-10-24 "카카오 앱으로 로그인 해야지" — 카카오톡 앱 로그인은 시스템 브라우저로 돌아오므로 웹뷰 안에서는 결과를 못 받는다): 앱의 초기화 스크립트가 `window.__GANPANDA_APP__ = true`(+ `<html data-ganpanda-app>`)를 표시 → 웹 `inNativeApp()` 이 참이면 카카오 링크에 `&app=1` + `target=_blank`(→ 시스템 브라우저) → 서버 `oauth_states.app`(0042) → 콜백이 `ganpanda://login#session=…&next=…` 로 → 앱(`tauri-plugin-deep-link`, `login_from_deep_link`)이 지금 열린 사이트의 `/login#…` 으로 웹뷰를 옮기면 웹의 기존 처리가 세션을 저장한다. 토스 카드 등록은 http 로 돌아오므로 웹뷰 안에서 그대로. 맥 개발 실행(`app:dev`·`app:live`)에서는 딥링크가 등록되지 않아 **번들(`app:build`)에서만** 카카오 로그인이 끝까지 된다. iOS 는 **`gen/apple/project.yml` 의 `info.properties.CFBundleURLTypes`**(ganpanda) — Info.plist 는 xcodegen 이 project.yml 에서 만들므로 Info.plist 를 직접 고치면 다음 `xcodegen generate` 때 지워진다(2026-10-25 그래서 사파리 "주소가 유효하지 않음"). 카메라·사진 권한 문구, 상태 막대 흰 글자도 거기에. Android 는 init 뒤 AndroidManifest 에 intent-filter 추가 필요.
- **이동 규칙**(`src-tauri/src/lib.rs` `nav_action`, Rust 단위 테스트): http(s)·about·blob·data 는 웹뷰 안, 그 밖의 스킴(`tel:`·`mailto:`·`kakaotalk://`·`intent://`·`ispmobile://` 등 카드사 앱)은 시스템에 넘긴다(opener 플러그인). 웹뷰는 새 창을 못 열므로 초기화 스크립트가 `window.open`·`target=_blank` 링크를 `ganpanda-open:<주소>` 이동으로 바꾸고, Rust 가 http(s)만 바깥 브라우저로 연다(`javascript:` 등은 막음). 페이지는 `document.documentElement.dataset.ganpandaApp = '1'` 로 앱 안임을 알 수 있다.
- 웹은 IPC 를 쓰지 않는다(권한 `capabilities/default.json` = core:default · opener:default 뿐). 원격 페이지에 Tauri API 를 열지 않는 것이 안전하다.
- 아이콘: `src-tauri/app-icon.png`(1024, 노랑 바탕 "간판다") → `cargo tauri icon src-tauri/app-icon.png -o src-tauri/icons`.

- **iOS 26.1 시뮬레이터 크래시 우회**: Tauri 런타임이 시작할 때 묻는 WebKit 버전(`NSBundle bundleWithIdentifier("com.apple.WebKit")`)이 시뮬레이터 안에서 죽는다(앱 코드와 무관). `src-tauri/patches/tauri-runtime-wry`(2.12.3 사본, 한 줄: iOS 는 묻지 않음) + `Cargo.toml [patch.crates-io]`. 상위 버전에서 고쳐지면 지운다. **iOS 시뮬레이터에서 앱 실행 확인됨 2026-10-24.**
- **안전 영역**: 웹 `.shell` 에 `padding-top: env(safe-area-inset-top)`, 알림·빠른 막대·도구 막대는 아래·위 inset 만큼 띄움(브라우저에선 0). 아이콘은 `icons/ios/*` 를 `gen/apple/Assets.xcassets/AppIcon.appiconset/` 에 복사(ios init 이 기본 아이콘을 넣는다).

- **할 일 (2026-10-25 "아이폰에서 사진 삭제가 안된다")**: 웹뷰 엔진(wry)은 **iOS·맥에서 `confirm()`·`prompt()`·`alert()` 를 지원하지 않는다**(안드로이드는 지원) — 확인 창이 즉시 "취소"로 끝나 사진 삭제·프로젝트 삭제·요청 취소·이름 바꾸기 등 약 20곳이 앱에서 동작하지 않는다. 계획: `src/lib/ui/ask.ts`(`askConfirm`·`askPrompt`, 앱 안이면 자체 대화 창 `AskDialog.svelte`, 브라우저면 기존 native) + 호출부 async 전환(BoardView 사진 삭제, Home 프로젝트·그룹 삭제·간판집 전환, RequestView 확정·취소, EstimateLock, Settings 사업자 해제·전환, BillingSection 해지, VersionsDialog 되돌리기, Chat 삭제·이름, ColorCardDialog, ObjectPanel 음성 삭제, LayerPanel 세트 이름, PhotoZone 사진 이름, App 표시 이름).

## 명령 (저장소 루트)
| 할 일 | 명령 |
|---|---|
| 맥 개발 실행 (로컬 vite 연결 — 로컬 서버는 카카오 키가 자리값이라 **카카오 로그인은 안 됨**) | `npm run app:dev` |
| 맥 개발 실행 — **운영 사이트**를 열기 (카카오 로그인·결제 시험, `src-tauri/tauri.live.json`) | `npm run app:live` |
| 맥 배포판 만들기 (.app/.dmg, 서명 없음) | `npm run app:build` → `src-tauri/target/release/bundle/` |
| Rust 테스트 | `npm run app:test` |
| iOS 실행 — **운영 사이트** (시뮬레이터 또는 케이블로 연결한 아이폰 — 아이폰은 Xcode 에 Apple 계정 로그인 + `project.yml` `DEVELOPMENT_TEAM`, 설치 뒤 자동 실행은 아이폰이 잠겨 있으면 실패하니 직접 연다) | `npm run app:ios` (처음엔 `cargo tauri ios init` — 한 번, 결과 `src-tauri/gen/apple` 은 커밋) |
| iOS 실행 — 로컬 vite (LAN 주소로 열리게 `--host`) | `npm run app:ios:local` |
| Android 실행 — **운영 사이트** (에뮬레이터 `Medium_Phone_API_36.1` 또는 USB 디버깅 켠 폰; 환경은 `scripts/android-env.sh` 가 잡음) | `npm run app:android` |
| Android 실행 — 로컬 vite | `npm run app:android:local` |
| Android 배포판(.apk/.aab) | `npm run app:android:build` → `src-tauri/gen/android/app/build/outputs/` (서명 키는 D3 때) |

## 준비물 (이 맥, 2026-10-24 확인)
- 있음: Rust 1.97, tauri-cli 2.11, Xcode 26.1(시뮬레이터), iOS rust 타깃(aarch64-apple-ios·-sim).
- **Android**(2026-10-25 "안드로이드 시작해도 될까?" — 준비 완료): Java 17 = Homebrew `openjdk@17`(비밀번호 없이) + Temurin 17(사용자 설치), SDK `~/Library/Android/sdk`(platforms 35·36, build-tools 36), 명령줄 도구는 Google zip 을 `cmdline-tools/latest` 에 직접 풀어 설치, NDK 29(`sdkmanager --install "ndk;29.0.14206865"`), Rust 타깃 4개. 환경 변수는 `scripts/android-env.sh` 가 매번 잡는다(JAVA_HOME = `/usr/libexec/java_home -v 17` 또는 openjdk@17, ANDROID_HOME, NDK_HOME = ndk 중 최신). `cargo tauri android init` 결과 `src-tauri/gen/android` 은 커밋. **에뮬레이터(API 36)에서 앱 실행 확인됨.**
- **Android 손본 것**: `AndroidManifest.xml` 에 `ganpanda://` intent-filter(딥링크)와 CAMERA 권한(사진 찍기), 아이콘은 `icons/android/mipmap-*` 를 `res/mipmap-*` 에 복사(init 이 기본 아이콘을 넣는다), **상태 막대 겹침**: targetSdk 36 부터 끝까지 그리기(edge-to-edge)가 강제되고(테마의 `windowOptOutEdgeToEdgeEnforcement` 도 무시) 웹뷰는 안전 영역 값을 주지 않아 상단 막대가 시계와 겹쳤다 → `MainActivity.kt` 에서 템플릿의 `enableEdgeToEdge()` 를 빼고 **시스템 막대·컷아웃·키보드 inset 만큼 content 에 padding**(`ViewCompat.setOnApplyWindowInsetsListener`). 막대 뒤 색은 테마(`res/values*/themes.xml`) `windowBackground`. 패딩을 준 뒤 inset 은 **CONSUMED** 로 돌려준다 — 안 그러면 카메라 구멍이 있는 기기(갤럭시 Z 폴드)에서 웹뷰가 컷아웃 여백을 `env(safe-area-inset-*)` 로 한 번 더 더해 상단에 띠가 생기고 가로에서 아래 막대가 떴다(2026-10-25). 외부 열기(`opener`)는 **별도 스레드**에서 — 이동 콜백(화면 스레드)에서 기다리면 ANR 로 앱이 꺼진다.

## 남은 일 (로드맵)
- D1 ✓ 맥 개발판·이동 규칙·iOS 프로젝트. **맥 번들에서 카카오 로그인(사파리 → `ganpanda://` 복귀) 확인됨 2026-10-24.** 데스크톱은 카카오톡 앱 로그인이 없어 브라우저(아이디·QR)가 정상; 휴대폰에서는 카카오 페이지의 [카카오톡으로 로그인]으로 앱 간 이동. **WebKit 점검**(3D·ORT wasm 자동 분리·IndexedDB·파일 선택)은 실제로 열어 보며.
- D2 서명·공증한 맥 배포판(.dmg, Apple 개발자 계정) — 토스 정식 오픈 후.
- D3 윈도우판(WebView2)·자동 업데이트·Android 서명 키(.aab). 앱이 웹을 품지 않아 업데이트는 Rust 가 바뀔 때만.
- D4 푸시(톡 알림). iOS·Android 스토어 등록(개발자 계정·심사).
