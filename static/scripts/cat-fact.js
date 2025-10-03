// -----------------------------
// Cat facts + avatars module
// -----------------------------

import { fetchFactsBatch } from './api.js';

const FACT_INTERVAL_MS_DEFAULT = 5 * 60 * 1000;     // 5 minutes
const FACTS_PER_HOUR_DEFAULT = Math.ceil(60 * 60 * 1000 / FACT_INTERVAL_MS_DEFAULT);
const PREFETCH_SIZE_DEFAULT = Math.max(FACTS_PER_HOUR_DEFAULT, 20);
const REFILL_THRESHOLD_DEFAULT = Math.floor(PREFETCH_SIZE_DEFAULT / 3);

let catFacts = [];
let factIdx = 0;
let factTimer = null;

export function displayCatFact(text, selector = '#catFactBox') {
    const el = document.querySelector(selector);
    if (el) el.textContent = text || '—';
}

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

export function loadCatAvatars(selector = '.cat-avatar') {
    document.querySelectorAll(selector).forEach(img => {
        img.src = `https://cataas.com/cat?type=square&${Math.random()}`;
    });
}

export function attachAvatarRefresh(selector = '.cat-avatar') {
    document.addEventListener('click', (e) => {
        if (e.target && e.target.matches(selector)) {
            loadCatAvatars(selector);
        }
    }, { passive: true });
}
