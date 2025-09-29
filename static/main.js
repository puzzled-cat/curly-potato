async function fetchFeeding() {
  const res = await fetch("/api/feeding");
  return res.json();
}

async function setFeeding(time, fed) {
  const res = await fetch("/api/feeding", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({time, fed})
  });
  return res.json();
}

function renderFeeding(feedMap) {
  document.querySelectorAll('input[data-feed]').forEach(cb => {
    cb.checked = !!feedMap[cb.dataset.feed];
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
  renderFeeding(await fetchFeeding());

  document.querySelectorAll('input[data-feed]').forEach(cb => {
    cb.addEventListener('change', async () => {
      await setFeeding(cb.dataset.feed, cb.checked);
    });
  });

  setInterval(async () => {
    renderFeeding(await fetchFeeding());
  }, 3000);

  updateClock();
  setInterval(updateClock, 1000);
}

document.addEventListener('DOMContentLoaded', init);
