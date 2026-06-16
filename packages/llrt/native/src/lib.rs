pub mod runtime;

use napi_derive::napi;

#[napi]
pub fn native_smoke() -> String {
    "llrt-native-ok".to_string()
}
