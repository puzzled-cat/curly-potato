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

async function init() {
  // Load initial state
  const initialState = await fetchFeeding();
  renderFeeding(initialState);
  updateStatusLabels(initialState);

  // Toggle handler
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

  updateClock();
  setInterval(updateClock, 1000);
}

document.addEventListener('DOMContentLoaded', init);
