import {
  analyzeParty,
  buildEncounterForecast,
  generateDungeon,
  placeEncounters,
  TILE_INFO,
} from "./lib/adventure.js";

const STORAGE_KEY = "delvewright-session-v1";
const DEFAULT_PARTY = [
  {
    id: crypto.randomUUID(),
    name: "Mira Vale",
    class: "Ranger",
    level: 4,
    hp: 31,
    maxHp: 36,
    ac: 16,
    resource: 3,
    maxResource: 4,
  },
  {
    id: crypto.randomUUID(),
    name: "Thorn",
    class: "Fighter",
    level: 4,
    hp: 42,
    maxHp: 42,
    ac: 18,
    resource: 4,
    maxResource: 4,
  },
  {
    id: crypto.randomUUID(),
    name: "Sable Quill",
    class: "Wizard",
    level: 4,
    hp: 18,
    maxHp: 26,
    ac: 13,
    resource: 5,
    maxResource: 7,
  },
  {
    id: crypto.randomUUID(),
    name: "Brother Orr",
    class: "Cleric",
    level: 4,
    hp: 29,
    maxHp: 33,
    ac: 17,
    resource: 4,
    maxResource: 6,
  },
];

const $ = (selector) => document.querySelector(selector);
const state = loadState();
let dungeon = generateDungeon(state.seed);
let forecast = null;
let animationFrame = null;
let zoom = 1;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.party?.length && saved.seed) return { floor: 1, ...saved };
  } catch { /* Start fresh if local data was malformed. */ }
  return { party: DEFAULT_PARTY, seed: randomSeed(), completed: 0, expedition: 1, floor: 1 };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function randomSeed() {
  const first = ["ember", "hollow", "moss", "ashen", "gilded", "silent"];
  const second = ["vault", "spire", "deep", "reliquary", "warren", "crypt"];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  return `${pick(first)}-${pick(second)}-${Math.floor(10 + Math.random() * 89)}`;
}

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function healthClass(member) {
  const ratio = member.hp / member.maxHp;
  return ratio < 0.3 ? "critical" : ratio < 0.65 ? "wounded" : "";
}

function renderParty() {
  const profile = analyzeParty(state.party);
  $("#party-level").textContent = profile.averageLevel.toFixed(1);
  $("#party-hp").textContent = `${Math.round(profile.hpRatio * 100)}%`;
  $("#party-size").textContent = profile.members;
  $("#party-list").innerHTML = state.party.map((member) => `
    <article class="member-card ${
    healthClass(member)
  }" data-member-id="${member.id}" tabindex="0" aria-label="Edit ${member.name}">
      <div class="member-main">
        <div class="avatar">${initials(member.name)}</div>
        <div class="member-identity"><strong>${
    escapeHtml(member.name)
  }</strong><span>LV ${member.level} · ${escapeHtml(member.class)}</span></div>
        <div class="hp-number"><b>${member.hp}</b><span> / ${member.maxHp}</span></div>
      </div>
      <div class="stat-bars"><div class="hp-bar"><i style="width:${
    Math.min(100, member.hp / member.maxHp * 100)
  }%"></i></div><span>AC ${member.ac} · ◈ ${member.resource}/${member.maxResource}</span></div>
    </article>`).join("");
  document.querySelectorAll(".member-card").forEach((card) => {
    card.addEventListener("click", () => openMemberDialog(card.dataset.memberId));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") openMemberDialog(card.dataset.memberId);
    });
  });
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char],
  );
}

function buildMapCells() {
  const map = $("#ascii-map");
  map.style.gridTemplateColumns = `repeat(${dungeon.width}, var(--cell-width, 9px))`;
  map.innerHTML = dungeon.grid.flatMap((row, y) =>
    row.map((tile, x) => {
      const info = TILE_INFO[tile] ?? TILE_INFO[" "];
      return `<button class="map-cell ${info.kind}" data-x="${x}" data-y="${y}" data-tile="${tile}" data-title="${info.name}" title="${info.name}" tabindex="-1">${tile}</button>`;
    })
  ).join("");
  renderDungeonLedger();
}

function renderDungeonLedger() {
  $("#room-count").textContent = `${dungeon.rooms.length} rooms · floor ${state.floor}`;
  const counts = dungeon.rooms.reduce((result, room) => {
    result[room.condition] = (result[room.condition] ?? 0) + 1;
    return result;
  }, {});
  $("#room-conditions").innerHTML = Object.entries(counts).slice(0, 4).map(([name, count]) =>
    `<span>${escapeHtml(name)} <b>${count}</b></span>`
  ).join("");
  $("#loot-table").innerHTML = dungeon.loot.length
    ? dungeon.loot.map((loot) =>
      `<p><b>d8 · ${loot.roll}</b><span>${escapeHtml(loot.result)}</span></p>`
    ).join("")
    : "<p><span>No marked cache on this floor.</span></p>";
}

function playCollapse() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  const cells = document.querySelectorAll(".map-cell");
  cells.forEach((cell) => cell.classList.remove("resolved"));
  $("#collapse-status").classList.remove("done");
  let index = 0;
  const batch = Math.max(3, Math.ceil(dungeon.steps.length / 170));
  const tick = () => {
    for (let n = 0; n < batch && index < dungeon.steps.length; n++, index++) {
      const step = dungeon.steps[index];
      document.querySelector(`.map-cell[data-x="${step.x}"][data-y="${step.y}"]`)?.classList.add(
        "resolved",
      );
    }
    $("#collapse-count").textContent = `${index} / ${dungeon.steps.length} marks drawn`;
    if (index < dungeon.steps.length) animationFrame = requestAnimationFrame(tick);
    else setTimeout(() => $("#collapse-status").classList.add("done"), 650);
  };
  animationFrame = requestAnimationFrame(tick);
}

async function updateForecast(message = "Forecast updated") {
  const button = $("#refresh-forecast");
  button.disabled = true;
  try {
    const response = await fetch("/api/forecast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        party: state.party,
        seed: state.seed,
        completed: state.completed,
        floor: state.floor,
      }),
    });
    if (!response.ok) throw new Error("Forecast API unavailable");
    forecast = await response.json();
  } catch {
    forecast = buildEncounterForecast(state.party, state.seed, state.completed, state.floor);
    showToast("Running the local prediction model");
  } finally {
    button.disabled = false;
  }
  forecast.encounters = placeEncounters(forecast.encounters, dungeon, state.completed);
  renderForecast();
  if (message) showToast(message);
}

function renderForecast() {
  const percent = Math.round(forecast.profile.readiness * 100);
  $("#pacing-label").textContent = `${forecast.plan} pace · floor ${forecast.floor}`;
  $("#readiness-value").textContent = `${percent}%`;
  $("#readiness-ring").style.setProperty("--readiness", `${percent}%`);
  $("#readiness-label").textContent = percent > 76
    ? "Ready to press deeper"
    : percent > 55
    ? "Capable, with caution"
    : "Rest would be wise";
  $("#encounter-list").innerHTML = forecast.encounters.map((encounter, index) => `
    <article class="encounter-card" id="encounter-${encounter.marker}" data-encounter="${encounter.marker}" style="animation-delay:${
    index * 80
  }ms">
      <button class="encounter-node locate-encounter" data-encounter="${encounter.marker}" title="Show room ${encounter.marker} on the map">${encounter.marker}</button>
      <div>
        <div class="encounter-order"><span>0${
    index + 1
  } · ${encounter.intent.toUpperCase()}</span><span class="rating ${encounter.rating}">${encounter.rating}</span></div>
        <h3>${escapeHtml(encounter.title)}</h3>
        <button class="encounter-location locate-encounter" data-encounter="${encounter.marker}"><b>ROOM ${encounter.marker}</b> ${
    escapeHtml(encounter.room.name)
  } · ${encounter.room.coordinates}</button>
        <p><b>Objective:</b> ${escapeHtml(encounter.objective)}</p>
        <p class="encounter-twist"><b>Twist:</b> ${escapeHtml(encounter.twist)}</p>
        <div class="encounter-meta"><span>${encounter.tone}</span><span>Budget ${encounter.budget}</span>${
    encounter.foes ? `<span>${encounter.foes} foes</span>` : ""
  }<span>~${encounter.rounds} rounds</span></div>
        ${encounter.recovery ? `<p class="recovery-note">✦ ${encounter.recovery}</p>` : ""}
      </div>
    </article>`).join("");
  renderEncounterMarkers();
}

function renderEncounterMarkers() {
  document.querySelectorAll(".map-cell.encounter-marker").forEach((cell) => {
    cell.textContent = cell.dataset.tile;
    cell.title = cell.dataset.title;
    cell.classList.remove("encounter-marker", "marker-1", "marker-2", "marker-3", "focused");
    delete cell.dataset.encounter;
    cell.onclick = null;
    cell.tabIndex = -1;
  });
  forecast.encounters.forEach((encounter) => {
    const marker = document.querySelector(
      `.map-cell[data-x="${encounter.room.x}"][data-y="${encounter.room.y}"]`,
    );
    if (!marker) return;
    marker.textContent = encounter.marker;
    marker.title = `Encounter ${encounter.marker}: ${encounter.title} — ${encounter.room.name}`;
    marker.classList.add("encounter-marker", `marker-${encounter.marker}`);
    marker.dataset.encounter = encounter.marker;
    marker.tabIndex = 0;
    marker.onclick = () => focusEncounter(encounter.marker, "card");
  });
  document.querySelectorAll(".locate-encounter").forEach((button) => {
    button.addEventListener("click", () => focusEncounter(Number(button.dataset.encounter), "map"));
  });
}

function focusEncounter(number, target) {
  const element = target === "map"
    ? document.querySelector(`.map-cell[data-encounter="${number}"]`)
    : document.querySelector(`#encounter-${number}`);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  element.classList.remove("focused");
  requestAnimationFrame(() => element.classList.add("focused"));
  setTimeout(() => element.classList.remove("focused"), 1300);
}

function openMemberDialog(id = null) {
  const dialog = $("#member-dialog");
  const form = $("#member-form");
  form.reset();
  const member = state.party.find((item) => item.id === id);
  $("#dialog-title").textContent = member ? `Update ${member.name}` : "Add adventurer";
  const defaults = member ??
    {
      memberId: "",
      name: "",
      class: "Fighter",
      level: 1,
      hp: 10,
      maxHp: 10,
      ac: 14,
      resource: 1,
      maxResource: 1,
    };
  for (const [key, value] of Object.entries(defaults)) {
    if (form.elements[key]) form.elements[key].value = value;
  }
  form.elements.memberId.value = member?.id ?? "";
  dialog.showModal();
  setTimeout(() => form.elements.name.focus(), 50);
}

function saveMember(event) {
  event.preventDefault();
  const form = $("#member-form");
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const member = {
    id: data.memberId || crypto.randomUUID(),
    name: data.name.trim(),
    class: data.class,
    level: Number(data.level),
    hp: Number(data.hp),
    maxHp: Number(data.maxHp),
    ac: Number(data.ac),
    resource: Number(data.resource),
    maxResource: Number(data.maxResource),
  };
  member.hp = Math.min(member.hp, member.maxHp);
  member.resource = Math.min(member.resource, member.maxResource);
  const index = state.party.findIndex((item) => item.id === member.id);
  if (index >= 0) state.party[index] = member;
  else state.party.push(member);
  saveState();
  dialogClose();
  renderParty();
  updateForecast("Party state saved · dungeon preserved");
}

function dialogClose() {
  $("#member-dialog").close();
}

function newExpedition() {
  state.seed = randomSeed();
  state.completed = 0;
  state.floor += 1;
  dungeon = generateDungeon(state.seed);
  saveState();
  renderMeta();
  buildMapCells();
  playCollapse();
  updateForecast("A new dungeon takes shape");
}

function renderMeta() {
  $("#seed-label").textContent = state.seed.toUpperCase();
  $("#expedition-number").textContent = String(state.expedition).padStart(2, "0");
  $("#floor-number").textContent = state.floor;
}

function showToast(text) {
  const toast = $("#toast");
  toast.textContent = text;
  toast.classList.add("visible");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function exportSession() {
  const data = {
    ...state,
    dungeon: { seed: dungeon.seed, grid: dungeon.grid.map((row) => row.join("")) },
    forecast,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `delvewright-${state.seed}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  showToast("Session exported");
}

$("#add-member").addEventListener("click", () => openMemberDialog());
$("#add-member-wide").addEventListener("click", () => openMemberDialog());
$("#save-member").addEventListener("click", saveMember);
$("#new-expedition").addEventListener("click", newExpedition);
$("#replay-collapse").addEventListener("click", playCollapse);
$("#refresh-forecast").addEventListener("click", () => {
  state.completed += 1;
  saveState();
  updateForecast("Next three encounters rebalanced");
});
$("#copy-seed").addEventListener("click", async () => {
  await navigator.clipboard?.writeText(state.seed);
  showToast("Seed copied");
});
$("#export-button").addEventListener("click", exportSession);
$("#theme-toggle").addEventListener("click", () => document.body.classList.toggle("high-contrast"));
$("#model-toggle").addEventListener("click", () => {
  const panel = $(".model-explainer");
  panel.classList.toggle("open");
  $("#model-toggle").setAttribute("aria-expanded", panel.classList.contains("open"));
});
$("#zoom-in").addEventListener("click", () => {
  zoom = Math.min(1.4, zoom + .1);
  $("#ascii-map").style.setProperty("--map-scale", zoom);
  $("#zoom-label").textContent = `${Math.round(zoom * 100)}%`;
});
$("#zoom-out").addEventListener("click", () => {
  zoom = Math.max(.6, zoom - .1);
  $("#ascii-map").style.setProperty("--map-scale", zoom);
  $("#zoom-label").textContent = `${Math.round(zoom * 100)}%`;
});

renderMeta();
renderParty();
buildMapCells();
playCollapse();
updateForecast("");
