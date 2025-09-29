const messages = [
  "Don't forget to smile :)",
  "Remember to stay hydrated!",
  "Remember to do the recycling",
];

let currentIndex = 0;

function cycleMessages() {
  setStatus(messages[currentIndex]);
  currentIndex = (currentIndex + 1) % messages.length;
}

cycleMessages(); // show first immediately
setInterval(cycleMessages, 10000); // change every 10 seconds

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

  if (today === 3) { // Wednesday
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
const LAT_BFS = 54.5973, LON_BFS = -5.9301;
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
  if ([0].includes(code)) return "☀️";
  if ([1, 2].includes(code)) return "⛅";
  if ([3].includes(code)) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 61, 63, 65].includes(code)) return "🌧️";
  if ([80, 81, 82].includes(code)) return "🌦️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
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
      <div class="wx-ico">${wxIcon(code)}</div>
      <div class="wx-minmax">${min}° / ${max}°</div>
      <div class="wx-rain">${typeof rain === "number" ? rain + "%" : "—"}</div>
    `;
    container.appendChild(el);
  }
}

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

async function init() {
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
