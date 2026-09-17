use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::{Client, RequestBuilder, Response};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::mpsc::{self, Receiver},
    thread,
    time::{Duration, Instant},
};
use tempfile::TempDir;

const TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RESPONSE: usize = 256 * 1024;
const A: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B: &str = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FIRST: &str = "11111111-1111-4111-8111-111111111111";
const SECOND: &str = "22222222-2222-4222-8222-222222222222";
const HIDDEN: &str = "33333333-3333-4333-8333-333333333333";
const FOREIGN: &str = "44444444-4444-4444-8444-444444444444";
const MISSING: &str = "99999999-9999-4999-8999-999999999999";
const NOTE: &str = "HTTP_NOTE_SECRET_A";
const PAYLOAD: &str = "HTTP_PAYLOAD_SECRET_A";
const HIDDEN_SECRET: &str = "HTTP_HIDDEN_SECRET";
const FOREIGN_SECRET: &str = "HTTP_FOREIGN_SECRET";
const FILE_SECRET: &str = "HTTP_REFERENCED_FILE_MUST_NOT_BE_READ";
const OPERATOR: &str = "synthetic-http-operator-secret-only";
const REDIRECT: &str = "http://127.0.0.1/cb";
const VERIFIER: &str = "synthetic-pkce-verifier-for-local-integration-tests-0123456789";
const STATE: &str = "synthetic state + / & = \" unicode ñ";
const ACCEPT: &str = "application/json, text/event-stream";
const TOOLS: [&str; 3] = ["leer_contexto_pieza", "leer_espacio", "listar_piezas"];
type Form = BTreeMap<String, String>;

const SCHEMA: &str = "
PRAGMA foreign_keys = ON;
CREATE TABLE grupo (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, icono TEXT NOT NULL DEFAULT 'folder',
    orden INTEGER NOT NULL, creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
);
CREATE TABLE espacio (
    id TEXT PRIMARY KEY, grupo_id TEXT NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL, nota TEXT, bot_activo INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
);
CREATE TABLE pieza (
    id TEXT PRIMARY KEY, espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, nombre TEXT NOT NULL, payload TEXT NOT NULL,
    marcada INTEGER NOT NULL DEFAULT 1, orden INTEGER NOT NULL,
    creado_en TEXT NOT NULL, editado_en TEXT NOT NULL
);
CREATE TABLE pack_pieza (
    espacio_id TEXT NOT NULL REFERENCES espacio(id) ON DELETE CASCADE,
    pieza_id TEXT NOT NULL REFERENCES pieza(id) ON DELETE CASCADE,
    PRIMARY KEY (espacio_id, pieza_id)
);
CREATE INDEX idx_espacio_grupo ON espacio(grupo_id);
CREATE INDEX idx_pieza_espacio ON pieza(espacio_id);
CREATE INDEX idx_pack_pieza_pieza ON pack_pieza(pieza_id);
";

fn client() -> Client {
    Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(2))
        .timeout(TIMEOUT)
        .build()
        .unwrap()
}

fn form(items: &[(&str, &str)]) -> Form {
    items
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

fn no_context(text: &str) {
    for forbidden in [
        A,
        B,
        FIRST,
        SECOND,
        HIDDEN,
        FOREIGN,
        NOTE,
        PAYLOAD,
        HIDDEN_SECRET,
        FOREIGN_SECRET,
        FILE_SECRET,
        OPERATOR,
    ] {
        assert!(
            !text.contains(forbidden),
            "response or diagnostics leaked fixture data"
        );
    }
}

fn no_foreign(value: &Value) {
    let text = value.to_string();
    for forbidden in [
        B,
        HIDDEN,
        FOREIGN,
        HIDDEN_SECRET,
        FOREIGN_SECRET,
        FILE_SECRET,
        OPERATOR,
    ] {
        assert!(
            !text.contains(forbidden),
            "response leaked hidden or foreign data"
        );
    }
}

fn capture(stream: impl Read + Send + 'static) -> Receiver<Vec<u8>> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut bytes = Vec::new();
        stream
            .take((MAX_RESPONSE + 1) as u64)
            .read_to_end(&mut bytes)
            .unwrap();
        let _ = tx.send(bytes);
    });
    rx
}

struct Process {
    child: Child,
    stdout: Receiver<Vec<u8>>,
    stderr: Receiver<Vec<u8>>,
}

impl Process {
    fn spawn(mut command: Command, root: &Path) -> Self {
        command
            .current_dir(root)
            .env_clear()
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for name in ["SystemRoot", "WINDIR"] {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }
        for name in [
            "HOME",
            "USERPROFILE",
            "APPDATA",
            "LOCALAPPDATA",
            "TEMP",
            "TMP",
            "TMPDIR",
            "XDG_DATA_HOME",
            "XDG_CONFIG_HOME",
        ] {
            command.env(name, root);
        }
        let mut child = command.spawn().expect("spawn real paravel-mcp binary");
        let stdout = capture(child.stdout.take().unwrap());
        let stderr = capture(child.stderr.take().unwrap());
        Self {
            child,
            stdout,
            stderr,
        }
    }

    fn wait(&mut self) -> ExitStatus {
        let deadline = Instant::now() + TIMEOUT;
        loop {
            if let Some(status) = self.child.try_wait().unwrap() {
                return status;
            }
            assert!(Instant::now() < deadline, "child exit timed out");
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn output(&self) -> String {
        let stdout = self
            .stdout
            .recv_timeout(TIMEOUT)
            .expect("stdout drain timed out");
        assert!(stdout.is_empty(), "HTTP/CLI stdout must remain empty");
        let stderr = self
            .stderr
            .recv_timeout(TIMEOUT)
            .expect("stderr drain timed out");
        assert!(
            stderr.len() <= MAX_RESPONSE,
            "stderr capture limit exceeded"
        );
        String::from_utf8(stderr).unwrap()
    }
}

impl Drop for Process {
    fn drop(&mut self) {
        if matches!(self.child.try_wait(), Ok(Some(_))) {
            return;
        }
        let _ = self.child.kill();
        let deadline = Instant::now() + TIMEOUT;
        while Instant::now() < deadline {
            match self.child.try_wait() {
                Ok(Some(_)) | Err(_) => return,
                Ok(None) => thread::sleep(Duration::from_millis(10)),
            }
        }
    }
}

struct Fixture {
    root: TempDir,
    db: PathBuf,
    secret: PathBuf,
    payload: Value,
}

impl Fixture {
    fn new() -> Self {
        let root = tempfile::Builder::new()
            .prefix("paravel-mcp-http-")
            .tempdir()
            .unwrap();
        let db = root.path().join("private fixture.sqlite3");
        let secret = root.path().join("private.operator-secret");
        let reference = root.path().join("private reference.txt");
        fs::write(&reference, FILE_SECRET).unwrap();
        fs::write(&secret, format!("{OPERATOR}\r\n")).unwrap();
        assert!(db.is_absolute() && secret.is_absolute());
        let payload = json!({"path": reference, "instruction": PAYLOAD});
        let fixture = Self {
            root,
            db,
            secret,
            payload,
        };
        let connection = fixture.connect();
        connection.execute_batch(SCHEMA).unwrap();
        for (id, name, note) in [
            (A, "Mesa autorizada", NOTE),
            (B, FOREIGN_SECRET, FOREIGN_SECRET),
        ] {
            connection
                .execute(
                    "INSERT INTO grupo VALUES(?1,?2,'folder',0,'t','t')",
                    params![id, name],
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO espacio VALUES(?1,?1,?2,?3,1,'t','t')",
                    params![id, name, note],
                )
                .unwrap();
        }
        for (id, space, name, payload, marked, order) in [
            (
                FIRST,
                A,
                "Archivo autorizado",
                fixture.payload.clone(),
                false,
                0,
            ),
            (
                SECOND,
                A,
                "Navegador autorizado",
                json!({"urls": ["https://example.invalid/no-fetch"], "data": PAYLOAD}),
                true,
                1,
            ),
            (
                HIDDEN,
                A,
                HIDDEN_SECRET,
                json!({"data": HIDDEN_SECRET}),
                true,
                2,
            ),
            (
                FOREIGN,
                B,
                FOREIGN_SECRET,
                json!({"data": FOREIGN_SECRET}),
                true,
                0,
            ),
        ] {
            connection
                .execute(
                    "INSERT INTO pieza VALUES(?1,?2,'file',?3,?4,?5,?6,'t','t')",
                    params![id, space, name, payload.to_string(), marked, order],
                )
                .unwrap();
        }
        for (space, piece) in [(A, FIRST), (A, SECOND), (B, FOREIGN)] {
            connection
                .execute(
                    "INSERT INTO pack_pieza VALUES(?1,?2)",
                    params![space, piece],
                )
                .unwrap();
        }
        fixture
    }

    fn connect(&self) -> Connection {
        let connection = Connection::open(&self.db).unwrap();
        connection.busy_timeout(Duration::from_secs(2)).unwrap();
        connection
    }

    fn snapshot(&self) -> BTreeMap<PathBuf, Vec<u8>> {
        fs::read_dir(self.root.path())
            .unwrap()
            .map(|entry| {
                let path = entry.unwrap().path();
                assert!(path.is_file(), "server created an unexpected directory");
                (
                    path.strip_prefix(self.root.path()).unwrap().to_owned(),
                    fs::read(path).unwrap(),
                )
            })
            .collect()
    }

    fn command(&self) -> Command {
        let mut command = Command::new(env!("CARGO_BIN_EXE_paravel-mcp"));
        command.arg("--db").arg(&self.db).args(["--espacio", A]);
        command
    }
}

struct Server {
    process: Process,
    fixture: Fixture,
    client: Client,
    base: String,
}

impl Server {
    async fn start() -> Self {
        Self::with_fixture(Fixture::new()).await
    }

    async fn with_fixture(fixture: Fixture) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let base = format!("http://{address}");
        let mut command = fixture.command();
        command
            .args([
                "--http",
                &address.to_string(),
                "--public-url",
                &format!("{base}/"),
                "--operator-secret-file",
            ])
            .arg(&fixture.secret);
        drop(listener);
        let process = Process::spawn(command, fixture.root.path());
        let mut server = Self {
            process,
            fixture,
            client: client(),
            base,
        };
        let deadline = Instant::now() + TIMEOUT;
        while Instant::now() < deadline {
            assert!(
                server.process.child.try_wait().unwrap().is_none(),
                "HTTP server exited at startup"
            );
            if let Ok(response) = server
                .get("/.well-known/oauth-authorization-server")
                .send()
                .await
            {
                assert_eq!(response.status(), 200);
                return server;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("HTTP listener readiness timed out");
    }

    fn get(&self, path: &str) -> RequestBuilder {
        self.client.get(format!("{}{path}", self.base))
    }

    fn post(&self, path: &str) -> RequestBuilder {
        self.client.post(format!("{}{path}", self.base))
    }

    async fn register(&self, redirects: &[&str]) -> String {
        let response = self
            .post("/register")
            .json(&json!({"redirect_uris": redirects}))
            .send()
            .await
            .unwrap();
        assert!(response.status().is_success());
        let value = json_response(response).await;
        assert_eq!(value["redirect_uris"], json!(redirects));
        assert_eq!(value["token_endpoint_auth_method"], "none");
        assert!(value.get("client_secret").is_none());
        let id = value["client_id"].as_str().unwrap().to_owned();
        assert!(!id.is_empty());
        id
    }

    fn authorization(&self, client_id: &str) -> Form {
        form(&[
            ("response_type", "code"),
            ("client_id", client_id),
            ("redirect_uri", REDIRECT),
            (
                "code_challenge",
                &URL_SAFE_NO_PAD.encode(Sha256::digest(VERIFIER.as_bytes())),
            ),
            ("code_challenge_method", "S256"),
            ("state", STATE),
            ("resource", &format!("{}/mcp", self.base)),
            ("scope", "mcp"),
        ])
    }

    async fn consent(&self, authorization: &Form) -> Consent {
        let response = self
            .get("/authorize")
            .query(authorization)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert!(response.headers()["content-type"]
            .to_str()
            .unwrap()
            .contains("text/html"));
        let cookie = response.headers()["set-cookie"]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_owned();
        let html = response.text().await.unwrap();
        no_context(&html);
        assert!(html.contains("127.0.0.1"));
        let fields = form(&[
            ("attempt_id", &hidden_input(&html, "attempt_id")),
            ("csrf_token", &hidden_input(&html, "csrf_token")),
            ("operator_secret", OPERATOR),
            ("decision", "approve"),
        ]);
        Consent { fields, cookie }
    }

    async fn approve(&self, client_id: &str) -> String {
        let consent = self.consent(&self.authorization(client_id)).await;
        let response = consent.submit(self).send().await.unwrap();
        let location = redirect_location(response, 302).await;
        assert_eq!(location.scheme(), "http");
        assert_eq!(location.host_str(), Some("127.0.0.1"));
        assert_eq!(location.path(), "/cb");
        let pairs: Form = location
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        assert_eq!(pairs.get("state").unwrap(), STATE);
        pairs
            .get("code")
            .expect("authorization code missing")
            .clone()
    }

    fn exchange(&self, client_id: &str, code: &str) -> Form {
        form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("client_id", client_id),
            ("redirect_uri", REDIRECT),
            ("code_verifier", VERIFIER),
        ])
    }

    async fn tokens(&self) -> Tokens {
        let client_id = self.register(&[REDIRECT]).await;
        let code = self.approve(&client_id).await;
        let response = self
            .post("/token")
            .form(&self.exchange(&client_id, &code))
            .send()
            .await
            .unwrap();
        Tokens::from_response(response, client_id).await
    }

    async fn finish(mut self, credentials: &[&str]) {
        let before = self.fixture.snapshot();
        self.process.child.kill().unwrap();
        self.process.wait();
        let stderr = self.process.output();
        no_context(&stderr);
        assert!(!stderr.contains(self.fixture.root.path().to_string_lossy().as_ref()));
        for credential in credentials {
            assert!(!stderr.contains(credential), "stderr leaked credential");
        }
        assert_eq!(
            self.fixture.snapshot(),
            before,
            "server wrote to the fixture directory"
        );
    }
}

fn hidden_input(html: &str, name: &str) -> String {
    let element = html
        .split('<')
        .find(|part| {
            part.starts_with("input ")
                && (part.contains(&format!("name={name} "))
                    || part.contains(&format!("name=\"{name}\"")))
        })
        .expect("consent hidden field missing");
    let value = element
        .split_once("value=\"")
        .unwrap()
        .1
        .split('"')
        .next()
        .unwrap();
    assert!(!value.is_empty());
    value.to_owned()
}

struct Consent {
    fields: Form,
    cookie: String,
}

impl Consent {
    fn submit(&self, server: &Server) -> RequestBuilder {
        server
            .post("/authorize")
            .header("cookie", &self.cookie)
            .header("origin", &server.base)
            .form(&self.fields)
    }
}

struct Tokens {
    access: String,
    refresh: String,
    client_id: String,
}

impl Tokens {
    async fn from_response(response: Response, client_id: String) -> Self {
        assert_eq!(response.status(), 200);
        let value = json_response(response).await;
        assert_eq!(value["token_type"], "Bearer");
        assert_eq!(value["expires_in"], 3600);
        assert_eq!(value["scope"], "mcp");
        let access = value["access_token"].as_str().unwrap().to_owned();
        let refresh = value["refresh_token"].as_str().unwrap().to_owned();
        assert!(access.len() >= 43 && refresh.len() >= 43);
        assert_ne!(access, refresh);
        Self {
            access,
            refresh,
            client_id,
        }
    }

    fn refresh_form(&self) -> Form {
        form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", &self.refresh),
            ("client_id", &self.client_id),
        ])
    }
}

async fn json_response(response: Response) -> Value {
    assert!(response.headers()["content-type"]
        .to_str()
        .unwrap()
        .contains("application/json"));
    let bytes = response.bytes().await.unwrap();
    assert!(bytes.len() <= MAX_RESPONSE);
    serde_json::from_slice(&bytes).expect("invalid JSON response")
}

async fn redirect_location(response: Response, status: u16) -> url::Url {
    assert_eq!(response.status(), status);
    let location = url::Url::parse(response.headers()["location"].to_str().unwrap()).unwrap();
    no_context(&response.text().await.unwrap());
    location
}

async fn rejected(response: Response, status: u16) {
    assert_eq!(response.status(), status);
    assert!(response.headers().get("location").is_none());
    let text = response.text().await.unwrap();
    no_context(&text);
    assert!(!text.contains("access_token") && !text.contains("refresh_token"));
}

async fn unauthorized(server: &Server, response: Response) {
    assert_eq!(response.status(), 401);
    assert_eq!(response.headers()["www-authenticate"], format!("Bearer realm=\"paravel-mcp\", resource_metadata=\"{}/.well-known/oauth-protected-resource\", scope=\"mcp\"", server.base));
    let text = response.text().await.unwrap();
    no_context(&text);
    assert!(
        text.is_empty()
            || serde_json::from_str::<Value>(&text).unwrap() == json!({"error": "invalid_token"})
    );
}

struct Mcp<'a> {
    server: &'a Server,
    access: &'a str,
    session: String,
    next_id: u64,
}

impl<'a> Mcp<'a> {
    async fn start(server: &'a Server, access: &'a str) -> Self {
        let response = server.post("/mcp").bearer_auth(access).header("accept", ACCEPT).json(&json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"paravel-http-integration","version":"1"}}})).send().await.unwrap();
        assert_eq!(response.status(), 200);
        let session = response.headers()["mcp-session-id"]
            .to_str()
            .unwrap()
            .to_owned();
        let init = json_response(response).await;
        assert_eq!(init["id"], 1);
        assert_eq!(init["result"]["protocolVersion"], "2025-11-25");
        assert!(init["result"]["capabilities"]["tools"].is_object());
        let mcp = Self {
            server,
            access,
            session,
            next_id: 1,
        };
        let response = mcp
            .request()
            .json(&json!({"jsonrpc":"2.0","method":"notifications/initialized"}))
            .send()
            .await
            .unwrap();
        assert!(response.status().is_success());
        response.bytes().await.unwrap();
        mcp
    }

    fn request(&self) -> RequestBuilder {
        self.server
            .post("/mcp")
            .bearer_auth(self.access)
            .header("mcp-session-id", &self.session)
            .header("mcp-protocol-version", "2025-11-25")
            .header("accept", ACCEPT)
    }

    async fn rpc(&mut self, method: &str, params: Value) -> Value {
        self.next_id += 1;
        let response = self
            .request()
            .json(&json!({"jsonrpc":"2.0","id":self.next_id,"method":method,"params":params}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let message = json_response(response).await;
        assert_eq!(message["jsonrpc"], "2.0");
        assert_eq!(message["id"], self.next_id);
        assert_ne!(
            message.get("result").is_some(),
            message.get("error").is_some()
        );
        message
    }

    async fn call(&mut self, name: &str, arguments: Value) -> Value {
        self.rpc("tools/call", json!({"name":name,"arguments":arguments}))
            .await
    }

    async fn success(&mut self, name: &str, arguments: Value) -> Value {
        let message = self.call(name, arguments).await;
        assert!(message.get("error").is_none());
        assert_ne!(message["result"]["isError"], true);
        let value = &message["result"]["structuredContent"];
        assert!(value.is_object());
        let content = message["result"]["content"].as_array().unwrap();
        assert!(content.iter().all(|item| item["type"] == "text"));
        assert!(content.iter().any(|item| serde_json::from_str::<Value>(
            item["text"].as_str().unwrap()
        )
        .unwrap()
            == *value));
        no_foreign(&message);
        value.clone()
    }

    async fn error(&mut self, name: &str, arguments: Value, code: &str) -> Value {
        let message = self.call(name, arguments).await;
        assert!(message.get("error").is_none());
        assert_eq!(message["result"]["isError"], true);
        assert_eq!(message["result"]["structuredContent"]["code"], code);
        no_context(&message.to_string());
        message["result"].clone()
    }
}

#[tokio::test]
async fn metadata_matches_public_url_and_unauthorized_requests_never_return_context() {
    let server = Server::start().await;
    let before = server.fixture.snapshot();
    let expected = json!({"resource":format!("{}/mcp",server.base),"authorization_servers":[server.base],"scopes_supported":["mcp"],"bearer_methods_supported":["header"]});
    for path in [
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
    ] {
        let response = server.get(path).send().await.unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(json_response(response).await, expected);
    }
    let metadata = json_response(
        server
            .get("/.well-known/oauth-authorization-server")
            .send()
            .await
            .unwrap(),
    )
    .await;
    for (key, value) in [
        ("issuer", json!(server.base)),
        (
            "authorization_endpoint",
            json!(format!("{}/authorize", server.base)),
        ),
        ("token_endpoint", json!(format!("{}/token", server.base))),
        (
            "registration_endpoint",
            json!(format!("{}/register", server.base)),
        ),
        ("code_challenge_methods_supported", json!(["S256"])),
        (
            "grant_types_supported",
            json!(["authorization_code", "refresh_token"]),
        ),
        ("token_endpoint_auth_methods_supported", json!(["none"])),
        ("response_types_supported", json!(["code"])),
        ("scopes_supported", json!(["mcp"])),
    ] {
        assert_eq!(metadata[key], value, "metadata field {key}");
    }
    for method in [
        reqwest::Method::GET,
        reqwest::Method::POST,
        reqwest::Method::DELETE,
    ] {
        for header in [
            None,
            Some("Bearer not-a-token"),
            Some("Basic synthetic"),
            Some("Bearer "),
        ] {
            let mut request = server
                .client
                .request(method.clone(), format!("{}/mcp", server.base));
            if let Some(header) = header {
                request = request.header("authorization", header);
            }
            let response = request.header("accept", ACCEPT).json(&json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"leer_espacio","arguments":{}}})).send().await.unwrap();
            unauthorized(&server, response).await;
        }
    }
    assert_eq!(server.fixture.snapshot(), before);
    server.finish(&[]).await;
}

#[tokio::test]
async fn dcr_accepts_only_allowlisted_public_clients_and_echoes_exact_redirects() {
    let server = Server::start().await;
    let redirects = [
        REDIRECT,
        "http://localhost:43210/Callback?fixed=1",
        "https://grok.com/cb",
        "https://x.ai/cb",
    ];
    let first = server.register(&redirects).await;
    assert_ne!(server.register(&[REDIRECT]).await, first);
    let explicit = server
        .post("/register")
        .json(&json!({"redirect_uris":[REDIRECT],"token_endpoint_auth_method":"none"}))
        .send()
        .await
        .unwrap();
    assert!(explicit.status().is_success());
    for uri in [
        "https://evil.example/cb",
        "https://grok.com.evil.example/cb",
        "https://sub.grok.com/cb",
        "https://sub.x.ai/cb",
        "http://grok.com/cb",
        "http://x.ai/cb",
        "ftp://localhost/cb",
        "http://192.168.1.2/cb",
    ] {
        rejected(
            server
                .post("/register")
                .json(&json!({"redirect_uris":[uri]}))
                .send()
                .await
                .unwrap(),
            400,
        )
        .await;
    }
    for request in [
        json!({"redirect_uris":[]}),
        json!({"redirect_uris":[REDIRECT,"https://evil.example/cb"]}),
        json!({"redirect_uris":[REDIRECT],"token_endpoint_auth_method":"client_secret_basic"}),
    ] {
        rejected(
            server
                .post("/register")
                .json(&request)
                .send()
                .await
                .unwrap(),
            400,
        )
        .await;
    }
    server.finish(&[]).await;
}

#[tokio::test]
async fn authorize_requires_exact_redirect_s256_resource_and_scope() {
    let server = Server::start().await;
    let client_id = server.register(&[REDIRECT]).await;
    for (key, value) in [
        ("redirect_uri", "http://127.0.0.1/cb/"),
        ("redirect_uri", "http://127.0.0.1/CB"),
        ("redirect_uri", "http://127.0.0.1/cb?extra=1"),
        ("redirect_uri", "http://localhost/cb"),
        ("redirect_uri", "https://evil.example/cb"),
        ("client_id", "unknown-client"),
        ("response_type", "token"),
        ("code_challenge_method", "plain"),
        ("code_challenge", ""),
        ("resource", "http://127.0.0.1/wrong-resource"),
        ("scope", "write"),
        ("scope", "mcp write"),
    ] {
        let mut authorization = server.authorization(&client_id);
        authorization.insert(key.into(), value.into());
        rejected(
            server
                .get("/authorize")
                .query(&authorization)
                .send()
                .await
                .unwrap(),
            400,
        )
        .await;
    }
    let mut omitted = server.authorization(&client_id);
    for key in ["scope", "resource", "state"] {
        omitted.remove(key);
    }
    let consent = server.consent(&omitted).await;
    let location = redirect_location(consent.submit(&server).send().await.unwrap(), 302).await;
    assert!(location.query_pairs().any(|(key, _)| key == "code"));
    assert!(!location.query_pairs().any(|(key, _)| key == "state"));
    omitted.insert("scope".into(), String::new());
    server.consent(&omitted).await;
    server.finish(&[]).await;
}

#[tokio::test]
async fn operator_failures_lock_only_the_consent_attempt_and_denial_issues_no_code() {
    let server = Server::start().await;
    let client_id = server.register(&[REDIRECT]).await;
    let mut consent = server.consent(&server.authorization(&client_id)).await;
    consent.fields.insert(
        "operator_secret".into(),
        "incorrect-synthetic-operator".into(),
    );
    for status in [400, 400, 429] {
        rejected(consent.submit(&server).send().await.unwrap(), status).await;
    }
    consent
        .fields
        .insert("operator_secret".into(), OPERATOR.into());
    rejected(consent.submit(&server).send().await.unwrap(), 429).await;
    assert!(!server.approve(&client_id).await.is_empty());
    let mut denied = server.consent(&server.authorization(&client_id)).await;
    denied.fields.insert("decision".into(), "deny".into());
    denied.fields.remove("operator_secret");
    let response = denied.submit(&server).send().await.unwrap();
    if response.status() == 302 {
        let location = redirect_location(response, 302).await;
        let pairs: Form = location
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        assert_eq!(pairs.get("error").unwrap(), "access_denied");
        assert!(!pairs.contains_key("code"));
        assert_eq!(pairs.get("state").unwrap(), STATE);
    } else {
        rejected(response, 400).await;
    }
    server.finish(&[]).await;
}

#[tokio::test]
async fn consent_requires_its_cookie_and_csrf_and_cannot_be_replayed() {
    let server = Server::start().await;
    let client_id = server.register(&[REDIRECT]).await;
    let consent = server.consent(&server.authorization(&client_id)).await;
    let other = server.consent(&server.authorization(&client_id)).await;
    rejected(
        server
            .post("/authorize")
            .form(&consent.fields)
            .send()
            .await
            .unwrap(),
        403,
    )
    .await;
    rejected(
        server
            .post("/authorize")
            .header("cookie", &other.cookie)
            .form(&consent.fields)
            .send()
            .await
            .unwrap(),
        403,
    )
    .await;
    let mut incorrect = consent.fields.clone();
    incorrect.insert("csrf_token".into(), other.fields["csrf_token"].clone());
    rejected(
        server
            .post("/authorize")
            .header("cookie", &consent.cookie)
            .form(&incorrect)
            .send()
            .await
            .unwrap(),
        403,
    )
    .await;
    let location = redirect_location(consent.submit(&server).send().await.unwrap(), 302).await;
    assert!(location.query_pairs().any(|(key, _)| key == "code"));
    rejected(consent.submit(&server).send().await.unwrap(), 400).await;
    server.finish(&[]).await;
}

#[tokio::test]
async fn pkce_exchange_binds_client_redirect_and_verifier_and_code_is_single_use() {
    let server = Server::start().await;
    let client_id = server.register(&[REDIRECT]).await;
    let other_client = server.register(&[REDIRECT]).await;
    for (key, value) in [
        ("client_id", other_client.as_str()),
        ("redirect_uri", "http://127.0.0.1/cb/"),
        (
            "code_verifier",
            "wrong-but-long-enough-verifier-012345678901234567890123456789",
        ),
        ("code_verifier", "short"),
    ] {
        let code = server.approve(&client_id).await;
        let mut exchange = server.exchange(&client_id, &code);
        exchange.insert(key.into(), value.into());
        rejected(
            server.post("/token").form(&exchange).send().await.unwrap(),
            400,
        )
        .await;
    }
    for key in ["code", "client_id", "redirect_uri", "code_verifier"] {
        let code = server.approve(&client_id).await;
        let mut exchange = server.exchange(&client_id, &code);
        exchange.remove(key);
        rejected(
            server.post("/token").form(&exchange).send().await.unwrap(),
            400,
        )
        .await;
    }
    let code = server.approve(&client_id).await;
    let exchange = server.exchange(&client_id, &code);
    let tokens = Tokens::from_response(
        server.post("/token").form(&exchange).send().await.unwrap(),
        client_id,
    )
    .await;
    rejected(
        server.post("/token").form(&exchange).send().await.unwrap(),
        400,
    )
    .await;
    let mut mcp = Mcp::start(&server, &tokens.access).await;
    assert_eq!(mcp.success("leer_espacio", json!({})).await["nota"], NOTE);
    server
        .finish(&[&tokens.access, &tokens.refresh, &code])
        .await;
}

#[tokio::test]
async fn token_grants_reject_resource_and_scope_mismatches() {
    let server = Server::start().await;
    let tokens = server.tokens().await;
    for (key, value) in [
        ("resource", "http://127.0.0.1/wrong"),
        ("scope", "write"),
        ("scope", "mcp write"),
    ] {
        let code = server.approve(&tokens.client_id).await;
        for mut request in [
            server.exchange(&tokens.client_id, &code),
            tokens.refresh_form(),
        ] {
            request.insert(key.into(), value.into());
            rejected(
                server.post("/token").form(&request).send().await.unwrap(),
                400,
            )
            .await;
        }
    }
    let mut refresh = tokens.refresh_form();
    refresh.insert("resource".into(), format!("{}/mcp", server.base));
    refresh.insert("scope".into(), "mcp".into());
    let rotated = Tokens::from_response(
        server.post("/token").form(&refresh).send().await.unwrap(),
        tokens.client_id.clone(),
    )
    .await;
    let mut mcp = Mcp::start(&server, &rotated.access).await;
    assert_eq!(mcp.success("leer_espacio", json!({})).await["id"], A);
    server
        .finish(&[
            &tokens.access,
            &tokens.refresh,
            &rotated.access,
            &rotated.refresh,
        ])
        .await;
}

#[tokio::test]
async fn refresh_rotates_is_client_bound_and_revokes_old_bearer() {
    let server = Server::start().await;
    let tokens = server.tokens().await;
    let other = server.register(&[REDIRECT]).await;
    let mut wrong_client = tokens.refresh_form();
    wrong_client.insert("client_id".into(), other);
    rejected(
        server
            .post("/token")
            .form(&wrong_client)
            .send()
            .await
            .unwrap(),
        400,
    )
    .await;
    let mut missing_client = tokens.refresh_form();
    missing_client.remove("client_id");
    rejected(
        server
            .post("/token")
            .form(&missing_client)
            .send()
            .await
            .unwrap(),
        400,
    )
    .await;
    let rotated = Tokens::from_response(
        server
            .post("/token")
            .form(&tokens.refresh_form())
            .send()
            .await
            .unwrap(),
        tokens.client_id.clone(),
    )
    .await;
    assert_ne!(rotated.access, tokens.access);
    assert_ne!(rotated.refresh, tokens.refresh);
    rejected(
        server
            .post("/token")
            .form(&tokens.refresh_form())
            .send()
            .await
            .unwrap(),
        400,
    )
    .await;
    unauthorized(
        &server,
        server
            .post("/mcp")
            .bearer_auth(&tokens.access)
            .send()
            .await
            .unwrap(),
    )
    .await;
    let mut mcp = Mcp::start(&server, &rotated.access).await;
    assert_eq!(mcp.success("leer_espacio", json!({})).await["nota"], NOTE);
    let again = Tokens::from_response(
        server
            .post("/token")
            .form(&rotated.refresh_form())
            .send()
            .await
            .unwrap(),
        tokens.client_id.clone(),
    )
    .await;
    assert_ne!(again.refresh, rotated.refresh);
    rejected(
        server
            .post("/token")
            .form(&rotated.refresh_form())
            .send()
            .await
            .unwrap(),
        400,
    )
    .await;
    unauthorized(
        &server,
        server
            .post("/mcp")
            .bearer_auth(&rotated.access)
            .send()
            .await
            .unwrap(),
    )
    .await;
    server
        .finish(&[
            &tokens.access,
            &tokens.refresh,
            &rotated.access,
            &rotated.refresh,
            &again.access,
            &again.refresh,
        ])
        .await;
}

#[tokio::test]
async fn authorized_discovery_and_reads_preserve_the_entire_sqlite_snapshot() {
    let fixture = Fixture::new();
    let before = fixture.snapshot();
    let server = Server::with_fixture(fixture).await;
    let tokens = server.tokens().await;
    let mut mcp = Mcp::start(&server, &tokens.access).await;
    let response = mcp.rpc("tools/list", json!({})).await;
    let tools = response["result"]["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 3);
    assert_eq!(
        tools
            .iter()
            .map(|tool| tool["name"].as_str().unwrap())
            .collect::<BTreeSet<_>>(),
        BTreeSet::from(TOOLS)
    );
    for tool in tools {
        assert_eq!(tool["inputSchema"]["type"], "object");
        assert_eq!(tool["inputSchema"]["additionalProperties"], false);
        assert_eq!(tool["outputSchema"]["type"], "object");
        for (key, expected) in [
            ("readOnlyHint", true),
            ("destructiveHint", false),
            ("idempotentHint", true),
            ("openWorldHint", false),
        ] {
            assert_eq!(tool["annotations"][key], expected);
        }
    }
    for name in [
        "list_navigation_catalog",
        "resolve_navigation_target",
        "buscar",
        "search",
        "buscar_global",
    ] {
        let message = mcp.call(name, json!({})).await;
        assert!(
            message.get("result").is_none(),
            "{name} must not be an MCP tool"
        );
        assert!(matches!(
            message["error"]["code"].as_i64(),
            Some(-32601 | -32602)
        ));
    }
    assert_eq!(
        mcp.success("leer_espacio", json!({})).await,
        json!({"id":A,"nombre":"Mesa autorizada","grupo":"Mesa autorizada","nota":NOTE,"piezas_compartidas":2})
    );
    let page = mcp.success("listar_piezas", json!({"limite":1})).await;
    assert_eq!(
        page["piezas"],
        json!([{"id":FIRST,"nombre":"Archivo autorizado","kind":"file"}])
    );
    let last = mcp
        .success(
            "listar_piezas",
            json!({"limite":1,"cursor":page["cursor_siguiente"]}),
        )
        .await;
    assert_eq!(
        last["piezas"],
        json!([{"id":SECOND,"nombre":"Navegador autorizado","kind":"file"}])
    );
    assert!(last["cursor_siguiente"].is_null());
    assert_eq!(
        mcp.success("leer_contexto_pieza", json!({"pieza_id":FIRST}))
            .await,
        json!({"id":FIRST,"nombre":"Archivo autorizado","kind":"file","payload":server.fixture.payload})
    );
    assert_eq!(
        mcp.success("leer_contexto_pieza", json!({"pieza_id":SECOND}))
            .await["payload"]["data"],
        PAYLOAD
    );
    for name in TOOLS {
        let args = if name == "leer_contexto_pieza" {
            json!({"pieza_id":FIRST,"espacio_id":B})
        } else {
            json!({"espacio_id":B})
        };
        mcp.error(name, args, "INVALID_ARGUMENT").await;
    }
    assert_eq!(server.fixture.snapshot(), before);
    server.finish(&[&tokens.access, &tokens.refresh]).await;
}

#[tokio::test]
async fn foreign_hidden_and_missing_ids_match_even_with_cross_table_pack_rows() {
    let fixture = Fixture::new();
    fixture
        .connect()
        .execute("INSERT INTO pack_pieza VALUES(?1,?2)", params![A, FOREIGN])
        .unwrap();
    let before = fixture.snapshot();
    let server = Server::with_fixture(fixture).await;
    let tokens = server.tokens().await;
    let mut mcp = Mcp::start(&server, &tokens.access).await;
    assert_eq!(
        mcp.success("leer_espacio", json!({})).await["piezas_compartidas"],
        2
    );
    let list = mcp.success("listar_piezas", json!({})).await;
    assert_eq!(
        list["piezas"]
            .as_array()
            .unwrap()
            .iter()
            .map(|piece| piece["id"].as_str().unwrap())
            .collect::<Vec<_>>(),
        vec![FIRST, SECOND]
    );
    let missing = mcp
        .error(
            "leer_contexto_pieza",
            json!({"pieza_id":MISSING}),
            "NOT_FOUND_OR_NOT_VISIBLE",
        )
        .await;
    for id in [B, FOREIGN, HIDDEN] {
        assert_eq!(
            mcp.error(
                "leer_contexto_pieza",
                json!({"pieza_id":id}),
                "NOT_FOUND_OR_NOT_VISIBLE"
            )
            .await,
            missing
        );
    }
    assert_eq!(server.fixture.snapshot(), before);
    server.finish(&[&tokens.access, &tokens.refresh]).await;
}

#[tokio::test]
async fn revocation_is_live_and_empty_pack_preserves_note_without_server_writes() {
    let server = Server::start().await;
    let tokens = server.tokens().await;
    let mut mcp = Mcp::start(&server, &tokens.access).await;
    let before = server.fixture.snapshot();
    mcp.success("leer_contexto_pieza", json!({"pieza_id":FIRST}))
        .await;
    let first = mcp.success("listar_piezas", json!({"limite":1})).await;
    assert_eq!(server.fixture.snapshot(), before);
    server
        .fixture
        .connect()
        .execute(
            "DELETE FROM pack_pieza WHERE espacio_id=?1 AND pieza_id=?2",
            params![A, SECOND],
        )
        .unwrap();
    let revoked = server.fixture.snapshot();
    mcp.error(
        "leer_contexto_pieza",
        json!({"pieza_id":SECOND}),
        "NOT_FOUND_OR_NOT_VISIBLE",
    )
    .await;
    assert_eq!(
        mcp.success(
            "listar_piezas",
            json!({"limite":1,"cursor":first["cursor_siguiente"]})
        )
        .await["piezas"],
        json!([])
    );
    assert_eq!(
        mcp.success("leer_espacio", json!({})).await["piezas_compartidas"],
        1
    );
    assert_eq!(server.fixture.snapshot(), revoked);
    server
        .fixture
        .connect()
        .execute("DELETE FROM pack_pieza WHERE espacio_id=?1", [A])
        .unwrap();
    server
        .fixture
        .connect()
        .execute("UPDATE pieza SET marcada=1 WHERE espacio_id=?1", [A])
        .unwrap();
    let empty = server.fixture.snapshot();
    mcp.error(
        "leer_contexto_pieza",
        json!({"pieza_id":FIRST}),
        "NOT_FOUND_OR_NOT_VISIBLE",
    )
    .await;
    assert_eq!(
        mcp.success("listar_piezas", json!({})).await,
        json!({"piezas":[],"cursor_siguiente":null})
    );
    let space = mcp.success("leer_espacio", json!({})).await;
    assert_eq!(space["nota"], NOTE);
    assert_eq!(space["piezas_compartidas"], 0);
    assert_eq!(server.fixture.snapshot(), empty);
    server.finish(&[&tokens.access, &tokens.refresh]).await;
}

#[tokio::test]
async fn oversized_http_bodies_return_413_before_parsing_and_server_recovers() {
    let server = Server::start().await;
    let tokens = server.tokens().await;
    let before = server.fixture.snapshot();
    for (path, content_type) in [
        ("/register", "application/json"),
        ("/authorize", "application/x-www-form-urlencoded"),
        ("/token", "application/x-www-form-urlencoded"),
        ("/mcp", "application/json"),
    ] {
        let mut request = server.post(path).header("content-type", content_type);
        if path == "/mcp" {
            request = request.bearer_auth(&tokens.access).header("accept", ACCEPT);
        }
        rejected(
            request
                .body("x".repeat(64 * 1024 + 1))
                .send()
                .await
                .unwrap(),
            413,
        )
        .await;
    }
    let mut mcp = Mcp::start(&server, &tokens.access).await;
    assert_eq!(mcp.success("leer_espacio", json!({})).await["nota"], NOTE);
    assert_eq!(server.fixture.snapshot(), before);
    server.finish(&[&tokens.access, &tokens.refresh]).await;
}

#[tokio::test]
async fn access_token_cadence_is_exactly_60_and_independent_between_tokens() {
    let server = Server::start().await;
    let tokens = server.tokens().await;
    let other = server.tokens().await;
    let mut mcp = Mcp::start(&server, &tokens.access).await;
    let start = Instant::now();
    for _ in 0..58 {
        let value = mcp.rpc("tools/list", json!({})).await;
        assert_eq!(value["result"]["tools"].as_array().unwrap().len(), 3);
    }
    assert!(start.elapsed() < Duration::from_secs(45));
    rejected(
        mcp.request()
            .json(&json!({"jsonrpc":"2.0","id":99,"method":"tools/list","params":{}}))
            .send()
            .await
            .unwrap(),
        429,
    )
    .await;
    let mut independent = Mcp::start(&server, &other.access).await;
    assert_eq!(
        independent.success("leer_espacio", json!({})).await["id"],
        A
    );
    server
        .finish(&[
            &tokens.access,
            &tokens.refresh,
            &other.access,
            &other.refresh,
        ])
        .await;
}

#[tokio::test]
async fn public_endpoint_cadence_is_shared_and_bounded() {
    let server = Server::start().await;
    let mut accepted = 0;
    let mut limited = 0;
    let start = Instant::now();
    for index in 0..65 {
        let response = match index % 3 {
            0 => server
                .post("/register")
                .json(&json!({"redirect_uris":[REDIRECT]}))
                .send()
                .await
                .unwrap(),
            1 => server
                .post("/token")
                .form(&[("grant_type", "unsupported")])
                .send()
                .await
                .unwrap(),
            _ => server
                .get("/authorize")
                .query(&server.authorization("unknown-client"))
                .send()
                .await
                .unwrap(),
        };
        let status = response.status();
        if status == 429 {
            limited += 1;
        } else {
            assert_eq!(limited, 0, "rate limit unexpectedly reset");
            assert!(status.is_success() || status == 400);
            accepted += 1;
        }
        no_context(&response.text().await.unwrap());
    }
    assert!(start.elapsed() < Duration::from_secs(45));
    assert!(
        (59..=60).contains(&accepted),
        "expected 60 public requests including readiness, got {accepted}"
    );
    assert!(limited >= 5);
    server.finish(&[]).await;
}

#[tokio::test]
async fn four_inflight_mcp_bodies_reject_the_fifth_then_release_capacity() {
    let server = Server::start().await;
    let tokens = server.tokens().await;
    let url = url::Url::parse(&server.base).unwrap();
    let address = format!("127.0.0.1:{}", url.port().unwrap());
    let mut pending = Vec::new();
    for _ in 0..4 {
        let mut socket =
            TcpStream::connect_timeout(&address.parse().unwrap(), Duration::from_secs(2)).unwrap();
        socket
            .set_write_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        socket
            .set_read_timeout(Some(Duration::from_millis(150)))
            .unwrap();
        write!(socket, "POST /mcp HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nAccept: {ACCEPT}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{", tokens.access).unwrap();
        pending.push(socket);
    }
    for socket in &mut pending {
        let mut byte = [0];
        let error = socket
            .peek(&mut byte)
            .expect_err("held request unexpectedly completed");
        assert!(matches!(
            error.kind(),
            std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
        ));
    }
    let start = Instant::now();
    rejected(
        server
            .post("/mcp")
            .bearer_auth(&tokens.access)
            .header("accept", ACCEPT)
            .json(&json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}))
            .send()
            .await
            .unwrap(),
        429,
    )
    .await;
    assert!(
        start.elapsed() < Duration::from_secs(2),
        "fifth request was queued"
    );
    for mut socket in pending {
        socket.write_all(b"}").unwrap();
        socket.set_read_timeout(Some(TIMEOUT)).unwrap();
        let mut response = String::new();
        socket
            .take(MAX_RESPONSE as u64)
            .read_to_string(&mut response)
            .unwrap();
        assert!(response.starts_with("HTTP/1.1 400"));
        no_context(&response);
    }
    let mut mcp = Mcp::start(&server, &tokens.access).await;
    assert_eq!(mcp.success("leer_espacio", json!({})).await["id"], A);
    server.finish(&[&tokens.access, &tokens.refresh]).await;
}

#[tokio::test]
async fn restart_revokes_oauth_credentials_and_mcp_sessions_without_persisting_them() {
    let mut server = Server::start().await;
    let before = server.fixture.snapshot();
    let tokens = server.tokens().await;
    let session = Mcp::start(&server, &tokens.access).await.session;
    server.process.child.kill().unwrap();
    server.process.wait();
    let stderr = server.process.output();
    no_context(&stderr);
    for secret in [&tokens.access, &tokens.refresh, &session] {
        assert!(!stderr.contains(secret));
    }
    assert_eq!(server.fixture.snapshot(), before);
    let restarted = Server::with_fixture(server.fixture).await;
    unauthorized(
        &restarted,
        restarted
            .post("/mcp")
            .bearer_auth(&tokens.access)
            .header("mcp-session-id", &session)
            .send()
            .await
            .unwrap(),
    )
    .await;
    rejected(
        restarted
            .post("/token")
            .form(&tokens.refresh_form())
            .send()
            .await
            .unwrap(),
        400,
    )
    .await;
    let fresh = restarted.tokens().await;
    rejected(
        restarted
            .post("/mcp")
            .bearer_auth(&fresh.access)
            .header("mcp-session-id", &session)
            .header("accept", ACCEPT)
            .json(&json!({"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}))
            .send()
            .await
            .unwrap(),
        404,
    )
    .await;
    let mut mcp = Mcp::start(&restarted, &fresh.access).await;
    assert_eq!(mcp.success("leer_espacio", json!({})).await["nota"], NOTE);
    assert_eq!(restarted.fixture.snapshot(), before);
    restarted
        .finish(&[
            &tokens.access,
            &tokens.refresh,
            &fresh.access,
            &fresh.refresh,
        ])
        .await;
}

#[tokio::test]
async fn http_2026_discovery_and_reads_require_bearer_and_preserve_scope() {
    let server = Server::start().await;
    let before = server.fixture.snapshot();
    let tokens = server.tokens().await;
    let meta = json!({"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"http-discovery-test","version":"1"}});
    let discover =
        json!({"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":meta}});
    unauthorized(
        &server,
        server
            .post("/mcp")
            .header("mcp-protocol-version", "2026-07-28")
            .header("accept", ACCEPT)
            .json(&discover)
            .send()
            .await
            .unwrap(),
    )
    .await;
    let request = || {
        server
            .post("/mcp")
            .bearer_auth(&tokens.access)
            .header("mcp-protocol-version", "2026-07-28")
            .header("accept", ACCEPT)
    };
    let response = request()
        .header("mcp-method", "server/discover")
        .json(&discover)
        .send()
        .await
        .unwrap();
    let status = response.status();
    if status != 200 {
        let body = response.text().await.unwrap();
        no_context(&body);
        panic!("HTTP 2026 discovery returned {status}: {body}");
    }
    let result = json_response(response).await;
    assert_eq!(result["result"]["cacheScope"], "private");
    assert_eq!(result["result"]["ttlMs"], 0);
    assert!(result["result"]["supportedVersions"]
        .as_array()
        .unwrap()
        .contains(&json!("2026-07-28")));
    let listed = json_response(
        request()
            .header("mcp-method", "tools/list")
            .json(&json!({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":meta}}))
            .send()
            .await
            .unwrap(),
    )
    .await;
    let tools = listed["result"]["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 3);
    assert_eq!(
        tools
            .iter()
            .map(|tool| tool["name"].as_str().unwrap())
            .collect::<BTreeSet<_>>(),
        BTreeSet::from(TOOLS)
    );
    for (id, name, arguments) in [
        (3, "leer_espacio", json!({})),
        (4, "leer_contexto_pieza", json!({"pieza_id":FOREIGN})),
    ] {
        let response = json_response(request().header("mcp-method", "tools/call").header("mcp-name", name).json(&json!({"jsonrpc":"2.0","id":id,"method":"tools/call","params":{"_meta":meta,"name":name,"arguments":arguments}})).send().await.unwrap()).await;
        assert_eq!(response["id"], id);
        if id == 3 {
            assert_eq!(response["result"]["structuredContent"]["nota"], NOTE);
            no_foreign(&response);
        } else {
            assert_eq!(response["result"]["isError"], true);
            assert_eq!(
                response["result"]["structuredContent"]["code"],
                "NOT_FOUND_OR_NOT_VISIBLE"
            );
            no_context(&response.to_string());
        }
    }
    assert_eq!(server.fixture.snapshot(), before);
    server.finish(&[&tokens.access, &tokens.refresh]).await;
}

#[tokio::test]
async fn oversized_stored_context_returns_bounded_errors_without_payload_leaks() {
    let fixture = Fixture::new();
    let oversized = format!("{PAYLOAD}{}", "x".repeat(MAX_RESPONSE + 1));
    fixture
        .connect()
        .execute(
            "UPDATE pieza SET payload=?1 WHERE id=?2",
            params![json!({"data":oversized}).to_string(), FIRST],
        )
        .unwrap();
    fixture
        .connect()
        .execute(
            "UPDATE espacio SET nota=?1 WHERE id=?2",
            params![oversized, A],
        )
        .unwrap();
    let before = fixture.snapshot();
    let server = Server::with_fixture(fixture).await;
    let tokens = server.tokens().await;
    let mut mcp = Mcp::start(&server, &tokens.access).await;
    mcp.error("leer_espacio", json!({}), "CONTEXT_TOO_LARGE")
        .await;
    mcp.error(
        "leer_contexto_pieza",
        json!({"pieza_id":FIRST}),
        "CONTEXT_TOO_LARGE",
    )
    .await;
    assert_eq!(
        mcp.success("listar_piezas", json!({})).await["piezas"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(server.fixture.snapshot(), before);
    server.finish(&[&tokens.access, &tokens.refresh]).await;
}

#[test]
fn http_cli_rejects_invalid_bind_public_url_and_secret_paths_without_stdout() {
    let fixture = Fixture::new();
    let before = fixture.snapshot();
    for bind in [
        "0.0.0.0:8787",
        "[::]:8787",
        "[::1]:8787",
        "192.168.1.2:8787",
        "127.0.0.1",
        "127.0.0.1:65536",
    ] {
        let mut command = fixture.command();
        command.args(["--http", bind, "--public-url", "http://127.0.0.1:8787"]);
        let mut process = Process::spawn(command, fixture.root.path());
        assert_eq!(process.wait().code(), Some(2));
        let diagnostics = process.output();
        assert!(diagnostics.contains("INVALID_ARGUMENT"));
        no_context(&diagnostics);
    }
    for arguments in [
        vec!["--http", "127.0.0.1:8787"],
        vec![
            "--http",
            "127.0.0.1:8787",
            "--public-url",
            "https://example.invalid/path",
        ],
        vec![
            "--http",
            "127.0.0.1:8787",
            "--public-url",
            "http://example.invalid",
        ],
        vec![
            "--http",
            "127.0.0.1:8787",
            "--public-url",
            "https://example.invalid?query=1",
        ],
        vec![
            "--http",
            "127.0.0.1:8787",
            "--public-url",
            "https://example.invalid#fragment",
        ],
        vec![
            "--http",
            "127.0.0.1:8787",
            "--public-url",
            "http://127.0.0.1:8787",
            "--operator-secret-file",
            "relative.operator-secret",
        ],
        vec![
            "--http",
            "127.0.0.1:8787",
            "--http",
            "127.0.0.1:8788",
            "--public-url",
            "http://127.0.0.1:8787",
        ],
    ] {
        let mut command = fixture.command();
        command.args(arguments);
        let mut process = Process::spawn(command, fixture.root.path());
        assert_eq!(process.wait().code(), Some(2));
        let diagnostics = process.output();
        assert!(diagnostics.contains("INVALID_ARGUMENT"));
        no_context(&diagnostics);
    }
    for flag in ["--help", "--version"] {
        let mut command = Command::new(env!("CARGO_BIN_EXE_paravel-mcp"));
        command.arg(flag);
        let mut process = Process::spawn(command, fixture.root.path());
        assert!(process.wait().success());
        let diagnostics = process.output();
        assert!(diagnostics.contains("paravel-mcp"));
        if flag == "--help" {
            assert!(diagnostics.contains("--http"));
        }
    }
    assert_eq!(fixture.snapshot(), before);
}
