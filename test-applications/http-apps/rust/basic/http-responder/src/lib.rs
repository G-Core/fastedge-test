use anyhow::Result;
use fastedge::body::Body;
use fastedge::http::{Request, Response, StatusCode};
use serde_json::json;
use std::collections::HashMap;

#[fastedge::http]
fn main(req: Request<Body>) -> Result<Response<Body>> {
    if let Some(redirect_url) = req
        .headers()
        .get("x-redirect-url")
        .and_then(|v| v.to_str().ok())
    {
        return Response::builder()
            .status(StatusCode::FOUND)
            .header("location", redirect_url)
            .body(Body::from(""))
            .map_err(Into::into);
    }

    // Set-Cookie regression path: RFC 6265 §3 requires multiple Set-Cookie
    // headers to stay separate (not comma-joined). Two distinct cookies are
    // emitted when x-set-cookies is present so the runner can be verified
    // end-to-end.
    if req.headers().contains_key("x-set-cookies") {
        return Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "text/plain")
            .header("set-cookie", "sid=abc; Path=/; HttpOnly")
            .header("set-cookie", "theme=dark; Path=/")
            .body(Body::from("cookies set"))
            .map_err(Into::into);
    }

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
