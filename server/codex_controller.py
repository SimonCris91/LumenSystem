"""Authenticated Lumen adapter to a persistent Codex App Server over stdio."""
import json
import os
import queue
import shutil
import subprocess
import threading
import uuid
from copy import deepcopy
from pathlib import Path

PROJECTS = [
    ("radar", "Radar AI", r"D:\Codex\LumenSystem"),
    ("shopping", "Radar Spesa Locale", r"D:\Codex\LumenSystem"),
    ("aquarius-age", "Aquarius Age", r"D:\Codex\AquariusAgeSiteWork"),
    ("aegis", "AEGIS Invest AI · Demo", r"D:\Aegis\ahhh-s-ho-capito-cosa-intendi"),
    ("account-finder", "Account Finder", r"D:\Codex\2026-08-26\ma-esiste-un-modo-per-inserendo\work\account-finder-site"),
    ("inbox", "Inbox personale", ""),
    ("nexus", "NEXUS AI", r"D:\Codex\2026-08-24\riesci-a-cearmi-un-app-per"),
    ("ai-remote", "AI Remote", r"D:\Codex\ai_remote"),
    ("signum", "Signum Aura AI", r"D:\CodexHome\.chatgpt-projects\g-p-6a6f42113ae08191ace300af6c337200\metasign_ai"),
    ("yachting", "Yachting Agent AI", r"D:\Codex\2026-08-09\referenced-chatgpt-conversation-this-is-an\work\metayachting-ai"),
    ("numeri", "Numeri Lab AI", r"D:\Super"),
    ("simoncris", "SimonCris Content", ""),
    ("lavormetal", "LavorMetal Operations", r"D:\Codex\LavorMetal\live-site-source"),
    ("personal-operations", "Personal Operations", r"D:\Codex\PersonalAI"),
    ("lumen", "Lumen System", r"D:\Codex\LumenSystem"),
]


class CodexController:
    def __init__(self, store):
        self.store = store
        self.lock = threading.RLock()
        self.connect_lock = threading.Lock()
        self.write_lock = threading.Lock()
        self.pending = {}
        self.approvals = {}
        self.items = {}
        self.sequence = 0
        self.process = None
        self.connected = False
        self.error = ""
        self.current = None
        with store.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS codex_runs (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, objective TEXT NOT NULL,
                thread_id TEXT NOT NULL DEFAULT '', turn_id TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL, events_json TEXT NOT NULL DEFAULT '[]')""")
            db.execute("UPDATE codex_runs SET status='interrupted' WHERE status IN ('starting','inProgress')")
            columns = {r[1] for r in db.execute('PRAGMA table_info(codex_runs)')}
            if 'mode' not in columns:
                db.execute("ALTER TABLE codex_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'analysis'")
            if 'parent_id' not in columns:
                db.execute("ALTER TABLE codex_runs ADD COLUMN parent_id TEXT NOT NULL DEFAULT ''")

    def projects(self):
        return [{"id": i, "name": n, "path": p, "available": bool(p and Path(p).is_dir()),
                 "reason": "" if p and Path(p).is_dir() else "Checkout D da configurare"} for i, n, p in PROJECTS]

    def _send(self, message):
        with self.write_lock:
            if not self.process or self.process.poll() is not None:
                raise ValueError("Codex App Server non connesso")
            self.process.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
            self.process.stdin.flush()

    def rpc(self, method, params=None):
        with self.lock:
            self.sequence += 1
            ident = self.sequence
            reply = queue.Queue(maxsize=1)
            self.pending[ident] = reply
        try:
            self._send({"id": ident, "method": method, "params": params or {}})
            try:
                message = reply.get(timeout=30)
            except queue.Empty:
                raise ValueError("Timeout Codex App Server") from None
            if "error" in message:
                raise ValueError("Codex ha rifiutato la richiesta: " + str(message['error'].get('message', 'errore'))[:500])
            return message.get("result", {})
        finally:
            with self.lock:
                self.pending.pop(ident, None)

    def _event(self, event):
        with self.lock:
            if not self.current:
                return
            run = self.store.row("SELECT * FROM codex_runs WHERE id=?", (self.current,))
            if not run:
                return
            events = json.loads(run['events_json'])
            events.append(event)
            with self.store.connect() as db:
                db.execute("UPDATE codex_runs SET events_json=? WHERE id=?", (json.dumps(events[-300:], ensure_ascii=False), self.current))

    def _file_request_allowed(self, params):
        run = self.store.row('SELECT * FROM codex_runs WHERE id=?', (self.current,)) if self.current else None
        if not run or run['mode'] != 'edit' or params.get('threadId') != run['thread_id']:
            return False
        if run['turn_id'] and params.get('turnId') != run['turn_id']:
            return False
        project = next((p for p in self.projects() if p['id'] == run['project_id']), None)
        if not project:
            return False
        root = Path(project['path']).resolve()
        changes = self.items.get(params.get('itemId'), {}).get('changes', [])
        if not changes:
            return False
        for change in changes:
            path = Path(change.get('path', ''))
            if not path.is_absolute() or not path.resolve().is_relative_to(root):
                return False
            resolved = path.resolve()
            parts = [part.casefold() for part in resolved.relative_to(root).parts]
            if any(part in {'.git', 'data', 'condivisa', 'node_modules'} or part.startswith('.env') for part in parts):
                return False
            if resolved.suffix.casefold() in {'.db', '.sqlite', '.sqlite3', '.token'} or not change.get('diff'):
                return False
            if len(change['diff']) > 1_000_000:
                return False
            kind = change.get('kind', {})
            if isinstance(kind, dict) and (kind.get('movePath') or kind.get('move_path')):
                return False
        grant = params.get('grantRoot')
        return not grant or Path(grant).resolve().is_relative_to(root)

    def _server_request(self, msg):
        method, params = msg['method'], msg.get('params', {})
        if method == 'item/fileChange/requestApproval' and self._file_request_allowed(params):
            token = uuid.uuid4().hex
            with self.lock:
                self.approvals[token] = {'id': token, 'rpc_id': msg['id'], 'run_id': self.current,
                    'thread_id': params['threadId'], 'turn_id': params.get('turnId'),
                    'details': deepcopy(params), 'changes': deepcopy(self.items[params['itemId']]['changes'])}
            self._event({'type': 'approval', 'approval_id': token, 'request_id': msg['id'],
                         'method': method, 'details': params, 'decision': 'pending'})
            return
        self._event({'type': 'approval', 'request_id': msg['id'], 'method': method,
                     'details': params, 'decision': 'decline'})
        if method in ('item/commandExecution/requestApproval', 'item/fileChange/requestApproval'):
            self._send({'id': msg['id'], 'result': {'decision': 'decline'}})
        else:
            self._send({'id': msg['id'], 'error': {'code': -32601, 'message': 'Unsupported server request'}})

    def decide(self, data):
        decision = data.get('decision')
        if decision not in {'accept', 'decline'}:
            raise ValueError('Decisione non valida')
        with self.lock:
            approval = self.approvals.get(str(data.get('approval_id', '')))
            if not approval or approval['run_id'] != self.current:
                raise ValueError('Approvazione scaduta o già risolta')
            if decision == 'accept' and not self._file_request_allowed(approval['details']):
                raise ValueError('Le modifiche non appartengono al checkout autorizzato')
            if decision == 'accept' and self.items.get(approval['details'].get('itemId'), {}).get('changes') != approval['changes']:
                raise ValueError('Il diff è cambiato: aggiorna il pannello prima di approvare')
            self._send({'id': approval['rpc_id'], 'result': {'decision': decision}})
            del self.approvals[approval['id']]
            self._event({'type': 'approval_decision', 'approval_id': approval['id'], 'decision': decision})
        return {'decision': decision}

    def _read(self, process):
        try:
            for line in process.stdout:
                try:
                    msg = json.loads(line)
                except ValueError:
                    continue
                if 'method' not in msg and 'id' in msg:
                    with self.lock:
                        reply = self.pending.get(msg['id'])
                    if reply:
                        reply.put(msg)
                    continue
                method, params = msg.get('method', ''), msg.get('params', {})
                if params.get('threadId') and self.current:
                    active = self.store.row('SELECT thread_id FROM codex_runs WHERE id=?', (self.current,))
                    if active and active['thread_id'] and params['threadId'] != active['thread_id']:
                        if 'id' in msg:
                            self._send({'id': msg['id'], 'error': {'code': -32600, 'message': 'Thread not managed by this controller'}})
                        continue
                if 'id' in msg:
                    self._server_request(msg)
                    continue
                if method == 'item/agentMessage/delta':
                    self._event({"type": "message", "text": str(params.get('delta', ''))[:10000]})
                elif method == 'turn/diff/updated':
                    self._event({"type": "diff", "text": str(params.get('diff', ''))[:50000]})
                elif method in ('item/started', 'item/completed'):
                    item = params.get('item', {})
                    with self.lock:
                        self.items[item.get('id')] = item
                    self._event({"type": method, "item_type": item.get('type'), "text": str(item.get('text') or item.get('command') or '')[:10000]})
                elif method == 'serverRequest/resolved':
                    with self.lock:
                        self.approvals = {k: v for k, v in self.approvals.items() if v['rpc_id'] != params.get('requestId')}
                elif method == 'turn/completed':
                    turn = params.get('turn', {})
                    with self.lock, self.store.connect() as db:
                        db.execute("UPDATE codex_runs SET status=?,turn_id=? WHERE id=?",
                                   (turn.get('status', 'failed'), turn.get('id', ''), self.current))
                    self._event({"type": "completed", "status": turn.get('status'), "error": turn.get('error')})
                    with self.lock:
                        self.current = None
                        self.approvals.clear()
                        self.items.clear()
        finally:
            if process is not self.process:
                return
            self.connected = False
            with self.lock, self.store.connect() as db:
                db.execute("UPDATE codex_runs SET status='interrupted' WHERE status IN ('starting','inProgress')")
                self.current = None
                self.approvals.clear()

    def connect(self):
        with self.connect_lock:
            return self._connect()

    def _connect(self):
        with self.lock:
            if self.connected and self.process and self.process.poll() is None:
                return self.status()
            binary = os.environ.get('CODEX_BINARY') or shutil.which('codex')
            if not binary:
                candidates = list((Path(os.environ.get('LOCALAPPDATA', '')) / 'OpenAI/Codex/bin').glob('*/codex.exe'))
                binary = str(candidates[0]) if candidates else ''
            if not binary or not Path(binary).is_file():
                raise ValueError("Binario Codex non trovato: configura CODEX_BINARY sul server")
            self.process = subprocess.Popen([binary, 'app-server', '--listen', 'stdio://'],
                cwd=str(Path(__file__).resolve().parent.parent), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, text=True, encoding='utf-8', creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            threading.Thread(target=self._read, args=(self.process,), daemon=True).start()
        try:
            self.rpc('initialize', {"clientInfo": {"name": "lumen_personal_controller", "title": "Lumen Personal Controller", "version": "0.1.0"}})
            self._send({"method": "initialized", "params": {}})
            self.rpc('thread/list', {"limit": 1})
            self.connected = True
            self.error = ''
        except Exception:
            self.close()
            raise
        return self.status()

    def status(self):
        with self.lock:
            return {"connected": self.connected, "mode": "readOnly", "active_run": self.current, "approvals": deepcopy(list(self.approvals.values())),
                    "projects": self.projects(), "runs": self.store.rows("SELECT * FROM codex_runs ORDER BY rowid DESC LIMIT 20")}

    def start(self, data):
        project = next((p for p in self.projects() if p['id'] == data.get('project_id')), None)
        objective = str(data.get('objective', '')).strip()
        mode = data.get('mode', 'analysis')
        if mode not in {'analysis', 'edit'}:
            raise ValueError('Modalità non valida')
        previous = None
        if data.get('resume_run_id'):
            previous = self.store.row('SELECT * FROM codex_runs WHERE id=?', (str(data['resume_run_id']),))
            if not previous or previous['project_id'] != data.get('project_id') or not previous['thread_id']:
                raise ValueError('Il thread salvato non appartiene al progetto selezionato')
        if not project or not project['available']:
            raise ValueError('Checkout D non disponibile per il progetto')
        if not objective or len(objective) > 4000:
            raise ValueError('Inserisci un obiettivo fino a 4000 caratteri')
        self.connect()
        with self.lock:
            if self.current:
                raise ValueError('Un lavoro è già in corso: attendi o interrompilo')
            ident = 'run-' + uuid.uuid4().hex
            self.current = ident
            with self.store.connect() as db:
                db.execute("INSERT INTO codex_runs(id,project_id,objective,status,mode,parent_id) VALUES(?,?,?,'starting',?,?)", (ident, project['id'], objective, mode, previous['id'] if previous else ''))
        try:
            params = {"cwd": project['path'], "approvalPolicy": "on-request", "sandbox": "read-only"}
            if previous:
                params['threadId'] = previous['thread_id']
            thread = self.rpc('thread/resume' if previous else 'thread/start', params)['thread']
            with self.store.connect() as db:
                db.execute('UPDATE codex_runs SET thread_id=? WHERE id=?', (thread['id'], ident))
            instructions = ('Modalità analisi: non modificare file. ' if mode == 'analysis' else
                'Modalità modifiche con approvazione: usa apply_patch per proporre ogni modifica. Attendi approvazione del client. Non usare shell per scrivere file. ')
            prompt = instructions + 'Lavora solo nel checkout indicato. Non leggere segreti, .env o documenti personali. Non modificare servizi, domini, email o account. AEGIS resta Demo-only. Obiettivo: ' + objective
            turn = self.rpc('turn/start', {"threadId": thread['id'], "input": [{"type": "text", "text": prompt}]})['turn']
            with self.store.connect() as db:
                db.execute("UPDATE codex_runs SET turn_id=?,status=? WHERE id=? AND status='starting'", (turn['id'], turn['status'], ident))
            return {"run_id": ident, "thread_id": thread['id']}
        except Exception:
            with self.lock, self.store.connect() as db:
                db.execute("UPDATE codex_runs SET status='failed' WHERE id=?", (ident,))
                self.current = None
            raise

    def interrupt(self):
        with self.lock:
            run = self.store.row('SELECT * FROM codex_runs WHERE id=?', (self.current,)) if self.current else None
        if run and run['turn_id']:
            self.rpc('turn/interrupt', {"threadId": run['thread_id'], "turnId": run['turn_id']})
        return {"requested": bool(run)}

    def close(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
        self.connected = False
