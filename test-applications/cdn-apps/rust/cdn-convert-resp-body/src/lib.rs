//! convert_image, onResponseBody only: converts the body to AVIF when the `response.content-type`
//! property (set by onResponseHeaders) says so.
use image::*;
use proxy_wasm::traits::*;
use proxy_wasm::types::*;
use std::{env, io::Cursor, str::from_utf8};

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
        Some(Box::new(ConvertRespBody))
    }
}

struct ConvertRespBody;

impl Context for ConvertRespBody {}

impl HttpContext for ConvertRespBody {
    fn on_http_response_body(&mut self, body_size: usize, end_of_stream: bool) -> Action {
        if !end_of_stream {
            // wait till we get complete body
            return Action::Pause;
        }

        let Some(content_type) = self.get_property(vec!["response.content-type"]) else {
            return Action::Continue;
        };

        let Ok(content_type) = from_utf8(&content_type) else {
            // should never happen
            println!("Invalid UTF-8 in Content-Type");
            self.send_http_response(500, vec![], None);
            return Action::Pause;
        };

        if content_type != "image/avif" {
            // should never happen
            println!(
                "Content-Type {} is not supported, not transforming",
                content_type
            );
            return Action::Continue;
        }

        if let Some(body_bytes) = self.get_http_response_body(0, body_size) {
            let buf = body_bytes.as_bytes();
            let img = match load_from_memory(buf) {
                Ok(i) => i,
                Err(e) => {
                    println!("cannot load image to memory {}, not converting", e);
                    return Action::Continue;
                }
            };

            let mut out = Vec::new();
            let mut c = Cursor::new(&mut out);
            let res = img.write_with_encoder(codecs::avif::AvifEncoder::new_with_speed_quality(
                &mut c,
                u8_param("AVIF_SPEED", 1, 10, 5),
                u8_param("AVIF_QUALITY", 1, 100, 70),
            ));

            match res {
                Ok(_) => {
                    println!(
                        "{} bytes -> {} bytes {}",
                        body_size,
                        out.len(),
                        content_type
                    );
                    self.set_http_response_body(0, body_size, &out)
                }
                Err(e) => println!("cannot store transformed image {}", e),
            }
        } else {
            println!("No response body to transform");
        }

        Action::Continue
    }
}

fn u8_param(name: &str, min: u8, max: u8, default: u8) -> u8 {
    let Ok(val) = env::var(name) else {
        println!("Param {} is not set, using default value {}", name, default);
        return default;
    };
    if val.is_empty() {
        println!("Param {} is not set, using default value {}", name, default);
        return default;
    }

    let val = match val.parse() {
        Err(_) => {
            println!(
                "Param {} is not a valid number, using default value {}",
                name, default
            );
            return default;
        }
        Ok(v) => v,
    };
    if val < min {
        println!(
            "Param {} is below minimum {}, using default value {}",
            name, min, default
        );
        return default;
    }
    if val > max {
        println!(
            "Param {} is above maximum {}, using default value {}",
            name, max, default
        );
        return default;
    }

    val
}
