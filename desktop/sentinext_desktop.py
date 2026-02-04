import socket
import threading

import uvicorn
import webview


def _pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _run_server(port: int, ready: threading.Event, stop_flag: threading.Event) -> None:
    config = uvicorn.Config(
        "backend.local_app:app",
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)

    def _serve() -> None:
        ready.set()
        server.run()

    thread = threading.Thread(target=_serve, daemon=True)
    thread.start()

    stop_flag.wait()
    server.should_exit = True
    thread.join(timeout=5)


def main() -> None:
    port = _pick_free_port()
    ready = threading.Event()
    stop_flag = threading.Event()

    server_thread = threading.Thread(
        target=_run_server,
        args=(port, ready, stop_flag),
        daemon=True,
    )
    server_thread.start()

    ready.wait(timeout=5)
    url = f"http://127.0.0.1:{port}"

    window = webview.create_window(
        "SENTINEXT",
        url,
        width=1280,
        height=860,
        min_size=(1024, 700),
    )

    try:
        webview.start()
    finally:
        stop_flag.set()
        server_thread.join(timeout=5)


if __name__ == "__main__":
    main()
