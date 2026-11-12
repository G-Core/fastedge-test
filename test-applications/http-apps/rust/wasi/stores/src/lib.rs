//! Cache and Edge KV from an HTTP app, for the storage service tests.
//! `GET /?op=<op>&key=..&store=..&pattern=..` → the result as the body.
//! Ops: incr, get, set (`value`), kv-get, kv-scan, kv-zrange (`min`, `max`), kv-bf (`item`).
use fastedge::{cache, key_value::Store};
use wstd::http::body::Body;
use wstd::http::{Request, Response};

#[wstd::http_server]
async fn main(req: Request<Body>) -> anyhow::Result<Response<Body>> {
    let query = req.uri().query().unwrap_or("").to_string();
    let p = |name: &str| {
        query
            .split('&')
            .find_map(|kv| kv.strip_prefix(name).and_then(|v| v.strip_prefix('=')))
            .unwrap_or("")
            .to_string()
    };
    let key = p("key");
    let text = |v: Vec<u8>| String::from_utf8_lossy(&v).into_owned();
    let store = || Store::open(&p("store"));
    let result: Result<String, String> = match p("op").as_str() {
        "incr" => cache::incr(&key, 1).map(|v| v.to_string()).map_err(|e| format!("{e:?}")),
        "get" => cache::get(&key).map(|v| v.map_or("none".into(), text)).map_err(|e| format!("{e:?}")),
        "set" => cache::set(&key, p("value").as_bytes(), None).map(|_| "ok".into()).map_err(|e| format!("{e:?}")),
        "kv-get" => store().and_then(|s| s.get(&key)).map(|v| v.map_or("none".into(), text)).map_err(|e| format!("{e:?}")),
        "kv-scan" => store().and_then(|s| s.scan(&p("pattern"))).map(|v| v.join(",")).map_err(|e| format!("{e:?}")),
        "kv-zrange" => store()
            .and_then(|s| s.zrange_by_score(&key, p("min").parse().unwrap_or(f64::NEG_INFINITY), p("max").parse().unwrap_or(f64::INFINITY)))
            .map(|v| v.into_iter().map(|(m, s)| format!("{}={s}", text(m))).collect::<Vec<_>>().join(","))
            .map_err(|e| format!("{e:?}")),
        "kv-bf" => store().and_then(|s| s.bf_exists(&key, &p("item"))).map(|v| v.to_string()).map_err(|e| format!("{e:?}")),
        other => Ok(format!("unknown op {other}")),
    };
    Ok(Response::new(result.unwrap_or_else(|e| format!("err:{e}")).into()))
}
