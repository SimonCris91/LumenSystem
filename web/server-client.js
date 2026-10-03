(function () {
  "use strict";

  var active = false;
  var booting = false;
  var syncInFlight = null;
  var refreshTimer = null;
  var connectionRetryTimer = null;
  var currentUser = null;
  var loginDialog = document.querySelector("#serverLoginDialog");
  var loginForm = document.querySelector("#serverLoginForm");
  var loginError = document.querySelector("#serverLoginError");
  var registrationDialog = document.querySelector("#registrationDialog");
  var registrationForm = document.querySelector("#registrationForm");
  var registrationError = document.querySelector("#registrationError");
  var adminUsersDialog = document.querySelector("#adminUsersDialog");
  var adminUsersList = document.querySelector("#adminUsersList");
  var adminUsersError = document.querySelector("#adminUsersError");
  var apiBase = String(window.LM_API_BASE || "").replace(/\/+$/, "");

  function api(path, options) {
    var request = options || {};
    request.credentials = "include";
    request.headers = Object.assign({ "Content-Type": "application/json" }, request.headers || {});
    return fetch(apiBase + "/api/v1" + path, request).then(async function (response) {
      var payload = null;
      try { payload = await response.json(); } catch (_) {}
      if (!response.ok) {
        var error = new Error(payload && payload.message || "Server non disponibile.");
        error.status = response.status;
        error.code = payload && payload.error;
        throw error;
      }
      return payload;
    });
  }

  var legacyDateCorrections = {};

  async function correctLegacyActivityDates(tasks) {
    for (var i = 0; i < tasks.length; i += 1) {
      var task = tasks[i];
      var correction = legacyDateCorrections[task.id];
      if (!correction || task.date !== correction.from) continue;
      try {
        var payload = await api("/activities/" + encodeURIComponent(task.id), {
          method: "PATCH",
          body: JSON.stringify(Object.assign({}, task, { date: correction.to }))
        });
        tasks[i] = mapTask(payload.activity);
      } catch (error) {
        console.warn("Impossibile riallineare la data dell'attività " + task.id + ".", error);
      }
    }
    return tasks;
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function setAdminButton() {
    var button = document.querySelector("#serverUsersButton");
    if (button) button.hidden = !(currentUser && currentUser.role === "admin");
  }

  function setPersistenceStatus(state, title, detail) {
    window.LMCalendar?.setPersistenceStatus(state, title, detail);
  }

  function connectedDetail() {
    try {
      if (new URL(apiBase, window.location.href).hostname.endsWith(".trycloudflare.com")) return "Dati condivisi · tunnel Cloudflare temporaneo";
    } catch (_) {}
    return "Attività condivise con il PC officina";
  }

  function stopConnectionRetry() {
    if (connectionRetryTimer) clearInterval(connectionRetryTimer);
    connectionRetryTimer = null;
  }

  function startConnectionRetry() {
    if (connectionRetryTimer) return;
    connectionRetryTimer = setInterval(function () {
      if (active || document.visibilityState !== "visible" || loginDialog?.open) return;
      bootstrap();
    }, 60000);
  }

  function mapTask(task) {
    return {
      id: task.id,
      title: task.title,
      date: task.date || "",
      place: task.place || "",
      people: Array.isArray(task.people) ? task.people : [],
      status: task.status || "in_sospeso",
      notes: task.notes || "",
      version: task.version,
      source_type: task.source_type,
      source_ref: task.source_ref
    };
  }

  function showLogin(message) {
    if (loginError) loginError.textContent = message || "Accedi al server Lumen System per continuare.";
    if (loginDialog && !loginDialog.open) loginDialog.showModal();
  }

  async function syncActivities(preserveView) {
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async function () {
      try {
        var payload = await api("/activities");
        var tasks = (payload.activities || []).map(mapTask);
        if (!tasks.length && Array.isArray(window.LMSeedActivities) && window.LMSeedActivities.length && !sessionStorage.getItem("lumen-system-seed-imported")) {
          await api("/imports/commit", { method: "POST", body: JSON.stringify({ calendar: window.LMSeedActivities, products: [], documents: [] }) });
          sessionStorage.setItem("lumen-system-seed-imported", "1");
          payload = await api("/activities");
          tasks = (payload.activities || []).map(mapTask);
        }
        tasks = await correctLegacyActivityDates(tasks);
        window.LMCalendar?.replaceActivities(tasks, Boolean(preserveView));
        setPersistenceStatus("connected", "Server collegato", connectedDetail());
        return tasks;
      } catch (error) {
        if (error.status === 401) {
          active = false;
          currentUser = null;
          setAdminButton();
          setPersistenceStatus("required", "Accesso richiesto", "Accedi per usare i dati condivisi");
          showLogin("La sessione è scaduta. Accedi di nuovo al server Lumen System.");
        } else {
          setPersistenceStatus("offline", "Server non raggiungibile", "Le modifiche potrebbero non essere condivise");
          if (active) startActivityRefresh();
        }
        throw error;
      } finally {
        syncInFlight = null;
      }
    })();
    return syncInFlight;
  }

  function startActivityRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (!active || document.visibilityState !== "visible" || document.querySelector("dialog[open]")) return;
      syncActivities(true).catch(function () {});
    }, 30000);
  }

  async function login(event) {
    event.preventDefault();
    var button = loginForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      var payload = await api("/session", { method: "POST", body: JSON.stringify({ login: loginForm.login.value.trim(), password: loginForm.password.value }) });
      currentUser = payload && payload.user ? payload.user : null;
      active = true;
      setAdminButton();
      await syncActivities();
      startActivityRefresh();
      loginForm.reset();
      if (loginDialog) loginDialog.close();
    } catch (error) {
      if (loginError) loginError.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function register(event) {
    event.preventDefault();
    var button = registrationForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    if (registrationError) registrationError.textContent = "";
    try {
      var payload = await api("/register", { method: "POST", body: JSON.stringify({
        display_name: registrationForm.display_name.value.trim(),
        login: registrationForm.login.value.trim(),
        password: registrationForm.password.value
      }) });
      registrationForm.reset();
      if (registrationDialog) registrationDialog.close();
      showLogin(payload && payload.message || "Profilo creato. Attendi l'approvazione dell'amministratore.");
    } catch (error) {
      if (registrationError) registrationError.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  }

  function renderUsers(users) {
    if (!adminUsersList) return;
    if (!users.length) {
      adminUsersList.innerHTML = '<p class="page-subtitle">Nessun profilo registrato.</p>';
      return;
    }
    adminUsersList.innerHTML = users.map(function (user) {
      var status = user.status === "pending" ? "In attesa" : user.status === "approved" ? "Approvato" : "Rifiutato";
      var actions = user.status === "pending" ? '<button class="button button-primary" type="button" data-admin-user-action="approve" data-user-id="' + esc(user.id) + '">Approva</button><button class="button button-quiet" type="button" data-admin-user-action="reject" data-user-id="' + esc(user.id) + '">Rifiuta</button>' : '';
      return '<div class="admin-user-row"><div class="admin-user-copy"><strong>' + esc(user.display_name) + '</strong><small>@' + esc(user.login) + ' · ' + esc(status) + ' · ' + esc(user.role) + '</small></div><div class="admin-user-actions">' + actions + '</div></div>';
    }).join("");
  }

  async function loadUsers() {
    if (adminUsersError) adminUsersError.textContent = "";
    if (adminUsersList) adminUsersList.innerHTML = '<p class="page-subtitle">Caricamento…</p>';
    try {
      var payload = await api("/admin/users");
      renderUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (error) {
      if (adminUsersError) adminUsersError.textContent = error.message;
    }
  }

  async function updateUserStatus(userId, status) {
    try {
      await api("/admin/users/" + encodeURIComponent(userId), { method: "PATCH", body: JSON.stringify({ status: status }) });
      await loadUsers();
    } catch (error) {
      if (adminUsersError) adminUsersError.textContent = error.message;
    }
  }

  async function bootstrap() {
    if (booting) return;
    booting = true;
    try {
      var response = await fetch(apiBase + "/api/v1/me", { credentials: "include", cache: "no-store" });
      if (response.status === 404) {
        stopConnectionRetry();
        setPersistenceStatus("local", "Archivio locale", "Le modifiche restano su questo dispositivo");
        return;
      }
      if (response.status === 401) {
        stopConnectionRetry();
        active = false;
        currentUser = null;
        setAdminButton();
        setPersistenceStatus("required", "Accesso richiesto", "Accedi per usare i dati condivisi");
        showLogin();
        return;
      }
      if (!response.ok) {
        setPersistenceStatus("offline", "Server non raggiungibile", "Stai visualizzando la copia locale");
        startConnectionRetry();
        return;
      }
      var me = await response.json();
      if (!me || typeof me !== "object") return;
      stopConnectionRetry();
      active = Boolean(me.authenticated);
      currentUser = me.user || null;
      setAdminButton();
      if (active) {
        await syncActivities();
        startActivityRefresh();
      } else {
        setPersistenceStatus("required", "Accesso richiesto", "Accedi per usare i dati condivisi");
        showLogin();
      }
    } catch (error) {
      if (error.status !== 401 && !active) {
        currentUser = null;
        setAdminButton();
        startConnectionRetry();
      }
      if (error.status !== 401) setPersistenceStatus("offline", "Server non raggiungibile", active ? "Attività caricate; nuovo tentativo automatico" : "Stai visualizzando la copia locale");
    } finally {
      booting = false;
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (active && document.visibilityState === "visible") syncActivities(true).catch(function () {});
  });
  window.addEventListener("online", function () {
    if (active) syncActivities(true).catch(function () {});
  });

  window.LMServer = {
    isActive: function () { return active; },
    request: api,
    logout: async function () {
      await api("/session", { method: "DELETE" });
      active = false;
      stopConnectionRetry();
      currentUser = null;
      setAdminButton();
      setPersistenceStatus("local", "Sessione chiusa", "Le modifiche restano su questo dispositivo");
    },
    persistActivity: async function (task, original) {
      var path = original ? "/activities/" + encodeURIComponent(task.id) : "/activities";
      var method = original ? "PATCH" : "POST";
      var body = Object.assign({}, task);
      if (original && original.version) body.version = original.version;
      var payload = await api(path, { method: method, body: JSON.stringify(body) });
      return mapTask(payload.activity);
    },
    deleteActivity: async function (id) {
      await api("/activities/" + encodeURIComponent(id), { method: "DELETE" });
    }
  };

  document.addEventListener("click", function (event) {
    var target = event.target.closest("[data-action]");
    if (target && target.dataset.action === "open-register") {
      if (loginDialog && loginDialog.open) loginDialog.close();
      if (registrationError) registrationError.textContent = "";
      if (registrationDialog && !registrationDialog.open) registrationDialog.showModal();
    } else if (target && target.dataset.action === "close-register") {
      if (registrationDialog && registrationDialog.open) registrationDialog.close();
      showLogin();
    } else if (target && target.dataset.action === "open-users") {
      if (adminUsersDialog && !adminUsersDialog.open) adminUsersDialog.showModal();
      loadUsers();
    } else if (target && target.dataset.action === "close-users") {
      if (adminUsersDialog && adminUsersDialog.open) adminUsersDialog.close();
    }
    var userAction = event.target.closest("[data-admin-user-action]");
    if (userAction) updateUserStatus(userAction.dataset.userId, userAction.dataset.adminUserAction === "approve" ? "approved" : "rejected");
  });

  if (loginForm) loginForm.addEventListener("submit", login);
  if (registrationForm) registrationForm.addEventListener("submit", register);
  bootstrap();
})();
