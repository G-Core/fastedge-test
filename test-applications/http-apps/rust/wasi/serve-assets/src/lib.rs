use include_dir::{include_dir, Dir};
use wstd::http::body::Body;
use wstd::http::{Request, Response};

// Everything under ./assets is embedded in the wasm binary at compile time.
static ASSETS: Dir = include_dir!("$CARGO_MANIFEST_DIR/assets");

#[wstd::http_server]
async fn main(request: Request<Body>) -> anyhow::Result<Response<Body>> {
    let path = request.uri().path().trim_start_matches('/').to_string();
    println!("request received: {path}");

    // get_file only looks inside the embedded tree, so `..` can't escape it.
    match ASSETS.get_file(&path) {
        Some(file) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            Ok(Response::builder()
                .status(200)
                .header("content-type", mime.as_ref())
                .body(Body::from(file.contents().to_vec()))?)
        }
        None => Ok(Response::builder()
            .status(404)
            .header("content-type", "text/plain;charset=UTF-8")
            .body(Body::from("Not found"))?),
    }
}
