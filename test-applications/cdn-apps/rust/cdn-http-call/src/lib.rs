use proxy_wasm::traits::*;
use proxy_wasm::types::*;
use std::time::Duration;

proxy_wasm::main! {{
    proxy_wasm::set_log_level(LogLevel::Trace);
    proxy_wasm::set_root_context(|_| -> Box<dyn RootContext> { Box::new(HttpCallRoot) });
}}

struct HttpCallRoot;

impl Context for HttpCallRoot {}

impl RootContext for HttpCallRoot {
    fn create_http_context(&self, _: u32) -> Option<Box<dyn HttpContext>> {
        Some(Box::new(HttpCallContext { http_call_done: false }))
    }

    fn get_type(&self) -> Option<ContextType> {
        Some(ContextType::HttpContext)
    }
}

struct HttpCallContext {
    http_call_done: bool,
}

impl Context for HttpCallContext {
    fn on_http_call_response(
        &mut self,
        token_id: u32,
        num_headers: usize,
        body_size: usize,
        _num_trailers: usize,
    ) {
        proxy_wasm::hostcalls::log(
            LogLevel::Info,
            &format!("Received http call response with token id: {token_id}"),
        )
        .ok();

        if num_headers != 0 {
            let user_agent = self.get_http_call_response_header("user-agent");
            match user_agent {
                Some(ua) => {
                    proxy_wasm::hostcalls::log(LogLevel::Info, &format!("User-Agent: Some({ua})"))
                        .ok();
                }
                None => {
                    proxy_wasm::hostcalls::log(LogLevel::Info, "User-Agent: None").ok();
                }
            }

            if body_size > 0 {
                if let Some(body) = self.get_http_call_response_body(0, body_size) {
                    let body_str = String::from_utf8_lossy(&body);
                    proxy_wasm::hostcalls::log(
                        LogLevel::Info,
                        &format!("Response body: Some({body_str})"),
                    )
                    .ok();
                }
            } else {
                proxy_wasm::hostcalls::log(LogLevel::Info, "Response body: None").ok();
            }

            proxy_wasm::hostcalls::log(
                LogLevel::Info,
                "HTTP call response was received successfully, resuming request.",
            )
            .ok();

            self.resume_http_request();
        } else {
            self.reset_http_request();
        }
    }
}

impl HttpContext for HttpCallContext {
    fn on_http_request_headers(&mut self, _: usize, _: bool) -> Action {
        if self.http_call_done {
            return Action::Continue;
        }

        let authority = self
            .get_http_request_header(":authority")
            .unwrap_or_default();
        let scheme = self
            .get_http_request_header(":scheme")
            .unwrap_or_else(|| "https".to_string());
        let path = self
            .get_http_request_header(":path")
            .unwrap_or_else(|| "/".to_string());

        match self.dispatch_http_call(
            &authority,
            vec![
                (":authority", &authority),
                (":scheme", &scheme),
                (":path", &path),
                (":method", "GET"),
            ],
            None,
            vec![],
            Duration::from_millis(5000),
        ) {
            Ok(_token_id) => {
                self.http_call_done = true;
                Action::Pause
            }
            Err(status) => {
                self.send_http_response(
                    500,
                    vec![],
                    Some(format!("Failed to dispatch http call: {:?}", status).as_bytes()),
                );
                Action::Pause
            }
        }
    }
}
