"""Opt-in real transport/approval probe against a dedicated D fixture."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import Store
import codex_controller

root = Path(r'D:\CodexTools\controller-probe')
codex_controller.PROJECTS = [('probe', 'Isolated controller probe', str(root))]
c = codex_controller.CodexController(Store(root / 'probe.sqlite3'))
before = root.joinpath('README.md').read_text().strip()
old = 'BEFORE' if before.endswith('BEFORE') else 'AFTER'
new = 'AFTER' if old == 'BEFORE' else 'BEFORE'
try:
    result = c.start({'project_id': 'probe', 'mode': 'edit', 'objective':
        f'Prova tecnica autorizzata: usa il tool apply_patch per modificare D:/CodexTools/controller-probe/README.md. Il contenuto verificato è esattamente "{before}". La sola sostituzione richiesta è {old} con {new}. Usa il percorso assoluto dato. Richiedi approvazione quando necessario; non fermarti alla sola descrizione testuale. Non eseguire shell.'})
    deadline = time.monotonic() + 90
    approved = False
    while time.monotonic() < deadline:
        approvals = c.status()['approvals']
        if approvals:
            assert root.joinpath('README.md').read_text().strip() == before
            print('Real file approval received; file unchanged before approval', flush=True)
            c.decide({'approval_id': approvals[0]['id'], 'decision': 'accept'})
            approved = True
        run = c.store.row('SELECT * FROM codex_runs WHERE id=?', (result['run_id'],))
        if run['status'] not in ('starting', 'inProgress'):
            print('Terminal:', run['status'], 'approved:', approved, 'fixture:', root.joinpath('README.md').read_text().strip(), flush=True)
            if not approved:
                print(run['events_json'][-6000:].encode('ascii', 'backslashreplace').decode(), flush=True)
            assert approved and run['status'] == 'completed'
            assert root.joinpath('README.md').read_text().strip() == before.replace(old, new)
            break
        time.sleep(1)
    else:
        c.interrupt()
        raise RuntimeError('Live approval probe timed out')
    resumed = c.start({'project_id': 'probe', 'mode': 'analysis', 'resume_run_id': result['run_id'],
        'objective': 'Prova ripresa thread: rispondi esclusivamente RESUME_OK, senza strumenti.'})
    assert resumed['thread_id'] == result['thread_id']
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        row = c.store.row('SELECT * FROM codex_runs WHERE id=?', (resumed['run_id'],))
        if row['status'] not in ('starting', 'inProgress'):
            assert row['status'] == 'completed' and 'RESUME_OK' in row['events_json']
            assert c.store.row('SELECT status FROM codex_runs WHERE id=?', (result['run_id'],))['status'] == 'completed'
            print('Thread resume completed; original run status preserved', flush=True)
            break
        time.sleep(1)
    else:
        c.interrupt()
        raise RuntimeError('Resume probe timed out')
finally:
    c.close()
