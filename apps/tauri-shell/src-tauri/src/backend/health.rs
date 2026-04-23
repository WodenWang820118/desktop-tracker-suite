use std::time::Duration;

use anyhow::{anyhow, Context, Result};

use crate::diagnostics::trace_step;

const STARTUP_ATTEMPTS: usize = 60;
const STARTUP_DELAY_MS: u64 = 1000;

pub(crate) async fn wait_for_backend_ready(port: u16) -> Result<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(1500))
        .build()
        .context("failed to create backend health-check client")?;
    let health_url = build_health_url(port);
    trace_step(format!("waiting for backend health at {health_url}"));

    for attempt in 1..=STARTUP_ATTEMPTS {
        match client.get(&health_url).send().await {
            Ok(response) if response.status().is_success() => {
                trace_step(format!("backend health-check passed on attempt {attempt}"));
                return Ok(());
            }
            Ok(response) => {
                eprintln!(
                    "Backend health-check attempt {attempt} returned status {}",
                    response.status()
                );
            }
            Err(error) => {
                eprintln!("Backend health-check attempt {attempt} failed: {error}");
            }
        }

        tokio::time::sleep(Duration::from_millis(STARTUP_DELAY_MS)).await;
    }

    Err(anyhow!("backend did not become ready at {health_url}"))
}

fn build_health_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/health")
}

#[cfg(test)]
mod tests {
    use super::build_health_url;

    #[test]
    fn build_health_url_uses_loopback_host() {
        assert_eq!(build_health_url(5000), "http://127.0.0.1:5000/health");
    }

    #[test]
    fn build_health_url_supports_maximum_u16_port() {
        assert_eq!(build_health_url(u16::MAX), "http://127.0.0.1:65535/health");
    }

    #[test]
    fn build_health_url_supports_zero_port() {
        assert_eq!(build_health_url(0), "http://127.0.0.1:0/health");
    }
}
