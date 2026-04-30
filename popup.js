const STORAGE_MASTER_TOGGLE = "masterToggleEnabled";
const STORAGE_SESSION_START = "telemetrySessionStart";
const STORAGE_REFRESH_COUNT = "telemetryRefreshCount";
const STORAGE_APPLIED_COUNT = "telemetryAppliedCount";
const STORAGE_HISTORY = "telemetryHistoryByDate";

const toggleEl = document.getElementById("master-toggle");
const statusEl = document.getElementById("status-text");
const uptimeEl = document.getElementById("uptime-value");
const refreshEl = document.getElementById("refresh-count");
const jobsEl = document.getElementById("jobs-count");
const dailyEl = document.getElementById("daily-rate");
const weeklyEl = document.getElementById("weekly-rate");
const monthlyEl = document.getElementById("monthly-rate");

let latestSnapshot = null;
let updatingToggle = false;

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function normalizeSnapshot(data = {}) {
  return {
    masterToggleEnabled:
      typeof data.masterToggleEnabled === "boolean"
        ? data.masterToggleEnabled
        : true,
    sessionStartAt: Number.isFinite(data.sessionStartAt)
      ? data.sessionStartAt
      : 0,
    refreshCount: Number.isFinite(data.refreshCount) ? data.refreshCount : 0,
    jobsApplied: Number.isFinite(data.jobsApplied) ? data.jobsApplied : 0,
    history:
      data.history && typeof data.history === "object" && !Array.isArray(data.history)
        ? data.history
        : {}
  };
}

async function fetchTelemetrySnapshot() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_TELEMETRY_SNAPSHOT"
    });
    if (response?.ok) {
      return normalizeSnapshot(response.data);
    }
  } catch (err) {
    console.warn("Telemetry message failed:", err);
  }
  const data = await chrome.storage.local.get([
    STORAGE_MASTER_TOGGLE,
    STORAGE_SESSION_START,
    STORAGE_REFRESH_COUNT,
    STORAGE_APPLIED_COUNT,
    STORAGE_HISTORY
  ]);
  return normalizeSnapshot({
    masterToggleEnabled:
      typeof data[STORAGE_MASTER_TOGGLE] === "boolean"
        ? data[STORAGE_MASTER_TOGGLE]
        : true,
    sessionStartAt: Number.isFinite(data[STORAGE_SESSION_START])
      ? data[STORAGE_SESSION_START]
      : 0,
    refreshCount: Number.isFinite(data[STORAGE_REFRESH_COUNT])
      ? data[STORAGE_REFRESH_COUNT]
      : 0,
    jobsApplied: Number.isFinite(data[STORAGE_APPLIED_COUNT])
      ? data[STORAGE_APPLIED_COUNT]
      : 0,
    history:
      data[STORAGE_HISTORY] &&
      typeof data[STORAGE_HISTORY] === "object" &&
      !Array.isArray(data[STORAGE_HISTORY])
        ? data[STORAGE_HISTORY]
        : {}
  });
}

function sumHistory(history, days) {
  let total = 0;
  for (let i = 0; i < days; i += 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = getLocalDateKey(date);
    total += Number.isFinite(history[key]) ? history[key] : 0;
  }
  return total;
}

function renderSnapshot(snapshot) {
  if (!snapshot) return;
  updatingToggle = true;
  toggleEl.checked = snapshot.masterToggleEnabled;
  updatingToggle = false;

  statusEl.textContent = snapshot.masterToggleEnabled ? "Active" : "Paused";
  statusEl.classList.toggle("off", !snapshot.masterToggleEnabled);

  const uptimeMs =
    snapshot.masterToggleEnabled && snapshot.sessionStartAt > 0
      ? Date.now() - snapshot.sessionStartAt
      : 0;
  uptimeEl.textContent = snapshot.masterToggleEnabled
    ? formatDuration(uptimeMs)
    : "Paused";

  refreshEl.textContent = snapshot.refreshCount.toString();
  jobsEl.textContent = snapshot.jobsApplied.toString();

  const history = snapshot.history || {};
  dailyEl.textContent = sumHistory(history, 1).toString();
  weeklyEl.textContent = sumHistory(history, 7).toString();
  monthlyEl.textContent = sumHistory(history, 30).toString();
}

async function refreshSnapshot() {
  latestSnapshot = await fetchTelemetrySnapshot();
  renderSnapshot(latestSnapshot);
}

toggleEl.addEventListener("change", async () => {
  if (updatingToggle) return;
  const enabled = toggleEl.checked;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_MASTER_TOGGLE",
      payload: { enabled }
    });
    if (!response?.ok) {
      console.error("Failed to update toggle:", response?.error || "unknown");
    }
  } catch (err) {
    console.error("Failed to update toggle:", err);
  } finally {
    await refreshSnapshot();
  }
});

refreshSnapshot();
setInterval(() => {
  if (latestSnapshot) {
    renderSnapshot(latestSnapshot);
  }
}, 1000);
setInterval(refreshSnapshot, 5000);
