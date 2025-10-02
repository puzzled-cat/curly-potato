// static/js/catfacts.js
// -----------------------------
// Cat facts + avatars module
// -----------------------------

import { fetchFactsBatch } from './api.js';

// ---- Config (override via init/start args if you like)
const CATFACT_URL = "https://catfact.ninja/facts"; // kept for reference
const FACT_INTERVAL_MS_DEFAULT = 5 * 60 * 1000;     // 5 minutes
const FACTS_PER_HOUR_DEFAULT = Math.ceil(60 * 60 * 1000 / FACT_INTERVAL_MS_DEFAULT);
const PREFETCH_SIZE_DEFAULT = Math.max(FACTS_PER_HOUR_DEFAULT, 20);
const REFILL_THRESHOLD_DEFAULT = Math.floor(PREFETCH_SIZE_DEFAULT / 3);

// ---- Internal state
let catFacts = [];
let factIdx = 0;
let factTimer = null;

// ---- Rendering
export function displayCatFact(text, selector = '#catFactBox') {
    const el = document.querySelector(selector);
    if (el) el.textContent = text || '—';
}

// ---- Ensure cache has enough facts, refill when low
export async function ensureFacts(prefetchSize = PREFETCH_SIZE_DEFAULT, refillThreshold = REFILL_THRESHOLD_DEFAULT) {
    if (catFacts.length - factIdx <= refillThreshold) {
        const fresh = await fetchFactsBatch(prefetchSize);
        if (fresh.length) {
            // Deduplicate against the unseen window
            const seen = new Set(catFacts.slice(factIdx));
            fresh.forEach(f => { if (!seen.has(f)) catFacts.push(f); });

            // Optional cap to prevent unbounded growth
            const windowFacts = catFacts.slice(factIdx);
            if (windowFacts.length > prefetchSize * 3) {
                catFacts = windowFacts;
                factIdx = 0;
            }
        }
    }
}

// ---- Advance + show next fact, refill in background if low
export async function nextCatFact(prefetchSize = PREFETCH_SIZE_DEFAULT, selector = '#catFactBox') {
    if (factIdx >= catFacts.length) {
        const fresh = await fetchFactsBatch(prefetchSize);
        catFacts = fresh;
        factIdx = 0;
    }
    const fact = catFacts[factIdx] || 'Cats are cute. (No facts available right now.)';
    factIdx += 1;
    displayCatFact(fact, selector);
    // background refill (no await)
    ensureFacts(prefetchSize);
}

// ---- Start rotating facts on an interval
export function startCatFacts({
    intervalMs = FACT_INTERVAL_MS_DEFAULT,
    prefetchSize = PREFETCH_SIZE_DEFAULT,
    selector = '#catFactBox'
} = {}) {
    // initial prefetch then start rotation
    (async () => {
        const fresh = await fetchFactsBatch(prefetchSize);
        if (fresh.length) {
            catFacts = fresh;
            factIdx = 0;
        }
        await nextCatFact(prefetchSize, selector); // show first immediately
        if (factTimer) clearInterval(factTimer);
        factTimer = setInterval(() => nextCatFact(prefetchSize, selector), intervalMs);
    })();
}

// ---- Avatars (CATAAS)
export function loadCatAvatars(selector = '.cat-avatar') {
    document.querySelectorAll(selector).forEach(img => {
        // type=square gives a square crop that circles nicely with border-radius
        img.src = `https://cataas.com/cat?type=square&${Math.random()}`;
    });
}

/**
 * Attach a click handler that refreshes all avatars when any avatar is clicked.
 * Call once during bootstrap.
 */
export function attachAvatarRefresh(selector = '.cat-avatar') {
    document.addEventListener('click', (e) => {
        if (e.target && e.target.matches(selector)) {
            loadCatAvatars(selector);
        }
    }, { passive: true });
}
