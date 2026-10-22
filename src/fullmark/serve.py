"""Local one-page servers.

`quiz watch --serve` reloads the browser after each rebuild; `quiz serve` waits for the
page to post its results back. In both only the served copy is changed (an injected
snippet and a CSP that allows the page to talk to its own server). The HTML on disk and
normal builds stay offline-only. Both bind to 127.0.0.1 only. `quiz serve --autosave FILE`
also keeps the attempt in progress in FILE (POST /progress) so it resumes after the server or
the browser closes.
"""

import json
import os
import re
import secrets
import sys
import threading
import time
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SNIPPET = (
    '<script>new EventSource("/events").onmessage = () => location.reload();</script>'
)
EARLY_MARK = '<script type="application/json" id="quiz-data">'
CSP_OLD = "default-src 'none';"
CSP_NEW = "default-src 'none'; connect-src 'self';"
SCHEMA = Path(__file__).parent / "schemas" / "results-v1.schema.json"
MAX_BODY = 20 * 1024 * 1024


def inject(html: str, snippet: str = SNIPPET, early: bool = False) -> str:
    """The page as served: a snippet before </body> plus connect-src 'self'.

    With `early` the snippet goes before the page's data block instead, so it has run when
    quiz.js starts and the start screen can already see FULLMARK_SUBMIT.progress."""
    html = html.replace(CSP_OLD, CSP_NEW, 1)
    if early:
        i = html.find(EARLY_MARK)
        if i >= 0:
            return html[:i] + snippet + html[i:]
    i = html.rfind("</body>")
    return html[:i] + snippet + html[i:] if i >= 0 else html + snippet


def submit_snippet(
    token: str, autosave: bool = False, progress: dict | None = None
) -> str:
    """Tells quiz.js where to post the results (see FULLMARK_SUBMIT in quiz.js).

    The progress holds the learner's own text, so `<` is escaped: an answer containing
    `</script>` must not end the script. `\\u003c` is valid JSON and JavaScript."""
    cfg = {
        "url": "/submit",
        "token": token,
        "autosave": "/progress" if autosave else None,
        "progress": progress,
    }
    cfg = json.dumps(cfg).replace("<", "\\u003c")
    return f"<script>window.FULLMARK_SUBMIT = {cfg};</script>"


def _page_response(handler: BaseHTTPRequestHandler, body: bytes) -> None:
    handler.send_response(200)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


class ReloadServer:
    """Serves one HTML file on 127.0.0.1 and pings /events listeners after each rebuild."""

    def __init__(self, html_path: Path):
        self.path = html_path
        self.version = 0
        self.cond = threading.Condition()
        self.closing = False
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):  # keep the terminal quiet
                pass

            def do_GET(self):
                route = self.path.split("?")[0]
                if route in ("/", "/" + owner.path.name):
                    try:
                        body = inject(owner.path.read_text(encoding="utf-8")).encode(
                            "utf-8"
                        )
                    except OSError:
                        self.send_error(404)
                        return
                    _page_response(self, body)
                elif route == "/events":
                    seen = owner.version  # before the headers, so no rebuild slips by
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(b": connected\n\n")
                    self.wfile.flush()
                    try:
                        while not owner.closing:
                            with owner.cond:
                                owner.cond.wait_for(
                                    lambda s=seen: owner.version != s or owner.closing,
                                    1.0,
                                )
                                changed = owner.version != seen
                                seen = owner.version
                            self.wfile.write(
                                b"data: reload\n\n" if changed else b": keep-alive\n\n"
                            )
                            self.wfile.flush()
                    except OSError:
                        pass
                else:
                    self.send_error(404)

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.httpd.daemon_threads = True
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.httpd.server_address[1]}/{self.path.name}"

    def start(self) -> None:
        self.thread.start()

    def rebuilt(self) -> None:
        with self.cond:
            self.version += 1
            self.cond.notify_all()

    def stop(self) -> None:
        self.closing = True
        with self.cond:
            self.cond.notify_all()
        self.httpd.shutdown()
        self.httpd.server_close()


# ------------------------------------------------------------ results validation


def quiz_meta_of_html(html: str) -> dict | None:
    """The parsed data block of a built page (id, hash, ...), or None."""
    m = re.search(
        r'<script type="application/json" id="quiz-data">(.*?)</script>',
        html,
        re.DOTALL,
    )
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def quiz_id_of_html(html: str) -> str | None:
    """The quiz id recorded in a built page's data block."""
    meta = quiz_meta_of_html(html)
    return meta.get("id") if meta else None


_TYPES = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "null": lambda v: v is None,
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
}


def _check(value, schema: dict, root: dict, path: str, errors: list[str]) -> None:
    """The subset of JSON Schema that results-v1.schema.json uses (no new dependency)."""
    if len(errors) >= 5:
        return
    where = path or "/"
    if "$ref" in schema:
        node = root
        for part in schema["$ref"].lstrip("#/").split("/"):
            node = node[part]
        _check(value, node, root, path, errors)
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_TYPES[t](value) for t in types):
            errors.append(f"{where}: expected {'/'.join(types)}")
            return
    if "const" in schema and value != schema["const"]:
        errors.append(f"{where}: must be {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{where}: must be one of {schema['enum']}")
    if "minimum" in schema and _TYPES["number"](value) and value < schema["minimum"]:
        errors.append(f"{where}: below {schema['minimum']}")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{where}: missing {key!r}")
        for key, sub in schema.get("properties", {}).items():
            if key in value:
                _check(value[key], sub, root, f"{path}/{key}", errors)
        patterns = schema.get("patternProperties", {})
        extra = schema.get("additionalProperties", True)
        for key, item in value.items():
            if key in schema.get("properties", {}):
                continue
            hits = [sub for pat, sub in patterns.items() if re.search(pat, key)]
            for sub in hits:
                _check(item, sub, root, f"{path}/{key}", errors)
            if not hits and extra is False:
                errors.append(f"{where}: unexpected key {key!r}")
            elif not hits and isinstance(extra, dict):
                _check(item, extra, root, f"{path}/{key}", errors)
    if isinstance(value, list) and isinstance(schema.get("items"), dict):
        for i, item in enumerate(value):
            _check(item, schema["items"], root, f"{path}/{i}", errors)
    for sub in schema.get("allOf", []):
        _check(value, sub, root, path, errors)
    if "if" in schema and "then" in schema:
        trial: list[str] = []
        _check(value, schema["if"], root, path, trial)
        if not trial:
            _check(value, schema["then"], root, path, errors)


def validate_results(data, quiz_id: str | None) -> list[str]:
    """Problems with a posted results object; empty when it is acceptable."""
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    errors: list[str] = []
    _check(data, schema, schema, "", errors)
    if errors:
        return errors
    if quiz_id is not None and data["quiz"]["id"] != quiz_id:
        return [
            f"quiz id {data['quiz']['id']!r} does not match the served quiz {quiz_id!r}"
        ]
    return []


def unique_path(path: Path) -> Path:
    """`path`, or `stem-2.suffix`, `stem-3.suffix`... so nothing is overwritten."""
    if not path.exists():
        return path
    n = 2
    while path.with_name(f"{path.stem}-{n}{path.suffix}").exists():
        n += 1
    return path.with_name(f"{path.stem}-{n}{path.suffix}")


def default_out(source: Path, quiz_id: str | None) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return source.parent / f"{quiz_id or source.stem}-results-{stamp}.json"


class SubmitServer:
    """Serves one quiz page and accepts its results on POST /submit (token required)."""

    def __init__(
        self,
        html: str,
        quiz_id: str | None,
        out: Path,
        port: int = 0,
        *,
        autosave: Path | None = None,
        quiz_hash: str | None = None,
    ):
        self.html = html
        self.quiz_id = quiz_id
        self.out = out
        self.autosave = autosave
        self.quiz_hash = quiz_hash
        self.token = secrets.token_urlsafe(16)
        self.paths: list[Path] = []
        self.submitted = threading.Event()
        self.lock = threading.Lock()
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                pass

            def _reply(self, code: int, obj: dict) -> None:
                body = json.dumps(obj).encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                route, _, query = self.path.partition("?")
                if route != "/":
                    self.send_error(404)
                    return
                if f"t={owner.token}" not in query.split("&"):
                    self.send_error(403)
                    return
                snippet = submit_snippet(
                    owner.token, owner.autosave is not None, owner.progress()
                )
                _page_response(self, inject(owner.html, snippet, early=True).encode())

            def _read_checked(self) -> bytes | None:
                """The request body once size, origin and token pass; replies itself otherwise."""
                try:
                    size = int(self.headers.get("Content-Length", ""))
                except ValueError:
                    size = -1
                # read the body first, so a refusal is not a reset connection
                raw = self.rfile.read(size) if 0 < size <= MAX_BODY else b""
                origin = self.headers.get("Origin")
                if origin is not None and origin != f"http://127.0.0.1:{owner.port}":
                    self._reply(403, {"ok": False, "error": "wrong origin"})
                    return None
                if not secrets.compare_digest(
                    self.headers.get("X-Fullmark-Token", ""), owner.token
                ):
                    self._reply(403, {"ok": False, "error": "wrong or missing token"})
                    return None
                if not raw:
                    self._reply(
                        400, {"ok": False, "error": "bad or missing Content-Length"}
                    )
                    return None
                return raw

            def _read_json(self):
                """(ok, data); when not ok the reply has been sent."""
                raw = self._read_checked()
                if raw is None:
                    return False, None
                try:
                    return True, json.loads(raw.decode("utf-8"))
                except ValueError:
                    self._reply(400, {"ok": False, "error": "not JSON"})
                    return False, None

            def _progress(self, data) -> None:
                if not isinstance(data, dict) or data.get("hash") != owner.quiz_hash:
                    self._reply(
                        400,
                        {
                            "ok": False,
                            "error": "progress is for another version of this quiz",
                        },
                    )
                    return
                state = data.get("state")
                if state is None or (
                    isinstance(state, dict) and state.get("submitted")
                ):
                    owner.clear_progress()
                    self._reply(200, {"ok": True, "deleted": True})
                elif isinstance(state, dict):
                    owner.write_progress(data)
                    self._reply(200, {"ok": True})
                else:
                    self._reply(
                        400, {"ok": False, "error": "state must be an object or null"}
                    )

            def do_POST(self):
                if self.path not in ("/submit", "/progress") or (
                    self.path == "/progress" and owner.autosave is None
                ):
                    # drain the body, so the refusal is not a reset connection
                    try:
                        n = int(self.headers.get("Content-Length", ""))
                    except ValueError:
                        n = 0
                    if 0 < n <= MAX_BODY:
                        self.rfile.read(n)
                    self.send_error(404)
                    return
                ok, data = self._read_json()
                if not ok:
                    return
                if self.path == "/progress":
                    self._progress(data)
                    return
                problems = validate_results(data, owner.quiz_id)
                if problems:
                    self._reply(400, {"ok": False, "error": "; ".join(problems)})
                    return
                path = owner.save(data)
                self._reply(200, {"ok": True, "path": path.name})

        self.httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self.httpd.daemon_threads = True
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)

    def progress(self) -> dict | None:
        """The saved attempt in progress for this quiz, or None. Read on every request."""
        if self.autosave is None:
            return None
        try:
            data = json.loads(self.autosave.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if not isinstance(data, dict) or data.get("hash") != self.quiz_hash:
            return None
        state = data.get("state")
        if not isinstance(state, dict) or state.get("submitted"):
            return None
        return state

    def clear_progress(self) -> None:
        """Delete the progress file (the page asked, with this quiz's hash)."""
        if self.autosave is None:
            return
        with self.lock:
            self.autosave.unlink(missing_ok=True)

    def _delete_own(self) -> None:
        """After an accepted submit: delete the progress, unless it is for another quiz version."""
        path = self.autosave
        if path is None:
            return
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        if isinstance(data, dict) and data.get("hash") == self.quiz_hash:
            path.unlink(missing_ok=True)

    def write_progress(self, data: dict) -> None:
        """Replace the progress file atomically."""
        record = {
            "hash": self.quiz_hash,
            "saved": data.get("saved"),
            "state": data["state"],
        }
        text = json.dumps(record, ensure_ascii=False) + "\n"
        path = self.autosave
        if path is None:
            return
        with self.lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_name(path.name + ".tmp")
            tmp.write_text(text, encoding="utf-8", newline="\n")
            os.replace(tmp, path)

    def save(self, data: dict) -> Path:
        """Write the posted results without overwriting anything."""
        text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        with self.lock:
            if self.autosave is not None:
                self._delete_own()
            path = unique_path(self.out)
            path.write_text(text, encoding="utf-8", newline="\n")
            self.paths.append(path)
        self.submitted.set()
        return path

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/?t={self.token}"

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()


def serve_loop(
    html,
    quiz_id,
    out,
    args,
    info,
    should_stop=lambda: False,
    ready=None,
    on_new=None,
    quiz_hash=None,
):
    """Serve `html`, wait for submits, return (server, "submitted" | "timeout").

    `on_new(path)` is called for each results file as it is written. Raises OSError when
    the port is taken."""
    once = args.once or not sys.stdout.isatty()
    autosave = getattr(args, "autosave", None)
    server = SubmitServer(
        html,
        quiz_id,
        out,
        port=args.port,
        autosave=Path(autosave) if autosave else None,
        quiz_hash=quiz_hash,
    )
    server.start()
    print(f"serving {server.url}", file=info, flush=True)
    if ready:
        ready(server.url)
    if args.open:
        webbrowser.open(server.url)
    status = "timeout"
    deadline = time.monotonic() + args.timeout if args.timeout else None
    shown = 0
    try:
        while not should_stop():
            server.submitted.wait(0.1)
            with server.lock:
                new, shown = server.paths[shown:], len(server.paths)
            for p in new:
                print(f"wrote {p}", file=info, flush=True)
                if on_new:
                    on_new(p)
            if server.paths:
                status = "submitted"
                if once:
                    break
            elif deadline is not None and time.monotonic() >= deadline:
                break
    except KeyboardInterrupt:
        print("stopped", file=info)
    finally:
        server.stop()
    return server, status
