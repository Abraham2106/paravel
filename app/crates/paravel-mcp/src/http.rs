use crate::{
    oauth::{allow_rate, random_token, OAuth},
    server::ContextServer,
};
use axum::{
    body::{to_bytes, Body, Bytes},
    extract::State,
    http::{header, Method, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use http_body::{Body as HttpBody, Frame};
use hyper::{server::conn::http1, service::service_fn};
use hyper_util::rt::{TokioIo, TokioTimer};
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use std::{
    collections::HashMap,
    convert::Infallible,
    future::Future,
    io,
    net::{Ipv4Addr, SocketAddr},
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;
use tokio::{
    sync::{Mutex, OwnedSemaphorePermit, Semaphore},
    time::{timeout, Sleep},
};
use tower::ServiceExt;
use url::Url;

const MAX_BODY: usize = 64 * 1024;
const MAX_RESPONSE: usize = 256 * 1024;
const SESSION_HEADER: &str = "mcp-session-id";

struct Session {
    owner: String,
    expires: Instant,
    _slot: OwnedSemaphorePermit,
}

#[derive(Clone)]
struct Limits {
    oauth: OAuth,
    public_url: String,
    hosts: Vec<String>,
    all: Arc<Semaphore>,
    mcp: Arc<Semaphore>,
    session_slots: Arc<Semaphore>,
    sessions: Arc<Mutex<HashMap<String, Session>>>,
    public_rate: Arc<Mutex<(Instant, u32)>>,
    global_rate: Arc<Mutex<(Instant, u32)>>,
}

pub async fn run(
    server: ContextServer,
    bind: SocketAddr,
    public_url: String,
    secret: String,
) -> io::Result<()> {
    if bind.ip() != Ipv4Addr::LOCALHOST {
        return Err(io::Error::other("INVALID_BIND"));
    }
    let public = Url::parse(&public_url).map_err(|_| io::Error::other("INVALID_URL"))?;
    let listener = tokio::net::TcpListener::bind(bind).await?;
    let actual = listener.local_addr()?;
    let oauth = OAuth::new(public_url.clone(), secret);
    let public_authority = public[url::Position::BeforeHost..url::Position::AfterPort].to_owned();
    let hosts = vec![
        public_authority,
        actual.to_string(),
        format!("localhost:{}", actual.port()),
    ];
    let limits = Limits {
        oauth: oauth.clone(),
        public_url: public_url.clone(),
        hosts: hosts.clone(),
        all: Arc::new(Semaphore::new(16)),
        mcp: Arc::new(Semaphore::new(4)),
        session_slots: Arc::new(Semaphore::new(64)),
        sessions: Arc::new(Mutex::new(HashMap::new())),
        public_rate: Arc::new(Mutex::new((Instant::now(), 0))),
        global_rate: Arc::new(Mutex::new((Instant::now(), 0))),
    };
    let mut config = StreamableHttpServerConfig::default();
    config.max_request_body_bytes = MAX_BODY;
    config.json_response = true;
    config.legacy_session_mode = false;
    config.allowed_hosts = hosts;
    config.allowed_origins = vec![public_url.clone()];
    let cancellation = config.cancellation_token.clone();
    let service = StreamableHttpService::new(
        move || Ok(server.clone()),
        LocalSessionManager::default().into(),
        config,
    );
    let app = Router::new()
        .route(
            "/.well-known/oauth-protected-resource",
            get(protected_metadata),
        )
        .route(
            "/.well-known/oauth-protected-resource/mcp",
            get(protected_metadata),
        )
        .route(
            "/.well-known/oauth-authorization-server",
            get(authorization_metadata),
        )
        .route("/register", post(OAuth::register))
        .route(
            "/authorize",
            get(OAuth::authorize_get).post(OAuth::authorize_post),
        )
        .route("/token", post(OAuth::token))
        .nest_service("/mcp", service)
        .with_state(oauth)
        .layer(middleware::from_fn_with_state(limits.clone(), guard));
    let connections = Arc::new(Semaphore::new(32));
    let mut tasks = tokio::task::JoinSet::new();
    let mut cleanup = tokio::time::interval(Duration::from_secs(30));
    eprintln!("HTTP_BIND: {actual}");
    eprintln!("HTTP_PUBLIC_URL: {public_url}");
    loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => break,
            _ = cleanup.tick() => {
                limits.sessions.lock().await.retain(|_, session| session.expires > Instant::now());
            }
            _ = tasks.join_next(), if !tasks.is_empty() => {},
            accepted = listener.accept() => {
                let (socket, _) = accepted?;
                let Ok(permit) = connections.clone().try_acquire_owned() else { drop(socket); continue };
                let app = app.clone();
                tasks.spawn(async move {
                    let _permit = permit;
                    let service = service_fn(move |request: Request<hyper::body::Incoming>| {
                        let app = app.clone();
                        async move {
                            let response = app.oneshot(request.map(Body::new)).await.unwrap_or_else(|never: Infallible| match never {});
                            Ok::<_, Infallible>(response)
                        }
                    });
                    let mut builder = http1::Builder::new();
                    builder.timer(TokioTimer::new()).header_read_timeout(Duration::from_secs(5))
                        .max_headers(64).max_buf_size(32 * 1024).keep_alive(false);
                    let _ = timeout(Duration::from_secs(30), builder.serve_connection(TokioIo::new(socket), service)).await;
                });
            }
        }
    }
    cancellation.cancel();
    tasks.abort_all();
    while tasks.join_next().await.is_some() {}
    eprintln!("HTTP_STOPPED");
    Ok(())
}

async fn protected_metadata(State(oauth): State<OAuth>) -> impl IntoResponse {
    oauth.protected_resource_metadata()
}
async fn authorization_metadata(State(oauth): State<OAuth>) -> impl IntoResponse {
    oauth.authorization_server_metadata()
}

async fn guard(State(limits): State<Limits>, request: Request<Body>, next: Next) -> Response {
    let mut response = guarded(&limits, request, next).await;
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    headers.insert(header::PRAGMA, "no-cache".parse().unwrap());
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
            .parse()
            .unwrap(),
    );
    headers.insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse().unwrap());
    headers.insert(header::X_FRAME_OPTIONS, "DENY".parse().unwrap());
    headers.insert(header::REFERRER_POLICY, "no-referrer".parse().unwrap());
    response
}

async fn guarded(limits: &Limits, request: Request<Body>, next: Next) -> Response {
    if !trusted_request(limits, &request) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Ok(global) = limits.all.clone().try_acquire_owned() else {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    };
    if !allow_rate(&mut *limits.global_rate.lock().await, 600) {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    let is_mcp = request.uri().path() == "/mcp" || request.uri().path().starts_with("/mcp/");
    let mut permits = vec![global];
    let mut identity = None;
    if is_mcp {
        identity = match limits.oauth.bearer(request.headers()).await {
            Ok(identity) => Some(identity),
            Err(StatusCode::UNAUTHORIZED) => return unauthorized(&limits.oauth),
            Err(status) => return status.into_response(),
        };
        let Ok(permit) = limits.mcp.clone().try_acquire_owned() else {
            return StatusCode::TOO_MANY_REQUESTS.into_response();
        };
        permits.push(permit);
        if !matches!(*request.method(), Method::POST | Method::DELETE) {
            return StatusCode::METHOD_NOT_ALLOWED.into_response();
        }
    } else if !allow_rate(&mut *limits.public_rate.lock().await, 60) {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    }
    let (mut parts, body) = request.into_parts();
    let bytes = match timeout(Duration::from_secs(5), to_bytes(body, MAX_BODY)).await {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(_)) => return StatusCode::PAYLOAD_TOO_LARGE.into_response(),
        Err(_) => return StatusCode::REQUEST_TIMEOUT.into_response(),
    };
    let mut new_session = None;
    if let Some((owner, token_expires)) = identity {
        if !limits.oauth.active_token(&owner).await {
            return unauthorized(&limits.oauth);
        }
        if parts.headers.get_all(SESSION_HEADER).iter().count() > 1 {
            return StatusCode::BAD_REQUEST.into_response();
        }
        let mut sessions = limits.sessions.lock().await;
        sessions.retain(|_, session| session.expires > Instant::now());
        if let Some(id) = parts.headers.get(SESSION_HEADER) {
            let Ok(id) = id.to_str() else {
                return StatusCode::BAD_REQUEST.into_response();
            };
            let Some(session) = sessions.get(id) else {
                return StatusCode::NOT_FOUND.into_response();
            };
            if !bool::from(session.owner.as_bytes().ct_eq(owner.as_bytes())) {
                return StatusCode::NOT_FOUND.into_response();
            }
            if parts.method == Method::DELETE {
                sessions.remove(id);
                return StatusCode::NO_CONTENT.into_response();
            }
        } else {
            if parts.method != Method::POST {
                return StatusCode::BAD_REQUEST.into_response();
            }
            let message = serde_json::from_slice::<serde_json::Value>(&bytes).ok();
            let method = message
                .as_ref()
                .and_then(|value| value.get("method"))
                .and_then(|value| value.as_str());
            if method == Some("initialize") {
                let Ok(slot) = limits.session_slots.clone().try_acquire_owned() else {
                    return StatusCode::TOO_MANY_REQUESTS.into_response();
                };
                new_session = Some((
                    random_token(),
                    Session {
                        owner,
                        expires: token_expires.min(Instant::now() + Duration::from_secs(900)),
                        _slot: slot,
                    },
                ));
            } else if method != Some("server/discover")
                && parts
                    .headers
                    .get("mcp-protocol-version")
                    .and_then(|value| value.to_str().ok())
                    != Some("2026-07-28")
            {
                return StatusCode::BAD_REQUEST.into_response();
            }
        }
        parts.headers.remove(SESSION_HEADER);
    }
    let response = match timeout(
        Duration::from_secs(10),
        next.run(Request::from_parts(parts, Body::from(bytes))),
    )
    .await
    {
        Ok(response) => response,
        Err(_) => return StatusCode::GATEWAY_TIMEOUT.into_response(),
    };
    let (mut parts, body) = response.into_parts();
    if let Some((id, session)) = new_session {
        if parts.status.is_success() {
            parts.headers.insert(SESSION_HEADER, id.parse().unwrap());
            limits.sessions.lock().await.insert(id, session);
        }
    }
    Response::from_parts(
        parts,
        Body::new(GuardedBody {
            inner: body,
            _permits: permits,
            deadline: Box::pin(tokio::time::sleep(Duration::from_secs(10))),
            remaining: MAX_RESPONSE,
        }),
    )
}

fn trusted_request(limits: &Limits, request: &Request<Body>) -> bool {
    let headers = request.headers();
    if headers.get_all(header::HOST).iter().count() != 1
        || headers.get_all(header::ORIGIN).iter().count() > 1
    {
        return false;
    }
    let Some(host) = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    if !limits
        .hosts
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(host))
    {
        return false;
    }
    if request
        .uri()
        .authority()
        .is_some_and(|authority| !authority.as_str().eq_ignore_ascii_case(host))
    {
        return false;
    }
    if let Some(origin) = headers.get(header::ORIGIN) {
        let Ok(origin) = origin.to_str() else {
            return false;
        };
        if !allowed_origin(limits, request.uri().path(), origin) {
            return false;
        }
    }
    if request.method() == Method::POST
        && request.uri().path() == "/authorize"
        && headers
            .get("sec-fetch-site")
            .is_some_and(|value| value != "same-origin" && value != "none")
    {
        return false;
    }
    true
}

fn allowed_origin(limits: &Limits, _path: &str, origin: &str) -> bool {
    origin == limits.public_url
}

fn unauthorized(oauth: &OAuth) -> Response {
    let value = format!("Bearer realm=\"paravel-mcp\", resource_metadata=\"{}/.well-known/oauth-protected-resource\", scope=\"mcp\"", oauth.resource().trim_end_matches("/mcp"));
    let mut response = (
        StatusCode::UNAUTHORIZED,
        axum::Json(serde_json::json!({"error": "invalid_token"})),
    )
        .into_response();
    response
        .headers_mut()
        .insert(header::WWW_AUTHENTICATE, value.parse().unwrap());
    response
}

struct GuardedBody {
    inner: Body,
    _permits: Vec<OwnedSemaphorePermit>,
    deadline: Pin<Box<Sleep>>,
    remaining: usize,
}

impl HttpBody for GuardedBody {
    type Data = Bytes;
    type Error = io::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Bytes>, io::Error>>> {
        let this = self.get_mut();
        if this.deadline.as_mut().poll(cx).is_ready() {
            return Poll::Ready(Some(Err(io::Error::other("RESPONSE_TIMEOUT"))));
        }
        match Pin::new(&mut this.inner).poll_frame(cx) {
            Poll::Ready(Some(Ok(frame))) => {
                if let Some(data) = frame.data_ref() {
                    if data.len() > this.remaining {
                        return Poll::Ready(Some(Err(io::Error::other("RESPONSE_TOO_LARGE"))));
                    }
                    this.remaining -= data.len();
                }
                Poll::Ready(Some(Ok(frame)))
            }
            Poll::Ready(Some(Err(_))) => {
                Poll::Ready(Some(Err(io::Error::other("RESPONSE_FAILED"))))
            }
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    fn request(path: &str, host: Option<&str>, origin: Option<&str>) -> Request<Body> {
        let builder = Request::builder().method(Method::POST).uri(path);
        let builder = match host {
            Some(value) => builder.header(header::HOST, value),
            None => builder,
        };
        let builder = match origin {
            Some(value) => builder.header(header::ORIGIN, value),
            None => builder,
        };
        builder.body(Body::empty()).unwrap()
    }

    fn limits(hosts: &[&str], public_url: &str) -> Limits {
        Limits {
            oauth: OAuth::new(public_url.to_owned(), "operator-secret-long".to_owned()),
            public_url: public_url.to_owned(),
            hosts: hosts.iter().map(|value| value.to_string()).collect(),
            all: Arc::new(Semaphore::new(16)),
            mcp: Arc::new(Semaphore::new(4)),
            session_slots: Arc::new(Semaphore::new(64)),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            public_rate: Arc::new(Mutex::new((Instant::now(), 0))),
            global_rate: Arc::new(Mutex::new((Instant::now(), 0))),
        }
    }

    #[test]
    fn host_must_match_allowed_authority_exactly() {
        let limits = limits(&["tunnel.example:8787"], "https://tunnel.example:8787");
        assert!(trusted_request(
            &limits,
            &request("/token", Some("tunnel.example:8787"), None)
        ));
        assert!(!trusted_request(
            &limits,
            &request("/token", Some("sub.tunnel.example:8787"), None)
        ));
        assert!(!trusted_request(
            &limits,
            &request("/token", Some("tunnel.example:8787."), None)
        ));
        assert!(!trusted_request(
            &limits,
            &request("/token", Some("tunnel.example"), None)
        ));
        assert!(!trusted_request(&limits, &request("/token", None, None)));
    }

    #[test]
    fn origin_must_equal_public_url_and_single_host_enforced() {
        let limits = limits(&["tunnel.example:8787"], "https://tunnel.example:8787");
        assert!(trusted_request(
            &limits,
            &request(
                "/authorize",
                Some("tunnel.example:8787"),
                Some("https://tunnel.example:8787")
            )
        ));
        assert!(!trusted_request(
            &limits,
            &request(
                "/authorize",
                Some("tunnel.example:8787"),
                Some("https://evil.example")
            )
        ));
        assert!(!trusted_request(
            &limits,
            &request(
                "/authorize",
                Some("tunnel.example:8787"),
                Some("https://grok.com")
            )
        ));
        let mut request = request(
            "/mcp",
            Some("tunnel.example:8787"),
            Some("https://tunnel.example:8787"),
        );
        request.headers_mut().append(
            header::ORIGIN,
            "https://tunnel.example:8787".parse().unwrap(),
        );
        assert!(!trusted_request(&limits, &request));
    }
}
