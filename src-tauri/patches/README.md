# 패치한 의존성
- `tauri-runtime-wry` 2.12.3 사본 — `src/lib.rs` 한 줄: iOS 에서는 `wry::webview_version()` 을 부르지 않는다 (iOS 26.1 시뮬레이터에서 `NSBundle bundleWithIdentifier("com.apple.WebKit")` 가 CoreFoundation 안에서 SIGTRAP, 2026-10-24). 상위 버전에서 고쳐지면 `Cargo.toml` 의 `[patch.crates-io]` 와 이 폴더를 지운다.
