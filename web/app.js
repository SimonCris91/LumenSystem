const PEOPLE = [];
const STORAGE_KEY = "lumen-system-calendario-operativo-v1";
const SEED_VERSION_KEY = "lumen-system-calendario-seed-version";
const SEED_VERSION = "5";
const DATE_CORRECTIONS = {};
const THEME_STORAGE_KEY = "lumen-system-calendario-theme-v1";
const INITIAL_ACTIVITIES = [];
const HISTORICAL_ACTIVITIES = [];

INITIAL_ACTIVITIES.push(...HISTORICAL_ACTIVITIES);

const STATUS_LABELS = { programmata: "Programmata", in_corso: "In corso", completata: "Completata", in_sospeso: "In sospeso" };
const MONTHS = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });
const LONG_DATE = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const SHORT_DATE = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
const FULL_DATE = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });
const dateAtMidnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const toISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const fromISO = (value) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
const today = dateAtMidnight(new Date());
const latestInitialDate = INITIAL_ACTIVITIES.filter((task) => task.date).map((task) => task.date).sort().at(-1);
const initialSelectedDate = latestInitialDate || toISO(today);
const initialView = window.matchMedia("(max-width: 650px)").matches ? "week" : "month";
const state = { page: "calendar", view: initialView, selectedDate: initialSelectedDate, anchor: fromISO(initialSelectedDate), person: "", query: "" };

const CORRECTED_SEED_IDS = new Set(["lm-2209-motore", "lm-pend-donnine", "lm-pend-piscina", "lm-pend-cover", "lm-pend-motore", "lm-pend-scale"]);
const V3_BACKLOG_BEFORE_2409 = {};
const copySeedTask = (task) => ({ ...task, people: [...task.people] });
const correctKnownDate = (task) => {
  const correction = DATE_CORRECTIONS[task.id];
  return correction && task.date === correction.from ? { ...task, date: correction.to } : task;
};
const matchesSeedTask = (task, seed) =>
  ["id", "title", "date", "place", "status", "notes"].every((field) => task[field] === seed[field]) &&
  Array.isArray(task.people) && task.people.length === seed.people.length &&
  task.people.every((name, index) => name === seed.people[index]);

function readActivities() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const savedSeedVersion = localStorage.getItem(SEED_VERSION_KEY);
        if (savedSeedVersion !== SEED_VERSION) {
          const seedById = new Map(INITIAL_ACTIVITIES.map((task) => [task.id, task]));
          const knownIds = new Set(parsed.map((task) => task.id));
          const merged = parsed.map((task) => {
            const seed = seedById.get(task.id);
            if (!seed) return task;
            if (savedSeedVersion !== "3" && CORRECTED_SEED_IDS.has(task.id)) return copySeedTask(seed);
            if (V3_BACKLOG_BEFORE_2409[task.id] && matchesSeedTask(task, V3_BACKLOG_BEFORE_2409[task.id])) return copySeedTask(seed);
            return correctKnownDate(task);
          });
          const additions = savedSeedVersion === "3"
            ? INITIAL_ACTIVITIES.filter((task) => task.id.startsWith("lm-2409-") || task.id === "lm-pend-lamiera-2409")
            : INITIAL_ACTIVITIES;
          additions.forEach((task) => { if (!knownIds.has(task.id)) merged.push(copySeedTask(task)); });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
          return merged;
        }
        return parsed;
      }
    }
  } catch (error) { console.warn("Impossibile leggere i dati salvati.", error); }
  try { localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION); }
  catch (error) { console.warn("Impossibile registrare la versione dei dati iniziali.", error); }
  return INITIAL_ACTIVITIES.map(copySeedTask);
}

let activities = readActivities();
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const initials = (name) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const statusClass = (status) => `status-${status || "in_sospeso"}`;
const taskStatus = (task) => `<span class="status-pill ${statusClass(task.status)}">${esc(STATUS_LABELS[task.status] || "In sospeso")}</span>`;
const personAvatars = (people = []) => people.length ? `<div class="person-stack" aria-label="${esc(people.join(", "))}">${people.map((name) => `<span class="person-avatar" data-name="${esc(name)}" title="${esc(name)}">${esc(initials(name))}</span>`).join("")}</div>` : `<span class="agenda-people">Responsabile da assegnare</span>`;

function saveActivities() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(activities)); }
  catch (error) { console.warn("Impossibile salvare le modifiche in questo browser.", error); }
  render();
}

function filteredTasks(list) {
  const query = state.query.trim().toLocaleLowerCase("it");
  return list.filter((task) => {
    const matchesPerson = !state.person || task.people.includes(state.person);
    const haystack = `${task.title} ${task.place} ${task.notes} ${task.people.join(" ")}`.toLocaleLowerCase("it");
    return matchesPerson && (!query || haystack.includes(query));
  });
}

function renderSidebar() {
  const backlog = activities.filter((task) => !task.date).length;
  const backlogOption = $("#backlogOption");
  if (backlogOption) backlogOption.textContent = backlog ? `Da programmare (${backlog})` : "Da programmare";
  $("#sidebarTeam").innerHTML = PEOPLE.map((name) => `<button class="team-person ${state.person === name ? "selected" : ""}" data-action="person-filter" data-person="${esc(name)}"><span class="team-avatar">${esc(initials(name))}</span><span class="person-name">${esc(name)}</span></button>`).join("");
  const navigation = $("#primaryNavigation");
  if (navigation) navigation.value = state.page;
  document.querySelectorAll(".nav-files-cta").forEach((button) => button.classList.toggle("is-active", state.page === "files" && button.dataset.folder === window.LMFilesFolder?.()));
}

function setPersistenceStatus(stateName, title, detail) {
  const dot = $("#saveDot");
  const titleNode = $("#saveStatusTitle");
  const detailNode = $("#saveStatusDetail");
  if (dot) dot.dataset.state = stateName;
  if (titleNode) titleNode.textContent = title;
  if (detailNode) detailNode.textContent = detail;
}

function render() {
  renderSidebar();
  $("#todayLabel").textContent = LONG_DATE.format(today);
  const content = $("#appContent");
  if (state.page === "backlog") content.innerHTML = renderBacklogPage();
  else if (state.page === "team") content.innerHTML = renderTeamPage();
  else if (state.page === "warehouse") content.innerHTML = renderWarehousePage();
  else if (state.page === "vehicles") content.innerHTML = window.renderVehiclesPage?.() || "";
  else if (state.page === "files") content.innerHTML = window.renderFilesPage?.() || "";
  else if (state.page === "ecosystem") content.innerHTML = window.renderModulesPage?.() || "";
  else content.innerHTML = renderCalendarPage();
  $("#addTaskButton").classList.toggle("hidden", state.page !== "calendar");
  bindToolbarInputs();
}

function pageHeading(kicker, title, subtitle, note = "") {
  return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div>${note ? `<div class="heading-note">${note}</div>` : ""}</div>`;
}

function statsMarkup() {
  const dateLabel = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" }).format(fromISO(state.selectedDate));
  const datedCount = activities.filter((task) => task.date === state.selectedDate).length;
  const backlog = activities.filter((task) => !task.date).length;
  return '<div class="stats-row">' +
    '<div class="stat-card"><div><div class="stat-label">Attività del ' + esc(dateLabel) + '</div><div class="stat-value">' + datedCount + '</div></div><span class="stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></span></div>' +
    '<div class="stat-card"><div><div class="stat-label">Attività da programmare</div><div class="stat-value">' + backlog + '</div></div><span class="stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5l3 2M20 12a8 8 0 1 1-2.34-5.66"/></svg></span></div>' +
    '<div class="stat-card"><div><div class="stat-label">Persone</div><div class="stat-value">' + PEOPLE.length + '</div></div><span class="stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19zM16 5.3a3 3 0 0 1 0 5.8m1.2 2.1a4.6 4.6 0 0 1 3.3 4.4V19h-3"/></svg></span></div>' +
  '</div>';
}

function monthTitle() {
  if (state.view === "month") return MONTHS.format(state.anchor);
  if (state.view === "day") return LONG_DATE.format(fromISO(state.selectedDate));
  const start = startOfWeek(state.anchor);
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) return `${start.getDate()} – ${end.getDate()} ${new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(end)}`;
  return `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)} ${end.getFullYear()}`;
}

function startOfWeek(date) {
  const result = dateAtMidnight(date);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}
function addDays(date, amount) { const result = new Date(date); result.setDate(result.getDate() + amount); return result; }

function renderCalendarPage() {
  const selected = fromISO(state.selectedDate);
  const allDated = activities.filter((task) => task.date);
  const visibleDated = filteredTasks(allDated);
  const undated = filteredTasks(activities.filter((task) => !task.date));
  const viewMarkup = state.view === "month" ? renderMonthView(visibleDated) : state.view === "week" ? renderWeekView(visibleDated) : renderDayView(visibleDated);
  return `${pageHeading("AGENDA PERSONALE", "Lumen System", "Attività, scadenze e informazioni importanti in un unico spazio.", `Oggi · <strong>${esc(SHORT_DATE.format(today))}</strong>`)}
    ${statsMarkup()}
    <section class="calendar-layout" aria-label="Calendario e attività in sospeso">
      <div class="calendar-main">
        <div class="calendar-toolbar">
          <div class="toolbar-date"><div class="month-controls"><button class="icon-button" data-action="previous" aria-label="Periodo precedente">‹</button><button class="icon-button" data-action="next" aria-label="Periodo successivo">›</button></div><h2>${esc(monthTitle())}</h2><button class="button button-quiet" data-action="today">Oggi</button></div>
          <div class="toolbar-right">
            <div class="view-switch" role="group" aria-label="Vista calendario"><button class="view-button ${state.view === "month" ? "active" : ""}" data-action="set-view" data-view="month">Mese</button><button class="view-button ${state.view === "week" ? "active" : ""}" data-action="set-view" data-view="week">Settimana</button><button class="view-button ${state.view === "day" ? "active" : ""}" data-action="set-view" data-view="day">Giorno</button></div>
            <select class="filter-select" id="personFilter" aria-label="Filtra per responsabile"><option value="">Tutti</option>${PEOPLE.map((name) => `<option value="${esc(name)}" ${state.person === name ? "selected" : ""}>${esc(name)}</option>`).join("")}</select>
            <label class="search-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></svg><input class="search-input" id="taskSearch" value="${esc(state.query)}" placeholder="Cerca…" aria-label="Cerca attività" /></label>
          </div>
        </div>
        <div class="calendar-card">${viewMarkup}<div class="calendar-lower-note"><span><strong>${visibleDated.length}</strong> attività con data nel progetto</span><span>Le attività senza data restano nella lista “Da programmare”.</span></div></div>
      </div>
      <aside class="right-rail">
        <section class="rail-card"><div class="rail-head"><h3>Da programmare</h3><button data-action="navigate" data-page="backlog">Vedi tutte <span aria-hidden="true">→</span></button></div><p class="rail-subtitle">Senza data assegnata</p>${undated.length ? undated.slice(0, 4).map((task) => `<div class="rail-task" role="button" tabindex="0" data-action="edit-task" data-id="${esc(task.id)}"><span class="rail-task-marker"></span><span><strong>${esc(task.title)}</strong><small>${esc(task.place || "Luogo da definire")}</small></span></div>`).join("") : `<p class="rail-empty">Nessuna attività da programmare con questi filtri.</p>`}</section>
        <section class="rail-card selected-day-card"><div class="selected-day-top"><h3>Giornata selezionata</h3><span class="selected-day-date">${esc(FULL_DATE.format(selected))}</span></div>${renderSelectedDay(selected, visibleDated)}</section>
      </aside>
    </section>`;
}

function renderMonthView(tasks) {
  const year = state.anchor.getFullYear();
  const month = state.anchor.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = startOfWeek(first);
  const headers = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((day) => `<div class="weekday">${day}</div>`).join("");
  let cells = "";
  const totalDays = Math.ceil((((first.getDay() + 6) % 7) + new Date(year, month + 1, 0).getDate()) / 7) * 7;
  for (let index = 0; index < totalDays; index += 1) {
    const date = addDays(gridStart, index);
    const key = toISO(date);
    const dayTasks = tasks.filter((task) => task.date === key);
    const classes = ["day-cell", date.getMonth() !== month ? "outside-month" : "", key === state.selectedDate ? "selected" : "", key === toISO(today) ? "today" : ""].filter(Boolean).join(" ");
    const dayCount = dayTasks.length ? '<span class="day-count" aria-label="' + dayTasks.length + ' attività">' + dayTasks.length + '</span>' : "";
    const chips = dayTasks.slice(0, 2).map((task) => `<button class="event-chip ${statusClass(task.status)}" title="${esc(task.title)} · ${esc(task.people.join(", ") || "Responsabile da assegnare")}" data-action="edit-task" data-id="${esc(task.id)}">${esc(task.title)}</button>`).join("");
    const more = dayTasks.length > 2 ? `<button class="more-events" data-action="show-day" data-date="${key}">+ ${dayTasks.length - 2} altre</button>` : "";
    cells += `<div class="${classes}" role="button" tabindex="0" data-action="select-date" data-date="${key}"><span class="day-number">${date.getDate()}</span>${dayCount}${chips}${more}</div>`;
  }
  return `<div class="month-grid">${headers}${cells}</div>`;
}

function renderWeekView(tasks) {
  const first = startOfWeek(state.anchor);
  const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));
  const weekdays = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
  return `<div class="week-view">${days.map((date, index) => {
    const key = toISO(date);
    const dayTasks = tasks.filter((task) => task.date === key);
    return `<section class="week-day ${key === toISO(today) ? "today" : ""}"><div class="week-day-head"><span>${weekdays[index]}</span><button data-action="select-date" data-date="${key}" aria-label="Seleziona ${esc(FULL_DATE.format(date))}">${date.getDate()}</button></div>${dayTasks.length ? dayTasks.map((task) => `<button class="event-chip ${statusClass(task.status)}" title="${esc(task.title)}" data-action="edit-task" data-id="${esc(task.id)}">${esc(task.title)}</button>`).join("") : `<span class="empty-day">—</span>`}</section>`;
  }).join("")}</div>`;
}

function renderDayView(tasks) {
  const key = state.selectedDate;
  const dayTasks = tasks.filter((task) => task.date === key);
  return `<div class="agenda-view"><section class="agenda-day"><div class="agenda-day-head"><strong>${fromISO(key).getDate()}</strong>${esc(FULL_DATE.format(fromISO(key)))}</div>${dayTasks.length ? dayTasks.map(agendaTaskMarkup).join("") : `<div class="empty-day">Nessuna attività con data per questo giorno. Puoi aggiungerne una o scegliere un'attività da programmare.</div>`}</section></div>`;
}

function agendaTaskMarkup(task) {
  return `<div class="agenda-task" role="button" tabindex="0" data-action="edit-task" data-id="${esc(task.id)}"><span class="agenda-accent ${statusClass(task.status)}"></span><span class="agenda-title">${esc(task.title)}</span><span class="agenda-place">${esc(task.place || "Luogo da definire")}</span>${personAvatars(task.people)}${taskStatus(task)}</div>`;
}

function renderSelectedDay(date, tasks) {
  const key = toISO(date);
  const dayTasks = tasks.filter((task) => task.date === key);
  if (!dayTasks.length) return '<div class="empty-day">Nessuna attività con data.<button data-action="add-task">Aggiungi attività a questa data →</button></div>';
  return dayTasks.map((task) => '<div class="selected-day-item" role="button" tabindex="0" data-action="edit-task" data-id="' + esc(task.id) + '">' +
    '<strong>' + esc(task.title) + '</strong>' +
    '<small>' + esc(task.place || "Luogo da definire") + '</small>' +
    '<small>Responsabili: ' + esc(task.people.join(" · ") || "da assegnare") + '</small>' +
    taskStatus(task) +
    (task.notes ? '<p class="selected-day-note">' + esc(task.notes) + '</p>' : '') +
    '</div>').join("");
}

function renderBacklogPage() {
  const tasks = filteredTasks(activities.filter((task) => !task.date));
  return `${pageHeading("ATTIVITÀ APERTE", "Da programmare", "Lavori in sospeso senza una data assegnata.", `<strong>${tasks.length}</strong> attività`)}
    <div class="list-toolbar"><div class="list-toolbar-copy">Le date si possono aggiungere quando la pianificazione è definita.</div><label class="search-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></svg><input class="search-input" id="taskSearch" value="${esc(state.query)}" placeholder="Cerca…" aria-label="Cerca attività" /></label></div>
    ${tasks.length ? `<div class="task-list">${tasks.map(taskCardMarkup).join("")}</div>` : `<div class="empty-state"><strong>Nessuna attività da programmare</strong>Prova a cambiare i filtri o aggiungi una nuova attività.</div>`}`;
}

function taskCardMarkup(task) {
  const people = task.people.length ? task.people.join(" · ") : "Responsabile da assegnare";
  return `<article class="task-card" role="button" tabindex="0" data-action="edit-task" data-id="${esc(task.id)}"><span class="task-card-bar ${statusClass(task.status)}"></span><div class="task-card-main"><div class="task-card-title-row"><h3>${esc(task.title)}</h3>${taskStatus(task)}</div>${task.notes ? `<p class="task-card-notes">${esc(task.notes)}</p>` : ""}<div class="task-meta"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2"/></svg>${esc(task.place || "Luogo da definire")}</span><span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V19zM16 5.3a3 3 0 0 1 0 5.8"/></svg>${esc(people)}</span></div></div><div class="task-card-side"><span class="eyebrow">SENZA DATA</span><button class="icon-button" aria-label="Modifica ${esc(task.title)}">›</button></div></article>`;
}

function renderTeamPage() {
  return `${pageHeading("PERSONE", "Famiglia", "Le persone di casa e le attività che condividete.", `${PEOPLE.length} persone`)}
    <div class="team-grid">${PEOPLE.map((name) => {
      const count = activities.filter((task) => task.people.includes(name)).length;
      return `<article class="member-card"><div class="member-head"><span class="person-avatar" data-name="${esc(name)}">${esc(initials(name))}</span><div><h3>${esc(name)}</h3><small>Responsabile attività</small></div></div><p class="member-count"><strong>${count}</strong> ${count === 1 ? "attività registrata" : "attività registrate"}</p><button class="member-open" data-action="person-filter" data-person="${esc(name)}">Mostra attività →</button></article>`;
    }).join("")}</div>
    <p class="calendar-lower-note"><span>${PEOPLE.length ? "Il personale configurato può essere assegnato alle attività." : "Nessun membro del personale è stato ancora configurato."}</span></p>`;
}

function bindToolbarInputs() {
  const personFilter = $("#personFilter");
  if (personFilter) personFilter.addEventListener("change", (event) => { state.person = event.target.value; render(); });
  const search = $("#taskSearch");
  if (search) search.addEventListener("input", (event) => {
    state.query = event.target.value;
    const cursor = event.target.selectionStart;
    render();
    const nextSearch = $("#taskSearch");
    if (nextSearch) { nextSearch.focus(); nextSearch.setSelectionRange(cursor, cursor); }
  });
}

function setTheme(theme, persist = true) {
  const selectedTheme = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = selectedTheme;
  const button = $("#themeToggle");
  const switchingTo = selectedTheme === "dark" ? "chiaro" : "scuro";
  button.setAttribute("aria-label", `Passa al tema ${switchingTo}`);
  button.title = `Passa al tema ${switchingTo}`;
  button.innerHTML = selectedTheme === "dark"
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"/></svg>`;
  if (persist) {
    try { localStorage.setItem(THEME_STORAGE_KEY, selectedTheme); }
    catch (error) { console.warn("Impossibile salvare il tema scelto.", error); }
  }
}

function openTaskDialog(task = null, defaultDate = "") {
  const dialog = $("#taskDialog");
  $("#dialogTitle").textContent = task ? "Modifica attività" : "Nuova attività";
  $("#taskId").value = task?.id || "";
  $("#taskTitle").value = task?.title || "";
  $("#taskDate").value = task?.date || defaultDate;
  $("#taskPlace").value = task?.place || "";
  $("#taskStatus").value = task?.status || "in_sospeso";
  $("#taskNotes").value = task?.notes || "";
  $("#peopleOptions").innerHTML = PEOPLE.map((name) => `<label class="person-option"><input type="checkbox" name="people" value="${esc(name)}" ${task?.people.includes(name) ? "checked" : ""}/><span>${esc(name)}</span></label>`).join("");
  $("#deleteTask").classList.toggle("hidden", !task);
  dialog.showModal();
  window.setTimeout(() => $("#taskTitle").focus(), 0);
}

function movePeriod(direction) {
  const base = fromISO(state.selectedDate);
  if (state.view === "month") {
    const next = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + direction, 1);
    state.anchor = next;
    state.selectedDate = toISO(new Date(next.getFullYear(), next.getMonth(), Math.min(base.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate())));
  } else {
    const next = addDays(base, direction * (state.view === "week" ? 7 : 1));
    state.selectedDate = toISO(next);
    state.anchor = next;
  }
  render();
}

document.addEventListener("change", (event) => {
  if (event.target?.id !== "primaryNavigation") return;
  state.page = event.target.value;
  state.query = "";
  if (state.page === "files") window.setFilesFolder?.("all");
  render();
  if (state.page === "warehouse") window.loadWarehousePage?.();
  if (state.page === "vehicles") window.loadVehiclesPage?.();
  if (state.page === "files") window.loadFilesPage?.();
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "navigate") { state.page = target.dataset.page; state.query = ""; if (state.page === "files") window.setFilesFolder?.(target.dataset.folder || "all"); render(); if (state.page === "warehouse") window.loadWarehousePage?.(); if (state.page === "vehicles") window.loadVehiclesPage?.(); if (state.page === "files") window.loadFilesPage?.(); }
  else if (action === "today") { state.anchor = today; state.selectedDate = toISO(today); state.page = "calendar"; render(); }
  else if (action === "toggle-theme") setTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
  else if (action === "server-logout") {
    target.disabled = true;
    try {
      await window.LMServer?.logout?.();
      window.location.reload();
    } catch (error) {
      target.disabled = false;
      window.alert(error?.message || "Impossibile chiudere la sessione.");
    }
  }
  else if (action === "previous") movePeriod(-1);
  else if (action === "next") movePeriod(1);
  else if (action === "set-view") { state.view = target.dataset.view; state.anchor = fromISO(state.selectedDate); render(); }
  else if (action === "select-date" || action === "show-day") {
    state.selectedDate = target.dataset.date;
    state.anchor = fromISO(state.selectedDate);
    if (action === "show-day") state.view = "day";
    render();
  }
  else if (action === "person-filter") { state.person = state.person === target.dataset.person ? "" : target.dataset.person; state.page = "calendar"; render(); }
  else if (action === "add-task") openTaskDialog(null, state.page === "calendar" ? state.selectedDate : "");
  else if (action === "edit-task") {
    const task = activities.find((item) => item.id === target.dataset.id);
    if (task) openTaskDialog(task);
  }
  else if (action === "close-dialog") $("#taskDialog").close();
  else if (action === "delete-task") {
    const id = $("#taskId").value;
    try {
      if (window.LMServer?.isActive?.()) await window.LMServer.deleteActivity(id);
      activities = activities.filter((task) => task.id !== id);
      $("#taskDialog").close();
      saveActivities();
    } catch (error) {
      window.alert(error?.message || "Impossibile eliminare l'attività dal server.");
    }
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target.closest("[data-action]");
  if (target && (event.key === "Enter" || event.key === " ") && ["edit-task", "select-date"].includes(target.dataset.action)) {
    event.preventDefault(); target.click();
  }
});

$("#taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#taskId").value || `task-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
  const original = activities.find((task) => task.id === id);
  const updated = {
    id,
    title: $("#taskTitle").value.trim(),
    date: $("#taskDate").value,
    place: $("#taskPlace").value.trim(),
    people: $$("input[name='people']:checked", $("#peopleOptions")).map((input) => input.value),
    status: $("#taskStatus").value,
    notes: $("#taskNotes").value.trim()
  };
  const submit = event.target.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const saved = window.LMServer?.isActive?.() ? await window.LMServer.persistActivity(updated, original) : updated;
    const finalTask = saved || updated;
    if (original) activities = activities.map((task) => task.id === id ? finalTask : task);
    else activities.unshift(finalTask);
    if (finalTask.date) { state.selectedDate = finalTask.date; state.anchor = fromISO(finalTask.date); state.page = "calendar"; }
    else state.page = "backlog";
    $("#taskDialog").close();
    saveActivities();
  } catch (error) {
    window.alert(error?.message || "Impossibile salvare l'attività sul server.");
  } finally {
    if (submit) submit.disabled = false;
  }
});

let savedTheme = "dark";
try {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") savedTheme = storedTheme;
} catch (error) { console.warn("Impossibile leggere il tema salvato.", error); }
setTheme(savedTheme, false);
render();

window.LMCalendar = {
  getActivities: () => activities.map((task) => ({ ...task, people: [...(task.people || [])] })),
  setPersistenceStatus,
  replaceActivities: (next, preserveView = false) => {
    activities = Array.isArray(next) ? next.map((task) => ({ ...task, date: task.date || "", people: [...(task.people || [])] })) : [];
    const dated = activities.filter((task) => task.date).map((task) => task.date).sort().at(-1);
    if (dated && !preserveView) { state.selectedDate = dated; state.anchor = fromISO(dated); }
    if (preserveView && ["warehouse", "files", "vehicles"].includes(state.page)) renderSidebar();
    else render();
  },
  render
};
window.LMSeedActivities = INITIAL_ACTIVITIES.map(copySeedTask);

