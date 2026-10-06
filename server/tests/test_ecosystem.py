import http.client
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import ApiServer, Store
from ecosystem import build_status, list_modules


class EcosystemRegistryTests(unittest.TestCase):
    def test_registry_shape_and_unique_ids(self):
        modules = list_modules()
        self.assertGreaterEqual(len(modules), 15)
        required = {
            "id", "name", "kind", "state", "description", "owner",
            "capabilities", "integration_mode", "access_mode", "connection_state",
        }
        self.assertEqual(len({module["id"] for module in modules}), len(modules))
        for module in modules:
            self.assertTrue(required.issubset(module))
            self.assertIsInstance(module["capabilities"], list)

    def test_registry_has_no_sensitive_fields(self):
        payload = json.dumps(list_modules()).casefold()
        for forbidden in ("password", "access_token", "api_token", "app_secret", "private_key"):
            self.assertNotIn(forbidden, payload)

    def test_status_reports_database_and_does_not_probe_external_apps(self):
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / "lumen.sqlite3")
            payload = build_status(
                store,
                timestamp="2026-10-06T18:00:00Z",
                runtime={"radar": True, "shopping": True},
            )
        self.assertEqual(payload["status"], "ok")
        self.assertTrue(payload["database"]["available"])
        states = {item["id"]: item["connection_state"] for item in payload["modules"]}
        self.assertEqual(states["lumen"], "connected")
        self.assertEqual(states["radar"], "connected")
        self.assertEqual(states["shopping"], "connected")
        self.assertEqual(states["aegis"], "external")
        self.assertIn(states["ai-remote"], {"not_configured", "not_connected"})


class EcosystemEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.server = ApiServer(
            ("127.0.0.1", 0),
            Store(root / "lumen.sqlite3"),
            {
                "token": "test-bootstrap-token",
                "allowed_origin": "http://127.0.0.1",
                "web_root": str(root),
                "shared_root": str(root / "shared"),
                "sketchup_source_dir": "",
                "sketchup_mac_dir": "",
                "sketchup_agent_token": "",
                "documents_windows_dir": "",
                "wa_waba_id": "",
                "wa_business_id": "",
                "wa_app_id": "",
                "wa_verify_token": "",
                "wa_app_secret": "",
                "wa_access_token": "",
                "wa_phone_number_id": "",
                "wa_graph_version": "v23.0",
            },
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.codex_controller.close()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp.cleanup()

    def request(self, path, authenticated=False):
        headers = {}
        if authenticated:
            headers["Authorization"] = "Bearer test-bootstrap-token"
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        connection.request("GET", path, headers=headers)
        response = connection.getresponse()
        body = response.read()
        connection.close()
        return response.status, json.loads(body.decode("utf-8"))

    def test_modules_requires_authentication(self):
        status, payload = self.request("/api/v1/ecosystem/modules")
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "unauthorized")

    def test_modules_endpoint(self):
        status, payload = self.request("/api/v1/ecosystem/modules", authenticated=True)
        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(payload["modules"]), 15)

    def test_status_endpoint(self):
        status, payload = self.request("/api/v1/ecosystem/status", authenticated=True)
        self.assertEqual(status, 200)
        self.assertEqual(payload["service"], "lumen-system-api")
        self.assertTrue(payload["database"]["available"])


if __name__ == "__main__":
    unittest.main()
