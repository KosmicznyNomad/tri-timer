(() => {
  // ---- storage ----
  const KEY = "tri-timer-v1";

  const MODE_LABEL = { work: "Praca", study: "Nauka", read: "Czytanie" };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function defaultState() {
    return {
      totalsByDate: {}, // { "YYYY-MM-DD": {work: seconds, study: seconds, read: seconds} }
      activeMode: "work",
      running: false,
      sessionStartMs: null,
    };
  }

  // ---- time helpers ----
  function pad2(n) { return String(n).padStart(2, "0"); }

  function toISODateLocal(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function startOfNextDayLocal(ms) {
    const d = new Date(ms);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }

  function ensureDay(state, isoDate) {
    if (!state.totalsByDate[isoDate]) {
      state.totalsByDate[isoDate] = { work: 0, study: 0, read: 0 };
    } else {
      // make sure keys exist
      for (const k of ["work","study","read"]) state.totalsByDate[isoDate][k] ??= 0;
    }
  }

  function addDurationSplitByDay(state, mode, startMs, endMs) {
    let cur = startMs;
    while (cur < endMs) {
      const iso = toISODateLocal(cur);
      ensureDay(state, iso);

      const nextDay = startOfNextDayLocal(cur);
      const segEnd = Math.min(endMs, nextDay);
      const seconds = Math.max(0, Math.floor((segEnd - cur) / 1000));
      state.totalsByDate[iso][mode] += seconds;

      cur = segEnd;
    }
  }

  function secondsToHHMMSS(sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(r)}`;
  }

  function secondsToHHMM(sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${pad2(m)}m` : `${m}m`;
  }

  function nowMs() { return Date.now(); }

  // ---- UI ----
  const statusLine = document.getElementById("statusLine");
  const tabTimer = document.getElementById("tabTimer");
  const tabStats = document.getElementById("tabStats");
  const viewTimer = document.getElementById("viewTimer");
  const viewStats = document.getElementById("viewStats");

  const timerLabel = document.getElementById("timerLabel");
  const timerValue = document.getElementById("timerValue");
  const btnStartStop = document.getElementById("btnStartStop");
  const btnResetSession = document.getElementById("btnResetSession");
  const todayMini = document.getElementById("todayMini");

  const statWork = document.getElementById("statWork");
  const statStudy = document.getElementById("statStudy");
  const statRead = document.getElementById("statRead");

  const btnExport = document.getElementById("btnExport");
  const fileImport = document.getElementById("fileImport");
  const btnWipe = document.getElementById("btnWipe");

  let state = load() || defaultState();

  // Recover: if app was closed while running, keep it running.
  // (We only store start time; UI recalculates.)
  let uiTick = null;
  let statsRange = "day"; // day | week | month

  function setActiveMode(mode) {
    // if switching while running, close old session and start new immediately
    if (state.running && state.activeMode !== mode) {
      const oldMode = state.activeMode;
      const start = state.sessionStartMs;
      const end = nowMs();
      addDurationSplitByDay(state, oldMode, start, end);
      state.activeMode = mode;
      state.sessionStartMs = end;
      save(state);
      statusLine.textContent = `Przełączono na: ${MODE_LABEL[mode]}.`;
    } else {
      state.activeMode = mode;
      save(state);
    }
    updateModeButtons();
    updateTimerLabel();
    updateMiniToday();
    updateStats();
  }

  function updateModeButtons() {
    document.querySelectorAll(".mode").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === state.activeMode);
    });
  }

  function updateTimerLabel() {
    timerLabel.textContent = `Sesja: ${MODE_LABEL[state.activeMode]}`;
  }

  function getSessionSeconds() {
    if (!state.running || !state.sessionStartMs) return 0;
    return Math.floor((nowMs() - state.sessionStartMs) / 1000);
  }

  function updateTimerDisplay() {
    timerValue.textContent = secondsToHHMMSS(getSessionSeconds());
  }

  function setRunning(running) {
    state.running = running;
    if (running) {
      state.sessionStartMs = nowMs();
      statusLine.textContent = `Włączone: ${MODE_LABEL[state.activeMode]}.`;
    } else {
      statusLine.textContent = "Zatrzymane.";
    }
    save(state);
    btnStartStop.textContent = running ? "Stop" : "Start";
  }

  function start() {
    if (state.running) return;
    setRunning(true);
  }

  function stop() {
    if (!state.running) return;

    const startMs = state.sessionStartMs;
    const endMs = nowMs();

    if (startMs && endMs > startMs) {
      addDurationSplitByDay(state, state.activeMode, startMs, endMs);
    }

    state.sessionStartMs = null;
    setRunning(false);

    updateMiniToday();
    updateStats();
  }

  function resetSessionOnly() {
    if (state.running) {
      state.sessionStartMs = nowMs();
      save(state);
      statusLine.textContent = "Sesja zresetowana.";
    } else {
      statusLine.textContent = "Sesja już stoi (00:00:00).";
    }
    updateTimerDisplay();
  }

  function isoToday() {
    return toISODateLocal(nowMs());
  }

  function getTotalsForDate(iso) {
    ensureDay(state, iso);
    return state.totalsByDate[iso];
  }

  function sumRange(days) {
    // days: array of ISO strings
    const sum = { work: 0, study: 0, read: 0 };
    for (const d of days) {
      const t = state.totalsByDate[d];
      if (!t) continue;
      sum.work += t.work || 0;
      sum.study += t.study || 0;
      sum.read += t.read || 0;
    }
    return sum;
  }

  function lastNDaysISO(n) {
    const out = [];
    const now = new Date();
    now.setHours(12,0,0,0); // reduce DST weirdness
    for (let i = 0; i < n; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      out.push(`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`);
    }
    return out;
  }

  function currentMonthISODays() {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth(); // 0-11
    const first = new Date(y, m, 1);
    const next = new Date(y, m + 1, 1);

    const days = [];
    for (let cur = new Date(first); cur < next; cur.setDate(cur.getDate() + 1)) {
      days.push(`${cur.getFullYear()}-${pad2(cur.getMonth()+1)}-${pad2(cur.getDate())}`);
    }
    return days;
  }

  function updateMiniToday() {
    const today = isoToday();
    const t = state.totalsByDate[today] || { work: 0, study: 0, read: 0 };
    const runningExtra = state.running ? getSessionSeconds() : 0;
    // show today totals + current running session (for current mode only)
    const sum = { ...t };
    if (state.running) sum[state.activeMode] = (sum[state.activeMode] || 0) + runningExtra;
    todayMini.textContent = `Praca ${secondsToHHMM(sum.work)}, Nauka ${secondsToHHMM(sum.study)}, Czytanie ${secondsToHHMM(sum.read)}`;
  }

  function updateStats() {
    let totals;
    if (statsRange === "day") {
      const today = isoToday();
      totals = sumRange([today]);
      if (state.running) totals[state.activeMode] += getSessionSeconds();
    } else if (statsRange === "week") {
      const days = lastNDaysISO(7);
      totals = sumRange(days);
      if (state.running) totals[state.activeMode] += getSessionSeconds();
    } else {
      const days = currentMonthISODays();
      totals = sumRange(days);
      if (state.running) totals[state.activeMode] += getSessionSeconds();
    }

    statWork.textContent = secondsToHHMM(totals.work);
    statStudy.textContent = secondsToHHMM(totals.study);
    statRead.textContent = secondsToHHMM(totals.read);
  }

  function setRange(range) {
    statsRange = range;
    document.querySelectorAll(".pill").forEach(p => {
      p.classList.toggle("active", p.dataset.range === range);
    });
    updateStats();
  }

  function showTab(which) {
    const timerOn = which === "timer";
    tabTimer.classList.toggle("active", timerOn);
    tabStats.classList.toggle("active", !timerOn);
    viewTimer.classList.toggle("hidden", !timerOn);
    viewStats.classList.toggle("hidden", timerOn);
    updateStats();
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function exportData() {
    // include running state so it can be restored
    downloadJson({
      exportedAt: new Date().toISOString(),
      state
    }, `tri-timer-export-${isoToday()}.json`);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        if (!parsed || !parsed.state || !parsed.state.totalsByDate) throw new Error("zły format");
        state = parsed.state;
        save(state);
        statusLine.textContent = "Zaimportowano dane.";
        updateModeButtons();
        updateTimerLabel();
        btnStartStop.textContent = state.running ? "Stop" : "Start";
        updateTimerDisplay();
        updateMiniToday();
        updateStats();
      } catch {
        alert("Nie udało się zaimportować. Upewnij się, że to plik z eksportu tej aplikacji.");
      }
    };
    reader.readAsText(file);
  }

  function wipeAll() {
    if (!confirm("Na pewno? To usunie wszystkie statystyki z tego urządzenia.")) return;
    state = defaultState();
    save(state);
    statusLine.textContent = "Wyczyszczono.";
    updateModeButtons();
    updateTimerLabel();
    btnStartStop.textContent = "Start";
    timerValue.textContent = "00:00:00";
    updateMiniToday();
    updateStats();
  }

  // ---- events ----
  document.querySelectorAll(".mode").forEach(btn => {
    btn.addEventListener("click", () => setActiveMode(btn.dataset.mode));
  });

  btnStartStop.addEventListener("click", () => {
    if (state.running) stop();
    else start();
  });

  btnResetSession.addEventListener("click", resetSessionOnly);

  tabTimer.addEventListener("click", () => showTab("timer"));
  tabStats.addEventListener("click", () => showTab("stats"));

  document.querySelectorAll(".pill").forEach(btn => {
    btn.addEventListener("click", () => setRange(btn.dataset.range));
  });

  btnExport.addEventListener("click", exportData);
  fileImport.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importData(file);
    e.target.value = "";
  });
  btnWipe.addEventListener("click", wipeAll);

  // ---- tick ----
  function tick() {
    updateTimerDisplay();
    // keep small today line "live"
    updateMiniToday();
  }

  function startTick() {
    if (uiTick) return;
    uiTick = setInterval(tick, 250);
  }

  // ---- PWA install/offline ----
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  // ---- init ----
  updateModeButtons();
  updateTimerLabel();
  btnStartStop.textContent = state.running ? "Stop" : "Start";
  updateTimerDisplay();
  updateMiniToday();
  updateStats();
  startTick();
})();
