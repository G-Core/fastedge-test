use anyhow::Result;
use fastedge::body::Body;
use fastedge::http::{Request, Response, StatusCode};
use serde_json::json;
use std::collections::HashMap;

#[fastedge::http]
fn main(req: Request<Body>) -> Result<Response<Body>> {
    let method = req.method().to_string();
    let request_url = req.uri().to_string();

    let mut req_headers = HashMap::new();
    for (name, value) in req.headers() {
        if let Ok(v) = value.to_str() {
            println!("Header: {} = {}", name.as_str(), v);
            req_headers.insert(name.to_string(), v.to_string());
        }
    }

    let (_, body) = req.into_parts();
    let req_body = String::from_utf8_lossy(&body.to_vec()).to_string();

    let json = json!({
        "hello": "http-responder works!",
        "method": method,
        "reqHeaders": req_headers,
        "reqBody": req_body,
        "requestUrl": request_url,
    });

    Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/json")
        .body(Body::from(json.to_string()))
        .map_err(Into::into)
}
