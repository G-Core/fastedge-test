use fastedge::proxywasm::dictionary;
use fastedge::proxywasm::secret;
use proxy_wasm::traits::*;
use proxy_wasm::types::*;

proxy_wasm::main! {{
    proxy_wasm::set_log_level(LogLevel::Info);
    proxy_wasm::set_root_context(|_| -> Box<dyn RootContext> { Box::new(VariablesRoot) });
}}

struct VariablesRoot;

impl Context for VariablesRoot {}

impl RootContext for VariablesRoot {
    fn get_type(&self) -> Option<ContextType> {
        Some(ContextType::HttpContext)
    }

    fn create_http_context(&self, _: u32) -> Option<Box<dyn HttpContext>> {
        Some(Box::new(VariablesContext))
    }
}

struct VariablesContext;

impl Context for VariablesContext {}

impl HttpContext for VariablesContext {
    fn on_http_request_headers(&mut self, _: usize, _: bool) -> Action {
        // std::env::var: reads via WASI environ_get (< 64 KB values)
        let username = std::env::var("USERNAME").unwrap_or_default();
        // dictionary::get: reads via proxy_dictionary_get (no size limit)
        let large_data = dictionary::get("LARGE_DATA").unwrap_or_default();
        // secret::get: reads via proxy_get_secret
        let password = secret::get("PASSWORD")
            .ok()
            .flatten()
            .and_then(|v| String::from_utf8(v).ok())
            .unwrap_or_default();

        proxy_wasm::hostcalls::log(LogLevel::Info, &format!("USERNAME: {}", username)).ok();
        proxy_wasm::hostcalls::log(LogLevel::Info, &format!("LARGE_DATA: {}", large_data)).ok();
        proxy_wasm::hostcalls::log(LogLevel::Info, &format!("PASSWORD: {}", password)).ok();

        self.add_http_request_header("x-env-username", &username);
        self.add_http_request_header("x-dict-large-data", &large_data);
        self.add_http_request_header("x-env-password", &password);

        Action::Continue
    }
}
