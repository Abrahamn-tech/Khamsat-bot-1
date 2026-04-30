// =============================
// CONFIG (REPLACE PLACEHOLDERS)
// =============================
const WEBHOOK_URL = "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage";
const WEBHOOK_CHAT_ID = "<YOUR_CHAT_ID>";

// Base URL for master page (fallback)
const MASTER_PAGE_URL = "https://khamsat.com/community/requests";

// Selectors (update as needed)
const SELECTOR_REQUEST_LINKS = "a.request-link";
const SELECTOR_REQUEST_TEXT = ".request-content, .topic-body, .request-details";
const SELECTOR_ADD_REPLY =
  "button.add-reply, a.add-reply, button[data-action='add-reply'], .add-comment, .reply-button";
const SELECTOR_TEXTAREA = "textarea";
const SELECTOR_CHECKBOX = "input[type='checkbox'].terms";
const SELECTOR_SUBMIT = "button[type='submit'], .submit";
const SELECTOR_SUCCESS = ".alert-success, .success-message, .notice-success";
const SELECTOR_WARNING = ".alert.alert-danger, .warning, .error";
const FALLBACK_ADD_REPLY_TEXTS = [
  "أضف تعليق",
  "اضف تعليق",
  "إضافة تعليق",
  "أضف رد",
  "اضف رد",
  "إضافة رد"
];
const FALLBACK_SUBMIT_TEXTS = [
  "أرسل",
  "ارسال",
  "إرسال",
  "إرسال الرد",
  "ارسل",
  "ارسال الرد"
];
const REQUEST_CONTAINER_SELECTORS = [
  ".requests-list",
  ".topic-list",
  ".topics-list",
  ".request-list",
  ".requests",
  ".community-requests",
  ".request-cards",
  "main",
  ".content",
  ".container"
];

// Storage keys
const STORAGE_PROCESSED = "processedRequestIds";
const STORAGE_FAILED = "failedRequestIds";
const STORAGE_FATIGUE_STATE = "fatigueState";
const STORAGE_FAILURE_STREAK = "consecutiveFailureCount";
const STORAGE_KILL_SWITCH = "killSwitchActive";
const STORAGE_DRAFT_CACHE = "draftCacheByRequestId";

// Timing
const MAX_WAIT_MS = 10000;
const POLLING_INTERVAL_MIN_MS = 60000;
const POLLING_INTERVAL_MAX_MS = 120000;
const TYPO_CHANCE_PER_CHAR = 0.01;
const TYPING_DELAY_MIN_MS = 90;
const TYPING_DELAY_MAX_MS = 250;
const TYPO_PAUSE_MS = 300;
const CORRECTION_PAUSE_MS = 150;
const READING_DELAY_MIN_MS = 3000;
const READING_DELAY_MAX_MS = 6000;
const UI_SHIFT_DELAY_MIN_MS = 1500;
const UI_SHIFT_DELAY_MAX_MS = 2500;
const STORAGE_LIST_LIMIT = 500;
const VISIBILITY_CHECK_INTERVAL_MS = 250;
const FATIGUE_TASKS_MIN = 3;
const FATIGUE_TASKS_MAX = 5;
const FATIGUE_BREAK_MIN_MS = 8 * 60 * 1000;
const FATIGUE_BREAK_MAX_MS = 15 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 3;
const MICRO_SCROLL_MIN_PX = 4;
const MICRO_SCROLL_MAX_PX = 18;
const MICRO_SCROLL_EDGE_BUFFER_PX = 6;
const MICRO_SCROLL_INTERVAL_MIN_MS = 250;
const MICRO_SCROLL_INTERVAL_MAX_MS = 900;
const API_BACKOFF_MIN_MS = 2 * 60 * 1000;
const API_BACKOFF_MAX_MS = 4 * 60 * 1000;
const DRAFT_PROBE_MIN_LENGTH = 40;
const DRAFT_PROBE_MAX_LENGTH = 120;
const AZURE_API_ERROR_PATTERN = /azure|openai|rate limit|too many requests|429/i;

// =============================
// Utilities
// =============================
let isPageVisible = !document.hidden;
let visibleSince = isPageVisible ? performance.now() : null;
let totalVisibleMs = 0;
const visibleWaiters = new Set();
const hiddenWaiters = new Set();
let killSwitchActive = false;
const SECURITY_CHALLENGE_SIGNATURES = [
  { label: "Cloudflare", pattern: /cloudflare/i },
  { label: "Captcha", pattern: /captcha/i },
  { label: "Are you human", pattern: /are you human/i },
  { label: "Access denied", pattern: /access denied/i },
  { label: "Attention required", pattern: /attention required/i },
  { label: "Verify you are human", pattern: /verify you are human/i },
  { label: "Robot check", pattern: /robot check/i }
];

function handleVisibilityChange() {
  if (document.hidden) {
    if (visibleSince !== null) {
      totalVisibleMs += performance.now() - visibleSince;
      visibleSince = null;
    }
    isPageVisible = false;
    for (const resolve of hiddenWaiters) {
      resolve();
    }
    hiddenWaiters.clear();
    return;
  }

  isPageVisible = true;
  visibleSince = performance.now();
  for (const resolve of visibleWaiters) {
    resolve();
  }
  visibleWaiters.clear();
}

document.addEventListener("visibilitychange", handleVisibilityChange);

function waitForVisibility() {
  if (isPageVisible) return Promise.resolve();
  return new Promise((resolve) => visibleWaiters.add(resolve));
}

function waitForHidden() {
  if (!isPageVisible) return Promise.resolve();
  return new Promise((resolve) => hiddenWaiters.add(resolve));
}

function getVisibleElapsedMs() {
  if (visibleSince === null) return totalVisibleMs;
  return totalVisibleMs + (performance.now() - visibleSince);
}

async function sleep(ms) {
  const startVisible = getVisibleElapsedMs();
  while (true) {
    await waitForVisibility();
    const elapsed = getVisibleElapsedMs() - startVisible;
    if (elapsed >= ms) return;
    const remaining = ms - elapsed;
    const slice = Math.min(remaining, VISIBILITY_CHECK_INTERVAL_MS);
    const raceResult = await Promise.race([
      new Promise((resolve) => setTimeout(() => resolve("timeout"), slice)),
      waitForHidden().then(() => "hidden")
    ]);
    if (raceResult === "hidden") {
      continue;
    }
  }
}

function getScrollingElement() {
  return document.scrollingElement || document.documentElement;
}

async function performMicroScroll() {
  await waitForVisibility();
  const scrollingElement = getScrollingElement();
  if (!scrollingElement) return;
  const maxScrollTop =
    scrollingElement.scrollHeight - scrollingElement.clientHeight;
  if (maxScrollTop <= 0) return;
  const currentTop = scrollingElement.scrollTop;
  let delta = randInt(MICRO_SCROLL_MIN_PX, MICRO_SCROLL_MAX_PX);
  if (Math.random() < 0.5) delta *= -1;
  if (currentTop <= MICRO_SCROLL_EDGE_BUFFER_PX) {
    delta = Math.abs(delta);
  } else if (currentTop >= maxScrollTop - MICRO_SCROLL_EDGE_BUFFER_PX) {
    delta = -Math.abs(delta);
  }
  const targetTop = Math.max(0, Math.min(maxScrollTop, currentTop + delta));
  if (targetTop === currentTop) return;
  window.dispatchEvent(
    new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: delta
    })
  );
  scrollingElement.scrollTop = targetTop;
}

async function sleepWithMicroScroll(durationMs) {
  const startVisible = getVisibleElapsedMs();
  let nextScrollAt = randInt(
    MICRO_SCROLL_INTERVAL_MIN_MS,
    MICRO_SCROLL_INTERVAL_MAX_MS
  );
  while (true) {
    await waitForVisibility();
    const elapsed = getVisibleElapsedMs() - startVisible;
    if (elapsed >= durationMs) return;
    if (elapsed >= nextScrollAt) {
      await performMicroScroll();
      nextScrollAt =
        elapsed +
        randInt(MICRO_SCROLL_INTERVAL_MIN_MS, MICRO_SCROLL_INTERVAL_MAX_MS);
    }
    const remaining = durationMs - elapsed;
    const untilNext = Math.max(0, nextScrollAt - elapsed);
    const slice = Math.min(
      remaining,
      Math.max(80, Math.min(400, untilNext))
    );
    await sleep(slice);
  }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function detectSecurityChallengeSignature() {
  const title = document.title || "";
  const bodyText =
    document.body?.innerText || document.body?.textContent || "";
  const haystack = `${title}\n${bodyText}`;
  if (!haystack.trim()) return null;
  const match = SECURITY_CHALLENGE_SIGNATURES.find(({ pattern }) =>
    pattern.test(haystack)
  );
  return match?.label || null;
}

async function runPreFlightSecurityCheck() {
  const signature = detectSecurityChallengeSignature();
  if (!signature) return false;
  await engageKillSwitch(
    `Pre-flight security challenge detected (${signature}). Halting automation.`
  );
  return true;
}

function findRequestListContainerNow() {
  const candidates = [];
  const seen = new Set();
  for (const selector of REQUEST_CONTAINER_SELECTORS) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!seen.has(node)) {
        candidates.push(node);
        seen.add(node);
      }
    }
  }
  let best = null;
  let bestCount = 0;
  for (const container of candidates) {
    const count = container.querySelectorAll(SELECTOR_REQUEST_LINKS).length;
    if (count > bestCount) {
      best = container;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : null;
}

function isMasterPage() {
  const url = window.location.href;
  if (url.includes("/community/requests") && !url.includes("/requests/")) return true;
  return !!findRequestListContainerNow();
}

function isDetailPage() {
  const url = window.location.href;
  if (url.includes("/community/requests/") || url.includes("add_comment")) return true;
  return !!document.querySelector(SELECTOR_REQUEST_TEXT);
}

function getRequestIdFromLink(link) {
  const href = link.getAttribute("href") || "";
  const match = href.match(/requests\/(\d+)/);
  return match?.[1] || href || link.textContent?.trim() || "unknown";
}

function getCurrentRequestId() {
  const url = window.location.href;
  const match = url.match(/requests\/(\d+)/);
  return match?.[1] || url;
}

async function getStorageList(key) {
  const data = await chrome.storage.local.get([key]);
  return data[key] || [];
}

async function addToStorageList(key, id) {
  const list = await getStorageList(key);
  const hasId = list.includes(id);
  let updated = list;
  let shouldPersist = false;

  if (!hasId) {
    const baseList =
      list.length >= STORAGE_LIST_LIMIT
        ? list.slice(list.length - (STORAGE_LIST_LIMIT - 1))
        : list;
    updated = [...baseList, id];
    shouldPersist = true;
  } else if (list.length > STORAGE_LIST_LIMIT) {
    updated = list.slice(list.length - STORAGE_LIST_LIMIT);
    shouldPersist = true;
  }

  if (shouldPersist) {
    await chrome.storage.local.set({ [key]: updated });
  }
}

async function getDraftCache() {
  const data = await chrome.storage.local.get([STORAGE_DRAFT_CACHE]);
  const stored = data[STORAGE_DRAFT_CACHE];
  if (stored && typeof stored === "object") {
    return stored;
  }
  if (stored !== undefined) {
    await chrome.storage.local.set({ [STORAGE_DRAFT_CACHE]: {} });
  }
  return {};
}

async function setDraftCache(cache) {
  await chrome.storage.local.set({ [STORAGE_DRAFT_CACHE]: cache });
}

async function getCachedDraft(requestId) {
  if (!requestId) return null;
  const cache = await getDraftCache();
  return cache[requestId] || null;
}

async function cacheDraft(requestId, draft) {
  if (!requestId || !draft) return;
  const cache = await getDraftCache();
  if (cache[requestId] === draft) return;
  await setDraftCache({ ...cache, [requestId]: draft });
}

async function clearCachedDraft(requestId) {
  if (!requestId) return;
  const cache = await getDraftCache();
  if (!Object.prototype.hasOwnProperty.call(cache, requestId)) return;
  const { [requestId]: _removed, ...rest } = cache;
  await setDraftCache(rest);
}

async function getFailureStreak() {
  const data = await chrome.storage.local.get([STORAGE_FAILURE_STREAK]);
  const stored = Number.isFinite(data[STORAGE_FAILURE_STREAK])
    ? data[STORAGE_FAILURE_STREAK]
    : 0;
  if (stored !== data[STORAGE_FAILURE_STREAK]) {
    await chrome.storage.local.set({ [STORAGE_FAILURE_STREAK]: stored });
  }
  return stored;
}

async function setFailureStreak(count) {
  await chrome.storage.local.set({ [STORAGE_FAILURE_STREAK]: count });
}

async function resetFailureStreak() {
  await setFailureStreak(0);
}

async function loadKillSwitchState() {
  const data = await chrome.storage.local.get([STORAGE_KILL_SWITCH]);
  killSwitchActive = !!data[STORAGE_KILL_SWITCH];
  return killSwitchActive;
}

async function engageKillSwitch(reason) {
  if (killSwitchActive) return;
  killSwitchActive = true;
  await chrome.storage.local.set({ [STORAGE_KILL_SWITCH]: true });
  visibleWaiters.clear();
  hiddenWaiters.clear();
  if (reason) {
    await safeWebhookNotify(`[Extension Fatal] ${reason}`);
  }
}

async function recordFailureAndMaybeKill() {
  const nextCount = (await getFailureStreak()) + 1;
  await setFailureStreak(nextCount);
  if (nextCount >= MAX_CONSECUTIVE_FAILURES) {
    await engageKillSwitch(
      `Kill switch engaged after ${nextCount} consecutive failures. Manual intervention required.`
    );
    return true;
  }
  return false;
}

async function getFatigueState() {
  const data = await chrome.storage.local.get([STORAGE_FATIGUE_STATE]);
  const stored = data[STORAGE_FATIGUE_STATE];
  if (stored && typeof stored === "object") {
    const normalized = {
      completedCount: Number.isFinite(stored.completedCount)
        ? stored.completedCount
        : 0,
      targetCount: Number.isFinite(stored.targetCount)
        ? stored.targetCount
        : randInt(FATIGUE_TASKS_MIN, FATIGUE_TASKS_MAX),
      breakUntil: Number.isFinite(stored.breakUntil) ? stored.breakUntil : 0
    };
    if (
      normalized.completedCount !== stored.completedCount ||
      normalized.targetCount !== stored.targetCount ||
      normalized.breakUntil !== stored.breakUntil
    ) {
      await chrome.storage.local.set({ [STORAGE_FATIGUE_STATE]: normalized });
    }
    return normalized;
  }
  const fresh = {
    completedCount: 0,
    targetCount: randInt(FATIGUE_TASKS_MIN, FATIGUE_TASKS_MAX),
    breakUntil: 0
  };
  await chrome.storage.local.set({ [STORAGE_FATIGUE_STATE]: fresh });
  return fresh;
}

async function setFatigueState(state) {
  await chrome.storage.local.set({ [STORAGE_FATIGUE_STATE]: state });
}

async function recordSuccessfulTaskForFatigue() {
  const state = await getFatigueState();
  if (state.breakUntil && Date.now() < state.breakUntil) {
    return;
  }
  const nextCount = state.completedCount + 1;
  if (nextCount >= state.targetCount) {
    const breakMs = randInt(FATIGUE_BREAK_MIN_MS, FATIGUE_BREAK_MAX_MS);
    const nextState = {
      completedCount: 0,
      targetCount: randInt(FATIGUE_TASKS_MIN, FATIGUE_TASKS_MAX),
      breakUntil: Date.now() + breakMs
    };
    await setFatigueState(nextState);
    return;
  }
  await setFatigueState({ ...state, completedCount: nextCount });
}

async function enforceFatigueBreakIfNeeded() {
  const state = await getFatigueState();
  if (state.breakUntil && Date.now() < state.breakUntil) {
    const remaining = state.breakUntil - Date.now();
    await sleep(remaining);
    await waitForVisibility();
    const refreshed = await getFatigueState();
    if (refreshed.breakUntil && Date.now() >= refreshed.breakUntil) {
      await setFatigueState({ ...refreshed, breakUntil: 0 });
    }
    window.location.reload();
    return true;
  }
  if (state.breakUntil && Date.now() >= state.breakUntil) {
    await setFatigueState({ ...state, breakUntil: 0 });
  }
  return false;
}


async function safeWebhookNotify(message) {
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: WEBHOOK_CHAT_ID,
        text: message
      })
    });
  } catch (err) {
    console.error("Webhook failed:", err);
  }
}

async function waitForElement(selector, timeoutMs = MAX_WAIT_MS) {
  const startVisible = getVisibleElapsedMs();
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (!isPageVisible) {
        await waitForVisibility();
        requestAnimationFrame(check);
        return;
      }
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (getVisibleElapsedMs() - startVisible > timeoutMs) {
        return reject(new Error(`Timeout waiting for element: ${selector}`));
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

function isElementVisibleNow(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const style = window.getComputedStyle(element);
  if (!style) return false;
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;
  return true;
}

function getFallbackCandidateText(element) {
  if (!element) return "";
  const parts = [
    element.innerText,
    element.textContent,
    element.value,
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("title")
  ];
  return parts.filter(Boolean).join(" ");
}

function findActionElementByTextNow(fallbackTexts) {
  if (!fallbackTexts?.length) return null;
  const normalizedFallbacks = fallbackTexts
    .map((text) => normalizeTextForMatch(text))
    .filter(Boolean);
  if (!normalizedFallbacks.length) return null;
  const selector = [
    "button",
    "a",
    "input[type='submit']",
    "input[type='button']",
    "[role='button']",
    "[role='link']"
  ].join(",");
  const nodes = Array.from(document.querySelectorAll(selector));
  for (const node of nodes) {
    if (!isElementVisibleNow(node)) continue;
    if (node.disabled) continue;
    const text = normalizeTextForMatch(getFallbackCandidateText(node));
    if (!text) continue;
    if (normalizedFallbacks.some((fallback) => text.includes(fallback))) {
      return node;
    }
  }
  return null;
}

async function waitForElementWithFallback(
  selector,
  fallbackTexts,
  timeoutMs = MAX_WAIT_MS
) {
  const startVisible = getVisibleElapsedMs();
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (!isPageVisible) {
        await waitForVisibility();
        requestAnimationFrame(check);
        return;
      }
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const fallback = findActionElementByTextNow(fallbackTexts);
      if (fallback) return resolve(fallback);
      if (getVisibleElapsedMs() - startVisible > timeoutMs) {
        return reject(new Error(`Timeout waiting for element: ${selector}`));
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

async function waitForTextInDOM(selector, timeoutMs = MAX_WAIT_MS) {
  const startVisible = getVisibleElapsedMs();
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (!isPageVisible) {
        await waitForVisibility();
        requestAnimationFrame(check);
        return;
      }
      const el = document.querySelector(selector);
      if (el && el.innerText?.trim()) return resolve(el.innerText.trim());
      if (getVisibleElapsedMs() - startVisible > timeoutMs) {
        return reject(new Error(`Timeout waiting for text: ${selector}`));
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

async function waitForRequestListContainer(timeoutMs = MAX_WAIT_MS) {
  const startVisible = getVisibleElapsedMs();
  return new Promise((resolve) => {
    const check = async () => {
      if (!isPageVisible) {
        await waitForVisibility();
        requestAnimationFrame(check);
        return;
      }
      const container = findRequestListContainerNow();
      if (container) return resolve(container);
      if (getVisibleElapsedMs() - startVisible > timeoutMs) {
        return resolve(null);
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

function cleanRequestText(raw) {
  return raw
    .replace(/^\s*مطلوب.*$/gm, "") // sample cleanup rule
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeTextForMatch(text) {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function getDraftProbeText(draft) {
  const normalized = normalizeTextForMatch(draft);
  if (!normalized) return "";
  const targetLen = Math.min(
    DRAFT_PROBE_MAX_LENGTH,
    Math.max(DRAFT_PROBE_MIN_LENGTH, Math.floor(normalized.length * 0.5))
  );
  return normalized.slice(0, targetLen);
}

function getPageTextExcludingTextareas(textareas = null) {
  const body = document.body;
  if (!body) return "";
  let text = body.innerText || "";
  const areas = textareas || Array.from(body.querySelectorAll("textarea"));
  for (const area of areas) {
    const value = area?.value?.trim();
    if (value) {
      text = text.replaceAll(value, " ");
    }
  }
  return text;
}

async function waitForDraftInjection(draft, timeoutMs = MAX_WAIT_MS) {
  const startVisible = getVisibleElapsedMs();
  const probe = getDraftProbeText(draft);
  const textareas = Array.from(document.querySelectorAll("textarea"));
  if (!probe) {
    throw new Error(
      "Draft verification failed: draft content is empty after normalization."
    );
  }
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (!isPageVisible) {
        await waitForVisibility();
        requestAnimationFrame(check);
        return;
      }
      const pageText = normalizeTextForMatch(
        getPageTextExcludingTextareas(textareas)
      );
      if (pageText.includes(probe)) return resolve(true);
      if (getVisibleElapsedMs() - startVisible > timeoutMs) {
        return reject(
          new Error(
            `Timeout waiting for draft to appear in the DOM after ${timeoutMs}ms.`
          )
        );
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

function isAzureApiError(err) {
  const message = `${err?.message || err || ""}`;
  return AZURE_API_ERROR_PATTERN.test(message);
}

async function enforceApiCooldownIfNeeded(err) {
  if (!isAzureApiError(err)) return false;
  const cooldownMs = randInt(API_BACKOFF_MIN_MS, API_BACKOFF_MAX_MS);
  console.warn(
    `Azure API issue detected. Enforcing cooldown for ${Math.round(
      cooldownMs / 1000
    )}s before returning to the master page.`
  );
  await sleep(cooldownMs);
  return true;
}

// =============================
// Emulated Pointer Trajectory
// =============================
function getRandomPoint(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + Math.random() * Math.max(rect.width, 1);
  const y = rect.top + Math.random() * Math.max(rect.height, 1);
  return { x, y };
}

function dispatchMouseEvent(element, type, point, options = {}) {
  element.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: point.x,
      clientY: point.y,
      ...options
    })
  );
}

function isElementFullyInViewport(element) {
  const rect = element.getBoundingClientRect();
  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth || 0;
  const viewportHeight =
    document.documentElement.clientHeight || window.innerHeight || 0;
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= viewportHeight &&
    rect.right <= viewportWidth
  );
}

function getElementDescriptor(element) {
  return `${element.tagName || "ELEMENT"}${element.id ? `#${element.id}` : ""}${
    element.className
      ? `.${String(element.className).trim().replace(/\s+/g, ".")}`
      : ""
  }`;
}

async function scrollElementIntoViewportIfNeeded(element, timeoutMs = MAX_WAIT_MS) {
  await waitForVisibility();
  if (isElementFullyInViewport(element)) return;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const behavior = prefersReducedMotion ? "auto" : "smooth";
  element.scrollIntoView({ behavior, block: "center", inline: "center" });
  const startVisible = getVisibleElapsedMs();
  while (getVisibleElapsedMs() - startVisible <= timeoutMs) {
    await waitForVisibility();
    if (isElementFullyInViewport(element)) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error(
    `Element did not become fully visible in viewport after ${timeoutMs}ms: ${getElementDescriptor(
      element
    )}.`
  );
}

async function simulateHumanClick(element) {
  if (!element) {
    throw new Error("Cannot simulate click: element is null or undefined.");
  }
  await waitForVisibility();
  const wasVisible = isElementFullyInViewport(element);
  await scrollElementIntoViewportIfNeeded(element);
  if (!wasVisible) {
    await sleep(randInt(UI_SHIFT_DELAY_MIN_MS, UI_SHIFT_DELAY_MAX_MS));
  }
  const point = getRandomPoint(element);

  dispatchMouseEvent(element, "mousemove", point);
  dispatchMouseEvent(element, "mouseenter", point);
  dispatchMouseEvent(element, "mouseover", point);
  await sleep(50);
  dispatchMouseEvent(element, "mousedown", point, { button: 0, buttons: 1 });
  await sleep(50);
  dispatchMouseEvent(element, "mouseup", point, { button: 0, buttons: 0 });
  dispatchMouseEvent(element, "click", point, { button: 0 });
}

// =============================
// Typo & Correction Typing Engine
// =============================
const TYPO_CHARS_LATIN = "abcdefghijklmnopqrstuvwxyz";
const TYPO_CHARS_ARABIC = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي";
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF]/;

function isArabicChar(ch) {
  return ARABIC_CHAR_REGEX.test(ch);
}

function randomTypoCharFor(ch) {
  const pool = isArabicChar(ch) ? TYPO_CHARS_ARABIC : TYPO_CHARS_LATIN;
  return pool[randInt(0, pool.length - 1)];
}

function dispatchInputEvent(element, data, inputType) {
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: false,
      data,
      inputType
    })
  );
}

function getNativeValueSetter(element) {
  if (element instanceof HTMLTextAreaElement) {
    return Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
  }
  if (element instanceof HTMLInputElement) {
    return Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
  }
  return Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    "value"
  )?.set;
}

function setNativeValue(element, value, setter) {
  const nativeSetter = setter || getNativeValueSetter(element);
  if (nativeSetter) {
    nativeSetter.call(element, value);
    return;
  }
  element.value = value;
}

async function typeLikeHuman(element, text) {
  await waitForVisibility();
  element.focus();
  const nativeSetter = getNativeValueSetter(element);
  let currentValue = "";
  setNativeValue(element, currentValue, nativeSetter);
  dispatchInputEvent(element, null, "deleteContentBackward");

  for (const ch of text) {
    await waitForVisibility();
    const delay = randInt(TYPING_DELAY_MIN_MS, TYPING_DELAY_MAX_MS);
    const makeTypo = Math.random() < TYPO_CHANCE_PER_CHAR;

    if (makeTypo) {
      const typo = randomTypoCharFor(ch);
      currentValue += typo;
      setNativeValue(element, currentValue, nativeSetter);
      dispatchInputEvent(element, typo, "insertText");
      await sleep(TYPO_PAUSE_MS);

      currentValue = currentValue.slice(0, -1);
      setNativeValue(element, currentValue, nativeSetter);
      dispatchInputEvent(element, null, "deleteContentBackward");
      await sleep(CORRECTION_PAUSE_MS);
    }

    currentValue += ch;
    setNativeValue(element, currentValue, nativeSetter);
    dispatchInputEvent(element, ch, "insertText");
    await sleep(delay);
  }
}

// =============================
// Error Handler
// =============================
async function failAndReturn(err, requestId) {
  console.error(err);
  await safeWebhookNotify(`[Extension Error] ${err.message || err}`);
  if (requestId) {
    await addToStorageList(STORAGE_FAILED, requestId);
  }
  await recordFailureAndMaybeKill();
  if (killSwitchActive) return;
  window.location.href = MASTER_PAGE_URL;
}

function isAddReplyTimeoutError(err) {
  const message = `${err?.message || err || ""}`;
  return message.includes(`Timeout waiting for element: ${SELECTOR_ADD_REPLY}`);
}

async function handleClosedRequest(requestId) {
  if (requestId) {
    await addToStorageList(STORAGE_PROCESSED, requestId);
  }
  await recordSuccessfulTaskForFatigue();
  await resetFailureStreak();
  window.location.href = MASTER_PAGE_URL;
}

// =============================
// Master Page Logic
// =============================
async function handleMasterPage() {
  await waitForVisibility();
  if (await enforceFatigueBreakIfNeeded()) return;
  await waitForVisibility();
  const container = await waitForRequestListContainer(MAX_WAIT_MS);
  if (!container) {
    await sleep(randInt(POLLING_INTERVAL_MIN_MS, POLLING_INTERVAL_MAX_MS));
    await waitForVisibility();
    window.location.reload();
    return;
  }
  const links = Array.from(container.querySelectorAll(SELECTOR_REQUEST_LINKS));
  const processed = await getStorageList(STORAGE_PROCESSED);
  const failed = await getStorageList(STORAGE_FAILED);
  const skipSet = new Set([...processed, ...failed]);

  for (const link of links) {
    const id = getRequestIdFromLink(link);
    if (!skipSet.has(id)) {
      await sleepWithMicroScroll(randInt(2000, 4000));
      await waitForVisibility();
      await simulateHumanClick(link);
      return;
    }
  }

  await sleep(randInt(POLLING_INTERVAL_MIN_MS, POLLING_INTERVAL_MAX_MS));
  await waitForVisibility();
  window.location.reload();
}

// =============================
// Detail Page Logic
// =============================
async function handleDetailPage() {
  const requestId = getCurrentRequestId();

  try {
    const rawText = await waitForTextInDOM(SELECTOR_REQUEST_TEXT, MAX_WAIT_MS);
    const requestText = cleanRequestText(rawText);

    await sleep(randInt(READING_DELAY_MIN_MS, READING_DELAY_MAX_MS));

    let draft = await getCachedDraft(requestId);
    if (!draft) {
      await waitForVisibility();
      const response = await chrome.runtime.sendMessage({
        type: "GENERATE_DRAFT",
        payload: { text: requestText }
      });

      if (!response?.ok || !response?.draft) {
        throw new Error(`Azure API failed: ${response?.error || "no draft"}`);
      }
      draft = response.draft;
      await cacheDraft(requestId, draft);
    }

    let addReplyButton;
    try {
      addReplyButton = await waitForElementWithFallback(
        SELECTOR_ADD_REPLY,
        FALLBACK_ADD_REPLY_TEXTS,
        MAX_WAIT_MS
      );
    } catch (err) {
      if (isAddReplyTimeoutError(err)) {
        await handleClosedRequest(requestId);
        return;
      }
      throw err;
    }
    await waitForVisibility();
    await simulateHumanClick(addReplyButton);
    await sleep(randInt(UI_SHIFT_DELAY_MIN_MS, UI_SHIFT_DELAY_MAX_MS));

    const textarea = await waitForElement(SELECTOR_TEXTAREA, MAX_WAIT_MS);
    await typeLikeHuman(textarea, draft);

    await sleep(randInt(1500, 3000));
    const checkbox = await waitForElement(SELECTOR_CHECKBOX, MAX_WAIT_MS);
    await waitForVisibility();
    const checkboxChecked =
      checkbox.checked || checkbox.getAttribute("aria-checked") === "true";
    if (!checkboxChecked) {
      await simulateHumanClick(checkbox);
    }

    await sleep(randInt(1000, 2500));
    const submitBtn = await waitForElementWithFallback(
      SELECTOR_SUBMIT,
      FALLBACK_SUBMIT_TEXTS,
      MAX_WAIT_MS
    );
    await waitForVisibility();
    await simulateHumanClick(submitBtn);

    await waitForDraftInjection(draft, MAX_WAIT_MS);
    await clearCachedDraft(requestId);
    await addToStorageList(STORAGE_PROCESSED, requestId);
    await recordSuccessfulTaskForFatigue();
    await resetFailureStreak();

    window.location.href = MASTER_PAGE_URL;
  } catch (err) {
    await enforceApiCooldownIfNeeded(err);
    await failAndReturn(err, requestId);
  }
}

// =============================
// Warning Detection (optional)
// =============================
function detectWarnings() {
  const warning = document.querySelector(SELECTOR_WARNING);
  if (warning) {
    const text = warning.innerText?.trim() || "Warning element detected.";
    safeWebhookNotify(`[Extension Warning] ${text}`);
  }
}

// =============================
// Bootstrap
// =============================
window.addEventListener("load", async () => {
  if (await runPreFlightSecurityCheck()) {
    console.error("Security challenge detected. Halting all operations.");
    return;
  }
  detectWarnings();

  if (await loadKillSwitchState()) {
    console.error("Kill switch active. Halting all operations.");
    return;
  }

  if (isMasterPage()) {
    await handleMasterPage();
    return;
  }

  if (isDetailPage()) {
    await handleDetailPage();
  }
});
