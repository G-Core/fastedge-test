//! convert_image, onResponseHeaders only: reads `Image-Format` (set by onRequestHeaders), rewrites
//! the response headers and sets the `response.content-type` property for onResponseBody.
use proxy_wasm::traits::*;
use proxy_wasm::types::*;

proxy_wasm::main! {{
    proxy_wasm::set_log_level(LogLevel::Trace);
    proxy_wasm::set_root_context(|_| -> Box<dyn RootContext> { Box::new(Root) });
}}

struct Root;

impl Context for Root {}

impl RootContext for Root {
    fn get_type(&self) -> Option<ContextType> {
        Some(ContextType::HttpContext)
    }

    fn create_http_context(&self, _: u32) -> Option<Box<dyn HttpContext>> {
        Some(Box::new(ConvertRespHeaders))
    }
}

struct ConvertRespHeaders;

impl Context for ConvertRespHeaders {}

impl HttpContext for ConvertRespHeaders {
    fn on_http_response_headers(&mut self, _: usize, _: bool) -> Action {
        // only process 200 responses
        if let Some(status) = self.rsp_status() {
            if status != 200 {
                println!(
                    "Response status is {} instead of expected 200, not transforming",
                    status
                );
                return Action::Continue;
            }
        } else {
            println!("Response status is not set, not transforming");
            return Action::Continue;
        }

        // if "Image-Format" request header is not set, don't convert the image
        let Some(content_type) = self.get_http_request_header("Image-Format") else {
            return Action::Continue;
        };
        // instruct cache to vary by this header so "original" and "image/avif" are cached separately
        self.add_http_response_header("Vary", "Image-Format");

        if content_type == "original" {
            return Action::Continue;
        };

        // image to be transformed, set headers accordingly
        self.set_http_response_header("Content-Length", None);
        self.set_http_response_header("Transfer-Encoding", Some("Chunked"));
        self.set_http_response_header("Content-Type", Some(content_type.as_str()));

        // indicate to on_http_response_body that transformation is needed
        self.set_property(vec!["response.content-type"], Some(content_type.as_bytes()));

        Action::Continue
    }
}

impl ConvertRespHeaders {
    fn rsp_status(&mut self) -> Option<u16> {
        if let Some(status) = self.get_property(vec!["response.status"]) {
            if status.len() != 2 {
                println!("HTTP status property is not 2 bytes");
                return None;
            }
            return Some(u16::from_be_bytes([status[0], status[1]]));
        }
        None
    }
}

