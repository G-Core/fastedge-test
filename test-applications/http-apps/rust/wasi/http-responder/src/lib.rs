use std::collections::HashMap;
use wstd::http::body::Body;
use wstd::http::{Request, Response};
use serde_json::json;

#[wstd::http_server]
async fn main(request: Request<Body>) -> anyhow::Result<Response<Body>> {
    if let Some(redirect_url) = request
        .headers()
        .get("x-redirect-url")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
    {
        return Ok(Response::builder()
            .status(302)
            .header("location", &redirect_url)
            .body(Body::from(""))?);
    }

    let method = request.method().to_string();
    let request_url = request.uri().to_string();

    let mut req_headers = HashMap::new();
    for (name, value) in request.headers() {
        if let Ok(v) = value.to_str() {
            println!("Header: {} = {}", name.as_str(), v);
            req_headers.insert(name.to_string(), v.to_string());
        }
    }

    let (_, mut body) = request.into_parts();
    let req_body = body.str_contents().await.unwrap_or("").to_string();

    let json = json!({
        "hello": "http-responder works!",
        "method": method,
        "reqHeaders": req_headers,
        "reqBody": req_body,
        "requestUrl": request_url,
    });

    Ok(Response::builder()
        .status(200)
        .header("content-type", "application/json")
        .body(Body::from(json.to_string()))?)
}
