// =============================
// CONFIG (REPLACE PLACEHOLDERS)
// =============================
const AZURE_OPENAI_ENDPOINT = "https://YOUR_AZURE_RESOURCE_NAME.openai.azure.com";
const AZURE_DEPLOYMENT_NAME = "YOUR_DEPLOYMENT_NAME";
const AZURE_OPENAI_API_KEY = "YOUR_AZURE_OPENAI_API_KEY";

const STORAGE_MASTER_TOGGLE = "masterToggleEnabled";
const STORAGE_SESSION_START = "telemetrySessionStart";
const STORAGE_REFRESH_COUNT = "telemetryRefreshCount";
const STORAGE_APPLIED_COUNT = "telemetryAppliedCount";
const STORAGE_HISTORY = "telemetryHistoryByDate";

// Updated system prompt (required)
const SYSTEM_PROMPT =
  "You are a Senior Arabic Freelancer. Write a very direct, highly professional proposal answering this specific client requirement. CRITICAL RULES: 1. DO NOT use generic AI openings like 'I read your request and I can help'. 2. Start directly with the technical solution or value you provide. 3. Keep it short (2-4 sentences max). 4. Use a confident, human tone.";

async function fetchAzureOpenAI(userText) {
  const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview`;

  const body = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userText }
    ],
    temperature: 0.7,
    max_tokens: 300
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "api-key": AZURE_OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Azure OpenAI error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message?.content?.trim();
  return message || "";
}

async function getTelemetrySnapshot() {
  const data = await chrome.storage.local.get([
    STORAGE_MASTER_TOGGLE,
    STORAGE_SESSION_START,
    STORAGE_REFRESH_COUNT,
    STORAGE_APPLIED_COUNT,
    STORAGE_HISTORY
  ]);
  return {
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
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "GENERATE_DRAFT") {
    fetchAzureOpenAI(msg.payload.text)
      .then((draft) => sendResponse({ ok: true, draft }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg?.type === "SET_MASTER_TOGGLE") {
    const enabled = !!msg?.payload?.enabled;
    chrome.storage.local
      .set({ [STORAGE_MASTER_TOGGLE]: enabled })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg?.type === "GET_TELEMETRY_SNAPSHOT") {
    getTelemetrySnapshot()
      .then((snapshot) => sendResponse({ ok: true, data: snapshot }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
