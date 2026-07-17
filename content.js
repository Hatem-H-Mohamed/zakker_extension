const OVERLAY_ID = "zakker-overlay-card";
const AUTO_DISMISS_MS = 5000;

function showOverlay(text) {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const card = document.createElement("div");
  card.id = OVERLAY_ID;
  card.dir = "rtl";
  card.lang = "ar";

  // Header container
  const header = document.createElement("div");
  header.className = "zakker-header";

  // Brand group
  const brandGroup = document.createElement("div");
  brandGroup.className = "zakker-brand-group";

  const logoImg = document.createElement("img");
  logoImg.className = "zakker-mini-logo";
  logoImg.src = chrome.runtime.getURL("icons/logo.png");
  logoImg.alt = "Zakker";

  const titleEl = document.createElement("span");
  titleEl.className = "zakker-title";
  titleEl.textContent = "Zakker";

  const arabicEl = document.createElement("span");
  arabicEl.className = "zakker-arabic";
  arabicEl.textContent = "ذكّر";

  brandGroup.appendChild(logoImg);
  brandGroup.appendChild(titleEl);
  brandGroup.appendChild(arabicEl);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "zakker-close-btn";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => {
    card.classList.remove("zakker-visible");
    card.addEventListener("transitionend", () => card.remove(), { once: true });
  });

  header.appendChild(brandGroup);
  header.appendChild(closeBtn);

  // Content text
  const textEl = document.createElement("div");
  textEl.className = "zakker-text";
  textEl.textContent = text;

  // Progress bar
  const progressBar = document.createElement("div");
  progressBar.className = "zakker-progress-bar";

  card.appendChild(header);
  card.appendChild(textEl);
  card.appendChild(progressBar);

  document.body.appendChild(card);

  requestAnimationFrame(() => card.classList.add("zakker-visible"));

  setTimeout(() => {
    if (document.body.contains(card)) {
      card.classList.remove("zakker-visible");
      card.addEventListener("transitionend", () => card.remove(), { once: true });
    }
  }, AUTO_DISMISS_MS);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "DISPLAY_ZIKR") {
    showOverlay(message.payload.text);
    if (sendResponse) sendResponse({ displayed: true });
  }
});
