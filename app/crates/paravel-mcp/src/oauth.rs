use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse, Response},
    Form, Json,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;
use tokio::sync::Mutex;
use url::Url;

const CODE_LIFETIME: Duration = Duration::from_secs(300);
const TOKEN_LIFETIME: Duration = Duration::from_secs(3600);
const CLIENT_LIFETIME: Duration = Duration::from_secs(86400);
const MAX_CLIENTS: usize = 128;
const MAX_GRANTS: usize = 256;

#[derive(Clone)]
pub struct OAuth {
    public_url: String,
    operator_secret: [u8; 32],
    state: Arc<Mutex<Store>>,
}

#[derive(Default)]
struct Store {
    clients: HashMap<String, Client>,
    attempts: HashMap<String, Attempt>,
    codes: HashMap<String, Code>,
    access: HashMap<String, Access>,
    refresh: HashMap<String, Refresh>,
}

struct Client {
    redirect_uris: Vec<String>,
    expires: Instant,
}

struct Attempt {
    request: AuthorizeRequest,
    csrf: String,
    cookie: String,
    failures: u8,
    expires: Instant,
}

struct Code {
    client_id: String,
    redirect_uri: String,
    challenge: String,
    expires: Instant,
}

struct Access {
    expires: Instant,
    rate: (Instant, u32),
}

struct Refresh {
    client_id: String,
    access: String,
    expires: Instant,
}

impl Store {
    fn prune(&mut self) {
        let now = Instant::now();
        self.clients.retain(|_, value| value.expires > now);
        self.attempts.retain(|_, value| value.expires > now);
        self.codes.retain(|_, value| value.expires > now);
        self.access.retain(|_, value| value.expires > now);
        self.refresh.retain(|_, value| value.expires > now);
    }
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    redirect_uris: Vec<String>,
    token_endpoint_auth_method: Option<String>,
    grant_types: Option<Vec<String>>,
    response_types: Option<Vec<String>>,
}

#[derive(Serialize)]
struct RegisterResponse {
    client_id: String,
    redirect_uris: Vec<String>,
    token_endpoint_auth_method: &'static str,
    grant_types: [&'static str; 2],
    response_types: [&'static str; 1],
}

#[derive(Clone, Deserialize)]
pub struct AuthorizeRequest {
    response_type: String,
    client_id: String,
    redirect_uri: String,
    code_challenge: String,
    code_challenge_method: String,
    state: Option<String>,
    resource: Option<String>,
    scope: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConsentRequest {
    attempt_id: String,
    csrf_token: String,
    operator_secret: Option<String>,
    decision: String,
}

#[derive(Deserialize)]
pub struct TokenRequest {
    grant_type: String,
    code: Option<String>,
    client_id: Option<String>,
    redirect_uri: Option<String>,
    code_verifier: Option<String>,
    refresh_token: Option<String>,
    resource: Option<String>,
    scope: Option<String>,
}

impl OAuth {
    pub fn new(public_url: String, operator_secret: String) -> Self {
        Self {
            public_url,
            operator_secret: Sha256::digest(operator_secret.as_bytes()).into(),
            state: Arc::new(Mutex::new(Store::default())),
        }
    }

    pub fn resource(&self) -> String {
        format!("{}/mcp", self.public_url)
    }

    pub fn protected_resource_metadata(&self) -> Json<serde_json::Value> {
        Json(serde_json::json!({
            "resource": self.resource(), "authorization_servers": [self.public_url],
            "scopes_supported": ["mcp"], "bearer_methods_supported": ["header"]
        }))
    }

    pub fn authorization_server_metadata(&self) -> Json<serde_json::Value> {
        Json(serde_json::json!({
            "issuer": self.public_url, "authorization_endpoint": format!("{}/authorize", self.public_url),
            "token_endpoint": format!("{}/token", self.public_url), "registration_endpoint": format!("{}/register", self.public_url),
            "code_challenge_methods_supported": ["S256"], "grant_types_supported": ["authorization_code", "refresh_token"],
            "token_endpoint_auth_methods_supported": ["none"], "response_types_supported": ["code"], "scopes_supported": ["mcp"]
        }))
    }

    pub async fn register(
        State(oauth): State<Self>,
        Json(request): Json<RegisterRequest>,
    ) -> Response {
        if request.redirect_uris.is_empty()
            || request.redirect_uris.len() > 8
            || request
                .token_endpoint_auth_method
                .as_deref()
                .is_some_and(|method| method != "none")
            || request.redirect_uris.iter().any(|uri| !valid_redirect(uri))
            || request.grant_types.as_ref().is_some_and(|types| {
                types.is_empty()
                    || types.len() > 2
                    || types.iter().any(|kind| {
                        !matches!(kind.as_str(), "authorization_code" | "refresh_token")
                    })
            })
            || request
                .response_types
                .as_ref()
                .is_some_and(|types| types.as_slice() != ["code"])
        {
            return oauth_error("invalid_client_metadata");
        }
        let mut store = oauth.state.lock().await;
        store.prune();
        if store.clients.len() >= MAX_CLIENTS {
            return StatusCode::TOO_MANY_REQUESTS.into_response();
        }
        let client_id = random_token();
        store.clients.insert(
            client_id.clone(),
            Client {
                redirect_uris: request.redirect_uris.clone(),
                expires: Instant::now() + CLIENT_LIFETIME,
            },
        );
        (
            StatusCode::CREATED,
            Json(RegisterResponse {
                client_id,
                redirect_uris: request.redirect_uris,
                token_endpoint_auth_method: "none",
                grant_types: ["authorization_code", "refresh_token"],
                response_types: ["code"],
            }),
        )
            .into_response()
    }

    pub async fn authorize_get(
        State(oauth): State<Self>,
        Query(request): Query<AuthorizeRequest>,
    ) -> Response {
        let mut store = oauth.state.lock().await;
        store.prune();
        if !oauth.validate_authorize(&store, &request) {
            return oauth_error("invalid_request");
        }
        if store.attempts.len() >= MAX_GRANTS {
            return StatusCode::TOO_MANY_REQUESTS.into_response();
        }
        let attempt_id = random_token();
        let attempt = Attempt {
            request,
            csrf: random_token(),
            cookie: random_token(),
            failures: 0,
            expires: Instant::now() + CODE_LIFETIME,
        };
        let mut response = consent_page(&attempt_id, &attempt, false);
        let secure = if oauth.public_url.starts_with("https://") {
            "; Secure"
        } else {
            ""
        };
        let cookie = format!(
            "paravel_consent={}; Path=/authorize; HttpOnly; SameSite=Lax; Max-Age=300{secure}",
            attempt.cookie
        );
        response
            .headers_mut()
            .insert(header::SET_COOKIE, cookie.parse().unwrap());
        store.attempts.insert(attempt_id, attempt);
        response
    }

    pub async fn authorize_post(
        State(oauth): State<Self>,
        headers: HeaderMap,
        Form(request): Form<ConsentRequest>,
    ) -> Response {
        let mut store = oauth.state.lock().await;
        store.prune();
        let Some(attempt) = store.attempts.get_mut(&request.attempt_id) else {
            return oauth_error("invalid_request");
        };
        if attempt.failures >= 3 {
            return StatusCode::TOO_MANY_REQUESTS.into_response();
        }
        let cookie = consent_cookie(&headers);
        if !constant_eq(&attempt.csrf, &request.csrf_token)
            || !cookie.is_some_and(|cookie| constant_eq(&attempt.cookie, cookie))
        {
            return StatusCode::FORBIDDEN.into_response();
        }
        if request.decision == "deny" {
            let attempt = store.attempts.remove(&request.attempt_id).unwrap();
            return authorization_redirect(&attempt.request, "error", "access_denied");
        }
        let supplied: [u8; 32] =
            Sha256::digest(request.operator_secret.as_deref().unwrap_or("").as_bytes()).into();
        if request.decision != "approve" || !bool::from(supplied.ct_eq(&oauth.operator_secret)) {
            attempt.failures += 1;
            if attempt.failures >= 3 {
                return StatusCode::TOO_MANY_REQUESTS.into_response();
            }
            let mut response = consent_page(&request.attempt_id, attempt, true);
            *response.status_mut() = StatusCode::BAD_REQUEST;
            return response;
        }
        if store.codes.len() >= MAX_GRANTS {
            return StatusCode::TOO_MANY_REQUESTS.into_response();
        }
        let attempt = store.attempts.remove(&request.attempt_id).unwrap();
        if !oauth.validate_authorize(&store, &attempt.request) {
            return oauth_error("invalid_request");
        }
        let code = random_token();
        store.codes.insert(
            code.clone(),
            Code {
                client_id: attempt.request.client_id.clone(),
                redirect_uri: attempt.request.redirect_uri.clone(),
                challenge: attempt.request.code_challenge.clone(),
                expires: Instant::now() + CODE_LIFETIME,
            },
        );
        authorization_redirect(&attempt.request, "code", &code)
    }

    pub async fn token(State(oauth): State<Self>, Form(request): Form<TokenRequest>) -> Response {
        if request
            .resource
            .as_deref()
            .is_some_and(|resource| resource != oauth.resource())
            || request.scope.as_deref().is_some_and(|scope| scope != "mcp")
        {
            return oauth_error("invalid_target");
        }
        let mut store = oauth.state.lock().await;
        store.prune();
        let Some(client_id) = request
            .client_id
            .filter(|id| store.clients.contains_key(id))
        else {
            return oauth_error("invalid_client");
        };
        let refresh_expires = match request.grant_type.as_str() {
            "authorization_code" => {
                if store.access.len() >= MAX_GRANTS || store.refresh.len() >= MAX_GRANTS {
                    return StatusCode::TOO_MANY_REQUESTS.into_response();
                }
                let (Some(code), Some(redirect_uri), Some(verifier)) =
                    (request.code, request.redirect_uri, request.code_verifier)
                else {
                    return oauth_error("invalid_request");
                };
                let Some(code) = store.codes.remove(&code) else {
                    return oauth_error("invalid_grant");
                };
                if code.client_id != client_id
                    || code.redirect_uri != redirect_uri
                    || !valid_verifier(&verifier)
                    || !constant_eq(&pkce(&verifier), &code.challenge)
                {
                    return oauth_error("invalid_grant");
                }
                Instant::now() + CLIENT_LIFETIME
            }
            "refresh_token" => {
                let Some(refresh) = request.refresh_token else {
                    return oauth_error("invalid_request");
                };
                let Some(known) = store.refresh.get(&refresh) else {
                    return oauth_error("invalid_grant");
                };
                if known.client_id != client_id {
                    return oauth_error("invalid_grant");
                }
                if !store.access.contains_key(&known.access) && store.access.len() >= MAX_GRANTS {
                    return StatusCode::TOO_MANY_REQUESTS.into_response();
                }
                let known = store.refresh.remove(&refresh).unwrap();
                store.access.remove(&known.access);
                known.expires
            }
            _ => return oauth_error("unsupported_grant_type"),
        };
        let access = random_token();
        let refresh = random_token();
        store.access.insert(
            access.clone(),
            Access {
                expires: Instant::now() + TOKEN_LIFETIME,
                rate: (Instant::now(), 0),
            },
        );
        store.refresh.insert(
            refresh.clone(),
            Refresh {
                client_id,
                access: access.clone(),
                expires: refresh_expires,
            },
        );
        Json(serde_json::json!({"access_token": access, "token_type": "Bearer", "expires_in": 3600, "refresh_token": refresh, "scope": "mcp"})).into_response()
    }

    pub async fn bearer(&self, headers: &HeaderMap) -> Result<(String, Instant), StatusCode> {
        if headers.get_all(header::AUTHORIZATION).iter().count() != 1 {
            return Err(StatusCode::UNAUTHORIZED);
        }
        let token = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .filter(|value| value.len() == 64)
            .ok_or(StatusCode::UNAUTHORIZED)?;
        let mut store = self.state.lock().await;
        store.prune();
        let mut found = None;
        for known in store.access.keys() {
            if constant_eq(known, token) {
                found = Some(known.clone());
            }
        }
        let key = found.ok_or(StatusCode::UNAUTHORIZED)?;
        let access = store.access.get_mut(&key).unwrap();
        if !allow_rate(&mut access.rate, 60) {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        Ok((key, access.expires))
    }

    pub async fn active_token(&self, token: &str) -> bool {
        let store = self.state.lock().await;
        store
            .access
            .get(token)
            .is_some_and(|access| access.expires > Instant::now())
    }

    fn validate_authorize(&self, store: &Store, request: &AuthorizeRequest) -> bool {
        request.response_type == "code"
            && request.code_challenge_method == "S256"
            && request.code_challenge.len() == 43
            && URL_SAFE_NO_PAD
                .decode(&request.code_challenge)
                .is_ok_and(|bytes| bytes.len() == 32)
            && request
                .state
                .as_ref()
                .is_none_or(|value| value.len() <= 2048)
            && request
                .scope
                .as_deref()
                .is_none_or(|scope| scope.is_empty() || scope == "mcp")
            && request
                .resource
                .as_deref()
                .is_none_or(|resource| resource == self.resource())
            && store
                .clients
                .get(&request.client_id)
                .is_some_and(|client| client.redirect_uris.contains(&request.redirect_uri))
    }
}

fn consent_cookie(headers: &HeaderMap) -> Option<&str> {
    let mut cookies = headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|value| value.trim().strip_prefix("paravel_consent="));
    let value = cookies.next()?;
    if cookies.next().is_some() {
        None
    } else {
        Some(value)
    }
}

fn consent_page(id: &str, attempt: &Attempt, failed: bool) -> Response {
    let host = Url::parse(&attempt.request.redirect_uri)
        .unwrap()
        .host_str()
        .unwrap()
        .to_owned();
    let error = if failed {
        "<p role=alert>Frase incorrecta. Intente de nuevo.</p>"
    } else {
        ""
    };
    Html(format!("<!doctype html><html lang=es><meta charset=utf-8><meta name=viewport content=\"width=device-width, initial-scale=1\"><title>Paravel — Consentimiento</title><main><h1>Autorizar lectura MCP</h1><p>Destino: {}</p><p>Comparte la nota y las piezas del pack del espacio configurado. Caduca en cinco minutos.</p>{error}<form action=\"/authorize\" method=post><input type=hidden name=attempt_id value=\"{id}\"><input type=hidden name=csrf_token value=\"{}\"><label for=operator-secret>Frase de operador (obligatoria)</label><input id=operator-secret name=operator_secret type=password autocomplete=current-password required maxlength=1024><button type=submit name=decision value=approve>Confirmar</button><button type=submit name=decision value=deny formnovalidate>Denegar</button></form></main></html>", html(&host), attempt.csrf)).into_response()
}

fn authorization_redirect(request: &AuthorizeRequest, key: &str, value: &str) -> Response {
    let mut redirect = Url::parse(&request.redirect_uri).unwrap();
    redirect.query_pairs_mut().append_pair(key, value);
    if let Some(state) = &request.state {
        redirect.query_pairs_mut().append_pair("state", state);
    }
    let mut response = StatusCode::FOUND.into_response();
    response
        .headers_mut()
        .insert(header::LOCATION, redirect.as_str().parse().unwrap());
    response
}

fn oauth_error(error: &'static str) -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({"error": error})),
    )
        .into_response()
}

fn allowed_redirect_host(host: &str) -> bool {
    matches!(host, "grok.com" | "x.ai" | "127.0.0.1" | "localhost")
}

fn valid_redirect(value: &str) -> bool {
    if value.len() > 2048 || value.bytes().any(|byte| byte <= b' ' || byte == b'\\') {
        return false;
    }
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
        && !url
            .query_pairs()
            .any(|(key, _)| matches!(key.as_ref(), "code" | "state" | "error"))
        && allowed_redirect_host(host)
        && if matches!(host, "127.0.0.1" | "localhost") {
            matches!(url.scheme(), "http" | "https")
        } else {
            url.scheme() == "https"
        }
}

pub fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn valid_verifier(value: &str) -> bool {
    (43..=128).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-._~".contains(&byte))
}

fn pkce(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn constant_eq(a: &str, b: &str) -> bool {
    bool::from(a.as_bytes().ct_eq(b.as_bytes()))
}

pub fn allow_rate(rate: &mut (Instant, u32), max: u32) -> bool {
    let now = Instant::now();
    if now.duration_since(rate.0) >= Duration::from_secs(60) {
        *rate = (now, 0);
    }
    if rate.1 >= max {
        return false;
    }
    rate.1 += 1;
    true
}

fn html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
