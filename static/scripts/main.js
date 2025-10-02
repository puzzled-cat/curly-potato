// static/js/main.js
// -------------------------------------------------
// Bootstrap for Curly Potato UI (ES module)
// -------------------------------------------------

// API calls
import { fetchFeeding, setFeeding } from './api.js';

// UI helpers
import { renderFeeding, updateStatusLabels } from './feeding.js';
import { initPouchesChips } from './pouches.js';
import { initListsUI } from './lists.js';

// Live updates + weather + cat facts
import { initSSE } from './sse.js';
import { initWeather } from './weather.js';
import { startCatFacts, loadCatAvatars, attachAvatarRefresh } from './cat-fact.js';

// -----------------------------
// Toolbar status messages
// -----------------------------
const messages = [
  "Remember to stay hydrated!",
  "Remember to do the recycling!",
];
let currentIndex = 0;

function setStatus(text = "") {
  const el = document.getElementById("statusText");
  if (el) el.textContent = text;
}

function cycleMessages() {
  setStatus(messages[currentIndex]);
  currentIndex = (currentIndex + 1) % messages.length;
}

// -----------------------------
// Clock + toolbar icons
// -----------------------------
function updateClock() {
  const now = new Date();
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  const dateStr = now.toLocaleDateString('en-GB', options);
  const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });
  const el = document.getElementById('timeDisplay');
  if (el) el.textContent = `${dateStr} ${timeStr}`;
}

function renderToolbarIcons({ iconHTML = null } = {}) {
  const box = document.getElementById("toolbarIcons");
  if (!box) return;
  box.innerHTML = "";

  // bin-day (Wednesday)
  if (new Date().getDay() === 3) {
    const bin = document.createElement("span");
    bin.className = "icon material-symbols-outlined";
    bin.textContent = "delete";
    bin.title = "Bin day!";
    box.appendChild(bin);
  }

  // weather icon from weather.js (already-built HTML)
  if (iconHTML) {
    const wrap = document.createElement("span");
    wrap.className = "icon";
    wrap.innerHTML = iconHTML;   // safe because the string is produced locally by your code
    box.appendChild(wrap);
  }
}

// subscribe to weather updates
window.addEventListener("weather:update", (e) => {
  const { iconHTML } = e.detail || {};
  renderToolbarIcons({ iconHTML });
});

// first paint: use cached icon (if present)
const cachedIcon = localStorage.getItem("wx_today_icon");
renderToolbarIcons({ iconHTML: cachedIcon });

// -----------------------------
// Tabs
// -----------------------------
function showPanel(id) {
  document.querySelectorAll('.panel')
    .forEach(p => p.classList.toggle('active', p.id === id));

  document.querySelectorAll('.tab')
    .forEach(b => {
      const sel = b.dataset.target === id;
      b.setAttribute('aria-selected', sel ? 'true' : 'false');
    });

  localStorage.setItem('activePanel', id);
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => showPanel(btn.dataset.target));
  });

  const saved = localStorage.getItem('activePanel');
  if (saved && document.getElementById(saved)) showPanel(saved);
  else showPanel('card-logs'); // default
}

// -----------------------------
// Feeding toggles (UI events)
// -----------------------------
function initFeedingToggles() {
  document.querySelectorAll('input[data-feed]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const updated = await setFeeding(cb.dataset.feed, cb.checked);
      renderFeeding(updated);
      updateStatusLabels(updated);
    });
  });
}

// -----------------------------
// Bootstrap
// -----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Live updates first so UI reacts quickly
  initSSE();

  // Panels & toolbar basics
  initTabs();
  renderToolbarIcons();
  setInterval(renderToolbarIcons, 60 * 60 * 1000); // hourly refresh

  updateClock();
  setInterval(updateClock, 1000);

  // Rotate status messages
  cycleMessages();
  setInterval(cycleMessages, 10_000);

  // Weather (Belfast defaults; change via options if needed)
  initWeather();

  // Cat facts + avatars
  startCatFacts({ intervalMs: 5 * 60 * 1000, selector: '#catFactBox' });
  loadCatAvatars('.cat-avatar');
  attachAvatarRefresh('.cat-avatar');

  // Lists UI
  initListsUI();

  // Pouches chips (+6/+12)
  initPouchesChips();

  // Initial feeding state + UI bindings
  try {
    const initialState = await fetchFeeding();
    renderFeeding(initialState);
    updateStatusLabels(initialState);
  } catch (e) {
    console.warn("[Init] Failed to load feeding state:", e);
  }
  initFeedingToggles();

  // (Optional) light fallback poll in case SSE is blocked
  // Poll only when the tab is visible to reduce noise.
  setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const current = await fetchFeeding();
      renderFeeding(current);
      updateStatusLabels(current);
    } catch { }
  }, 15_000);
});
