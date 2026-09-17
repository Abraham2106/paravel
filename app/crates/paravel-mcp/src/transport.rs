use std::{
    io,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    task::{Context, Poll},
};
use tokio::io::{AsyncRead, ReadBuf};

pub const MAX_REQUEST_BYTES: usize = 64 * 1024;

#[derive(Default)]
pub struct InputState {
    eof: AtomicBool,
    failed: AtomicBool,
}

impl InputState {
    pub fn eof(&self) -> bool {
        self.eof.load(Ordering::Relaxed)
    }

    pub fn failed(&self) -> bool {
        self.failed.load(Ordering::Relaxed)
    }
}

pub struct BoundedInput<R> {
    inner: R,
    line_bytes: usize,
    state: Arc<InputState>,
}

impl<R> BoundedInput<R> {
    pub fn new(inner: R, state: Arc<InputState>) -> Self {
        Self {
            inner,
            line_bytes: 0,
            state,
        }
    }
}

impl<R: AsyncRead + Unpin> AsyncRead for BoundedInput<R> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        output: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        if this.state.failed() {
            return Poll::Ready(Err(io::Error::other("Entrada MCP inválida.")));
        }
        if output.remaining() == 0 {
            return Poll::Ready(Ok(()));
        }
        let mut bytes = [0u8; 4096];
        let limit = bytes.len().min(output.remaining());
        let mut input = ReadBuf::new(&mut bytes[..limit]);
        match Pin::new(&mut this.inner).poll_read(cx, &mut input) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Err(_)) => {
                this.state.failed.store(true, Ordering::Relaxed);
                Poll::Ready(Err(io::Error::other("No se pudo leer stdin.")))
            }
            Poll::Ready(Ok(())) => {
                if input.filled().is_empty() {
                    this.state.eof.store(true, Ordering::Relaxed);
                    if this.line_bytes != 0 {
                        this.state.failed.store(true, Ordering::Relaxed);
                        return Poll::Ready(Err(io::Error::other("Trama MCP incompleta.")));
                    }
                }
                for byte in input.filled() {
                    if *byte == b'\n' {
                        this.line_bytes = 0;
                    } else {
                        this.line_bytes += 1;
                        if this.line_bytes > MAX_REQUEST_BYTES {
                            this.state.failed.store(true, Ordering::Relaxed);
                            return Poll::Ready(Err(io::Error::other("Trama MCP excesiva.")));
                        }
                    }
                }
                output.put_slice(input.filled());
                Poll::Ready(Ok(()))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;

    #[test]
    fn framing_is_bounded_and_resets_between_requests() {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(async {
                let mut bytes = vec![b'x'; MAX_REQUEST_BYTES];
                bytes.push(b'\n');
                bytes.extend_from_within(..);
                let state = Arc::new(InputState::default());
                let mut input = BoundedInput::new(bytes.as_slice(), state.clone());
                let mut output = Vec::new();
                input.read_to_end(&mut output).await.unwrap();
                assert_eq!(output, bytes);
                assert!(state.eof());
                assert!(!state.failed());
                let bytes = vec![b'x'; MAX_REQUEST_BYTES + 1];
                let state = Arc::new(InputState::default());
                let mut input = BoundedInput::new(bytes.as_slice(), state.clone());
                assert!(input.read_to_end(&mut Vec::new()).await.is_err());
                assert!(state.failed());
            });
    }

    #[test]
    fn incomplete_frame_at_eof_is_rejected() {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(async {
                let state = Arc::new(InputState::default());
                let mut input = BoundedInput::new(b"{}".as_slice(), state.clone());
                assert!(input.read_to_end(&mut Vec::new()).await.is_err());
                assert!(state.eof());
                assert!(state.failed());
            });
    }
}
