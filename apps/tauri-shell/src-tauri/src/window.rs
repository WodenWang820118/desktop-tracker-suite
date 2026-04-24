use anyhow::{Context, Result};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

use crate::diagnostics::trace_step;

const MAIN_WINDOW_LABEL: &str = "main";
const DEV_FRONTEND_URL: &str = "http://localhost:4200/";
const PRODUCT_NAME: &str = "Tracker Suite";

pub(crate) fn create_main_window(app: &AppHandle, task_api_url: &str) -> Result<()> {
    if app.get_webview_window(MAIN_WINDOW_LABEL).is_some() {
        return Ok(());
    }

    let webview_url = build_window_url(task_api_url, tauri::is_dev())?;
    WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, webview_url)
        .title(PRODUCT_NAME)
        .inner_size(1280.0, 800.0)
        .min_inner_size(1024.0, 720.0)
        .resizable(true)
        .build()
        .context("failed to create Tauri main window")?;

    Ok(())
}

pub(crate) fn build_window_url(task_api_url: &str, is_dev: bool) -> Result<WebviewUrl> {
    let encoded_task_api_url =
        url::form_urlencoded::byte_serialize(task_api_url.as_bytes()).collect::<String>();
    if is_dev {
        let dev_url = format!("{DEV_FRONTEND_URL}?taskApiUrl={encoded_task_api_url}");
        return Url::parse(&dev_url)
            .map(WebviewUrl::External)
            .context("failed to parse Tauri dev URL");
    }

    let packaged_url = format!("tauri://localhost/index.html?taskApiUrl={encoded_task_api_url}");
    trace_step(format!("packaged window URL: {packaged_url}"));
    Url::parse(&packaged_url)
        .map(WebviewUrl::CustomProtocol)
        .context("failed to parse the packaged Tauri app URL")
}

#[cfg(test)]
mod tests {
    use tauri::WebviewUrl;

    use super::build_window_url;

    fn task_api_url_from(webview_url: WebviewUrl) -> String {
        match webview_url {
            WebviewUrl::External(url) => {
                assert_eq!(
                    url.origin().unicode_serialization(),
                    "http://localhost:4200"
                );
                assert_eq!(url.path(), "/");
                url.query_pairs()
                    .find(|(key, _)| key == "taskApiUrl")
                    .map(|(_, value)| value.into_owned())
                    .expect("expected taskApiUrl query parameter")
            }
            WebviewUrl::CustomProtocol(url) => {
                assert_eq!(url.scheme(), "tauri");
                assert_eq!(url.host_str(), Some("localhost"));
                assert_eq!(url.path(), "/index.html");
                url.query_pairs()
                    .find(|(key, _)| key == "taskApiUrl")
                    .map(|(_, value)| value.into_owned())
                    .expect("expected taskApiUrl query parameter")
            }
            other => panic!("unexpected webview URL variant: {other:?}"),
        }
    }

    #[test]
    fn build_window_url_builds_dev_url_with_encoded_task_api_url() {
        let task_api_url = "http://localhost:3000/tasks?tag=due soon";
        let webview_url = build_window_url(task_api_url, true).unwrap();

        assert_eq!(task_api_url_from(webview_url), task_api_url);
    }

    #[test]
    fn build_window_url_builds_packaged_custom_protocol_url() {
        let task_api_url = "http://localhost:5000/tasks?tag=packed mode";
        let webview_url = build_window_url(task_api_url, false).unwrap();

        assert_eq!(task_api_url_from(webview_url), task_api_url);
    }

    #[test]
    fn build_window_url_round_trips_special_query_characters_in_dev_mode() {
        let task_api_url = "http://localhost:3000/tasks?filter=open&page=1&tag=a=b#frag";
        let webview_url = build_window_url(task_api_url, true).unwrap();

        assert_eq!(task_api_url_from(webview_url), task_api_url);
    }

    #[test]
    fn build_window_url_round_trips_special_query_characters_in_packaged_mode() {
        let task_api_url = "http://localhost:5000/tasks?filter=open&page=1&tag=a=b#frag";
        let webview_url = build_window_url(task_api_url, false).unwrap();

        assert_eq!(task_api_url_from(webview_url), task_api_url);
    }
}
