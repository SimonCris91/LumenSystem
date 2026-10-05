import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import Store
import codex_controller


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=r'D:\CodexTools')
        self.root = Path(self.temp.name)
        self.previous_projects = codex_controller.PROJECTS
        codex_controller.PROJECTS = [('probe', 'Probe', str(self.root))]
        self.c = codex_controller.CodexController(Store(self.root / 'test.sqlite3'))
        self.c.current = 'run-test'
        with self.c.store.connect() as db:
            db.execute("INSERT INTO codex_runs(id,project_id,objective,status,mode,thread_id,turn_id) VALUES('run-test','probe','test','inProgress','edit','thread-test','turn-test')")
        self.sent = []
        self.c._send = self.sent.append
        self.params = {'threadId': 'thread-test', 'turnId': 'turn-test', 'itemId': 'item-test'}
        self.c.items['item-test'] = {'changes': [{'path': str(self.root / 'README.md'), 'diff': '-before\n+after'}]}

    def tearDown(self):
        codex_controller.PROJECTS = self.previous_projects
        self.temp.cleanup()

    def request(self):
        self.c._server_request({'id': 77, 'method': 'item/fileChange/requestApproval', 'params': self.params})

    def test_pending_then_accept_and_replay_rejected(self):
        self.request()
        self.assertFalse(self.sent)
        token = next(iter(self.c.approvals))
        self.c.decide({'approval_id': token, 'decision': 'accept'})
        self.assertEqual(self.sent[-1], {'id': 77, 'result': {'decision': 'accept'}})
        with self.assertRaises(ValueError):
            self.c.decide({'approval_id': token, 'decision': 'accept'})

    def test_decline(self):
        self.request()
        self.c.decide({'approval_id': next(iter(self.c.approvals)), 'decision': 'decline'})
        self.assertEqual(self.sent[-1]['result']['decision'], 'decline')

    def test_changed_diff_requires_new_review(self):
        self.request()
        token = next(iter(self.c.approvals))
        self.c.items['item-test']['changes'][0]['diff'] = '-before\n+unreviewed'
        with self.assertRaises(ValueError):
            self.c.decide({'approval_id': token, 'decision': 'accept'})
        self.assertFalse(self.sent)

    def test_external_path_and_secrets_denied(self):
        for path in [self.root.parent / 'outside.md', self.root / '.env', self.root / 'data' / 'rows.json']:
            self.c.items['item-test']['changes'][0]['path'] = str(path)
            self.assertFalse(self.c._file_request_allowed(self.params))

    def test_stale_turn_and_analysis_denied(self):
        self.assertFalse(self.c._file_request_allowed(dict(self.params, turnId='other-turn')))
        with self.c.store.connect() as db:
            db.execute("UPDATE codex_runs SET mode='analysis'")
        self.request()
        self.assertFalse(self.c.approvals)
        self.assertEqual(self.sent[-1]['result']['decision'], 'decline')

    def test_escalated_command_denied(self):
        self.c._server_request({'id': 99, 'method': 'item/commandExecution/requestApproval', 'params': self.params})
        self.assertFalse(self.c.approvals)
        self.assertEqual(self.sent[-1]['result']['decision'], 'decline')

    def test_resume_cannot_cross_projects(self):
        with self.assertRaises(ValueError):
            self.c.start({'project_id': 'other', 'objective': 'test', 'resume_run_id': 'run-test'})


if __name__ == '__main__':
    unittest.main()
