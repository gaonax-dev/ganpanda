# 데스크톱·모바일 앱 (Tauri 2)

2026-10-24 사용자: "데스크탑 모바일 앱 준비해" (같은 날의 "완성후에 진행할께"는 대체됨). 로드맵 D1~D4 → [../product/roadmap.md](../product/roadmap.md).

## 방식
- 앱은 **운영 사이트(https://ganpanda.co.kr)를 웹뷰에 연다**(`src-tauri/tauri.conf.json` `build.frontendDist`). 앱 안에 웹 번들을 넣지 않으므로 **웹을 배포하면 앱 내용도 같이 바뀐다** — 앱을 다시 배포하는 때는 Rust 쪽(이동 규칙·창·권한)이나 아이콘이 바뀔 때뿐. 개발(`cargo tauri dev`)은 로컬 vite(`http://localhost:5173`)를 연다.
- **카카오 로그인은 시스템 브라우저로**(2026-10-24 "카카오 앱으로 로그인 해야지" — 카카오톡 앱 로그인은 시스템 브라우저로 돌아오므로 웹뷰 안에서는 결과를 못 받는다): 앱의 초기화 스크립트가 `window.__GANPANDA_APP__ = true`(+ `<html data-ganpanda-app>`)를 표시 → 웹 `inNativeApp()` 이 참이면 카카오 링크에 `&app=1` + `target=_blank`(→ 시스템 브라우저) → 서버 `oauth_states.app`(0042) → 콜백이 `ganpanda://login#session=…&next=…` 로 → 앱(`tauri-plugin-deep-link`, `login_from_deep_link`)이 지금 열린 사이트의 `/login#…` 으로 웹뷰를 옮기면 웹의 기존 처리가 세션을 저장한다. 토스 카드 등록은 http 로 돌아오므로 웹뷰 안에서 그대로. 맥 개발 실행(`app:dev`·`app:live`)에서는 딥링크가 등록되지 않아 **번들(`app:build`)에서만** 카카오 로그인이 끝까지 된다. iOS 는 `gen/apple/ganpanda_iOS/Info.plist` 의 `CFBundleURLTypes`(ganpanda). Android 는 init 뒤 AndroidManifest 에 intent-filter 추가 필요.
- **이동 규칙**(`src-tauri/src/lib.rs` `nav_action`, Rust 단위 테스트): http(s)·about·blob·data 는 웹뷰 안, 그 밖의 스킴(`tel:`·`mailto:`·`kakaotalk://`·`intent://`·`ispmobile://` 등 카드사 앱)은 시스템에 넘긴다(opener 플러그인). 웹뷰는 새 창을 못 열므로 초기화 스크립트가 `window.open`·`target=_blank` 링크를 `ganpanda-open:<주소>` 이동으로 바꾸고, Rust 가 http(s)만 바깥 브라우저로 연다(`javascript:` 등은 막음). 페이지는 `document.documentElement.dataset.ganpandaApp = '1'` 로 앱 안임을 알 수 있다.
- 웹은 IPC 를 쓰지 않는다(권한 `capabilities/default.json` = core:default · opener:default 뿐). 원격 페이지에 Tauri API 를 열지 않는 것이 안전하다.
- 아이콘: `src-tauri/app-icon.png`(1024, 노랑 바탕 "간판다") → `cargo tauri icon src-tauri/app-icon.png -o src-tauri/icons`.

- **iOS 26.1 시뮬레이터 크래시 우회**: Tauri 런타임이 시작할 때 묻는 WebKit 버전(`NSBundle bundleWithIdentifier("com.apple.WebKit")`)이 시뮬레이터 안에서 죽는다(앱 코드와 무관). `src-tauri/patches/tauri-runtime-wry`(2.12.3 사본, 한 줄: iOS 는 묻지 않음) + `Cargo.toml [patch.crates-io]`. 상위 버전에서 고쳐지면 지운다. **iOS 시뮬레이터에서 앱 실행 확인됨 2026-10-24.**
- **안전 영역**: 웹 `.shell` 에 `padding-top: env(safe-area-inset-top)`, 알림·빠른 막대·도구 막대는 아래·위 inset 만큼 띄움(브라우저에선 0). 아이콘은 `icons/ios/*` 를 `gen/apple/Assets.xcassets/AppIcon.appiconset/` 에 복사(ios init 이 기본 아이콘을 넣는다).

## 명령 (저장소 루트)
| 할 일 | 명령 |
|---|---|
| 맥 개발 실행 (로컬 vite 연결 — 로컬 서버는 카카오 키가 자리값이라 **카카오 로그인은 안 됨**) | `npm run app:dev` |
| 맥 개발 실행 — **운영 사이트**를 열기 (카카오 로그인·결제 시험, `src-tauri/tauri.live.json`) | `npm run app:live` |
| 맥 배포판 만들기 (.app/.dmg, 서명 없음) | `npm run app:build` → `src-tauri/target/release/bundle/` |
| Rust 테스트 | `npm run app:test` |
| iOS 시뮬레이터 실행 | `npm run app:ios` (처음엔 `cargo tauri ios init` — 한 번, 결과 `src-tauri/gen/apple` 은 커밋) |
| Android 실행 | `cargo tauri android init` 뒤 `npm run app:android` — **Java(JDK 17)·ANDROID_HOME·NDK 필요** |

## 준비물 (이 맥, 2026-10-24 확인)
- 있음: Rust 1.97, tauri-cli 2.11, Xcode 26.1(시뮬레이터), iOS rust 타깃(aarch64-apple-ios·-sim).
- **Android**: `~/Library/Android/sdk` 는 있으나 Java 없음·`ANDROID_HOME` 미설정·NDK 미확인 → `brew install --cask temurin@17`, `export ANDROID_HOME=~/Library/Android/sdk`, SDK Manager 로 NDK 설치 뒤 `cargo tauri android init`.

## 남은 일 (로드맵)
- D1 ✓ 맥 개발판·이동 규칙·iOS 프로젝트. **맥 번들에서 카카오 로그인(사파리 → `ganpanda://` 복귀) 확인됨 2026-10-24.** 데스크톱은 카카오톡 앱 로그인이 없어 브라우저(아이디·QR)가 정상; 휴대폰에서는 카카오 페이지의 [카카오톡으로 로그인]으로 앱 간 이동. **WebKit 점검**(3D·ORT wasm 자동 분리·IndexedDB·파일 선택)은 실제로 열어 보며.
- D2 서명·공증한 맥 배포판(.dmg, Apple 개발자 계정) — 토스 정식 오픈 후.
- D3 윈도우판(WebView2)·자동 업데이트. 앱이 웹을 품지 않아 업데이트는 Rust 가 바뀔 때만.
- D4 푸시(톡 알림). iOS·Android 스토어 등록(개발자 계정·심사).
