const PRESET_INTERVALS = [10, 30, 60, 120, 180];

const enabledEl = document.getElementById("enabled");
const intervalEl = document.getElementById("interval");
const customIntervalRow = document.getElementById("customIntervalRow");
const customIntervalEl = document.getElementById("customInterval");
const displayModeEls = document.querySelectorAll('input[name="displayMode"]');
const muteSoundEl = document.getElementById("muteSound");
const showNowBtn = document.getElementById("showNow");

function getSettingsFromForm() {
  let intervalMinutes;
  if (intervalEl.value === "custom") {
    intervalMinutes = Math.max(1, parseInt(customIntervalEl.value, 10) || 1);
  } else {
    intervalMinutes = parseInt(intervalEl.value, 10);
  }

  const displayMode = [...displayModeEls].find((el) => el.checked)?.value || "notification";

  return {
    enabled: enabledEl.checked,
    intervalMinutes,
    displayMode,
    muteNotificationSound: muteSoundEl.checked,
  };
}

function sendSettingsUpdate() {
  chrome.runtime.sendMessage({
    type: "SETTINGS_UPDATED",
    payload: getSettingsFromForm(),
  });
}

function syncCustomSelect() {
  const value = intervalEl.value;
  const container = document.getElementById("intervalContainer");
  const triggerText = document.getElementById("intervalTriggerText");
  if (!container || !triggerText) return;
  const options = container.querySelectorAll(".option");

  options.forEach((opt) => {
    if (opt.getAttribute("data-value") === value) {
      opt.classList.add("selected");
      triggerText.setAttribute("data-i18n", opt.getAttribute("data-i18n"));
      const translated = currentTranslations[opt.getAttribute("data-i18n")];
      triggerText.textContent = translated || opt.textContent;
    } else {
      opt.classList.remove("selected");
    }
  });
}

function applySettingsToForm(settings) {
  enabledEl.checked = settings.enabled;

  if (PRESET_INTERVALS.includes(settings.intervalMinutes)) {
    intervalEl.value = String(settings.intervalMinutes);
    customIntervalRow.hidden = true;
  } else {
    intervalEl.value = "custom";
    customIntervalRow.hidden = false;
    customIntervalEl.value = settings.intervalMinutes;
  }

  displayModeEls.forEach((el) => {
    el.checked = el.value === settings.displayMode;
  });

  muteSoundEl.checked = !!settings.muteNotificationSound;
  
  syncCustomSelect();
}

let currentLang = "en";
let currentTranslations = {};

async function loadTranslations(lang) {
  try {
    const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
    const res = await fetch(url);
    const data = await res.json();
    currentTranslations = {};
    for (const [key, value] of Object.entries(data)) {
      currentTranslations[key] = value.message;
    }
    currentLang = lang;
  } catch (e) {
    console.error("Failed to load translations for", lang, e);
  }
}

function localizeHtml(lang) {
  const dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const message = currentTranslations[key];
    if (message) {
      el.textContent = message;
    }
  });

  const langToggleBtn = document.getElementById("langToggle");
  if (langToggleBtn) {
    langToggleBtn.textContent = lang === "ar" ? "English" : "العربية";
  }
}

async function init() {
  const stored = await chrome.storage.sync.get(["language"]);
  let lang = stored.language || "ar";
  
  await loadTranslations(lang);
  localizeHtml(lang);

  const settings = await chrome.storage.sync.get([
    "enabled",
    "intervalMinutes",
    "displayMode",
    "muteNotificationSound",
  ]);
  applySettingsToForm(settings);
}

intervalEl.addEventListener("change", () => {
  customIntervalRow.hidden = intervalEl.value !== "custom";
  if (intervalEl.value !== "custom") {
    sendSettingsUpdate();
  }
});

customIntervalEl.addEventListener("change", sendSettingsUpdate);
enabledEl.addEventListener("change", sendSettingsUpdate);
muteSoundEl.addEventListener("change", sendSettingsUpdate);
displayModeEls.forEach((el) => el.addEventListener("change", sendSettingsUpdate));

showNowBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SHOW_NOW" });
});

const langToggleBtn = document.getElementById("langToggle");
if (langToggleBtn) {
  langToggleBtn.addEventListener("click", async () => {
    const nextLang = currentLang === "en" ? "ar" : "en";
    await loadTranslations(nextLang);
    localizeHtml(nextLang);
    await chrome.storage.sync.set({ language: nextLang });
  });
}

// Custom Select Event Handlers
const intervalContainer = document.getElementById("intervalContainer");
const intervalTrigger = document.getElementById("intervalTrigger");
const intervalOptions = document.getElementById("intervalOptions");

if (intervalTrigger && intervalOptions && intervalContainer) {
  intervalTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    intervalContainer.classList.toggle("active");
  });

  intervalTrigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      intervalContainer.classList.toggle("active");
    }
  });

  intervalOptions.querySelectorAll(".option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const val = opt.getAttribute("data-value");
      intervalEl.value = val;
      
      // Dispatch change event to trigger settings sync
      intervalEl.dispatchEvent(new Event("change"));
      
      syncCustomSelect();
      intervalContainer.classList.remove("active");
    });
  });

  // Close custom dropdown when clicking outside
  document.addEventListener("click", () => {
    intervalContainer.classList.remove("active");
  });
}

init();
