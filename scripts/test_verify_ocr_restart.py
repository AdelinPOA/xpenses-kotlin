"""Safety regressions: no real Docker commands or business requests are made."""
import argparse
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).with_name("verify-ocr-restart.py")
spec = importlib.util.spec_from_file_location("rehearsal", SCRIPT)
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot load rehearsal module")
rehearsal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rehearsal)


class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env = pathlib.Path(self.directory.name) / "fixture.env"
        self.env.write_text("SPRING_PROFILES_ACTIVE=ci\nCI_TEST_TECHNICIAN_USERNAME=repair-test\nCI_TEST_TECHNICIAN_PASSWORD=synthetic-password\n")
        self.args = argparse.Namespace(env_file=str(self.env), container_prefix="xpenses-repair",
            backend_url="http://127.0.0.1:18089", origin="http://localhost:3122",
            evidence_file=str(pathlib.Path(self.directory.name) / "evidence.json"))
        self.owner = {"id": 7, "username": "repair-test", "email": "repair-test@ci.invalid", "display_name": "CI Technician"}

    def test_destination_validation_uses_actual_host(self):
        for url in ("https://production.invalid", "http://localhost:123@outside.invalid:80",
                    "http://127.0.0.1:123@outside.invalid:80", "http://user@localhost:123",
                    "file:///etc/passwd", "http://localhost", "http://localhost:0", "http://localhost:65536",
                    "http://localhost:wrong", "http://localhost:123/api", "http://localhost:123?redirect=x",
                    "http://localhost:123#x", "http://localhost:123?", "http://localhost:123#",
                    "http://localhost:123\n", "http://localhost:123\\@outside.invalid"):
            with self.subTest(url=url), mock.patch.object(rehearsal, "Client") as client, mock.patch.object(rehearsal.subprocess, "run") as docker:
                self.args.backend_url = url
                with self.assertRaises(ValueError):
                    rehearsal.run(self.args)
                client.assert_not_called()
                docker.assert_not_called()
        for url in ("http://localhost:123", "http://127.0.0.1:8001/", "http://[::1]:8001"):
            self.assertIsNotNone(rehearsal.loopback_url(url))

    def test_local_guards_precede_any_http_or_docker(self):
        for contents in ("SPRING_PROFILES_ACTIVE=prod\n", "SPRING_PROFILES_ACTIVE=ci\n",
                         "SPRING_PROFILES_ACTIVE=ci\nCI_TEST_TECHNICIAN_USERNAME=actual-user\n",
                         "malformed-line\n"):
            self.env.write_text(contents)
            with mock.patch.object(rehearsal, "Client") as client, mock.patch.object(rehearsal.subprocess, "run") as docker:
                with self.assertRaises(ValueError):
                    rehearsal.run(self.args)
                client.assert_not_called()
                docker.assert_not_called()

    def test_identity_rejection_precedes_business_mutations(self):
        for changes in ({"username": "someone-else"}, {"email": "real@example.invalid"},
                        {"display_name": "Real User"}, {"id": 0}, {"id": True}):
            with mock.patch.object(rehearsal, "Client") as client, mock.patch.object(rehearsal.subprocess, "run") as docker:
                client.return_value.api.side_effect = [{}, {**self.owner, **changes}]
                with self.assertRaises(ValueError):
                    rehearsal.run(self.args)
                self.assertEqual([call.args[0] for call in client.return_value.api.call_args_list], ["/auth/login", "/auth/me"])
                docker.assert_not_called()

    def test_optimized_python_still_rejects_unsafe_environment(self):
        self.env.write_text("SPRING_PROFILES_ACTIVE=prod\n")
        result = subprocess.run([sys.executable, "-O", str(SCRIPT), "--env-file", str(self.env),
            "--container-prefix", "xpenses-repair", "--backend-url", self.args.backend_url,
            "--origin", self.args.origin, "--evidence-file", self.args.evidence_file], capture_output=True, text=True, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Disposable CI profile required", result.stderr)

    def test_http_redirect_is_not_followed_and_connection_is_closed(self):
        with mock.patch.object(rehearsal.http.client, "HTTPConnection") as connection:
            response = connection.return_value.getresponse.return_value
            response.status = 302
            with self.assertRaises(rehearsal.ApiError):
                rehearsal.Client(self.args.backend_url, self.args.origin).api("/auth/login", {})
            connection.assert_called_once_with("127.0.0.1", 18089, timeout=15)
            connection.return_value.close.assert_called_once()

    def test_sql_payload_is_a_psql_variable_not_interpolated_query(self):
        query = "SELECT :'payload';"
        payload = "apostrophe'; not executable SQL"
        with mock.patch.object(rehearsal.subprocess, "check_output", return_value="ok") as execute:
            self.assertEqual(rehearsal.sql("xpenses-repair-db", query, payload=payload), "ok")
            self.assertEqual(execute.call_args.kwargs["input"], query)
            self.assertIn("payload=" + payload, execute.call_args.args[0])

    def test_poll_timeout_and_eventual_success(self):
        with self.assertRaises(TimeoutError):
            rehearsal.poll(lambda: {"status": "PROCESSING"}, lambda item: item["status"] == "COMPLETED", 2, wait=lambda _: None)
        with self.assertRaises(ValueError):
            rehearsal.poll(lambda: None, bool, 0)
        fetch = mock.Mock(side_effect=[False, True])
        self.assertTrue(rehearsal.poll(fetch, bool, 2, wait=lambda _: None))

    def test_successful_rehearsal_retains_known_ids_and_restarts_backend(self):
        def api(path, body=None):
            if path == "/auth/login":
                return {}
            if path == "/auth/me":
                return self.owner
            if path == "/health":
                return {"status": "ok"}
            if path == "/expenses":
                return {"id": 101}
            if path.startswith("/ocr/jobs/"):
                job_id = int(path.rsplit("/", 1)[1])
                return {"status": "COMPLETED", "expense_id": 101 if job_id == 3 else 200 + job_id, "receipt_id": 500 + job_id}
            return {"receipts": [{"id": 501}]}
        with mock.patch.object(rehearsal, "Client") as client, mock.patch.object(rehearsal.subprocess, "run") as docker, mock.patch.object(rehearsal.subprocess, "check_output", side_effect=["1", "2", "3"]):
            client.return_value.api.side_effect = api
            rehearsal.run(self.args)
            commands = [call.args[0] for call in docker.call_args_list]
            self.assertIn(["docker", "stop", "xpenses-repair-backend"], commands)
            self.assertIn(["docker", "start", "xpenses-repair-backend"], commands)
            self.assertEqual(json.loads(pathlib.Path(self.args.evidence_file).read_text())["result"], "passed")


if __name__ == "__main__":
    unittest.main()
