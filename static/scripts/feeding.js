// -----------------------------
// Feeding UI helpers
// -----------------------------

/**
 * Updates the state of the feeding checkboxes on the UI
 * based on the current feeding map.
 * @param {Object} feedMap - e.g. { "09:00": true, "12:00": false, ... }
 */
export function renderFeeding(feedMap) {
    document.querySelectorAll('input[data-feed]').forEach(cb => {
        cb.checked = !!feedMap[cb.dataset.feed];
    });
}

/**
 * Updates the status labels ("Fed" / "Not fed") for each time slot
 * to reflect the current feeding map.
 * @param {Object} feedMap - e.g. { "09:00": true, "12:00": false, ... }
 */
export function updateStatusLabels(feedMap) {
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
