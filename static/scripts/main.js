// -------------------------------------------------
// Bootstrap for Curly Potato UI (ES module)
// -------------------------------------------------

import { fetchFeeding, setFeeding } from './api.js';

import { renderFeeding, updateStatusLabels } from './feeding.js';
import { initPouchesChips } from './pouches.js';
import { initListsUI } from './lists.js';
import { initSSE } from './sse.js';
import { initWeather, initWeatherRotator } from './weather.js';
import { startCatFacts, loadCatAvatars, attachAvatarRefresh } from './cat-fact.js';

// Fetch config from server
async function fetchConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error("Failed to fetch config");
  return res.json();
}

let config;

// Toolbar status messages
const messages = [
  "Remember to stay hydrated!",
  "Remember to do the recycling!",
  "Tea break time? You’ve earned it.",
  "A tidy space is a tidy mind.",
];

let statusMessages = [...messages];
let currentMsgIndex = 0;

async function fetchTodoMessages() {
  try {
    const res = await fetch('/api/lists/todo');
    if (!res.ok) throw new Error('Failed to fetch todo list');
    const data = await res.json();

    const todoMsgs = (data.items || [])
      .filter(it => !it.done)
      .map(it => `Todo: ${it.text}`);

    statusMessages = [...messages, ...todoMsgs];
  } catch (e) {
    console.error('[Status] Todo fetch failed', e);
    statusMessages = [...messages]; // fallback
  }
}

function cycleStatusMessages() {
  if (statusMessages.length === 0) return;
  const msg = statusMessages[currentMsgIndex];
  document.getElementById('statusText').textContent = msg;
  currentMsgIndex = (currentMsgIndex + 1) % statusMessages.length;
}

// Clock + toolbar icons
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

  const BIN_DAY = config?.bin.collection_day || 3; // default to Wednesday if not set
  if (new Date().getDay() === BIN_DAY) {
    const bin = document.createElement("span");
    bin.className = "icon material-symbols-outlined";
    bin.textContent = "delete";
    bin.title = "Bin day!";
    box.appendChild(bin);
  }

  // weather icon
  if (iconHTML) {
    const wrap = document.createElement("span");
    wrap.className = "icon";
    wrap.innerHTML = iconHTML;   // safe because the string is produced locally
    box.appendChild(wrap);
  }
}

// subscribe to weather updates
window.addEventListener("weather:update", (e) => {
  const { iconHTML } = e.detail || {};
  renderToolbarIcons({ iconHTML });
});

const cachedIcon = localStorage.getItem("wx_today_icon");
renderToolbarIcons({ iconHTML: cachedIcon });

// Tabs
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

// Feeding toggles (UI events)
function initFeedingToggles() {
  document.querySelectorAll('input[data-feed]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const updated = await setFeeding(cb.dataset.feed, cb.checked);
      renderFeeding(updated);
      updateStatusLabels(updated);
    });
  });
}

// Bootstrap
document.addEventListener('DOMContentLoaded', async () => {
  try {
    config = await fetchConfig();
  } catch (err) {
    console.error('Config fetch failed', err);
  }

  const locs = Array.isArray(config?.locations) ? config.locations : [];
  const refreshMs = (config?.ui?.weather_refresh_minutes ?? 10) * 60 * 1000;
  console.log(locs)

  if (locs.length > 1) {
    initWeatherRotator({
      locations: locs,
      refreshMs,
      rotateMs: 30_000,
      nameSelector: '.wx-location-name',
      shellSelector: '#card-logs',
    });
  } else {
    const loc = locs[0] ?? { latitude: 54.5831, longitude: -5.8980 };
    initWeather({ lat: loc.latitude, lon: loc.longitude, refreshMs });
  }

  // Live updates first so UI reacts quickly
  initSSE();
  // Panels & toolbar basics
  initTabs();
  renderToolbarIcons();
  setInterval(renderToolbarIcons, 60 * 60 * 1000); // hourly refresh

  updateClock();
  setInterval(updateClock, 1000);

  // Rotate status messages
  fetchTodoMessages();                          // initial
  setInterval(fetchTodoMessages, 5 * 60 * 1000); // refresh every 5 min
  setInterval(cycleStatusMessages, 10000);       // cycle messages every 10s

  // Optional: update immediately when lists change via SSE
  const es = new EventSource('/events');
  es.addEventListener('lists:update', fetchTodoMessages);

  // Weather (Belfast defaults; change via options if needed)

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

  setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const current = await fetchFeeding();
      renderFeeding(current);
      updateStatusLabels(current);
    } catch { }
  }, 15_000);
});
