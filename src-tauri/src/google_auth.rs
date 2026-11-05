use serde::Serialize;
use std::{io::{Read, Write}, net::TcpListener, time::{Duration, Instant}};
use rand::{rngs::OsRng, RngCore};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sha2::{Digest, Sha256};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleIdentity {
    pub subject: String,
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    pub picture: Option<String>,
}

fn random_urlsafe() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

#[tauri::command]
pub async fn google_sign_in() -> Result<GoogleIdentity, String> {
    tauri::async_runtime::spawn_blocking(sign_in_blocking)
        .await.map_err(|e| e.to_string())?
}

fn sign_in_blocking() -> Result<GoogleIdentity, String> {
    let client_id = option_env!("GOOGLE_OAUTH_CLIENT_ID")
        .filter(|s| !s.trim().is_empty())
        .ok_or("Brak GOOGLE_OAUTH_CLIENT_ID podczas kompilacji. Zobacz instrukcję konfiguracji Google.")?;
    let client_secret = option_env!("GOOGLE_OAUTH_CLIENT_SECRET")
        .filter(|s| !s.trim().is_empty())
        .ok_or("Brak GOOGLE_OAUTH_CLIENT_SECRET podczas kompilacji. Ustaw sekret klienta Desktop app z Google Cloud.")?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let verifier = random_urlsafe();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_urlsafe();
    let url = reqwest::Url::parse_with_params("https://accounts.google.com/o/oauth2/v2/auth", &[
        ("client_id", client_id), ("redirect_uri", redirect_uri.as_str()),
        ("response_type", "code"), ("scope", "openid email profile"),
        ("code_challenge", challenge.as_str()), ("code_challenge_method", "S256"),
        ("state", state.as_str()),
    ]).map_err(|e| e.to_string())?;
    open::that(url.as_str()).map_err(|e| format!("Nie można otworzyć przeglądarki: {e}"))?;
    let deadline = Instant::now() + Duration::from_secs(120);
    let code = loop {
        if Instant::now() >= deadline { return Err("Upłynął czas logowania (120 sekund).".into()); }
        match listener.accept() {
            Ok((mut stream, addr)) => {
                if !addr.ip().is_loopback() { continue; }
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
                let line = String::from_utf8_lossy(&buf[..n]);
                let target = line.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("");
                let parsed = reqwest::Url::parse(&format!("http://127.0.0.1:{port}{target}"));
                let mut returned_state = None;
                let mut code = None;
                let mut oauth_error = None;
                if let Ok(ref url) = parsed {
                    if url.path() == "/callback" {
                        for (k,v) in url.query_pairs() {
                            match k.as_ref() { "state" => returned_state = Some(v.into_owned()), "code" => code = Some(v.into_owned()), "error" => oauth_error = Some(v.into_owned()), _ => {} }
                        }
                    }
                }
                let valid_state = returned_state.as_deref() == Some(state.as_str());
                let success = valid_state && code.is_some();
                let body = if success { "Logowanie zakonczone. Mozesz zamknac to okno i wrocic do KKF Studio." } else { "Nie udalo sie zakonczyc logowania. Wroc do KKF Studio." };
                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                let _ = stream.write_all(response.as_bytes());
                if !valid_state { continue; }
                if let Some(err) = oauth_error { return Err(format!("Google: {err}")); }
                if let Some(code) = code { break code; }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(120)),
            Err(e) => return Err(e.to_string()),
        }
    };
    let http = reqwest::blocking::Client::builder().timeout(Duration::from_secs(20)).build().map_err(|e| e.to_string())?;
    let response = http.post("https://oauth2.googleapis.com/token").form(&[
        ("client_id", client_id), ("client_secret", client_secret), ("code", code.as_str()),
        ("code_verifier", verifier.as_str()), ("redirect_uri", redirect_uri.as_str()),
        ("grant_type", "authorization_code"),
    ]).send().map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_else(|_| "Brak tresci odpowiedzi".to_string());
        let error: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::Value::Null);
        let code = error["error"].as_str().unwrap_or("unknown_error");
        let description = error["error_description"].as_str().unwrap_or("Brak szczegolow od Google");
        return Err(format!("Google OAuth HTTP {status}: {code} - {description}"));
    }
    let token: serde_json::Value = response.json().map_err(|e| e.to_string())?;
    let access_token = token["access_token"].as_str().ok_or("Brak tokenu dostępu Google")?;
    let response = http.get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(access_token).send().map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Nie można pobrać profilu Google: HTTP {}", response.status())); }
    let user: serde_json::Value = response.json().map_err(|e| e.to_string())?;
    let get = |key: &str| user[key].as_str().unwrap_or("").to_owned();
    let subject = get("sub");
    if subject.is_empty() { return Err("Google nie zwrócił identyfikatora konta".into()); }
    Ok(GoogleIdentity {
        subject, first_name: get("given_name"), last_name: get("family_name"),
        email: get("email"), picture: user["picture"].as_str().map(str::to_owned),
    })
}
