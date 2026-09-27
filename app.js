"use strict";

/* ===================== данные и конфигурация ===================== */

// В реальном режиме данные приходят из API; интерфейс адаптера ниже.
const createDataSource = () => ({
  // fetchStatuses() -> Promise<[{id, status}]>. Замените на реальный запрос.
  async fetchStatuses() { return null; },
});

const STATUSES = {
  clear:     { label: "без угроз",       color: "var(--clear)",     raw: "#34d399", rank: 0 },
  attention: { label: "внимание",        color: "var(--attention)", raw: "#facc15", rank: 1 },
  threat:    { label: "угроза БПЛА",     color: "var(--threat)",    raw: "#fb923c", rank: 2 },
  alert:     { label: "воздуш. тревога", color: "var(--alert)",    raw: "#f87171", rank: 3 },
};

const REGIONS = [
  ["Адыгея", 44.91, 40.10], ["Архангельская область", 64.54, 40.54],
  ["Астраханская область", 46.35, 48.04], ["Башкортостан", 54.74, 55.97],
  ["Белгородская область", 50.60, 36.58], ["Брянская область", 53.25, 34.37],
  ["Владимирская область", 56.13, 40.41], ["Волгоградская область", 48.71, 44.51],
  ["Вологодская область", 59.22, 39.89], ["Воронежская область", 51.67, 39.18],
  ["Донецкая Народная Республика", 48.00, 37.80], ["Запорожская область", 46.85, 35.37],
  ["Ивановская область", 57.00, 40.97], ["Калининградская область", 54.71, 20.51],
  ["Калужская область", 54.51, 36.26], ["Кировская область", 58.60, 49.66],
  ["Костромская область", 57.77, 40.93], ["Краснодарский край", 45.03, 38.98],
  ["Крым", 44.95, 34.10], ["Курская область", 51.73, 36.19],
  ["Липецкая область", 52.61, 39.60], ["Луганская Народная Республика", 48.57, 39.30],
  ["Марий Эл", 56.63, 47.89], ["Мордовия", 54.18, 45.18],
  ["Москва и Московская область", 55.75, 37.62], ["Нижегородская область", 56.33, 44.00],
  ["Оренбургская область", 51.77, 55.10], ["Орловская область", 52.97, 36.06],
  ["Пензенская область", 53.20, 45.00], ["Пермский край", 58.01, 56.25],
  ["Псковская область", 57.82, 28.33], ["Ростовская область", 47.23, 39.70],
  ["Рязанская область", 54.63, 39.74], ["Самарская область", 53.20, 50.15],
  ["Санкт-Петербург и Ленинградская область", 59.94, 30.31], ["Саратовская область", 51.53, 46.03],
  ["Севастополь", 44.62, 33.53], ["Смоленская область", 54.78, 32.05],
  ["Ставропольский край", 45.04, 41.97], ["Тамбовская область", 52.72, 41.44],
  ["Татарстан", 55.79, 49.11], ["Тверская область", 56.86, 35.91],
  ["Тульская область", 54.19, 37.62], ["Удмуртия", 56.85, 53.20],
  ["Ульяновская область", 54.32, 48.40], ["Херсонская область", 46.64, 32.60],
  ["Челябинская область", 55.16, 61.40], ["Чувашия", 56.13, 47.25],
  ["Ярославская область", 57.63, 39.87],
].map(([name, lat, lon], i) => ({
  id: "r" + i, name, lat, lon, status: "clear", since: Date.now(),
}));

const TIPS = {
  clear: ["Угроз не фиксируется — оставайтесь на связи", "Проверяйте обновления периодически"],
  attention: ["Будьте готовы к сигналу тревоги", "Держите при себе документы и заряженный телефон", "Уточните расположение ближайшего укрытия"],
  threat: ["При возможности перейдите в укрытие", "Избегайте открытых пространств и окон", "Следите за официальными сообщениями"],
  alert: ["Немедленно перейдите в укрытие", "Держитесь подальше от окон", "Не снимайте работу ПВО на видео", "Ждите отбоя тревоги в официальных источниках"],
};

/* ===================== состояние ===================== */

const state = { selected: null, soundOn: false, drawerRegion: null };
const byId = new Map(REGIONS.map((r) => [r.id, r]));
const els = {
  list: document.getElementById("regionList"),
  empty: document.getElementById("regionEmpty"),
  search: document.getElementById("regionSearch"),
  onlyActive: document.getElementById("onlyActive"),
  feed: document.getElementById("feedList"),
  feedPanel: document.getElementById("feedPanel"),
  map: document.getElementById("map"),
  mapNote: document.getElementById("mapNote"),
  drawer: document.getElementById("regionDrawer"),
  drawerBackdrop: document.getElementById("drawerBackdrop"),
};

let map = null;
const markers = new Map();
let audioCtx = null;
const feedItems = [];

/* ===================== демо-симуляция ===================== */

const seedRandom = (seed) => () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};

function initDemoStatuses() {
  const rnd = seedRandom(Date.now() % 100000);
  const pick = () => {
    const p = rnd();
    if (p < 0.14) return "alert";
    if (p < 0.34) return "threat";
    if (p < 0.52) return "attention";
    return "clear";
  };
  REGIONS.forEach((r) => { r.status = pick(); r.since = Date.now() - Math.floor(rnd() * 3600e3); });
}

// Раз в несколько секунд меняем статус случайного региона, как живой поток.
function startDemoTicker() {
  setInterval(() => {
    const r = REGIONS[Math.floor(Math.random() * REGIONS.length)];
    const prev = r.status;
    const nextPool = prev === "clear" ? ["attention", "threat"]
      : prev === "attention" ? ["clear", "threat", "alert"]
      : prev === "threat" ? ["attention", "alert", "clear"]
      : ["threat", "clear"];
    const next = nextPool[Math.floor(Math.random() * nextPool.length)];
    if (next === prev) return;
    setStatus(r, next);
    pushFeed(r, prev, next);
    if (state.soundOn && STATUSES[next].rank > STATUSES[prev].rank) beep();
  }, 6000);
}

/* ===================== рендер ===================== */

function setStatus(region, status) {
  region.status = status;
  region.since = Date.now();
  updateMarker(region);
  renderList();
  renderSummary();
}

function visibleRegions() {
  const q = els.search.value.trim().toLowerCase();
  return REGIONS
    .filter((r) => !q || r.name.toLowerCase().includes(q))
    .filter((r) => !els.onlyActive.checked || r.status !== "clear")
    .sort((a, b) => STATUSES[b.status].rank - STATUSES[a.status].rank || a.name.localeCompare(b.name, "ru"));
}

function renderList() {
  const items = visibleRegions();
  els.empty.hidden = items.length > 0;
  els.list.replaceChildren(
    ...items.map((r) => {
      const li = document.createElement("li");
      li.className = "region-item" + (state.selected === r.id ? " is-active" : "");
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      li.dataset.id = r.id;
      const dot = document.createElement("span");
      dot.className = `region-item__dot region-item__dot--${r.status}`;
      const name = document.createElement("span");
      name.className = "region-item__name";
      name.textContent = r.name;
      const time = document.createElement("span");
      time.className = "region-item__time";
      time.dataset.since = r.since;
      time.textContent = relTime(r.since);
      li.append(dot, name, time);
      return li;
    })
  );
}

function renderSummary() {
  const counts = { alert: 0, threat: 0, attention: 0, clear: 0 };
  REGIONS.forEach((r) => counts[r.status]++);
  document.getElementById("statAlert").textContent = counts.alert;
  document.getElementById("statThreat").textContent = counts.threat;
  document.getElementById("statAttention").textContent = counts.attention;
  document.getElementById("statClear").textContent = counts.clear;
  document.getElementById("statTotal").textContent = REGIONS.length;
}

function pushFeed(region, prev, next) {
  feedItems.unshift({ region: region.name, prev, next, at: Date.now() });
  if (feedItems.length > 40) feedItems.pop();
  renderFeed();
}

function renderFeed() {
  els.feed.replaceChildren(
    ...feedItems.map((f) => {
      const li = document.createElement("li");
      li.className = "feed-item feed-item--" + f.next;
      const head = document.createElement("div");
      head.className = "feed-item__head";
      const name = document.createElement("span");
      name.textContent = f.region;
      const time = document.createElement("span");
      time.className = "feed-item__time";
      time.dataset.since = f.at;
      time.textContent = relTime(f.at);
      head.append(name, time);
      const text = document.createElement("p");
      text.className = "feed-item__text";
      text.textContent = `${STATUSES[f.prev].label} → ${STATUSES[f.next].label}`;
      li.append(head, text);
      return li;
    })
  );
}

function relTime(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "меньше минуты";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч ${m % 60} мин`;
  return `${Math.floor(h / 24)} дн`;
}

function refreshTimes() {
  document.querySelectorAll("[data-since]").forEach((el) => {
    el.textContent = relTime(Number(el.dataset.since));
  });
}

/* ===================== карта ===================== */

function initMap() {
  if (typeof L === "undefined") {
    els.mapNote.hidden = false;
    els.mapNote.textContent = "Карта недоступна без доступа к CDN — списки и лента работают в обычном режиме.";
    return;
  }
  map = L.map(els.map, { zoomControl: true, attributionControl: true }).setView([54.5, 42], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  REGIONS.forEach((r) => {
    const m = L.circleMarker([r.lat, r.lon], {
      radius: r.status === "alert" ? 12 : r.status === "threat" ? 10 : r.status === "attention" ? 8 : 6,
      color: STATUSES[r.status].raw,
      weight: 2,
      fillColor: STATUSES[r.status].raw,
      fillOpacity: r.status === "clear" ? 0.35 : 0.55,
    }).addTo(map);
    m.on("click", () => openDrawer(r));
    markers.set(r.id, m);
  });
}

function updateMarker(r) {
  const m = markers.get(r.id);
  if (!m) return;
  m.setStyle({
    radius: r.status === "alert" ? 12 : r.status === "threat" ? 10 : r.status === "attention" ? 8 : 6,
    color: STATUSES[r.status].raw,
    fillColor: STATUSES[r.status].raw,
    fillOpacity: r.status === "clear" ? 0.35 : 0.55,
  });
}

function flyTo(r) {
  if (map) map.flyTo([r.lat, r.lon], 8, { duration: 0.8 });
}

/* ===================== панель региона ===================== */

function openDrawer(r) {
  state.drawerRegion = r;
  state.selected = r.id;
  const s = STATUSES[r.status];
  const badge = els.drawer.querySelector(".drawer__status");
  badge.textContent = s.label;
  badge.style.color = s.color;
  badge.style.borderColor = s.raw;
  document.getElementById("drawerTitle").textContent = r.name;
  document.getElementById("drawerSince").textContent = "Статус актуален: " + relTime(r.since);
  document.getElementById("drawerTips").replaceChildren(
    ...TIPS[r.status].map((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      return li;
    })
  );
  els.drawer.hidden = false;
  els.drawerBackdrop.hidden = false;
  renderList();
  document.getElementById("drawerClose").focus();
}

function closeDrawer() {
  els.drawer.hidden = true;
  els.drawerBackdrop.hidden = true;
  state.drawerRegion = null;
  renderList();
}

/* ===================== звук ===================== */

function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  } catch (_) { /* звук недоступен — не критично */ }
}

/* ===================== события ===================== */

els.list.addEventListener("click", (e) => {
  const li = e.target.closest(".region-item");
  if (li) openDrawer(byId.get(li.dataset.id));
});
els.list.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const li = e.target.closest(".region-item");
  if (li) { e.preventDefault(); openDrawer(byId.get(li.dataset.id)); }
});
els.search.addEventListener("input", renderList);
els.onlyActive.addEventListener("change", renderList);

document.getElementById("drawerClose").addEventListener("click", closeDrawer);
els.drawerBackdrop.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.drawer.hidden) closeDrawer();
});
document.getElementById("drawerShow").addEventListener("click", () => {
  if (state.drawerRegion) { flyTo(state.drawerRegion); closeDrawer(); }
});

const soundBtn = document.getElementById("soundToggle");
soundBtn.addEventListener("click", () => {
  state.soundOn = !state.soundOn;
  soundBtn.setAttribute("aria-pressed", String(state.soundOn));
  soundBtn.querySelector(".btn__icon").textContent = state.soundOn ? "🔔" : "🔕";
  soundBtn.querySelector(".btn__label").textContent = state.soundOn ? "Звук вкл" : "Звук выкл";
  if (state.soundOn) beep();
});

const feedBtn = document.getElementById("feedToggle");
feedBtn.addEventListener("click", () => {
  const open = els.feedPanel.hidden;
  els.feedPanel.hidden = !open;
  feedBtn.setAttribute("aria-expanded", String(open));
});

document.getElementById("locateBtn").addEventListener("click", () => {
  if (!navigator.geolocation) { flyTo(REGIONS[24]); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      let best = REGIONS[0], bestD = Infinity;
      for (const r of REGIONS) {
        const d = (r.lat - pos.coords.latitude) ** 2 + (r.lon - pos.coords.longitude) ** 2;
        if (d < bestD) { bestD = d; best = r; }
      }
      openDrawer(best);
      flyTo(best);
    },
    () => flyTo(REGIONS[24]),
    { timeout: 8000 }
  );
});

/* ===================== часы и старт ===================== */

function tickClock() {
  document.getElementById("clock").textContent =
    new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

async function boot() {
  initDemoStatuses();
  initMap();
  renderList();
  renderSummary();
  renderFeed();
  tickClock();
  setInterval(tickClock, 20000);
  setInterval(refreshTimes, 30000);

  // Пробуем реальный источник; если его нет — остаёмся в демо-режиме.
  try {
    const updates = await createDataSource().fetchStatuses();
    if (Array.isArray(updates)) {
      updates.forEach(({ id, status }) => { if (byId.has(id) && STATUSES[status]) setStatus(byId.get(id), status); });
      document.querySelector(".demo-pill").hidden = true;
    } else {
      startDemoTicker();
    }
  } catch (_) {
    startDemoTicker();
  }
}

boot();
