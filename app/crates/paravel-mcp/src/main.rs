mod http;
mod oauth;
mod server;
mod transport;

use paravel_context::Reader;
use rmcp::ServiceExt;
use std::{
    ffi::OsString,
    fs,
    io::Read,
    net::{Ipv4Addr, SocketAddr},
    path::PathBuf,
    process::ExitCode,
    sync::Arc,
    time::Duration,
};
use transport::BoundedInput;
use url::Url;
use uuid::Uuid;

const USAGE: &str = "paravel-mcp --db ABS_PATH --espacio UUID\nparavel-mcp --db ABS_PATH --espacio UUID --http 127.0.0.1:8787 --public-url https://HOST --operator-secret-file ABS_PATH\nparavel-mcp --help\nparavel-mcp --version\nServidor MCP local de solo lectura por stdin/stdout o HTTP. No abre archivos referenciados ni URLs.";

struct Config {
    db: PathBuf,
    espacio: String,
    http: Option<String>,
    public_url: Option<String>,
    operator_secret_file: Option<PathBuf>,
}

enum Command {
    Run(Config),
    Help,
    Version,
}

fn parse_cli(args: impl IntoIterator<Item = OsString>) -> Result<Command, &'static str> {
    let mut args = args.into_iter().peekable();
    let mut db = None;
    let mut espacio = None;
    let mut http = None;
    let mut public_url = None;
    let mut operator_secret_file = None;
    while let Some(arg) = args.next() {
        match arg.to_str() {
            Some("--help")
                if db.is_none()
                    && espacio.is_none()
                    && http.is_none()
                    && public_url.is_none()
                    && operator_secret_file.is_none()
                    && args.peek().is_none() =>
            {
                return Ok(Command::Help);
            }
            Some("--version")
                if db.is_none()
                    && espacio.is_none()
                    && http.is_none()
                    && public_url.is_none()
                    && operator_secret_file.is_none()
                    && args.peek().is_none() =>
            {
                return Ok(Command::Version);
            }
            Some("--db") if db.is_none() => {
                db = Some(PathBuf::from(args.next().ok_or("Falta --db ABS_PATH.")?));
            }
            Some("--espacio") if espacio.is_none() => {
                let raw = args.next().ok_or("Falta --espacio UUID.")?;
                let raw = raw.to_str().ok_or("El espacio debe ser un UUID válido.")?;
                if !server::valid_uuid(raw) {
                    return Err("El espacio debe ser un UUID válido.");
                }
                espacio = Some(
                    Uuid::parse_str(raw)
                        .map_err(|_| "El espacio debe ser un UUID válido.")?
                        .to_string(),
                );
            }
            Some("--http") if http.is_none() => {
                let value = args.next().ok_or("Falta --http HOST:PORT.")?;
                let value = value.to_str().ok_or("--http requiere host:puerto.")?;
                validate_bind(value)?;
                http = Some(value.to_owned());
            }
            Some("--public-url") if public_url.is_none() => {
                let value = args.next().ok_or("Falta --public-url URL.")?;
                let value = value
                    .to_str()
                    .ok_or("--public-url requiere una URL válida.")?;
                public_url = Some(validate_public_url(value)?);
            }
            Some("--operator-secret-file") if operator_secret_file.is_none() => {
                let value = PathBuf::from(
                    args.next()
                        .ok_or("Falta --operator-secret-file ABS_PATH.")?,
                );
                if !value.is_absolute() {
                    return Err("--operator-secret-file requiere una ruta absoluta.");
                }
                operator_secret_file = Some(value);
            }
            _ => return Err("Argumentos no válidos. Use --help."),
        }
    }
    let db = db.ok_or("Falta --db ABS_PATH.")?;
    if !db.is_absolute() {
        return Err("--db requiere una ruta absoluta.");
    }
    if http.is_some() != public_url.is_some() {
        return Err("--http exige --public-url.");
    }
    if operator_secret_file.is_some() && http.is_none() {
        return Err("--operator-secret-file requiere --http.");
    }
    if http.is_some() && operator_secret_file.is_none() {
        return Err("--http exige --operator-secret-file ABS_PATH; no se imprimen secretos.");
    }
    Ok(Command::Run(Config {
        db,
        espacio: espacio.ok_or("Falta --espacio UUID.")?,
        http,
        public_url,
        operator_secret_file,
    }))
}

fn validate_bind(value: &str) -> Result<(), &'static str> {
    let Some((host, port)) = value.rsplit_once(':') else {
        return Err("--http requiere host:puerto.");
    };
    if !matches!(host, "127.0.0.1" | "localhost") || port.parse::<u16>().is_err() {
        return Err("--http solo permite 127.0.0.1 o localhost con un puerto válido.");
    }
    Ok(())
}

fn validate_public_url(value: &str) -> Result<String, &'static str> {
    if value.len() > 2048 || value.bytes().any(|byte| byte <= b' ' || byte == b'\\') {
        return Err("--public-url requiere una URL válida.");
    }
    let url = Url::parse(value).map_err(|_| "--public-url requiere una URL válida.")?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err("--public-url no admite credenciales.");
    }
    let host = url.host_str().ok_or("--public-url requiere host.")?;
    if url.query().is_some() || url.fragment().is_some() || !matches!(url.path(), "" | "/") {
        return Err("--public-url no admite path, query ni fragment.");
    }
    if url.scheme() != "https"
        && !(matches!(host, "127.0.0.1" | "localhost") && url.scheme() == "http")
    {
        return Err("--public-url requiere https salvo loopback local.");
    }
    Ok(url.origin().ascii_serialization())
}

fn operator_secret(path: Option<PathBuf>) -> Result<String, &'static str> {
    let path = path.ok_or("--http exige --operator-secret-file ABS_PATH.")?;
    let file = fs::File::open(path).map_err(|_| "No se pudo leer la frase de operador.")?;
    if !file
        .metadata()
        .is_ok_and(|metadata| metadata.is_file() && metadata.len() <= 1026)
    {
        return Err("Archivo de frase de operador inválido.");
    }
    let mut text = String::new();
    file.take(1027)
        .read_to_string(&mut text)
        .map_err(|_| "No se pudo leer la frase de operador.")?;
    let secret = text
        .strip_suffix("\r\n")
        .or_else(|| text.strip_suffix('\n'))
        .unwrap_or(&text);
    if !(16..=1024).contains(&secret.len())
        || !secret
            .bytes()
            .all(|byte| byte.is_ascii_graphic() || byte == b' ')
    {
        return Err(
            "La frase de operador debe ser un renglón ASCII imprimible de 16 a 1024 caracteres.",
        );
    }
    Ok(secret.to_owned())
}

async fn run(config: Config) -> Result<(), (&'static str, &'static str)> {
    let reader = tokio::task::spawn_blocking(move || Reader::open(&config.db, &config.espacio))
        .await
        .map_err(|_| ("DATABASE_UNAVAILABLE", "No se pudo abrir el contexto."))?
        .map_err(|error| (error.code(), error.message()))?;
    if let Some(http_bind) = config.http {
        let secret = operator_secret(config.operator_secret_file)
            .map_err(|message| ("INVALID_ARGUMENT", message))?;
        let (_, port) = http_bind.rsplit_once(':').unwrap();
        let bind = SocketAddr::from((Ipv4Addr::LOCALHOST, port.parse::<u16>().unwrap()));
        return http::run(
            server::ContextServer::new(reader),
            bind,
            config.public_url.unwrap(),
            secret,
        )
        .await
        .map_err(|_| ("BIND_FAILED", "No se pudo abrir el listener HTTP."));
    }
    let (stdin, stdout) = rmcp::transport::stdio();
    let state = Arc::new(transport::InputState::default());
    let transport = (BoundedInput::new(stdin, state.clone()), stdout);
    let service = server::ContextServer::new(reader).serve(transport).await;
    match service {
        Ok(service) => {
            let reason = service
                .waiting()
                .await
                .map_err(|_| ("SERVER_UNAVAILABLE", "El servidor se detuvo."))?;
            if !matches!(reason, rmcp::service::QuitReason::Closed) {
                return Err(("SERVER_UNAVAILABLE", "El servidor se detuvo."));
            }
        }
        Err(_) if state.eof() && !state.failed() => return Ok(()),
        Err(_) => return Err(("PROTOCOL_ERROR", "No se pudo iniciar el transporte MCP.")),
    }
    if state.failed() {
        return Err(("PROTOCOL_ERROR", "Entrada MCP inválida o demasiado grande."));
    }
    Ok(())
}

fn main() -> ExitCode {
    std::panic::set_hook(Box::new(|_| {
        eprintln!("INTERNAL_ERROR: El servidor se detuvo.");
    }));
    let command = match parse_cli(std::env::args_os().skip(1)) {
        Ok(command) => command,
        Err(message) => {
            eprintln!("INVALID_ARGUMENT: {message}");
            return ExitCode::from(2);
        }
    };
    let config = match command {
        Command::Help => {
            eprintln!("{USAGE}");
            return ExitCode::SUCCESS;
        }
        Command::Version => {
            eprintln!("paravel-mcp {} (rmcp 3.4.0)", env!("CARGO_PKG_VERSION"));
            return ExitCode::SUCCESS;
        }
        Command::Run(config) => config,
    };
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .max_blocking_threads(4)
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(_) => {
            eprintln!("SERVER_UNAVAILABLE: No se pudo iniciar el servidor.");
            return ExitCode::FAILURE;
        }
    };
    let result = runtime.block_on(run(config));
    runtime.shutdown_timeout(Duration::from_secs(3));
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err((code, message)) => {
            eprintln!("{code}: {message}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod cli_tests {
    use super::*;

    #[cfg(windows)]
    const ABS_DB: &str = r"C:\db.sqlite";
    #[cfg(windows)]
    const ABS_SECRET: &str = r"C:\test.operator-secret";
    #[cfg(not(windows))]
    const ABS_DB: &str = "/tmp/db.sqlite";
    #[cfg(not(windows))]
    const ABS_SECRET: &str = "/tmp/test.operator-secret";

    #[test]
    fn http_requires_loopback_and_public_url() {
        assert!(matches!(
            parse_cli([
                "--db".into(),
                ABS_DB.into(),
                "--espacio".into(),
                "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".into(),
                "--http".into(),
                "127.0.0.1:8787".into(),
                "--public-url".into(),
                "http://127.0.0.1:8787".into(),
                "--operator-secret-file".into(),
                ABS_SECRET.into()
            ]),
            Ok(Command::Run(_))
        ));
        assert!(parse_cli([
            "--db".into(),
            ABS_DB.into(),
            "--espacio".into(),
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".into(),
            "--http".into(),
            "0.0.0.0:8787".into(),
            "--public-url".into(),
            "http://127.0.0.1:8787".into()
        ])
        .is_err());
    }
}
