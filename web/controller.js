(function () {
  'use strict';
  var current = { projects: [], runs: [], connected: false };
  var timer;
  var resumeRun = '';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var api = function (path, body) { return window.LMServer.request('/controller/' + path, body === undefined ? {} : {method:'POST',body:JSON.stringify(body)}); };
  window.renderControllerPage = function () {
    return '<section><div class="page-heading"><div><span class="eyebrow">CONTROLLER CODEX</span><h1>Centro di controllo progetti</h1><p class="page-subtitle">Avvia lavori, controlla le modifiche e consulta i risultati. Accesso amministratore.</p></div></div><p id="controllerStatus" role="status">Caricamento…</p><div class="shopping-layout"><article class="shopping-panel"><h2>Nuovo lavoro</h2><form id="controllerForm" class="shopping-form"><label for="controllerProject">Progetto</label><select id="controllerProject" class="text-input"></select><label for="controllerMode">Modalità</label><select id="controllerMode" class="text-input"><option value="analysis">Analisi in sola lettura</option><option value="edit">Modifiche file con approvazione</option></select><p id="controllerResume" role="status"></p><label for="controllerObjective">Obiettivo</label><textarea id="controllerObjective" class="text-input" maxlength="4000" required placeholder="Descrivi il risultato desiderato."></textarea><button class="button button-primary" type="submit">Avvia lavoro Codex</button></form><button class="button button-quiet" data-controller="connect">Verifica connessione</button><button class="button button-quiet" data-controller="interrupt">Interrompi lavoro</button><p class="shopping-help">Le modifiche proposte richiedono il tuo consenso sul diff. Comandi con elevazione, file esterni e dati riservati vengono rifiutati.</p></article><article class="shopping-panel"><h2>Approvazioni</h2><div id="controllerApprovals"></div><h2>Lavori ed eventi reali</h2><div id="controllerRuns"></div></article></div></section>';
  };
  function renderStatus() {
    var status = document.querySelector('#controllerStatus');
    if (!status) return;
    status.textContent = current.connected ? 'Codex App Server connesso' + (current.active_run ? ' · lavoro in corso' : ' · pronto') : 'Codex App Server da collegare';
    document.querySelector('#controllerApprovals').innerHTML = (current.approvals || []).map(function(a) {
      return '<article class="shopping-source"><strong>Modifiche in attesa di approvazione</strong><small>Thread '+esc(a.thread_id)+'</small>'+a.changes.map(function(c){return '<p>'+esc(c.path)+'</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(c.diff)+'</pre>';}).join('')+'<button class="button button-primary" data-controller="decide" data-approval="'+esc(a.id)+'" data-decision="accept">Approva questa modifica</button><button class="button button-quiet" data-controller="decide" data-approval="'+esc(a.id)+'" data-decision="decline">Rifiuta</button></article>';
    }).join('') || '<p>Nessuna approvazione in attesa.</p>';
    var select = document.querySelector('#controllerProject');
    if (!select.options.length) select.innerHTML = current.projects.map(function(p) {return '<option value="'+esc(p.id)+'" '+(p.available?'':'disabled')+'>'+esc(p.name)+(p.available?'':' · checkout da configurare')+'</option>';}).join('');
    document.querySelector('#controllerRuns').innerHTML = current.runs.map(function (run) {
      var events; try { events = JSON.parse(run.events_json); } catch (_) { events = []; }
      var text = events.filter(function(e){return e.type === 'message';}).map(function(e){return e.text;}).join('');
      var completeMessages = events.filter(function(e){return e.type === 'item/completed' && e.item_type === 'agentMessage' && e.text;});
      if (completeMessages.length) text = completeMessages.map(function(e){return e.text;}).join('\n\n');
      var approvals = events.filter(function(e){return e.type === 'approval';});
      var errors = events.filter(function(e){return e.type === 'completed' && e.error;});
      var decisions = events.filter(function(e){return e.type === 'approval_decision';});
      var diffs = events.filter(function(e){return e.type === 'diff';});
      return '<article class="shopping-source"><strong>'+esc(run.project_id)+' · '+esc(run.status)+'</strong><p>'+esc(run.objective)+'</p><small>Thread '+esc(run.thread_id)+'</small><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(text)+'</pre>'+approvals.map(function(e){var decision=decisions.find(function(d){return d.approval_id === e.approval_id;});return '<details><summary>Richiesta reale · '+esc(decision ? decision.decision : e.decision === 'pending' ? 'in attesa o scaduta' : e.decision)+'</summary><pre style="white-space:pre-wrap">'+esc(JSON.stringify(e.details,null,2))+'</pre></details>';}).join('')+(diffs.length?'<details><summary>Diff del lavoro</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(diffs[diffs.length-1].text)+'</pre></details>':'')+errors.map(function(e){return '<p>'+esc(JSON.stringify(e.error))+'</p>';}).join('')+(!current.active_run && run.thread_id?'<button class="button button-quiet" data-controller="resume" data-run="'+esc(run.id)+'">Continua questo thread</button>':'')+'</article>';
    }).join('') || '<p>Nessun lavoro avviato.</p>';
  }
  async function load() {
    if (!document.querySelector('#controllerStatus')) {clearTimeout(timer);return;}
    try { current = await api('status'); renderStatus(); } catch (e) {document.querySelector('#controllerStatus').textContent=e.message;}
    clearTimeout(timer); timer=setTimeout(load,2000);
  }
  window.loadControllerPage = load;
  document.addEventListener('submit',async function(e) {
    if(e.target.id !== 'controllerForm')return;
    e.preventDefault();var button=e.target.querySelector('button');button.disabled=true;
    try {await api('start',{project_id:document.querySelector('#controllerProject').value,objective:document.querySelector('#controllerObjective').value,mode:document.querySelector('#controllerMode').value,resume_run_id:resumeRun});resumeRun='';document.querySelector('#controllerResume').textContent='';await load();}catch(err){document.querySelector('#controllerStatus').textContent=err.message;}finally{button.disabled=false;}
  });
  document.addEventListener('change',function(e){if(e.target.id==='controllerProject'){resumeRun='';document.querySelector('#controllerResume').textContent='';}});
  document.addEventListener('click',async function(e) {
    var b=e.target.closest('[data-controller]');if(!b)return;
    if(b.dataset.controller==='resume'){var run=current.runs.find(function(r){return r.id===b.dataset.run;});if(run){resumeRun=run.id;document.querySelector('#controllerProject').value=run.project_id;document.querySelector('#controllerMode').value=run.mode || 'analysis';document.querySelector('#controllerResume').textContent='Continua thread '+run.thread_id;document.querySelector('#controllerObjective').focus();}return;}
    b.disabled=true;
    try{await api(b.dataset.controller,b.dataset.controller==='decide'?{approval_id:b.dataset.approval,decision:b.dataset.decision}:{});await load();}catch(err){document.querySelector('#controllerStatus').textContent=err.message;}finally{b.disabled=false;}
  });
})();
