import http.client
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import ApiServer, Store


class AiRemoteReadOnlyEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.server = ApiServer(
            ("127.0.0.1", 0),
            Store(root / "lumen.sqlite3"),
            {
                "token": "test-bootstrap-token",
                "ai_remote_read_token": "test-ai-remote-read-token",
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

    def request(self, path, *, token="", method="GET", payload=None):
        headers = {}
        body = None
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload)
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        result = response.status, json.loads(response.read().decode("utf-8"))
        connection.close()
        return result

    def test_scoped_token_reads_bounded_activity_fields_only(self):
        status, _ = self.request(
            "/api/v1/activities",
            token="test-bootstrap-token",
            method="POST",
            payload={
                "title": "Verifica magazzino",
                "date": "2026-10-12",
                "place": "Olbia",
                "status": "programmata",
                "notes": "Controllare materiale.",
                "people": [],
            },
        )
        self.assertEqual(status, 201)

        status, payload = self.request(
            "/api/v1/integrations/ai-remote/activities?from=2026-10-10&to=2026-11-09",
            token="test-ai-remote-read-token",
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload["from"], "2026-10-10")
        self.assertEqual(len(payload["activities"]), 1)
        self.assertEqual(payload["activities"][0]["title"], "Verifica magazzino")
        self.assertEqual(
            set(payload["activities"][0]),
            {"id", "title", "date", "place", "people", "status", "notes"},
        )

    def test_scoped_token_cannot_read_general_api_or_write(self):
        status, payload = self.request(
            "/api/v1/activities",
            token="test-ai-remote-read-token",
        )
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "unauthorized")

        status, payload = self.request(
            "/api/v1/activities",
            token="test-ai-remote-read-token",
            method="POST",
            payload={"title": "Non deve essere creata"},
        )
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "unauthorized")

    def test_rejects_missing_or_oversized_date_range(self):
        status, payload = self.request(
            "/api/v1/integrations/ai-remote/activities?from=2026-10-10&to=2026-11-10",
            token="test-ai-remote-read-token",
        )
        self.assertEqual(status, 400)
        self.assertEqual(payload["error"], "invalid_date_range")

    def test_dedicated_route_rejects_wrong_token(self):
        status, payload = self.request(
            "/api/v1/integrations/ai-remote/activities?from=2026-10-10&to=2026-11-09",
            token="wrong-token",
        )
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"], "ai_remote_unauthorized")


if __name__ == "__main__":
    unittest.main()
