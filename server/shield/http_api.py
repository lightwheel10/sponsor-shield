"""The web address the extension talks to. Small on purpose: two routes.

    GET  /v1/segments/<videoId>[?transcript=<hash>]   look up an answer (free)
    POST /v1/transcripts                              send a transcript (may start an AI check)
    GET  /healthz                                     "is the server up?"

No CORS headers are sent, so ordinary websites cannot read our answers or
post JSON to us from a visitor's browser. The extension can, because its
manifest lists this server.
"""
import hashlib
import hmac
import ipaddress
import json
import logging
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from .limits import RateLimiter
from .transcript import BadSubmission, is_transcript_hash, is_video_id, parse_submission

log = logging.getLogger("shield.http")

MAX_BODY_BYTES = 2 * 1024 * 1024
HOUR = 3600


def network_code(address, secret):
    """A one-way code for the visitor's network (IPv4 /24 or IPv6 /48).

    People on the same home or office network share a code, so making many
    installs from one place still only counts as one network.
    """
    ip = ipaddress.ip_address(address)
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    prefix = 24 if ip.version == 4 else 48
    network = ipaddress.ip_network(f"{ip}/{prefix}", strict=False)
    return hmac.new(secret, b"net:" + str(network).encode(), hashlib.sha256).hexdigest()[:32]


def install_code(install_id, secret):
    return hmac.new(secret, b"install:" + install_id.encode(), hashlib.sha256).hexdigest()[:32]


class ShieldApp:
    """Holds what every request needs: the service, the speed limits, the settings."""

    def __init__(self, settings, service):
        self.settings = settings
        self.service = service
        # Generous for real viewers: a lookup per video plus polling while an
        # AI check runs (one every 4 seconds) still fits many videos an hour.
        self.lookups_per_network = RateLimiter(limit=900, window_seconds=HOUR)
        self.submissions_per_network = RateLimiter(limit=30, window_seconds=HOUR)
        self.submissions_per_install = RateLimiter(limit=15, window_seconds=HOUR)


class ShieldHandler(BaseHTTPRequestHandler):
    server_version = "SponsorShield"
    sys_version = ""  # Do not advertise the Python version.
    timeout = 30  # Drop connections that send too slowly.

    # --- routes --------------------------------------------------------------

    def do_GET(self):
        started = time.monotonic()
        url = urlsplit(self.path)
        if url.path == "/healthz":
            return self._reply(200, {"ok": True}, started)
        parts = url.path.split("/")
        if len(parts) != 4 or parts[:3] != ["", "v1", "segments"] or not is_video_id(parts[3]):
            return self._reply(404, {"error": "not found"}, started)
        if not self.app.lookups_per_network.allow(self._network()):
            return self._too_many(started)
        transcript_hash = parse_qs(url.query).get("transcript", [None])[0]
        if transcript_hash is not None and not is_transcript_hash(transcript_hash):
            return self._reply(400, {"error": "invalid transcript hash"}, started)
        return self._reply(200, self.app.service.lookup(parts[3], transcript_hash), started)

    def do_POST(self):
        started = time.monotonic()
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.close_connection = True
            return self._reply(411, {"error": "Content-Length required"}, started)
        if not 0 < length <= MAX_BODY_BYTES:
            self.close_connection = True  # Never read a body this big; just hang up after replying.
            return self._reply(413, {"error": "body too large"}, started)
        # Read the body before any reply, even a refusal: answering while the
        # sender is still sending can make the connection drop before they see it.
        body = self.rfile.read(length)
        if urlsplit(self.path).path != "/v1/transcripts":
            return self._reply(404, {"error": "not found"}, started)
        network = self._network()
        if not self.app.submissions_per_network.allow(network):
            return self._too_many(started)
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self._reply(415, {"error": "send JSON"}, started)
        try:
            payload = json.loads(body)
            submission = parse_submission(payload)
        except (ValueError, BadSubmission) as error:
            # BadSubmission messages are our own short texts; JSON errors are not echoed.
            message = str(error) if isinstance(error, BadSubmission) else "invalid JSON"
            return self._reply(400, {"error": message}, started)
        install = install_code(submission.install_id, self.app.settings.hash_secret)
        if not self.app.submissions_per_install.allow(install):
            return self._too_many(started)
        try:
            answer = self.app.service.submit(submission, install, network)
        except BadSubmission as error:
            return self._reply(400, {"error": str(error)}, started)
        return self._reply(200, answer, started)

    def do_PUT(self):
        self._reply(405, {"error": "method not allowed"}, time.monotonic())

    do_DELETE = do_PATCH = do_OPTIONS = do_HEAD = do_PUT

    # --- helpers -------------------------------------------------------------

    @property
    def app(self):
        return self.server.app

    def _network(self):
        address = self.client_address[0]
        # Only believe nginx's header when the connection really comes from
        # nginx on this machine; anyone else could fake it.
        forwarded = self.headers.get("X-Real-IP", "").strip()
        if self.app.settings.trust_proxy_header and forwarded and ipaddress.ip_address(address).is_loopback:
            address = forwarded
        try:
            return network_code(address, self.app.settings.hash_secret)
        except ValueError:
            return network_code("0.0.0.0", self.app.settings.hash_secret)

    def _too_many(self, started):
        return self._reply(429, {"error": "too many requests"}, started, {"Retry-After": "600"})

    def _reply(self, status, body, started, extra_headers=None):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)
        # Log the route and result only: never the query, body or address.
        log.info("%s %s %d %.0fms", self.command, urlsplit(self.path).path.rsplit("/", 1)[0] or "/",
                 status, (time.monotonic() - started) * 1000)

    def log_request(self, code="-", size="-"):
        pass  # Replaced by the line in _reply, which leaves out personal details.

    def log_error(self, format, *args):
        log.warning("http error: " + format, *args)


def make_server(app):
    server = ThreadingHTTPServer((app.settings.host, app.settings.port), ShieldHandler)
    server.daemon_threads = True
    server.app = app
    return server
