"""One place where the kit talks to another system (ADP-17).

Everything that leaves the repository goes through `Http.request`. Tests replace it with `Recorded`, which answers
from a script and keeps what was asked, so an adapter's exact requests can be asserted without a network.
Secrets are named in configuration and read from the environment here; their values are never printed or stored.
"""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from agentic_kit.core import KitError

RETRY = (429, 502, 503, 504)


@dataclass
class Response:
    status: int
    text: str = ""
    headers: dict = field(default_factory=dict)

    def json(self):
        try:
            return json.loads(self.text) if self.text.strip() else {}
        except ValueError as exc:
            raise KitError(f"the service answered {self.status} with something that is not JSON") from exc


def _checked(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme != "https" and not (parts.scheme == "http" and parts.hostname in ("localhost", "127.0.0.1")):
        raise KitError(f"refusing to send to {parts.scheme or 'an unknown scheme'}://{parts.hostname or ''}: only https is allowed")
    return url


class Http:
    """The real transport: the standard library, https only, a short bounded retry."""

    def __init__(self, timeout: int = 30, attempts: int = 3, sleep=time.sleep):
        self.timeout, self.attempts, self.sleep = timeout, attempts, sleep

    def request(self, method: str, url: str, headers: dict | None = None, body=None) -> Response:
        data = None
        headers = dict(headers or {})
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
            headers.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(_checked(url), data=data, headers=headers, method=method)
        last = Response(0)
        for attempt in range(self.attempts):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310 - scheme checked above
                    return Response(resp.status, resp.read().decode("utf-8", "replace"), dict(resp.headers))
            except urllib.error.HTTPError as exc:
                last = Response(exc.code, exc.read().decode("utf-8", "replace"), dict(exc.headers or {}))
                if exc.code not in RETRY:
                    return last
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                last = Response(0, f"could not reach {urlsplit(url).hostname}: {getattr(exc, 'reason', exc)}")
            if attempt + 1 < self.attempts:
                self.sleep(2 ** attempt)
        return last


class Recorded:
    """A scripted transport for tests. `script` is a list of (method, url, Response or dict or list or (status, body))."""

    def __init__(self, script: list | None = None):
        self.script = list(script or [])
        self.calls: list[dict] = []

    def add(self, method: str, url: str, answer) -> "Recorded":
        self.script.append((method, url, answer))
        return self

    def request(self, method: str, url: str, headers: dict | None = None, body=None) -> Response:
        _checked(url)
        self.calls.append({"method": method, "url": url, "headers": dict(headers or {}), "body": body})
        for i, (m, u, answer) in enumerate(self.script):
            if m == method and u == url:
                del self.script[i]
                if isinstance(answer, Response):
                    return answer
                if isinstance(answer, tuple):
                    status, payload = answer
                    return Response(status, payload if isinstance(payload, str) else json.dumps(payload))
                return Response(200, answer if isinstance(answer, str) else json.dumps(answer))
        raise AssertionError(f"unexpected request: {method} {url}")


def secret(name: str, env: dict | None = None) -> str:
    """The value of a secret the pipeline supplied. The name is configuration; the value never is."""
    if not name:
        raise KitError("a secret is not named in connect.yml")
    value = (os.environ if env is None else env).get(str(name), "")
    if not value:
        raise KitError(f"the secret {name} is not set in this job")
    return value


def basic(user: str, token: str) -> str:
    return "Basic " + base64.b64encode(f"{user}:{token}".encode("utf-8")).decode("ascii")


def redact(text: str, values: list[str]) -> str:
    for v in sorted({v for v in values if v and len(v) >= 4}, key=len, reverse=True):
        text = text.replace(v, "[secret]")
    return text


def expect(resp: Response, what: str, ok: tuple = (200, 201, 202, 204)) -> Response:
    if resp.status not in ok:
        detail = resp.text if resp.status == 0 else f"HTTP {resp.status}"
        raise KitError(f"{what} failed: {detail}")
    return resp
