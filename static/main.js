const messages = [
  "Remember to stay hydrated!",
  "Remember to do the recycling!",
];

let currentIndex = 0;

function cycleMessages() {
  setStatus(messages[currentIndex]);
  currentIndex = (currentIndex + 1) % messages.length;
}

cycleMessages();
setInterval(cycleMessages, 10000);

async function fetchFeeding() {
  const res = await fetch("/api/feeding");
  return res.json();
}

async function setFeeding(time, fed) {
  const res = await fetch("/api/feeding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ time, fed })
  });
  return res.json();
}

function renderFeeding(feedMap) {
  document.querySelectorAll('input[data-feed]').forEach(cb => {
    cb.checked = !!feedMap[cb.dataset.feed];
  });
}

// async function getCatFact() {
//   const res = await fetch("https://catfact.ninja/fact");
//   if (!res.ok) throw new Error("Failed to fetch cat fact");
//   const data = await res.json();
//   return data.fact;
// }

function loadCatAvatars() {
  document.querySelectorAll('.cat-avatar').forEach(img => {
    img.src = `https://cataas.com/cat?type=square&${Math.random()}`;
  });
}
document.addEventListener('DOMContentLoaded', loadCatAvatars());

// click an avatar to refresh all
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('cat-avatar')) loadCatAvatars();
});


// async function displayCatFact() {
//   try {
//     const fact = await getCatFact();
//     document.getElementById("catFactBox").textContent = fact;
//   } catch (err) {
//     console.error(err);
//     document.getElementById("catFactBox").textContent = "Couldn't fetch a cat fact";
//   }
// }

// displayCatFact();
// setInterval(displayCatFact, 5 * 60 * 1000);

function updateStatusLabels(feedMap) {
  document.querySelectorAll('.feed-status').forEach(span => {
    const time = span.dataset.status;
    const fed = feedMap[time];
    if (fed) {
      span.textContent = "Fed";
      span.classList.add("fed");
      span.classList.remove("not-fed");
    } else {
      span.textContent = "Not fed";
      span.classList.add("not-fed");
      span.classList.remove("fed");
    }
  });
}

function updateClock() {
  const now = new Date();
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  const dateStr = now.toLocaleDateString('en-GB', options);
  const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });
  document.getElementById('timeDisplay').textContent = `${dateStr} ${timeStr}`;
}

function renderToolbarIcons() {
  const iconsBox = document.getElementById("toolbarIcons");
  iconsBox.innerHTML = ""; // clear any existing icons

  const today = new Date().getDay();

  if (today === 3) { // Wednesday / binday
    const binIcon = document.createElement("span");
    binIcon.className = "icon material-symbols-outlined";
    binIcon.textContent = "delete";
    binIcon.title = "Bin day!";
    iconsBox.appendChild(binIcon);
  }
}

renderToolbarIcons();
setInterval(renderToolbarIcons, 60 * 60 * 1000); // hourly check

// Belfast coords TODO: make configurable
const LAT_BFS = 54.58314393020901, LON_BFS = -5.898022460442155;

// const LAT_BFS = 54.5973, LON_BFS = -5.9301;

const WX_REFRESH_MS = 10 * 60 * 1000;

function isoHourLocal(d = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

async function fetchWeatherBelfast() {
  const params = new URLSearchParams({
    latitude: LAT_BFS,
    longitude: LON_BFS,
    timezone: "auto",
    current_weather: "true",
    hourly: "precipitation_probability",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode",
    temperature_unit: "celsius",
    wind_speed_unit: "ms"
  });
  const res = await fetch("https://api.open-meteo.com/v1/forecast?" + params.toString());
  if (!res.ok) throw new Error("Weather fetch failed");
  return res.json();
}

function wxIcon(code) {
  // Minimal mapping (Open-Meteo weather codes)
  if ([0].includes(code)) return "<span class='material-symbols-outlined'>sunny</span>";
  if ([1, 2].includes(code)) return "<span class='material-symbols-outlined'>partly_cloudy_day</span>";
  if ([3].includes(code)) return "<span class='material-symbols-outlined'>cloud</span>";;
  if ([45, 48].includes(code)) return "<span class='material-symbols-outlined'>foggy</span>";;
  if ([51, 53, 55, 61, 63, 65].includes(code)) return "<span class='material-symbols-outlined'>rainy</span>";;
  if ([80, 81, 82].includes(code)) return "<span class='material-symbols-outlined'>sunny_snowing</span>";
  if ([95, 96, 99].includes(code)) return "<span class='material-symbols-outlined'>thunderstorm</span>";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "<span class='material-symbols-outlined'>ac_unit</span>";
  return "🌡️";
}

function renderNextDays(data) {
  const d = data.daily;
  if (!d || !d.time) return;

  const container = document.getElementById("wx-next");
  container.innerHTML = "";

  const count = Math.min(3, d.time.length);
  for (let i = 1; i < count; i++) {
    const dateStr = d.time[i]; // ISO date (YYYY-MM-DD)
    const day = new Date(dateStr + "T00:00");
    const label = i === 0 ? "Today" : day.toLocaleDateString(undefined, { weekday: "short" });

    const min = Math.round(d.temperature_2m_min[i]);
    const max = Math.round(d.temperature_2m_max[i]);
    const rain = d.precipitation_probability_max?.[i];
    const code = d.weathercode?.[i] ?? null;

    const el = document.createElement("div");
    el.className = "wx-day";
    el.innerHTML = `
      <div class="wx-when">${label}</div>
      <div class="wx-minmax">${min}° / ${max}°</div>
      <div class="wx-ico"> <small class="muted" id="rain-forecast">${typeof rain === "number" ? rain + "%" : "—"}</small> ${wxIcon(code)}</div>
    `;
    container.appendChild(el);
  }
}

async function loadLists() {
  const res = await fetch('/api/lists');
  const data = await res.json();
  const select = document.getElementById('listSelect');
  select.innerHTML = '';
  data.lists.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    select.appendChild(opt);
  });
  if (data.lists.length > 0) {
    renderList(select.value);
  }
}

async function renderList(name) {
  const res = await fetch(`/api/lists/${name}`);
  const data = await res.json();
  const listEl = document.getElementById('listItems');
  listEl.innerHTML = '';

  data.items.forEach(item => {
    const li = document.createElement('li');
    if (item.done) li.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.done;
    checkbox.addEventListener('change', async () => {
      await fetch(`/api/lists/${name}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: checkbox.checked })
      });
      renderList(name);
    });

    const text = document.createElement('span');
    text.textContent = item.text;

    const del = document.createElement('button');
    del.innerHTML = '✖';
    del.addEventListener('click', async () => {
      await fetch(`/api/lists/${name}/items/${item.id}`, { method: 'DELETE' });
      renderList(name);
    });

    li.appendChild(checkbox);
    li.appendChild(text);
    li.appendChild(del);
    listEl.appendChild(li);
  });
}

document.getElementById('listSelect').addEventListener('change', (e) => {
  renderList(e.target.value);
});

document.getElementById('addItemBtn').addEventListener('click', async () => {
  const name = document.getElementById('listSelect').value;
  const textEl = document.getElementById('newItemText');
  const text = textEl.value.trim();
  if (!text) return;
  await fetch(`/api/lists/${name}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  textEl.value = '';
  renderList(name);
});

document.getElementById('clearDoneBtn').addEventListener('click', async () => {
  const name = document.getElementById('listSelect').value;
  await fetch(`/api/lists/${name}/clear_done`, { method: 'POST' });
  renderList(name);
});

document.addEventListener('DOMContentLoaded', loadLists);

function renderWeatherCard(data) {
  const now = data.current_weather || {};
  const tempC = typeof now.temperature === "number" ? Math.round(now.temperature) : null;
  renderNextDays(data);

  // wind speed m/s -> mph
  const windMps = typeof now.windspeed === "number" ? now.windspeed : null;
  const windMph = windMps != null ? Math.round(windMps * 2.23694) : null;

  // rain chance for current local hour
  const times = data.hourly?.time || [];
  const idx = times.indexOf(isoHourLocal());
  let rainPct = null;
  if (idx >= 0 && Array.isArray(data.hourly.precipitation_probability)) {
    const v = data.hourly.precipitation_probability[idx];
    rainPct = (typeof v === "number") ? v : null;
  }

  // today range
  const tMax = data.daily?.temperature_2m_max?.[0];
  const tMin = data.daily?.temperature_2m_min?.[0];

  document.getElementById("wx-temp").textContent = tempC != null ? `${tempC}°C` : "—";
  document.getElementById("wx-rain").textContent = rainPct != null ? `${rainPct}%` : "—";
  document.getElementById("wx-wind").textContent = windMph != null ? `${windMph} mph` : "—";
  document.getElementById("wx-range").textContent = (tMin != null && tMax != null) ? `${Math.round(tMin)}° / ${Math.round(tMax)}°` : "—";
  document.getElementById("wx-updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

async function updateWeatherCard() {
  try {
    const data = await fetchWeatherBelfast();
    renderWeatherCard(data);
  } catch (e) {
    console.error(e);
    document.getElementById("wx-updated").textContent = "Weather unavailable";
  }
}

updateWeatherCard();
setInterval(updateWeatherCard, WX_REFRESH_MS);

function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === id));
  document.querySelectorAll('.tab').forEach(b => {
    const sel = b.dataset.target === id;
    b.setAttribute('aria-selected', sel ? 'true' : 'false');
  });
  localStorage.setItem('activePanel', id);
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => showPanel(btn.dataset.target));
});

const saved = localStorage.getItem('activePanel');
if (saved && document.getElementById(saved)) showPanel(saved);
else showPanel('card-feed'); // default


function setStatus(text) {
  document.getElementById("statusText").textContent = text;
}

async function apiGetFood() {
  const r = await fetch("/api/food");
  if (!r.ok) throw new Error("food get failed");
  return r.json(); // { pouches_left: n }
}

async function apiAddFood(amount) {
  const r = await fetch("/api/food/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount })
  });
  if (!r.ok) throw new Error("food add failed");
  return r.json();
}

function initPouchesChips() {
  const valEl = document.getElementById("pouchesValue");

  async function refresh() {
    try {
      const data = await apiGetFood();
      valEl.textContent = data.pouches_left;
    } catch {
      valEl.textContent = "—";
    }
  }

  async function add(amount) {
    try {
      const data = await apiAddFood(amount);
      valEl.textContent = data.pouches_left;
    } catch {
      console.error("Add pouches failed");
    }
  }

  document.querySelectorAll(".pouches-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const amount = parseInt(chip.dataset.add, 10);
      add(amount);
    });
  });

  refresh();
}

document.addEventListener("DOMContentLoaded", initPouchesChips);

function initSSE() {
  const es = new EventSource("/events");

  es.addEventListener("pouches:update", (e) => {
    const data = JSON.parse(e.data);
    const el = document.getElementById("pouchesValue");
    if (el && typeof data.pouches_left === "number") {
      el.textContent = data.pouches_left;
    }
  });

  es.addEventListener("feeding:update", (e) => {
    const data = JSON.parse(e.data); // { feeding: {...} }
    if (data && data.feeding) {
      renderFeeding(data.feeding);
      updateStatusLabels(data.feeding);
    }
  });

  // helper: which list is currently selected in your UI
  function currentListName() {
    const sel = document.getElementById("listSelect");
    return sel ? (sel.value || sel.dataset.default || "todo") : "todo";
  }

  // helper: re-fetch and render the given list (you already have something like this)
  async function refreshList(name) {
    const res = await fetch(`/api/lists/${encodeURIComponent(name)}`);
    const data = await res.json();
    renderList(name, data); // <- your existing renderer
  }

  es.addEventListener("lists:update", (e) => {
    const { name } = JSON.parse(e.data);
    if (name === currentListName()) {
      clearTimeout(window.__listDeb);
      window.__listDeb = setTimeout(() => renderList(name), 120);
    }
  });

  es.addEventListener("heartbeat", () => {
    // optional: set a "connected" indicator
  });

  es.onerror = () => {
    // optional: show "disconnected" badge; EventSource auto-reconnects
  };
}

// ---- Cat facts cache with hourly prefetch ----
const CATFACT_URL = "https://catfact.ninja/facts"; // batch endpoint
const FACT_INTERVAL_MS = 5 * 60 * 1000;            // how often you rotate
const FACTS_PER_HOUR = Math.ceil(60 * 60 * 1000 / FACT_INTERVAL_MS); // e.g., 12
const PREFETCH_SIZE = Math.max(FACTS_PER_HOUR, 20); // fetch at least a good chunk
const REFILL_THRESHOLD = Math.floor(PREFETCH_SIZE / 3); // when cache drops below this, refill

let catFacts = [];
let factIdx = 0;
let factTimer = null;

async function fetchFactsBatch(limit = PREFETCH_SIZE) {
  try {
    const res = await fetch(`${CATFACT_URL}?limit=${limit}`);
    if (!res.ok) throw new Error("cat facts fetch failed");
    const data = await res.json();
    console.log("[CatFacts] Fetched", (data.data || []).length, "facts");
    // API returns { data: [{fact, length}, ...], ... }
    const facts = (data.data || [])
      .map(x => (x.fact || "").trim())
      .filter(Boolean);
    return facts;
  } catch (e) {
    console.error("[CatFacts] Fetch error:", e);
    return [];
  }
}

function displayCatFact(text) {
  const el = document.getElementById("catFactBox");
  if (el) el.textContent = text || "—";
}

async function ensureFacts() {
  // if we're low, top up
  if (catFacts.length - factIdx <= REFILL_THRESHOLD) {
    const fresh = await fetchFactsBatch(PREFETCH_SIZE);
    if (fresh.length) {
      // Append new facts; also de-dup quick & dirty
      const seen = new Set(catFacts.slice(factIdx)); // only keep unseen window
      fresh.forEach(f => { if (!seen.has(f)) catFacts.push(f); });
      // Optional: cap growth
      const windowFacts = catFacts.slice(factIdx);
      if (windowFacts.length > PREFETCH_SIZE * 3) {
        // drop older consumed facts
        catFacts = windowFacts;
        factIdx = 0;
      }
    }
  }
}

async function nextCatFact() {
  if (factIdx >= catFacts.length) {
    // empty or exhausted, force fetch
    const fresh = await fetchFactsBatch(PREFETCH_SIZE);
    catFacts = fresh;
    factIdx = 0;
  }
  const fact = catFacts[factIdx] || "Cats are cute. (No facts available right now.)";
  factIdx += 1;
  displayCatFact(fact);
  // kick off a background refill if we’re getting low
  ensureFacts();
}

function startCatFacts(intervalMs = FACT_INTERVAL_MS) {
  // initial prefetch then start rotation
  (async () => {
    const fresh = await fetchFactsBatch(PREFETCH_SIZE);
    if (fresh.length) {
      catFacts = fresh;
      factIdx = 0;
    }
    await nextCatFact(); // show first immediately
    if (factTimer) clearInterval(factTimer);
    factTimer = setInterval(nextCatFact, intervalMs);
  })();
}


document.addEventListener("DOMContentLoaded", () => {
  startCatFacts(FACT_INTERVAL_MS);
});


async function init() {
  initSSE();
  const initialState = await fetchFeeding();
  renderFeeding(initialState);
  updateStatusLabels(initialState);

  document.querySelectorAll('input[data-feed]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const updated = await setFeeding(cb.dataset.feed, cb.checked);
      renderFeeding(updated);
      updateStatusLabels(updated);
    });
  });

  // Poll every few seconds to keep UI in sync
  setInterval(async () => {
    const current = await fetchFeeding();
    renderFeeding(current);
    updateStatusLabels(current);
  }, 3000);

  setStatus();

  updateClock();
  setInterval(updateClock, 1000);
}

document.addEventListener('DOMContentLoaded', init);
