use wstd::http::body::Body;
use wstd::http::{Request, Response};

#[wstd::http_server]
async fn main(request: Request<Body>) -> anyhow::Result<Response<Body>> {
    if request.method() != "POST" {
        return Ok(Response::builder()
            .status(405)
            .header("content-type", "application/json")
            .body(Body::from(r#"{"error":"Method not allowed"}"#))?);
    }

    let (_, mut body) = request.into_parts();
    let body_str = body.str_contents().await.unwrap_or("");
    let mut json: serde_json::Value = serde_json::from_str(body_str)?;
    json["processed"] = serde_json::Value::Bool(true);

    Ok(Response::builder()
        .status(200)
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_string(&json)?))?)
}
