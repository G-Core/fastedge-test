//! convert_image, onRequestHeaders only: decides whether to convert and tells the later hooks
//! through the `Image-Format` request header.
use proxy_wasm::traits::*;
use proxy_wasm::types::*;
use std::{env, env::VarError, str::from_utf8};

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
        Some(Box::new(ConvertReqHeaders))
    }
}

struct ConvertReqHeaders;

impl Context for ConvertReqHeaders {}

impl HttpContext for ConvertReqHeaders {
    fn on_http_request_headers(&mut self, _: usize, _: bool) -> Action {
        // this header is used to select correct image version from cache
        self.add_http_request_header("Image-Format", "original");

        // get extension
        let raw_ext = self.get_property(vec!["request.extension"]);
        println!("request.extension={raw_ext:?}");
        let Some(ext) = raw_ext else {
            println!("No extension in request path, not transforming");
            return Action::Continue;
        };
        let Ok(ext) = from_utf8(&ext) else {
            println!("Invalid UTF-8 in request extension, not transforming");
            return Action::Continue;
        };
        if ext.is_empty() {
            println!("No extension in request path, not transforming");
            return Action::Continue;
        }

        // FORMATS_TO_TRANSFORM contains list of file extensions to transfor
        // note that jpg and jpeg are different extensions
        let Ok(image_list) = str_param("FORMATS_TO_TRANSFORM") else {
            println!("FORMATS_TO_TRANSFORM param is not set, not transforming");
            return Action::Continue;
        };
        if !image_list.split(',').any(|entry| entry == ext) {
            println!(
                "extension {} is not in the list of formats to transform: {}, not transforming",
                ext, image_list
            );
            return Action::Continue;
        }

        // requests from User agents that match substrings in the IGNORED_UA_LIST param are not transformed
        let Some(ua) = self.get_http_request_header("User-Agent") else {
            println!("User-Agent header is not set, not transforming");
            return Action::Continue;
        };
        if ua.is_empty() {
            println!("User-Agent header is not set, not transforming");
            return Action::Continue;
        }
        if let Ok(ua_to_ignore) = str_param("IGNORED_UA_LIST") {
            if ua_to_ignore.split(",").any(|entry| ua.contains(entry)) {
                println!("User-Agent is in ignore list, not transforming");
                return Action::Continue;
            }
        }

        // indicator for on_response_headers and for cache key
        self.set_http_request_header("Image-Format", Some("image/avif"));

        Action::Continue
    }
}

fn str_param(name: &str) -> Result<String, VarError> {
    let val = env::var(name)?;
    if val.is_empty() {
        return Err(VarError::NotPresent);
    }

    Ok(val)
}

