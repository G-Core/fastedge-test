//! Cache and Edge KV from a CDN filter, for the storage service integration tests.
//!
//! - `x-op` (onRequestHeaders): run one store operation and answer locally with the result
//!   as the body. Args: `x-key`, `x-value`, `x-ttl` (u64, may exceed i64::MAX), `x-delta`,
//!   `x-prefix`, `x-store`, `x-pattern`, `x-min`, `x-max`, `x-item`.
//! - `x-hooks: <key>` (no op): every hook that runs does `incr(<key>)`.
use fastedge::proxywasm::{cache, key_value::Store};
use proxy_wasm::traits::*;
use proxy_wasm::types::*;

proxy_wasm::main! {{
    proxy_wasm::set_root_context(|_| -> Box<dyn RootContext> { Box::new(Root) });
}}

struct Root;
impl Context for Root {}
impl RootContext for Root {
    fn create_http_context(&self, _: u32) -> Option<Box<dyn HttpContext>> {
        Some(Box::new(Stores))
    }
    fn get_type(&self) -> Option<ContextType> {
        Some(ContextType::HttpContext)
    }
}

struct Stores;
impl Context for Stores {}

fn bytes(v: &[u8]) -> String {
    String::from_utf8_lossy(v).into_owned()
}

fn scored(list: Vec<(Vec<u8>, f64)>) -> String {
    list.iter().map(|(m, s)| format!("{}={s}", bytes(m))).collect::<Vec<_>>().join(",")
}

impl Stores {
    fn h(&self, name: &str) -> String {
        self.get_http_request_header(name).unwrap_or_default()
    }

    fn op(&self, op: &str) -> String {
        let key = self.h("x-key");
        let ttl = self.h("x-ttl").parse::<u64>().ok();
        let store = || Store::open(&self.h("x-store"));
        let result: Result<String, String> = match op {
            "get" => cache::get(&key).map(|v| v.map_or("none".into(), |v| format!("len:{}:{}", v.len(), bytes(&v)))).map_err(|e| format!("{e:?}")),
            "set" => cache::set(&key, self.h("x-value").as_bytes(), ttl).map(|_| "ok".into()).map_err(|e| format!("{e:?}")),
            "delete" => cache::delete(&key).map(|_| "ok".into()).map_err(|e| format!("{e:?}")),
            "exists" => cache::exists(&key).map(|v| v.to_string()).map_err(|e| format!("{e:?}")),
            "incr" => cache::incr(&key, self.h("x-delta").parse().unwrap_or(1)).map(|v| v.to_string()).map_err(|e| format!("{e:?}")),
            "expire" => cache::expire(&key, ttl.unwrap_or(0)).map(|v| v.to_string()).map_err(|e| format!("{e:?}")),
            "purge" => cache::purge().map(|v| v.to_string()).map_err(|e| format!("{e:?}")),
            "purge-prefix" => cache::purge_prefix(&self.h("x-prefix")).map(|v| v.to_string()).map_err(|e| format!("{e:?}")),
            "kv-open" => store().map(|_| "ok".into()).map_err(|e| format!("{e:?}")),
            "kv-get" => store().and_then(|s| s.get(&key)).map(|v| v.map_or("none".into(), |v| bytes(&v))).map_err(|e| format!("{e:?}")),
            "kv-zrange" => store()
                .and_then(|s| s.zrange_by_score(&key, self.h("x-min").parse().unwrap_or(f64::NEG_INFINITY), self.h("x-max").parse().unwrap_or(f64::INFINITY)))
                .map(scored)
                .map_err(|e| format!("{e:?}")),
            "kv-scan" => store().and_then(|s| s.scan(&self.h("x-pattern"))).map(|v| v.join(",")).map_err(|e| format!("{e:?}")),
            "kv-zscan" => store().and_then(|s| s.zscan(&key, &self.h("x-pattern"))).map(scored).map_err(|e| format!("{e:?}")),
            "kv-bf" => store().and_then(|s| s.bf_exists(&key, &self.h("x-item"))).map(|v| v.to_string()).map_err(|e| format!("{e:?}")),
            other => Ok(format!("unknown op {other}")),
        };
        result.unwrap_or_else(|e| format!("err:{e}"))
    }

    fn count(&self) {
        let key = self.h("x-hooks");
        if !key.is_empty() {
            let _ = cache::incr(&key, 1);
        }
    }
}

impl HttpContext for Stores {
    fn on_http_request_headers(&mut self, _: usize, _: bool) -> Action {
        let op = self.h("x-op");
        if !op.is_empty() {
            let result = self.op(&op);
            self.send_http_response(200, vec![], Some(result.as_bytes()));
            return Action::Pause;
        }
        self.count();
        Action::Continue
    }

    fn on_http_request_body(&mut self, _: usize, end: bool) -> Action {
        if end {
            self.count();
        }
        Action::Continue
    }

    fn on_http_response_headers(&mut self, _: usize, _: bool) -> Action {
        self.count();
        Action::Continue
    }

    fn on_http_response_body(&mut self, _: usize, end: bool) -> Action {
        if end {
            self.count();
        }
        Action::Continue
    }
}
