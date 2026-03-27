use std::env;
use wstd::http::body::Body;
use wstd::http::{Request, Response};

/// Note: wstd does not have a secret API. Both USERNAME and PASSWORD
/// are read as env vars. The test fixture .env must set both as
/// FASTEDGE_VAR_ENV_ prefixed variables.
#[wstd::http_server]
async fn main(_request: Request<Body>) -> anyhow::Result<Response<Body>> {
    let username = env::var("USERNAME").unwrap_or_default();
    let password = env::var("PASSWORD").unwrap_or_default();

    Ok(Response::builder()
        .status(200)
        .body(Body::from(format!(
            "Username: {username}, Password: {password}"
        )))?)
}
