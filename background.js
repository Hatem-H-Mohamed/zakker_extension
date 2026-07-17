const ALARM_NAME = "zakkerAlarm";

const DEFAULT_SETTINGS = {
  enabled: true,
  intervalMinutes: 60,
  displayMode: "notification", // "notification" | "overlay" | "both"
  muteNotificationSound: false,
};

async function loadAzkarData() {
  const url = chrome.runtime.getURL("daily_azkar.json");
  const res = await fetch(url);
  const azkarList = await res.json();
  await chrome.storage.local.set({ azkarList, shuffledQueue: [] });
}

async function initSettings() {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  await chrome.storage.sync.set(settings);
  return settings;
}

async function scheduleAlarm(intervalMinutes) {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });
}

function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function getNextZikr() {
  const { azkarList = [], shuffledQueue = [] } = await chrome.storage.local.get([
    "azkarList",
    "shuffledQueue",
  ]);
  if (!azkarList.length) return null;

  let queue = shuffledQueue;
  if (!queue.length) {
    queue = shuffle(azkarList.map((z) => z.id));
  }

  const nextId = queue[0];
  const remaining = queue.slice(1);
  await chrome.storage.local.set({ shuffledQueue: remaining });

  return azkarList.find((z) => z.id === nextId) || null;
}

async function showZikr(isManual = false) {
  const zikr = await getNextZikr();
  if (!zikr) return;

  const {
    displayMode = DEFAULT_SETTINGS.displayMode,
    muteNotificationSound = DEFAULT_SETTINGS.muteNotificationSound,
  } = await chrome.storage.sync.get(["displayMode", "muteNotificationSound"]);

  function showSystemNotification() {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Zakker - ذكّر",
      message: zikr.text,
      silent: muteNotificationSound,
    });
  }

  if (displayMode === "notification") {
    showSystemNotification();
  } else if (displayMode === "overlay") {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "DISPLAY_ZIKR", payload: { text: zikr.text } })
        .catch(() => {
          /* content script not present on this page (e.g. chrome:// URLs) */
        });
    }
  } else if (displayMode === "both") {
    let shownAsOverlay = false;
    try {
      const win = await chrome.windows.getLastFocused();
      if (isManual || (win && win.state !== "minimized" && win.focused)) {
        const queryOptions = isManual 
          ? { active: true, lastFocusedWindow: true } 
          : { active: true, windowId: win.id };
        const [tab] = await chrome.tabs.query(queryOptions);
        if (tab?.id) {
          const response = await chrome.tabs.sendMessage(tab.id, {
            type: "DISPLAY_ZIKR",
            payload: { text: zikr.text }
          });
          if (response && response.displayed) {
            shownAsOverlay = true;
          }
        }
      }
    } catch (err) {
      // Content script or window lookup failed, fallback to notification
    }

    if (!shownAsOverlay) {
      showSystemNotification();
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await loadAzkarData();
  const settings = await initSettings();
  if (settings.enabled) {
    await scheduleAlarm(settings.intervalMinutes);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await initSettings();
  if (settings.enabled) {
    await scheduleAlarm(settings.intervalMinutes);
  } else {
    await chrome.alarms.clear(ALARM_NAME);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const { enabled = true } = await chrome.storage.sync.get("enabled");
  if (enabled) {
    await showZikr();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SETTINGS_UPDATED") {
    (async () => {
      const settings = message.payload;
      await chrome.storage.sync.set(settings);
      if (settings.enabled) {
        await scheduleAlarm(settings.intervalMinutes);
      } else {
        await chrome.alarms.clear(ALARM_NAME);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "SHOW_NOW") {
    showZikr(true).then(() => sendResponse({ ok: true }));
    return true;
  }
});
