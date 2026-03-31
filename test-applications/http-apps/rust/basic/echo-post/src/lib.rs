use anyhow::Result;
use fastedge::body::Body;
use fastedge::http::{Request, Response, StatusCode};

#[fastedge::http]
fn main(req: Request<Body>) -> Result<Response<Body>> {
    if req.method() != "POST" {
        return Response::builder()
            .status(StatusCode::METHOD_NOT_ALLOWED)
            .header("content-type", "application/json")
            .body(Body::from(r#"{"error":"Method not allowed"}"#))
            .map_err(Into::into);
    }

    let (_, body) = req.into_parts();
    let body_bytes = body.to_vec();
    let body_str = String::from_utf8_lossy(&body_bytes);
    let mut json: serde_json::Value = serde_json::from_str(&body_str)?;
    json["processed"] = serde_json::Value::Bool(true);

    Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_string(&json)?))
        .map_err(Into::into)
}
