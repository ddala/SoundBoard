// ======== Settings ========
const CONFIG_URL = 'config.json'; // adjust if you place the config elsewhere
const DEFAULT_THUMB = 'https://via.placeholder.com/300x200?text=No+Image';

// ======== State ========
let allSounds = [];               // loaded config
let categories = [];              // unique category names
const player = document.getElementById('player');
const nowPlaying = document.getElementById('nowPlaying');

// --- Simple toast using Bootstrap
function toast(msg, color='dark') {
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${color} border-0 position-fixed bottom-0 end-0 m-3`;
  el.role = 'alert';
  el.ariaLive = 'assertive';
  el.ariaAtomic = 'true';
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${escapeHtml(msg)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
  document.body.appendChild(el);
  const t = new window.bootstrap.Toast(el, { delay: 3500 });
  t.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

// --- Config
async function loadConfig() {
  try {
    const res = await fetch(CONFIG_URL, {cache: 'no-store'});
    if (!res.ok) throw new Error('Config fetch failed');
    const cfg = await res.json();
    if (!cfg || !Array.isArray(cfg.sounds)) throw new Error('Invalid config schema');
    return cfg.sounds;
  } catch (e) {
    console.warn('[Config] using demo fallback because:', e.message);
    return [
      { filename: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_8f0c3a.mp3?filename=notification-2-27397.mp3', displayName: 'Demo Bell', type: 'sound', category: 'Alerts', thumbnail: null },
      { filename: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_ef6d0f.mp3?filename=lofi-study-112191.mp3', displayName: 'Demo Lofi', type: 'song', category: 'Music', thumbnail: null }
    ];
  }
}

// --- Rendering
function renderTabs() {
  const tabList = document.getElementById('categoryTabs');
  const tabContent = document.getElementById('categoryTabContent');
  tabList.innerHTML = ''; tabContent.innerHTML = '';

  const byCat = new Map();
  for (const s of allSounds) {
    if (!byCat.has(s.category)) byCat.set(s.category, []);
    byCat.get(s.category).push(s);
  }
  categories = [...byCat.keys()];

  const empty = document.getElementById('emptyState');
  empty.classList.toggle('d-none', categories.length > 0);
  if (!categories.length) return;

  categories.forEach((cat, idx) => {
    const tabId = `tab-${cssSafe(cat)}`;
    tabList.insertAdjacentHTML('beforeend', `
      <li class="nav-item" role="presentation">
        <button class="nav-link ${idx===0?'active':''}" id="${tabId}-tab" data-bs-toggle="tab" data-bs-target="#${tabId}" type="button" role="tab" aria-controls="${tabId}" aria-selected="${idx===0}">${escapeHtml(cat)}</button>
      </li>`);

    const items = byCat.get(cat).map(renderCard).join('');
    tabContent.insertAdjacentHTML('beforeend', `
      <div class="tab-pane fade ${idx===0?'show active':''}" id="${tabId}" role="tabpanel" aria-labelledby="${tabId}-tab">
        <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">${items}</div>
      </div>`);
  });
}

function renderCard(sound) {
  const id = idForSound(sound);
  const thumb = sound.thumbnail ? resolveUrl(sound.thumbnail) : DEFAULT_THUMB;
  const type = (sound.type ?? 'sound').toLowerCase();
  const badgeClass = type === 'song' ? 'badge-song' : 'badge-sound';

  return `
    <div class="col">
      <div class="card h-100 sound-card" id="card-${id}">
        <div class="card-body">
          <div class="card-media">
            <img src="${thumb}" class="thumb-left" alt="thumbnail" onerror="this.src='${DEFAULT_THUMB}'">
            <div class="d-flex flex-column gap-2 w-100">
              <div class="title-line mb-1">
                <h5 class="card-title mb-0 text-truncate">${escapeHtml(sound.displayName ?? 'Untitled')}</h5>
                <span class="badge ${badgeClass} pill">${escapeHtml(sound.type ?? 'sound')}</span>
              </div>
              <div class="controls">
                <button class="btn btn-primary btn-sm" data-action="play" data-id="${id}"><i class="bi bi-play-fill"></i></button>
                <button class="btn btn-outline-secondary btn-sm" data-action="pause" data-id="${id}" disabled><i class="bi bi-pause-fill"></i></button>
                <button class="btn btn-outline-danger btn-sm" data-action="stop" data-id="${id}" disabled><i class="bi bi-stop-fill"></i></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}


// --- Controls
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  const sound = allSounds.find(s => idForSound(s) === id);
  if (!sound) return;
  if (action === 'play') playSound(sound);
  if (action === 'pause') togglePause(sound);
  if (action === 'stop') stopSound(sound);
});

async function playSound(sound) {
  try {
    const src = resolveUrl(sound.filename);
    if (!src) throw new Error('Missing filename');
    if (player.src !== src) player.src = src;
    await player.play();
    updateButtons(sound, 'playing');
    nowPlaying.textContent = `Now playing: ${sound.displayName ?? 'Untitled'}`;
  } catch (e) {
    console.error('play error', e);
    toast('Unable to play. Check the media URL or your browser settings.');
  }
}
function togglePause(sound) {
  if (player.paused) {
    player.play().then(() => updateButtons(sound, 'playing')).catch(()=>{});
  } else {
    player.pause();
    updateButtons(sound, 'paused');
  }
}
function stopSound(sound) {
  player.pause();
  player.currentTime = 0;
  updateButtons(sound, 'stopped');
  nowPlaying.textContent = '';
}

// End of track -> reset UI
player.addEventListener('ended', () => {
  updateAllButtons('stopped');
  nowPlaying.textContent = '';
});

// UI state sync
function updateButtons(sound, state) {
  updateAllButtons('stopped'); // single-source model: reset others
  const id = idForSound(sound);
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  const btnPlay = card.querySelector('[data-action="play"]');
  const btnPause = card.querySelector('[data-action="pause"]');
  const btnStop = card.querySelector('[data-action="stop"]');
  if (state === 'playing') { btnPlay.disabled = true; btnPause.disabled = false; btnStop.disabled = false; }
  else if (state === 'paused') { btnPlay.disabled = false; btnPause.disabled = false; btnStop.disabled = false; }
  else { btnPlay.disabled = false; btnPause.disabled = true; btnStop.disabled = true; }
}
function updateAllButtons(state) {
  document.querySelectorAll('.sound-card').forEach(card => {
    const btnPlay = card.querySelector('[data-action="play"]');
    const btnPause = card.querySelector('[data-action="pause"]');
    const btnStop = card.querySelector('[data-action="stop"]');
    if (state === 'playing') { btnPlay.disabled = true; btnPause.disabled = false; btnStop.disabled = false; }
    else if (state === 'paused') { btnPlay.disabled = false; btnPause.disabled = false; btnStop.disabled = false; }
    else { btnPlay.disabled = false; btnPause.disabled = true; btnStop.disabled = true; }
  });
}

// --- Helpers
function cssSafe(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-'); }
function idForSound(s) { return btoa(unescape(encodeURIComponent(`${s.category}|${s.displayName}|${s.filename}`))).replace(/=/g,''); }
function escapeHtml(s) { return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function resolveUrl(path) { try { return path ? new URL(path, document.baseURI).href : ''; } catch { return path || ''; } }

// --- Clock & startup
setInterval(() => {
  const d = new Date();
  const el = document.getElementById('clock');
  if (el) el.textContent = d.toLocaleString();
}, 1000);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    allSounds = await loadConfig();
    renderTabs();
  } catch (err) {
    console.error('init error', err);
    toast('Failed to initialize. See console.', 'danger');
  }
});
