// ---------------------------------------------------------------------------
// Konstanten & Basis-Konfiguration
// ---------------------------------------------------------------------------

const STORAGE_KEY = "stephansHealthData_v1";
const DAILY_GOAL_PERCENT = 80;

// Sport-Regel (wie von dir definiert)
const STRENGTH_MIN_EXERCISES_FOR_GOAL = 2;
const STRENGTH_MIN_SETS_PER_EXERCISE_FOR_GOAL = 3;

const EXERCISES = [
  { id: "neck_mobility_all", title: "Nackendehnung links/rechts & hoch/runter", detail: "Jeweils 25 Wiederholungen." },
  { id: "neck_overstretch", title: "Nackendehnung links/rechts (überstrecken)", detail: "Jeweils 20 Sekunden halten." },
  { id: "double_chin_exercise", title: "Doppelkinnübung", detail: "20 Wiederholungen – langsam & kontrolliert." },
  { id: "serving_exercise", title: "Servierübung links/rechts", detail: "15 Wiederholungen – langsam & kontrolliert." },
  { id: "heat_pad", title: "Wärmekissen", detail: "10 Minuten Behandlung." },
  { id: "cold_icebath_head", title: "Eisbad (Kopf)", detail: "1 Minute unter Wasser." }
];

// Reihenfolge hier = Basis -> Spitze (Rendering ist logisch, CSS dreht visuell korrekt via column-reverse)
const NUTRITION_LEVELS = [
  { id: "drinks", maxUnits: 6 },
  { id: "veg_fruit", maxUnits: 5 },
  { id: "carbs", maxUnits: 4 },
  { id: "milk_meat", maxUnits: 4 },
  { id: "fats", maxUnits: 2 },
  { id: "extras", maxUnits: 1 }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampPercent(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Heute";
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function getStartOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function getSelectedDateKey(inputId) {
  const input = document.getElementById(inputId);
  return (input && input.value) ? input.value : null;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { exercises: {}, sport: { running: {}, strength: {} }, nutrition: {} };
    }
    const data = JSON.parse(raw);
    if (!data.exercises) data.exercises = {};
    if (!data.sport) data.sport = { running: {}, strength: {} };
    if (!data.sport.running) data.sport.running = {};
    if (!data.sport.strength) data.sport.strength = {};
    if (!data.nutrition) data.nutrition = {};
    return data;
  } catch (e) {
    console.error("Fehler beim Laden der Daten:", e);
    return { exercises: {}, sport: { running: {}, strength: {} }, nutrition: {} };
  }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    updateWeeklySummary(data);

    // Dashboard direkt mitziehen
    updateDashboardStatus(data);
    updateDailyGoalHistory(data);
  } catch (e) {
    console.error("Fehler beim Speichern der Daten:", e);
  }
}

// ---------------------------------------------------------------------------
// Tagesziel-Logik: Übungen, Ernährung, Sport
// ---------------------------------------------------------------------------

function getExercisesPercentForDate(data, dateKey) {
  const exercisesDay = (data.exercises && data.exercises[dateKey]) ? data.exercises[dateKey] : {};
  const total = EXERCISES.length;
  let done = 0;
  EXERCISES.forEach((ex) => { if (exercisesDay[ex.id]) done += 1; });
  return clampPercent(total > 0 ? (done / total) * 100 : 0);
}

function getNutritionStatusForDate(data, dateKey) {
  const day = (data.nutrition && data.nutrition[dateKey]) ? data.nutrition[dateKey] : {};
  const percents = [];

  // pro Stufe: mindestens 80% der Stufe (kein Verrechnen)
  let allLevelsMet = true;

  NUTRITION_LEVELS.forEach((lvl) => {
    const count = Number(day[lvl.id] || 0);
    const pct = clampPercent((count / lvl.maxUnits) * 100);
    percents.push(pct);

    const needed = Math.ceil(lvl.maxUnits * (DAILY_GOAL_PERCENT / 100));
    const met = count >= needed;
    if (!met) allLevelsMet = false;
  });

  // Prozent fürs Dashboard: bottleneck (Minimum), weil „jede Stufe muss“
  const nutritionPercent = percents.length ? Math.min(...percents) : 0;

  return {
    percent: nutritionPercent,
    allLevelsMet
  };
}

function getSportStatusForDate(data, dateKey) {
  const km = (data.sport && data.sport.running) ? data.sport.running[dateKey] : null;
  const strengthArr = (data.sport && data.sport.strength) ? (data.sport.strength[dateKey] || []) : [];

  // Running erfüllt, sobald ein positiver Eintrag vorhanden ist
  const runningMet = (typeof km === "number" && km > 0);

  // Kraft erfüllt, wenn >=2 Übungen und jede Übung >=3 Sätze
  const strengthMet =
    Array.isArray(strengthArr) &&
    strengthArr.length >= STRENGTH_MIN_EXERCISES_FOR_GOAL &&
    strengthArr.every((e) => Number(e.sets || 0) >= STRENGTH_MIN_SETS_PER_EXERCISE_FOR_GOAL);

  const met = runningMet || strengthMet;

  // Prozent fürs Dashboard: 100 wenn erfüllt, sonst 0 (passt zu deiner Regel „80% erreicht wenn …“)
  const percent = met ? 100 : 0;

  // Optionaler „Lieferant“, rein fürs Label/Note
  let basedOn = "—";
  if (runningMet) basedOn = "Running";
  else if (strengthMet) basedOn = "Kraft";

  return { percent, met, basedOn };
}

function getDailyGoalStatus(data, dateKey) {
  const exercisesPercent = getExercisesPercentForDate(data, dateKey);
  const nutrition = getNutritionStatusForDate(data, dateKey);
  const sport = getSportStatusForDate(data, dateKey);

  const exercisesMet = exercisesPercent >= DAILY_GOAL_PERCENT;
  const nutritionMet = nutrition.allLevelsMet;
  const sportMet = sport.met;

  const overallPercent = clampPercent((exercisesPercent + nutrition.percent + sport.percent) / 3);

  const goalReached = exercisesMet && nutritionMet && sportMet;

  return {
    exercisesPercent,
    nutritionPercent: nutrition.percent,
    sportPercent: sport.percent,
    overallPercent,
    goalReached,
    meta: {
      exercisesMet,
      nutritionMet,
      sportMet,
      sportBasedOn: sport.basedOn
    }
  };
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function initTabNavigation() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabScreens = document.querySelectorAll(".tab-screen");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-tab");

      tabButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      tabScreens.forEach((screen) => {
        screen.classList.toggle("active", screen.id === `tab-${target}`);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Übungen
// ---------------------------------------------------------------------------

function initExercisesUI(selectedDateKey) {
  const data = loadData();
  const todayKey = getTodayKey();

  const dateInput = document.getElementById("exercisesDateInput");
  let dateKey = selectedDateKey || getSelectedDateKey("exercisesDateInput") || todayKey;

  if (dateInput && dateInput.value !== dateKey) dateInput.value = dateKey;

  if (!data.exercises[dateKey]) data.exercises[dateKey] = {};
  const exercisesForDay = data.exercises[dateKey];

  const exerciseListEl = document.getElementById("exerciseList");
  const dateLabelEl = document.getElementById("exercisesDateLabel");
  if (!exerciseListEl) return;

  if (dateLabelEl) dateLabelEl.textContent = formatDateShort(dateKey);

  exerciseListEl.innerHTML = "";

  EXERCISES.forEach((exercise) => {
    const wrapper = document.createElement("div");
    wrapper.className = "exercise-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = exercise.id;
    checkbox.checked = Boolean(exercisesForDay[exercise.id]);

    const label = document.createElement("label");
    label.className = "exercise-label";
    label.setAttribute("for", exercise.id);
    label.innerHTML = `${exercise.title}<span>${exercise.detail}</span>`;

    if (checkbox.checked) wrapper.classList.add("completed");

    checkbox.addEventListener("change", () => {
      exercisesForDay[exercise.id] = checkbox.checked;
      wrapper.classList.toggle("completed", checkbox.checked);

      data.exercises[dateKey] = exercisesForDay;
      saveData(data);

      renderExercisesHistory(loadData());
    });

    wrapper.appendChild(checkbox);
    wrapper.appendChild(label);
    exerciseListEl.appendChild(wrapper);
  });

  updateDashboardStatus(data);
  renderExercisesHistory(data);
  updateDailyGoalHistory(data);

  const saveBtn = document.getElementById("saveExercisesButton");
  const saveNote = document.getElementById("exerciseSaveNote");
  if (saveBtn) {
    saveBtn.onclick = () => {
      saveData(data);
      if (saveNote) saveNote.textContent = "Übungen für dieses Datum wurden gespeichert.";
      renderExercisesHistory(loadData());
    };
  }
}

// ---------------------------------------------------------------------------
// Ernährung
// ---------------------------------------------------------------------------

function initNutritionUI(selectedDateKey) {
  const data = loadData();
  const todayKey = getTodayKey();

  const dateInput = document.getElementById("nutritionDateInput");
  let dateKey = selectedDateKey || getSelectedDateKey("nutritionDateInput") || todayKey;

  if (dateInput && dateInput.value !== dateKey) dateInput.value = dateKey;

  if (!data.nutrition[dateKey]) data.nutrition[dateKey] = {};
  const nutritionForDay = data.nutrition[dateKey];

  const pyramidEl = document.getElementById("nutritionPyramid");
  if (!pyramidEl) return;

  pyramidEl.innerHTML = "";

  // Render: Basis -> Spitze (CSS stellt via column-reverse korrekt dar)
  NUTRITION_LEVELS.forEach((level) => {
    const row = document.createElement("div");
    row.className = "pyramid-row";

    const count = nutritionForDay[level.id] || 0;
    const maxUnits = level.maxUnits;

    for (let i = 0; i < maxUnits; i++) {
      const cube = document.createElement("div");
      cube.className = `pyramid-cube pyramid-cube--${level.id}`;
      if (i < count) cube.classList.add("active");

      cube.addEventListener("click", () => {
        const currentCount = nutritionForDay[level.id] || 0;
        const clickedIndex = i;

        let newCount;
        if (clickedIndex + 1 === currentCount) newCount = clickedIndex;
        else newCount = clickedIndex + 1;

        if (newCount < 0) newCount = 0;
        if (newCount > maxUnits) newCount = maxUnits;

        nutritionForDay[level.id] = newCount;
        data.nutrition[dateKey] = nutritionForDay;

        // speichern, damit nichts verloren geht + Dashboard aktualisieren
        saveData(data);
        initNutritionUI(dateKey);
      });

      row.appendChild(cube);
    }

    pyramidEl.appendChild(row);
  });

  const saveBtn = document.getElementById("saveNutritionButton");
  const saveNote = document.getElementById("nutritionSaveNote");
  if (saveBtn) {
    saveBtn.onclick = () => {
      saveData(data);
      if (saveNote) saveNote.textContent = "Ernährung für dieses Datum wurde gespeichert.";
    };
  }
}

// ---------------------------------------------------------------------------
// Dashboard Status heute
// ---------------------------------------------------------------------------

function updateDashboardStatus(data) {
  const todayKey = getTodayKey();
  const status = getDailyGoalStatus(data, todayKey);

  const exEl = document.getElementById("todayExercisesValue");
  const nuEl = document.getElementById("todayNutritionValue");
  const spEl = document.getElementById("todaySportValue");
  const ovEl = document.getElementById("todayOverallValue");

  const progressBarEl = document.getElementById("todayProgressBar");
  const noteEl = document.getElementById("todayProgressNote");
  const goalDescEl = document.getElementById("dailyGoalDescription");

  if (exEl) exEl.textContent = `${status.exercisesPercent} %`;
  if (nuEl) nuEl.textContent = `${status.nutritionPercent} %`;
  if (spEl) spEl.textContent = `${status.sportPercent} %`;
  if (ovEl) ovEl.textContent = `${status.overallPercent} %`;

  if (progressBarEl) progressBarEl.style.width = `${status.overallPercent}%`;

  if (goalDescEl) {
    goalDescEl.textContent =
      `Übungen ≥ ${DAILY_GOAL_PERCENT}%, Ernährung: jede Stufe ≥ ${DAILY_GOAL_PERCENT}%, Sport: Running oder Kraft erfüllt.`;
  }

  if (noteEl) {
    if (status.goalReached) {
      noteEl.textContent = `Tagesziel erreicht ✅ (Sport basiert heute auf: ${status.meta.sportBasedOn})`;
      return;
    }

    const parts = [];
    if (!status.meta.exercisesMet) parts.push("Übungen");
    if (!status.meta.nutritionMet) parts.push("Ernährung");
    if (!status.meta.sportMet) parts.push("Sport");

    const missing = parts.length ? parts.join(", ") : "—";
    noteEl.textContent = `Tagesziel noch nicht erreicht. Offen: ${missing}. (Sport basiert heute auf: ${status.meta.sportBasedOn})`;
  }
}

// ---------------------------------------------------------------------------
// Mini-Historie: Tagesziel letzte 7 Tage (kombiniert)
// ---------------------------------------------------------------------------

function updateDailyGoalHistory(data) {
  const container = document.getElementById("dailyGoalHistory");
  if (!container) return;

  const today = new Date();
  const entries = [];

  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);

    const s = getDailyGoalStatus(data, key);

    entries.push({
      label: formatDateShort(key),
      exercisesPercent: s.exercisesPercent,
      nutritionPercent: s.nutritionPercent,
      sportPercent: s.sportPercent,
      percent: s.overallPercent,
      goalReached: s.goalReached
    });
  }

  container.innerHTML = "";

  entries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "daily-goal-item";

    const left = document.createElement("div");
    left.className = "daily-goal-date";
    left.textContent = entry.label;

    const rings = document.createElement("div");
    rings.className = "daily-goal-rings";

    const sportRing = document.createElement("div");
    sportRing.className = "daily-goal-ring sport";
    sportRing.style.setProperty("--ring-percent", entry.sportPercent);

    const nutritionRing = document.createElement("div");
    nutritionRing.className = "daily-goal-ring nutrition";
    nutritionRing.style.setProperty("--ring-percent", entry.nutritionPercent);

    const exercisesRing = document.createElement("div");
    exercisesRing.className = "daily-goal-ring exercises";
    exercisesRing.style.setProperty("--ring-percent", entry.exercisesPercent);

    rings.appendChild(sportRing);
    rings.appendChild(nutritionRing);
    rings.appendChild(exercisesRing);

    row.appendChild(left);
    row.appendChild(rings);
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// History – Übungen
// ---------------------------------------------------------------------------

function renderExercisesHistory(data) {
  const listEl = document.getElementById("exerciseHistoryList");
  if (!listEl) return;

  const exercisesData = data.exercises || {};
  const entries = [];

  Object.keys(exercisesData).forEach((dateKey) => {
    const dayMap = exercisesData[dateKey] || {};
    let doneCount = 0;

    EXERCISES.forEach((ex) => { if (dayMap[ex.id]) doneCount += 1; });

    if (doneCount > 0) entries.push({ dateKey, doneCount });
  });

  if (entries.length === 0) {
    listEl.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "card-note";
    empty.textContent = "Noch keine erledigten Übungen in der History.";
    listEl.appendChild(empty);
    return;
  }

  entries.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  const limited = entries.slice(0, 10);

  listEl.innerHTML = "";

  limited.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const left = document.createElement("div");
    left.className = "history-item-left";

    const dateLine = document.createElement("div");
    dateLine.className = "history-item-date";
    dateLine.textContent = formatDateShort(entry.dateKey);

    const subLine = document.createElement("div");
    subLine.className = "history-item-sub";
    subLine.textContent = `Erledigte Übungen: ${entry.doneCount} von ${EXERCISES.length}`;

    left.appendChild(dateLine);
    left.appendChild(subLine);

    const count = document.createElement("div");
    count.className = "history-item-count";
    count.textContent = `${entry.doneCount}`;

    item.appendChild(left);
    item.appendChild(count);

    item.addEventListener("click", () => {
      const dateInput = document.getElementById("exercisesDateInput");
      if (dateInput) dateInput.value = entry.dateKey;
      initExercisesUI(entry.dateKey);
      document.getElementById("tab-uebungen")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    listEl.appendChild(item);
  });
}

// ---------------------------------------------------------------------------
// Sport
// ---------------------------------------------------------------------------

function initSportUI(selectedDateKey) {
  const data = loadData();
  const todayKey = getTodayKey();

  const dateInput = document.getElementById("sportDateInput");
  let dateKey = selectedDateKey || getSelectedDateKey("sportDateInput") || todayKey;
  if (dateInput && dateInput.value !== dateKey) dateInput.value = dateKey;

  const runningInput = document.getElementById("runningDistanceInput");
  const runningDateLabel = document.getElementById("runningDateLabel");
  const runningSaveNote = document.getElementById("runningSaveNote");
  const runningCurrentValue = document.getElementById("runningCurrentValue");
  const saveRunningButton = document.getElementById("saveRunningButton");
  const deleteRunningButton = document.getElementById("deleteRunningButton");

  if (runningDateLabel) runningDateLabel.textContent = formatDateShort(dateKey);

  if (runningInput) {
    const storedKm = data.sport.running[dateKey];
    runningInput.value = storedKm != null ? String(storedKm).replace(".", ",") : "";
    updateRunningCurrentValue(storedKm);
  }

  function updateRunningCurrentValue(km) {
    if (!runningCurrentValue) return;
    if (typeof km === "number" && km > 0) {
      runningCurrentValue.textContent = `Gespeichert: ${km.toString().replace(".", ",")} km`;
      runningCurrentValue.classList.remove("is-empty");
    } else {
      runningCurrentValue.textContent = "Kein Running-Eintrag gespeichert.";
      runningCurrentValue.classList.add("is-empty");
    }
  }

  if (saveRunningButton && runningInput) {
    saveRunningButton.onclick = () => {
      const raw = runningInput.value.trim();

      if (raw === "") {
        delete data.sport.running[dateKey];
        saveData(data);
        updateRunningCurrentValue(null);
        if (runningSaveNote) runningSaveNote.textContent = "Running für dieses Datum wurde geleert.";
        return;
      }

      const normalized = raw.replace(",", ".");
      const km = parseFloat(normalized);

      if (Number.isNaN(km) || km < 0) {
        if (runningSaveNote) runningSaveNote.textContent = "Bitte eine gültige Kilometerzahl eingeben (z. B. 5 oder 5,5).";
        return;
      }

      data.sport.running[dateKey] = km;
      saveData(data);
      updateRunningCurrentValue(km);

      if (runningSaveNote) runningSaveNote.textContent = `Running gespeichert: ${km.toString().replace(".", ",")} km.`;
    };
  }

  if (deleteRunningButton && runningInput) {
    deleteRunningButton.onclick = () => {
      const confirmDelete = window.confirm("Möchtest du den Running-Eintrag für dieses Datum wirklich löschen?");
      if (!confirmDelete) return;

      runningInput.value = "";
      delete data.sport.running[dateKey];
      saveData(data);
      updateRunningCurrentValue(null);

      if (runningSaveNote) runningSaveNote.textContent = "Running-Eintrag für dieses Datum wurde gelöscht.";
    };
  }

  // Krafttraining
  const exerciseInput = document.getElementById("strengthExerciseInput");
  const weightInput = document.getElementById("strengthWeightInput");
  const repsInput = document.getElementById("strengthRepsInput");
  const setsInput = document.getElementById("strengthSetsInput");
  const addButton = document.getElementById("addStrengthSetButton");
  const errorEl = document.getElementById("strengthError");
  const listEl = document.getElementById("strengthList");
  const strengthDateLabel = document.getElementById("strengthDateLabel");

  if (strengthDateLabel) strengthDateLabel.textContent = formatDateShort(dateKey);
  if (!data.sport.strength[dateKey]) data.sport.strength[dateKey] = [];

  function renderStrengthList() {
    if (!listEl) return;
    const entries = data.sport.strength[dateKey] || [];
    listEl.innerHTML = "";

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "card-note";
      empty.textContent = "Noch keine Kraft-Einheiten für dieses Datum erfasst.";
      listEl.appendChild(empty);
      return;
    }

    entries.forEach((entry, index) => {
      const item = document.createElement("div");
      item.className = "strength-item";

      const title = document.createElement("div");
      title.className = "strength-item-title";
      title.textContent = entry.exercise;

      const meta = document.createElement("div");
      meta.className = "strength-item-meta";

      const weightText = (entry.weight == null) ? "Eigengewicht" : `${entry.weight.toString().replace(".", ",")} kg`;
      meta.textContent = `${weightText} – ${entry.sets}×${entry.reps} Wiederholungen`;

      const actions = document.createElement("div");
      actions.className = "strength-item-actions";

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "chip-button chip-danger";
      deleteBtn.textContent = "Löschen";

      deleteBtn.onclick = () => {
        const ok = window.confirm("Möchtest du diesen Krafttraining-Satz wirklich löschen?");
        if (!ok) return;
        data.sport.strength[dateKey].splice(index, 1);
        saveData(data);
        renderStrengthList();
      };

      actions.appendChild(deleteBtn);

      item.appendChild(title);
      item.appendChild(meta);
      item.appendChild(actions);
      listEl.appendChild(item);
    });
  }

  renderStrengthList();
  updateWeeklySummary(data);

  if (addButton && exerciseInput && weightInput && repsInput && setsInput) {
    addButton.onclick = () => {
      if (errorEl) errorEl.style.display = "none";

      const exercise = exerciseInput.value.trim();
      const weightRaw = (weightInput.value || "").trim();
      let weight = null;

      if (weightRaw !== "") {
        const parsed = parseFloat(weightRaw.replace(",", "."));
        if (Number.isNaN(parsed) || parsed < 0) {
          if (errorEl) {
            errorEl.textContent = "Bitte ein gültiges Gewicht angeben oder Feld leer lassen.";
            errorEl.style.display = "block";
          }
          return;
        }
        weight = parsed;
      }

      const reps = parseInt(repsInput.value || "0", 10);
      const sets = parseInt(setsInput.value || "0", 10);

      if (!exercise || reps <= 0 || sets <= 0) {
        if (errorEl) {
          errorEl.textContent = "Bitte Übung, Wiederholungen und Sätze sinnvoll ausfüllen. Gewicht ist optional.";
          errorEl.style.display = "block";
        }
        return;
      }

      data.sport.strength[dateKey].push({ exercise, weight, reps, sets });
      saveData(data);

      exerciseInput.value = "";
      weightInput.value = "";
      repsInput.value = "";
      setsInput.value = "";

      renderStrengthList();
    };
  }
}

// ---------------------------------------------------------------------------
// Wochensummary
// ---------------------------------------------------------------------------

function updateWeeklySummary(data) {
  const weekLabelEl = document.getElementById("weekLabel");
  const activeDaysEl = document.getElementById("weekActiveDays");
  const runningKmEl = document.getElementById("weekRunningKm");
  const strengthSetsEl = document.getElementById("weekStrengthSets");
  const noteEl = document.getElementById("weekNote");

  if (!weekLabelEl || !activeDaysEl || !runningKmEl || !strengthSetsEl) return;

  const today = new Date();
  const startOfWeek = getStartOfWeek(today);
  const isoWeek = getISOWeekNumber(today);

  let activeDays = 0;
  let runningSum = 0;
  let strengthSets = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const key = d.toISOString().slice(0, 10);

    const exercisesDay = data.exercises[key] || {};
    const sportRunning = data.sport.running[key];
    const sportStrength = data.sport.strength[key] || [];

    const hasExercises = Object.values(exercisesDay).some(Boolean);
    const hasRunning = typeof sportRunning === "number" && sportRunning > 0;
    const hasStrength = sportStrength.length > 0;

    if (hasExercises || hasRunning || hasStrength) activeDays += 1;
    if (hasRunning) runningSum += sportRunning;
    strengthSets += sportStrength.length;
  }

  weekLabelEl.textContent = `KW ${String(isoWeek).padStart(2, "0")}`;
  activeDaysEl.textContent = `${activeDays} / 7`;

  const runningText = runningSum.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  runningKmEl.textContent = `${runningText} km`;

  strengthSetsEl.textContent = String(strengthSets);

  if (noteEl) {
    noteEl.textContent = (activeDays === 0) ? "Noch keine Bewegungsdaten in dieser Woche." : "Werte basieren auf deinen Einträgen dieser Woche.";
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function downloadJsonFile(data) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `stephans-health-data-${getTodayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function initExportUI() {
  const exportButton = document.getElementById("exportJsonButton");
  const infoEl = document.getElementById("exportJsonInfo");
  if (!exportButton) return;

  exportButton.addEventListener("click", () => {
    try {
      const data = loadData();
      downloadJsonFile(data);
      if (infoEl) infoEl.textContent = "Daten wurden als JSON-Datei exportiert. Bitte den Download im Browser prüfen.";
    } catch (e) {
      console.error("Fehler beim JSON-Export:", e);
      if (infoEl) infoEl.textContent = "Export fehlgeschlagen. Schau bitte in die Browser-Konsole für Details.";
    }
  });
}

function initImportUI() {
  const importButton = document.getElementById("importJsonButton");
  const fileInput = document.getElementById("importJsonFile");
  const infoEl = document.getElementById("importJsonInfo");
  if (!importButton || !fileInput) return;

  importButton.addEventListener("click", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      if (infoEl) infoEl.textContent = "Bitte zuerst eine JSON-Datei auswählen.";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== "object") {
          throw new Error("Ungültige JSON-Struktur.");
        }

        // Minimaler Shape-Check
        if (!("exercises" in data) || !("sport" in data) || !("nutrition" in data)) {
          throw new Error("Die Datei scheint nicht aus dem Export zu stammen.");
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        updateWeeklySummary(data);
        updateDashboardStatus(data);
        updateDailyGoalHistory(data);
        initExercisesUI();
        initSportUI();
        initNutritionUI();

        if (infoEl) infoEl.textContent = "Import abgeschlossen. Daten wurden überschrieben.";
      } catch (e) {
        console.error("Import-Fehler:", e);
        if (infoEl) infoEl.textContent = "Import fehlgeschlagen. Bitte eine gültige Export-Datei wählen.";
      }
    };

    reader.onerror = () => {
      if (infoEl) infoEl.textContent = "Datei konnte nicht gelesen werden.";
    };

    reader.readAsText(file);
  });
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

function playAlarmTone() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);

  const now = ctx.currentTime;
  const tone = (start, duration, frequency) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.03);
    gain.gain.linearRampToValueAtTime(0.0, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration);
  };

  tone(now + 0.02, 0.6, 440);
  tone(now + 0.75, 0.6, 520);
  tone(now + 1.5, 0.8, 660);

  window.setTimeout(() => ctx.close(), 2600);
}

function formatTimerSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function initTimers() {
  const timers = [
    {
      displayId: "timerHeatDisplay",
      startId: "timerHeatStart",
      resetId: "timerHeatReset",
      duration: 10 * 60
    },
    {
      displayId: "timerIceDisplay",
      startId: "timerIceStart",
      resetId: "timerIceReset",
      duration: 70
    }
  ];

  timers.forEach((cfg) => {
    const display = document.getElementById(cfg.displayId);
    const startBtn = document.getElementById(cfg.startId);
    const resetBtn = document.getElementById(cfg.resetId);
    if (!display || !startBtn || !resetBtn) return;

    let remaining = cfg.duration;
    let running = false;
    let intervalId = null;

    display.textContent = formatTimerSeconds(remaining);

    const stopTimer = () => {
      if (intervalId) window.clearInterval(intervalId);
      intervalId = null;
      running = false;
      startBtn.textContent = "Start";
    };

    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = 0;
        display.textContent = formatTimerSeconds(remaining);
        stopTimer();
        display.textContent = "Fertig!";
        playAlarmTone();
        return;
      }
      display.textContent = formatTimerSeconds(remaining);
    };

    startBtn.addEventListener("click", () => {
      if (running) {
        stopTimer();
        return;
      }

      if (remaining <= 0) {
        remaining = cfg.duration;
        display.textContent = formatTimerSeconds(remaining);
      }

      running = true;
      startBtn.textContent = "Pause";
      intervalId = window.setInterval(tick, 1000);
    });

    resetBtn.addEventListener("click", () => {
      stopTimer();
      remaining = cfg.duration;
      display.textContent = formatTimerSeconds(remaining);
    });
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const debugEnabled = new URLSearchParams(window.location.search).get("debug") === "1";

  initTabNavigation();

  const data = loadData();
  updateWeeklySummary(data);
  updateDashboardStatus(data);
  updateDailyGoalHistory(data);

  initExercisesUI();
  initSportUI();
  initNutritionUI();
  initExportUI();
  initImportUI();
  initTimers();

  if (debugEnabled) {
    runDebugChecks();
  }

  // Übungen Datum
  const exercisesDateInput = document.getElementById("exercisesDateInput");
  const exercisesTodayButton = document.getElementById("exercisesTodayButton");
  if (exercisesDateInput) {
    exercisesDateInput.addEventListener("change", () => initExercisesUI(exercisesDateInput.value || null));
  }
  if (exercisesTodayButton && exercisesDateInput) {
    exercisesTodayButton.addEventListener("click", () => {
      const todayKey = getTodayKey();
      exercisesDateInput.value = todayKey;
      initExercisesUI(todayKey);
    });
  }

  // Sport Datum
  const sportDateInput = document.getElementById("sportDateInput");
  const sportTodayButton = document.getElementById("sportTodayButton");
  if (sportDateInput) {
    sportDateInput.addEventListener("change", () => initSportUI(sportDateInput.value || null));
  }
  if (sportTodayButton && sportDateInput) {
    sportTodayButton.addEventListener("click", () => {
      const todayKey = getTodayKey();
      sportDateInput.value = todayKey;
      initSportUI(todayKey);
    });
  }

  // Ernährung Datum
  const nutritionDateInput = document.getElementById("nutritionDateInput");
  const nutritionTodayButton = document.getElementById("nutritionTodayButton");
  if (nutritionDateInput) {
    nutritionDateInput.addEventListener("change", () => initNutritionUI(nutritionDateInput.value || null));
  }
  if (nutritionTodayButton && nutritionDateInput) {
    nutritionTodayButton.addEventListener("click", () => {
      const todayKey = getTodayKey();
      nutritionDateInput.value = todayKey;
      initNutritionUI(todayKey);
    });
  }

  // Reset Übungen
  const resetBtn = document.getElementById("resetExercisesToday");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const ok = window.confirm("Möchtest du die Übungen für dieses Datum wirklich zurücksetzen?");
      if (!ok) return;

      const dataCurrent = loadData();
      const selectedKey = getSelectedDateKey("exercisesDateInput") || getTodayKey();

      if (!dataCurrent.exercises[selectedKey]) dataCurrent.exercises[selectedKey] = {};
      EXERCISES.forEach((ex) => { dataCurrent.exercises[selectedKey][ex.id] = false; });

      saveData(dataCurrent);
      initExercisesUI(selectedKey);
    });
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .catch((err) => console.warn("Service-Worker-Registrierung fehlgeschlagen:", err));
  });
}

// ---------------------------------------------------------------------------
// Debug Checks (nur bei ?debug=1)
// ---------------------------------------------------------------------------

function runDebugChecks() {
  const requiredIds = [
    // Dashboard
    "dailyGoalHistory",
    "todayExercisesValue",
    "todayNutritionValue",
    "todaySportValue",
    "todayOverallValue",
    "todayProgressBar",
    "dailyGoalDescription",
    // Sport
    "runningDistanceInput",
    "runningCurrentValue",
    "saveRunningButton",
    "deleteRunningButton",
    // Timer
    "timerHeatDisplay",
    "timerHeatStart",
    "timerHeatReset",
    "timerIceDisplay",
    "timerIceStart",
    "timerIceReset"
  ];

  const missing = requiredIds.filter((id) => !document.getElementById(id));
  if (missing.length) {
    console.warn("[Debug] Fehlende Elemente:", missing);
  } else {
    console.info("[Debug] Alle Pflicht-Elemente vorhanden.");
  }

}
