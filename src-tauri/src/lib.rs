//! 간판다 데스크톱·모바일 앱 (Tauri 2, 2026-10-24 "데스크탑 모바일 앱 준비해").
//! 앱은 운영 사이트(https://ganpanda.co.kr)를 웹뷰에 연다 — 웹을 배포하면 앱 내용도 같이 바뀐다 (docs/product/roadmap.md D1).
//! 여기서 하는 일은 "어디로 가는 주소를 웹뷰 안에서 열고, 무엇을 바깥(시스템 브라우저·앱)으로 넘기는가" 뿐이다.
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

/// 웹뷰가 어떤 주소로 가려 할 때의 처리
#[derive(Debug, PartialEq, Eq)]
pub enum Nav {
    /// 웹뷰 안에서 그대로 연다 (간판다·카카오 로그인·토스 결제 등 모든 http/https)
    Keep,
    /// 시스템 브라우저·앱으로 넘기고 웹뷰는 그대로 둔다 (tel:·mailto:·카카오톡·카드사 앱, 그리고 새 창 링크)
    OpenExternal(String),
    /// 막는다 (알 수 없는 것)
    Block,
}

/// 새 창(target=_blank, window.open)은 웹뷰가 열 수 없다 — 초기화 스크립트가 이 스킴으로 바꿔 보내면 바깥에서 연다
pub const OPEN_SCHEME: &str = "ganpanda-open:";

/// 주소 하나를 보고 처리를 정한다. 순수 함수 — 테스트 대상
pub fn nav_action(url: &str) -> Nav {
    if let Some(rest) = url.strip_prefix(OPEN_SCHEME) {
        let target = percent_decode(rest);
        return if target.starts_with("http://") || target.starts_with("https://") { Nav::OpenExternal(target) } else { Nav::Block };
    }
    if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("about:") || url.starts_with("blob:") || url.starts_with("data:") {
        return Nav::Keep;
    }
    // tel: · mailto: · sms: · kakaotalk:// · intent:// (안드로이드 카드사 앱) · ispmobile:// 등 — 시스템이 연다
    if url.contains(':') { Nav::OpenExternal(url.to_string()) } else { Nav::Block }
}

/// 딥링크 `ganpanda://login#session=…&next=…` → 지금 열린 사이트의 `/login#…` (웹의 기존 처리가 세션을 저장한다). 다른 딥링크는 무시
pub fn login_from_deep_link(origin: &str, deep: &str) -> Option<String> {
    let u = url::Url::parse(deep).ok()?;
    if u.scheme() != "ganpanda" || u.host_str() != Some("login") { return None; }
    let frag = u.fragment()?;
    if !frag.contains("session=") { return None; }
    Some(format!("{}/login#{}", origin.trim_end_matches('/'), frag))
}

fn percent_decode(s: &str) -> String {
    url::form_urlencoded::parse(format!("u={s}").as_bytes()).find(|(k, _)| k == "u").map(|(_, v)| v.into_owned()).unwrap_or_else(|| s.to_string())
}

/// 웹 페이지에 넣는 스크립트: 새 창 링크와 window.open 을 `ganpanda-open:` 이동으로 바꾼다 (웹뷰는 새 창을 못 연다)
const INIT_SCRIPT: &str = r#"
(() => {
  const ext = (u) => { try { location.href = 'ganpanda-open:' + encodeURIComponent(new URL(u, location.href).href); } catch {} };
  window.open = (u) => { if (u) ext(String(u)); return null; };
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[target="_blank"]');
    if (a && a.href) { e.preventDefault(); ext(a.href); }
  }, true);
  window.__GANPANDA_APP__ = true; // 웹(inNativeApp)이 본다 — 문서 시작 시점엔 <html> 이 없을 수 있어 전역에도
  const mark = () => { if (document.documentElement) document.documentElement.dataset.ganpandaApp = '1'; };
  mark(); document.addEventListener('DOMContentLoaded', mark);
})();
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .setup(|app| {
            // 창은 여기서 만든다 — tauri.conf.json 의 창에는 이동 규칙(on_navigation)을 붙일 수 없다
            let handle = app.handle().clone();
            let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App(Default::default()))
                .initialization_script(INIT_SCRIPT)
                .on_navigation(move |url| handle_navigation(&handle, url));
            #[cfg(desktop)]
            let builder = builder.title("간판다").inner_size(1280.0, 820.0).min_inner_size(900.0, 600.0);
            builder.build()?;
            // 개발 실행에서도 ganpanda:// 를 이 앱이 받게 (윈도우·리눅스; 맥은 번들에서만)
            #[cfg(any(windows, target_os = "linux"))]
            { let _ = app.deep_link().register_all(); }
            let h = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let Some(w) = h.get_webview_window("main") else { return };
                let origin = w.url().ok().map(|u| u.origin().ascii_serialization()).unwrap_or_else(|| "https://ganpanda.co.kr".into());
                for u in event.urls() {
                    if let Some(t) = login_from_deep_link(&origin, u.as_str()) {
                        if let Ok(target) = url::Url::parse(&t) { let _ = w.navigate(target); let _ = w.set_focus(); }
                    }
                }
            });
            Ok(())
        })
        .on_page_load(|webview, _payload| {
            // 원격 사이트라 init script 가 안 먹는 경우를 대비해 페이지마다 다시 넣는다
            let _ = webview.eval(INIT_SCRIPT);
        })
        .build(tauri::generate_context!())
        .expect("간판다 앱을 만들지 못했습니다")
        .run(|_app, _event| {});
}

/// WebviewWindow 를 만들 때 on_navigation 으로 쓰는 처리 (tauri.conf.json 의 창에는 붙일 수 없어 lib 에서 창을 만들 때 쓴다)
pub fn handle_navigation(app: &tauri::AppHandle, url: &url::Url) -> bool {
    match nav_action(url.as_str()) {
        Nav::Keep => true,
        Nav::OpenExternal(target) => {
            // 다른 스레드에서: 안드로이드는 이 콜백이 화면 스레드라 여기서 플러그인 결과를 기다리면 앱이 멈춘다(ANR, 2026-10-25 갤럭시에서 [카카오로 시작] 누르면 꺼짐)
            let app = app.clone();
            std::thread::spawn(move || { if let Err(e) = app.opener().open_url(&target, None::<&str>) { log::warn!("외부 열기 실패 {target}: {e}"); } });
            false
        }
        Nav::Block => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_stays_in_webview() {
        for u in ["https://ganpanda.co.kr/", "https://sync.ganpanda.co.kr/api/auth/kakao/start?next=%2F", "https://kauth.kakao.com/oauth/authorize", "https://api.tosspayments.com/v1/x", "http://localhost:5173/", "about:blank"] {
            assert_eq!(nav_action(u), Nav::Keep, "{u}");
        }
    }

    #[test]
    fn app_schemes_open_externally() {
        assert_eq!(nav_action("tel:031-632-0907"), Nav::OpenExternal("tel:031-632-0907".into()));
        assert_eq!(nav_action("mailto:support@ganpanda.co.kr"), Nav::OpenExternal("mailto:support@ganpanda.co.kr".into()));
        assert_eq!(nav_action("kakaotalk://x"), Nav::OpenExternal("kakaotalk://x".into()));
        assert_eq!(nav_action("intent://pay#Intent;scheme=ispmobile;end"), Nav::OpenExternal("intent://pay#Intent;scheme=ispmobile;end".into()));
    }

    #[test]
    fn deep_link_login_goes_to_current_site() {
        assert_eq!(login_from_deep_link("https://ganpanda.co.kr", "ganpanda://login#session=abc&next=%2Festimate"), Some("https://ganpanda.co.kr/login#session=abc&next=%2Festimate".into()));
        assert_eq!(login_from_deep_link("http://localhost:5173/", "ganpanda://login#session=abc"), Some("http://localhost:5173/login#session=abc".into()));
        assert_eq!(login_from_deep_link("https://ganpanda.co.kr", "ganpanda://other#session=abc"), None);
        assert_eq!(login_from_deep_link("https://ganpanda.co.kr", "ganpanda://login"), None);
        assert_eq!(login_from_deep_link("https://ganpanda.co.kr", "https://evil/login#session=abc"), None);
    }

    #[test]
    fn new_window_links_open_externally_only_for_http() {
        assert_eq!(nav_action("ganpanda-open:https%3A%2F%2Fganpanda.co.kr%2Fterms"), Nav::OpenExternal("https://ganpanda.co.kr/terms".into()));
        assert_eq!(nav_action("ganpanda-open:javascript%3Aalert(1)"), Nav::Block);
        assert_eq!(nav_action("garbage"), Nav::Block);
    }
}
