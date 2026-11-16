// Resource probe: what survives between hooks, within one app and across apps (one app per hook).
// On the edge (measured): each hook starts with fresh memory (global=0, empty trail); a custom
// property written in onResponseHeaders is read in onResponseBody, by another app too; one written
// in onRequestHeaders is never seen later.
// PROBE_APP env names the app ("a" / "b"). Reports in x-probe-* response headers and the body.
use proxy_wasm::traits::*;
use proxy_wasm::types::*;
use std::sync::atomic::{AtomicU32, Ordering};

static GLOBAL: AtomicU32 = AtomicU32::new(0);

proxy_wasm::main! {{
    proxy_wasm::set_root_context(|_| -> Box<dyn RootContext> { Box::new(Root) });
}}

struct Root;
impl Context for Root {}
impl RootContext for Root {
    fn get_type(&self) -> Option<ContextType> { Some(ContextType::HttpContext) }
    fn create_http_context(&self, _: u32) -> Option<Box<dyn HttpContext>> {
        Some(Box::new(Probe { trail: String::new() }))
    }
}

struct Probe { trail: String }
impl Context for Probe {}

fn app() -> String { std::env::var("PROBE_APP").unwrap_or_else(|_| "?".into()) }

impl Probe {
    fn prop(&self, name: &str) -> String {
        match self.get_property(vec![name]) {
            Some(v) => String::from_utf8_lossy(&v).into_owned(),
            None => "<none>".into(),
        }
    }
    fn mark(&mut self, hook: &str) -> String {
        let g = GLOBAL.fetch_add(1, Ordering::SeqCst);
        let seen = format!("app={} global={} trail=[{}] reqh={} resph={}",
            app(), g, self.trail, self.prop("probe.reqh"), self.prop("probe.resph"));
        self.trail.push_str(&format!("{hook}:{} ", app()));
        seen
    }
}

impl HttpContext for Probe {
    fn on_http_request_headers(&mut self, _: usize, _: bool) -> Action {
        let seen = self.mark("reqh");
        let st = proxy_wasm::hostcalls::set_property(vec!["probe.reqh"], Some(app().as_bytes()));
        self.add_http_request_header("x-probe-reqh", &format!("{seen} set={st:?}"));
        Action::Continue
    }
    fn on_http_response_headers(&mut self, _: usize, _: bool) -> Action {
        let seen = self.mark("resph");
        let st = proxy_wasm::hostcalls::set_property(vec!["probe.resph"], Some(app().as_bytes()));
        self.set_http_response_header("content-length", None);
        self.add_http_response_header("x-probe-resph", &format!("{seen} set={st:?}"));
        let reqh = self.get_http_request_header("x-probe-reqh").unwrap_or_else(|| "<none>".into());
        self.add_http_response_header("x-probe-reqh-seen", &reqh);
        Action::Continue
    }
    fn on_http_response_body(&mut self, size: usize, end: bool) -> Action {
        if !end {
            self.set_http_response_body(0, size, b"");
            return Action::Continue;
        }
        // x-probe-invert: flip every byte of the body (the body is bytes, not text: e.g. an image).
        if self.get_http_request_header("x-probe-invert").is_some() {
            let body = self.get_http_response_body(0, size).unwrap_or_default();
            let inverted: Vec<u8> = body.iter().map(|b| !b).collect();
            self.set_http_response_body(0, size, &inverted);
            return Action::Continue;
        }
        let seen = self.mark("respb");
        let report = format!("respb: {seen}\n");
        self.set_http_response_body(0, size, report.as_bytes());
        Action::Continue
    }
}
