// ---------------------------------
// Weather card rendering + refresh
// ---------------------------------

import { fetchWeather } from './api.js';

// ---- Defaults
const DEFAULT_LAT = 54.58314393020901;
const DEFAULT_LON = -5.898022460442155;
const DEFAULT_REFRESH_MS = 10 * 60 * 1000; // 10 minutes

const FADE_MS = 300;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isoHourLocal(d = new Date()) {
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

function wxIcon(code) {
    if ([0].includes(code)) return "<span class='material-symbols-outlined'>sunny</span>";
    if ([1, 2].includes(code)) return "<span class='material-symbols-outlined'>partly_cloudy_day</span>";
    if ([3].includes(code)) return "<span class='material-symbols-outlined'>cloud</span>";
    if ([45, 48].includes(code)) return "<span class='material-symbols-outlined'>foggy</span>";
    if ([51, 53, 55, 61, 63, 65].includes(code)) return "<span class='material-symbols-outlined'>rainy</span>";
    if ([80, 81, 82].includes(code)) return "<span class='material-symbols-outlined'>sunny_snowing</span>";
    if ([95, 96, 99].includes(code)) return "<span class='material-symbols-outlined'>thunderstorm</span>";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "<span class='material-symbols-outlined'>ac_unit</span>";
    return "🌡️";
}

export function renderNextDays(data) {
    const d = data.daily;
    if (!d || !d.time) return;

    const container = document.getElementById("wx-next");
    if (!container) return;
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
      <div class="wx-ico"><small class="muted">${typeof rain === "number" ? rain + "%" : "—"}</small> ${wxIcon(code)}</div>
    `;
        container.appendChild(el);
    }
}

function publishToday({ code, iconHTML }) {
    try {
        localStorage.setItem("wx_today_code", String(code ?? ""));
        localStorage.setItem("wx_today_icon", iconHTML || "");
    } catch { }
    window.dispatchEvent(new CustomEvent("weather:update", { detail: { code, iconHTML } }));
}

export function renderWeatherCard(data) {
    const now = data.current_weather || {};
    const tempC = typeof now.temperature === "number" ? Math.round(now.temperature) : null;
    const current_code = typeof now.weathercode === "number" ? now.weathercode : null;

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

    const set = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    set("wx-temp", tempC != null ? `${tempC}°C` : "—");
    set("wx-rain", rainPct != null ? `${rainPct}%` : "—");
    set("wx-wind", windMph != null ? `${windMph} mph` : "—");
    set("wx-range", (tMin != null && tMax != null) ? `${Math.round(tMin)}° / ${Math.round(tMax)}°` : "—");
    set("wx-updated", `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);

    return {
        code: current_code,
        iconHTML: wxIcon(current_code)
    };
}

export function initWeather({
    lat = DEFAULT_LAT,
    lon = DEFAULT_LON,
    refreshMs = DEFAULT_REFRESH_MS,
} = {}) {
    async function updateWeatherCard() {
        try {
            const data = await fetchWeather(lat, lon, {
                temperature_unit: "celsius",
                wind_speed_unit: "mph",
                hourly: ["precipitation_probability"],
                daily: ["temperature_2m_max", "temperature_2m_min", "precipitation_probability_max", "weathercode"],
                current_weather: true,
            });
            const { code, iconHTML } = renderWeatherCard(data);
            publishToday({ code, iconHTML });
        } catch (e) {
            console.error("[Weather] fetch failed:", e);
            const el = document.getElementById("wx-updated");
            if (el) el.textContent = "Weather unavailable";
        }
    }

    updateWeatherCard();
    setInterval(updateWeatherCard, refreshMs);
}

export function initWeatherRotator({
    locations = [],
    refreshMs = DEFAULT_REFRESH_MS,
    rotateMs = 30 * 1000,
    nameSelector = ".wx-location-name",
} = {}) {
    if (!Array.isArray(locations) || locations.length === 0) return;

    let idx = 0;
    const cache = new Map();
    const keyOf = (loc) =>
        (loc?.name || `${loc?.latitude},${loc?.longitude}` || "loc").toLowerCase();

    const isFresh = (entry) => entry && (Date.now() - entry.ts) < refreshMs;

    async function getData(loc) {
        const key = keyOf(loc);
        const entry = cache.get(key);
        if (isFresh(entry)) return entry.data;

        const data = await fetchWeather(loc.latitude, loc.longitude, {
            temperature_unit: "celsius",
            wind_speed_unit: "mph",
            hourly: ["precipitation_probability"],
            daily: ["temperature_2m_max", "temperature_2m_min", "precipitation_probability_max", "weathercode"],
            current_weather: true,
        });
        cache.set(key, { data, ts: Date.now() });
        return data;
    }

    async function show(loc) {
        if (!loc) return;
        try {
            const data = await getData(loc);

            const shellSelector = '#card-logs'
            const shell = document.querySelector(shellSelector);
            if (shell) {
                shell.classList.add("fade-shell", "is-hiding");
                await sleep(FADE_MS);
            }

            const { code, iconHTML } = renderWeatherCard(data);
            publishToday({ code, iconHTML });

            const nameEl = document.querySelector(nameSelector);
            if (nameEl) nameEl.textContent = loc.name || `${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)}`;

            if (shell) {
                shell.classList.remove("is-hiding");
            }
        } catch (e) {
            console.error("[WeatherRotator] show failed:", e);
        }
    }
    // start with primary if present
    const pIdx = locations.findIndex(l => l && l.primary);
    idx = pIdx >= 0 ? pIdx : 0;

    show(locations[idx]);

    setInterval(() => {
        idx = (idx + 1) % locations.length;
        const loc = locations[idx];
        show(loc);
        console.log("[WeatherRotator] switching to", loc);
    }, rotateMs);
}
