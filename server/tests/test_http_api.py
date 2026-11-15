import http.client
import json
import threading
import unittest

from shield.http_api import ShieldApp, make_server, network_code
from shield.service import ShieldService
from shield.store import Store

from helpers import VIDEO, FakeDetector, FakeYouTube, payload, settings, wait_until


class HttpTests(unittest.TestCase):
    def setUp(self, **setting_changes):
        config = settings(**setting_changes)
        self.store = Store(":memory:")
        self.service = ShieldService(config, self.store, FakeYouTube(), FakeDetector())
        self.app = ShieldApp(config, self.service)
        self.server = make_server(self.app)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.store.close)
        self.addCleanup(self.service.close)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body
        all_headers = {"Content-Type": "application/json"} if data is not None else {}
        all_headers.update(headers or {})
        connection.request(method, path, body=data, headers=all_headers)
        response = connection.getresponse()
        raw = response.read()
        connection.close()
        return response.status, (json.loads(raw) if raw else None), dict(response.getheaders())

    def test_full_flow_over_http(self):
        status, body, headers = self.request("GET", f"/v1/segments/{VIDEO}")
        self.assertEqual((status, body), (200, {"status": "unknown"}))
        self.assertNotIn("Access-Control-Allow-Origin", headers)  # Websites cannot read answers.
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertNotIn("Python", headers.get("Server", ""))

        status, body, _ = self.request("POST", "/v1/transcripts", payload(), {"X-Real-IP": "203.0.113.5"})
        self.assertEqual(status, 200)
        transcript = body["transcript"]
        wait_until(lambda: self.request("GET", f"/v1/segments/{VIDEO}?transcript={transcript}")[1]["status"] == "ready")

        # A second install on a different network confirms it; now everyone sees it.
        second = payload(install="install-bbbbbbbbbbbb")
        self.request("POST", "/v1/transcripts", second, {"X-Real-IP": "198.51.100.7"})
        status, body, _ = self.request("GET", f"/v1/segments/{VIDEO}")
        self.assertEqual(body["status"], "ready")

    def test_same_network_does_not_count_twice(self):
        self.request("POST", "/v1/transcripts", payload(), {"X-Real-IP": "203.0.113.5"})
        wait_until(lambda: self.store.summary()["answers"] and self.store.summary()["answers"][0]["status"] == "done")
        self.request("POST", "/v1/transcripts", payload(install="install-bbbbbbbbbbbb"), {"X-Real-IP": "203.0.113.99"})
        self.assertEqual(self.request("GET", f"/v1/segments/{VIDEO}")[1], {"status": "unknown"})

    def test_bad_requests(self):
        cases = [
            ("GET", "/", None, {}, 404),
            ("GET", "/v1/segments/too-short", None, {}, 404),
            ("GET", f"/v1/segments/{VIDEO}/extra", None, {}, 404),
            ("GET", "/v1/segments/../../etc/passwd", None, {}, 404),
            ("GET", f"/v1/segments/{VIDEO}?transcript=xyz", None, {}, 400),
            ("POST", "/v1/elsewhere", payload(), {}, 404),
            ("POST", "/v1/transcripts", payload(), {"Content-Type": "text/plain"}, 415),
            ("POST", "/v1/transcripts", b"{not json", {}, 400),
            ("POST", "/v1/transcripts", payload(video="bad"), {}, 400),
            ("DELETE", f"/v1/segments/{VIDEO}", None, {}, 405),
        ]
        for method, path, body, headers, expected in cases:
            with self.subTest(method=method, path=path):
                self.assertEqual(self.request(method, path, body, headers)[0], expected)

    def test_oversized_body_is_refused_before_reading(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        connection.putrequest("POST", "/v1/transcripts")
        connection.putheader("Content-Type", "application/json")
        connection.putheader("Content-Length", str(50 * 1024 * 1024))
        connection.endheaders()
        self.assertEqual(connection.getresponse().status, 413)
        connection.close()

    def test_submissions_are_rate_limited_per_network(self):
        statuses = [self.request("POST", "/v1/transcripts", payload(install=f"install-{n:012d}"),
                                 {"X-Real-IP": "192.0.2.1"})[0] for n in range(31)]
        self.assertEqual(statuses[:30], [200] * 30)
        self.assertEqual(statuses[30], 429)
        # Another network is unaffected.
        self.assertEqual(self.request("POST", "/v1/transcripts", payload(), {"X-Real-IP": "192.0.3.1"})[0], 200)

    def test_submissions_are_rate_limited_per_install(self):
        statuses = [self.request("POST", "/v1/transcripts", payload(), {"X-Real-IP": f"10.{n}.0.1"})[0] for n in range(16)]
        self.assertEqual(statuses[15], 429)


class ProxyHeaderTests(HttpTests):
    """With the proxy header switched off, every request is the same network (loopback)."""

    def setUp(self):
        super().setUp(trust_proxy_header=False)

    def test_header_is_ignored_when_not_trusted(self):
        self.request("POST", "/v1/transcripts", payload(), {"X-Real-IP": "203.0.113.5"})
        wait_until(lambda: self.store.summary()["answers"] and self.store.summary()["answers"][0]["status"] == "done")
        self.request("POST", "/v1/transcripts", payload(install="install-bbbbbbbbbbbb"), {"X-Real-IP": "198.51.100.7"})
        self.assertEqual(self.request("GET", f"/v1/segments/{VIDEO}")[1], {"status": "unknown"})

    # These inherited tests depend on the header being trusted.
    test_full_flow_over_http = test_submissions_are_rate_limited_per_network = None
    test_submissions_are_rate_limited_per_install = None


class NetworkCodeTests(unittest.TestCase):
    def test_codes_group_by_network_and_hide_the_address(self):
        secret = b"s" * 32
        self.assertEqual(network_code("203.0.113.5", secret), network_code("203.0.113.200", secret))
        self.assertNotEqual(network_code("203.0.113.5", secret), network_code("203.0.114.5", secret))
        self.assertEqual(network_code("2001:db8:1::1", secret), network_code("2001:db8:1:ffff::9", secret))
        self.assertEqual(network_code("::ffff:203.0.113.5", secret), network_code("203.0.113.9", secret))
        self.assertNotIn("203", network_code("203.0.113.5", secret))
        self.assertNotEqual(network_code("203.0.113.5", secret), network_code("203.0.113.5", b"t" * 32))


if __name__ == "__main__":
    unittest.main()
