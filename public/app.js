import {
  analyzeParty,
  buildEncounterForecast,
  generateDungeon,
  hitDiceState,
  placeEncounters,
  takeLongRest,
  takeShortRest,
  TILE_INFO,
} from "./lib/adventure.js";
import { DEFAULT_SETTINGS, learningModel, outcomeSample, spendResources } from "./lib/campaign.js";

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
let dialogClassProfile = null;
let classProfileTimer = null;
let classProfileRequest = 0;
let quickForecastTimer = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.party?.length && saved.seed) {
      return {
        floor: 1,
        history: [],
        undoStack: [],
        learningSamples: [],
        encounterControls: { rerolls: {}, ratings: {}, kinds: {} },
        encounterLocks: {},
        settings: { ...DEFAULT_SETTINGS },
        awareness: 0,
        safeRoomsUsed: {},
        ...saved,
        settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
        encounterControls: {
          rerolls: {},
          ratings: {},
          kinds: {},
          ...(saved.encounterControls ?? {}),
        },
      };
    }
  } catch { /* Start fresh if local data was malformed. */ }
  return {
    party: DEFAULT_PARTY,
    seed: randomSeed(),
    completed: 0,
    expedition: 1,
    floor: 1,
    history: [],
    undoStack: [],
    learningSamples: [],
    encounterControls: { rerolls: {}, ratings: {}, kinds: {} },
    encounterLocks: {},
    settings: { ...DEFAULT_SETTINGS },
    awareness: 0,
    safeRoomsUsed: {},
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  $("#undo-action")?.toggleAttribute("disabled", !state.undoStack.length);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function checkpoint(label) {
  state.undoStack.push({
    label,
    at: new Date().toISOString(),
    snapshot: clone({
      party: state.party,
      completed: state.completed,
      floor: state.floor,
      seed: state.seed,
      history: state.history,
      learningSamples: state.learningSamples,
      encounterControls: state.encounterControls,
      encounterLocks: state.encounterLocks,
      awareness: state.awareness,
      safeRoomsUsed: state.safeRoomsUsed,
      settings: state.settings,
      expedition: state.expedition,
    }),
  });
  state.undoStack = state.undoStack.slice(-30);
}

function logEvent(type, title, detail = "") {
  state.history.unshift({
    id: crypto.randomUUID(),
    type,
    title,
    detail,
    floor: state.floor,
    seed: state.seed,
    at: new Date().toISOString(),
  });
  state.history = state.history.slice(0, 150);
}

function modelState() {
  return { ...learningModel(state.learningSamples), awareness: state.awareness };
}

function encounterKey(index) {
  return `${state.floor}:${state.completed}:${index}`;
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
  if (member.dead) return "dead";
  const ratio = member.hp / member.maxHp;
  return ratio < 0.3 ? "critical" : ratio < 0.65 ? "wounded" : "";
}

function resourceSummary(member) {
  if (!state.settings.trackResources) return "resource tracking off";
  if (!member.resources?.length) return `◈ ${member.resource}/${member.maxResource}`;
  const current = member.resources.reduce((sum, pool) => sum + Number(pool.current), 0);
  const maximum = member.resources.reduce((sum, pool) => sum + Number(pool.maximum), 0);
  return `${member.resources.length} pools · ${current}/${maximum}`;
}

function renderParty() {
  const living = state.party.filter((member) => !member.dead);
  const profile = living.length ? analyzeParty(state.party, state.settings) : null;
  document.body.classList.toggle("hide-resources", !state.settings.trackResources);
  document.body.classList.toggle("hide-afflictions", !state.settings.trackAfflictions);
  $("#party-level").textContent = profile ? profile.averageLevel.toFixed(1) : "—";
  $("#party-hp").textContent = profile ? `${Math.round(profile.hpRatio * 100)}%` : "0%";
  $("#party-size").textContent = living.length;
  $("#party-list").innerHTML = state.party.map((member) => `
    <article class="member-card ${
    healthClass(member)
  }" data-member-id="${member.id}" tabindex="0" aria-label="Edit ${member.name}">
      <div class="member-main">
        <div class="avatar">${member.dead ? "☠" : initials(member.name)}</div>
        <div class="member-identity"><strong>${escapeHtml(member.name)}</strong><span>${
    member.dead
      ? "FALLEN · EXCLUDED FROM FORECAST"
      : `LV ${member.level} · ${escapeHtml(member.class)}`
  }</span></div>
        <div class="hp-number"><b>${member.hp}</b><span> / ${member.maxHp}</span></div>
        <button class="remove-member" data-remove-member="${member.id}" type="button" aria-label="Remove ${
    escapeHtml(member.name)
  }" title="Remove party member">×</button>
      </div>
      <div class="stat-bars"><div class="hp-bar"><i style="width:${
    Math.min(100, member.hp / member.maxHp * 100)
  }%"></i></div><span>AC ${member.ac} · HD ${hitDiceState(member).current}/${
    hitDiceState(member).maximum
  } · ${resourceSummary(member)}</span></div>
      <div class="quick-member-actions" aria-label="Quick updates for ${escapeHtml(member.name)}">
        <button type="button" data-quick-action="hp" data-member-id="${member.id}" ${
    member.dead || member.hp <= 0 ? "disabled" : ""
  }>−1 HP</button>
        <button type="button" data-quick-action="resource" data-member-id="${member.id}" ${
    member.dead ? "disabled" : ""
  }>−1 RES</button>
        <button class="kill-member ${
    member.dead ? "revive-member" : ""
  }" type="button" data-quick-action="kill" data-member-id="${member.id}" aria-label="${
    member.dead ? "Revive" : "Mark"
  } ${escapeHtml(member.name)}${member.dead ? "" : " dead"}" title="${
    member.dead
      ? "Revive at 1 HP and include in difficulty"
      : "Mark dead and exclude from difficulty"
  }">☠</button>
      </div>
      ${
    state.settings.trackAfflictions && !member.dead
      ? `<div class="member-statuses">${
        Number(member.tempHp) > 0 ? `<span>+${member.tempHp} temp HP</span>` : ""
      }${member.concentration ? "<span>Concentrating</span>" : ""}${
        member.inspiration ? "<span>Inspiration</span>" : ""
      }${Number(member.exhaustion) > 0 ? `<span>Exhaustion ${member.exhaustion}</span>` : ""}${
        member.hp <= 0 && member.deathSaves
          ? `<span>Death saves ${member.deathSaves.successes}✓/${member.deathSaves.failures}✕</span>`
          : ""
      }${
        (member.conditions ?? []).map((condition) =>
          `<span>${escapeHtml(condition)}${
            Number(member.conditionRounds) > 0 ? ` · ${member.conditionRounds}r` : ""
          }</span>`
        ).join("")
      }</div>`
      : ""
  }
    </article>`).join("");
  document.querySelectorAll(".member-card").forEach((card) => {
    card.addEventListener("click", () => openMemberDialog(card.dataset.memberId));
    card.addEventListener("keydown", (event) => {
      if (event.target === card && event.key === "Enter") openMemberDialog(card.dataset.memberId);
    });
  });
  document.querySelectorAll(".remove-member").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      removeMember(button.dataset.removeMember);
    });
  });
  document.querySelectorAll("[data-quick-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      quickUpdateMember(button.dataset.memberId, button.dataset.quickAction);
    });
  });
}

function queueQuickForecast(message) {
  clearTimeout(quickForecastTimer);
  quickForecastTimer = setTimeout(() => updateForecast(message), 280);
}

function quickUpdateMember(id, action) {
  const member = state.party.find((item) => item.id === id);
  if (!member || (member.dead && action !== "kill")) return;
  let message = `${member.name} updated`;
  checkpoint(message);
  if (action === "hp") {
    member.hp = Math.max(0, Number(member.hp) - 1);
    message = `${member.name} loses 1 HP`;
  } else if (action === "resource") {
    if (member.resources?.length) {
      const pool = member.resources.find((candidate) => Number(candidate.current) > 0);
      if (!pool) {
        state.undoStack.pop();
        showToast(`${member.name} has no resource uses left`);
        return;
      }
      pool.current = Number(pool.current) - 1;
      member.resource = member.resources.reduce(
        (sum, candidate) => sum + Number(candidate.current),
        0,
      );
      message = `${member.name} spends 1 ${pool.label}`;
    } else {
      if (Number(member.resource) <= 0) {
        state.undoStack.pop();
        showToast(`${member.name} has no resource uses left`);
        return;
      }
      member.resource = Number(member.resource) - 1;
      message = `${member.name} spends 1 resource use`;
    }
  } else if (action === "kill") {
    if (member.dead) {
      member.dead = false;
      member.hp = Math.max(1, Number(member.hp));
      message = `${member.name} returns at 1 HP · included in encounter difficulty`;
    } else {
      member.hp = 0;
      member.dead = true;
      message = `${member.name} has fallen · excluded from encounter difficulty`;
    }
  }
  logEvent("party", message);
  saveState();
  renderParty();
  queueQuickForecast(message);
}

function removeMember(id) {
  const member = state.party.find((item) => item.id === id);
  if (!member) return;
  if (state.party.length === 1) {
    showToast("A party needs at least one adventurer");
    return;
  }
  if (!globalThis.confirm(`Remove ${member.name} from the party?`)) return;
  checkpoint(`Remove ${member.name}`);
  state.party = state.party.filter((item) => item.id !== id);
  logEvent("party", `Removed ${member.name}`);
  saveState();
  renderParty();
  updateForecast("Party member removed · encounters rebalanced");
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
      const jitterX = (((x * 17 + y * 11) % 5) - 2) * 0.16;
      const jitterY = (((x * 7 + y * 19) % 5) - 2) * 0.12;
      const jitterRotation = (((x * 13 + y * 23) % 7) - 3) * 0.28;
      return `<button class="map-cell ${info.kind}" data-x="${x}" data-y="${y}" data-tile="${tile}" data-title="${info.name}" title="${info.name}" tabindex="-1" style="--jitter-x:${jitterX}px;--jitter-y:${jitterY}px;--jitter-r:${jitterRotation}deg">${tile}</button>`;
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
  const lootEntries = forecast?.loot?.length ? forecast.loot : dungeon.loot;
  $("#loot-table").innerHTML = lootEntries.length
    ? lootEntries.map((loot) =>
      loot.name
        ? `<p class="api-loot"><b>${escapeHtml(loot.rarity)}</b><span><a href="${
          escapeHtml(loot.source)
        }" target="_blank" rel="noreferrer">${escapeHtml(loot.name)} ↗</a><small>${
          escapeHtml(loot.description)
        }</small></span></p>`
        : `<p><b>d8 · ${loot.roll}</b><span>${escapeHtml(loot.result)}</span></p>`
    ).join("")
    : "<p><span>No marked cache on this floor.</span></p>";
}

function applyClassProfiles(entries) {
  if (!entries?.length) return;
  let changed = false;
  for (const entry of entries) {
    const member = state.party.find((candidate) => candidate.id === entry.id);
    if (!member) continue;
    const existing = new Map((member.resources ?? []).map((pool) => [pool.key, pool]));
    const legacyRatio = Math.max(
      0,
      Math.min(1, Number(member.resource ?? 0) / Math.max(1, Number(member.maxResource ?? 1))),
    );
    member.resources = entry.profile.resources.map((pool) => ({
      ...pool,
      current: Math.min(
        Number(existing.get(pool.key)?.current ?? Math.round(Number(pool.maximum) * legacyRatio)),
        Number(pool.maximum),
      ),
    }));
    member.classProfile = {
      proficiencyBonus: entry.profile.proficiencyBonus,
      notes: entry.profile.notes,
      source: entry.profile.source,
    };
    if (member.resources.length) {
      member.resource = member.resources.reduce((sum, pool) => sum + Number(pool.current), 0);
      member.maxResource = member.resources.reduce((sum, pool) => sum + Number(pool.maximum), 0);
    }
    changed = true;
  }
  if (changed) {
    saveState();
    renderParty();
  }
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
  if (!state.party.some((member) => !member.dead)) {
    forecast = {
      profile: { readiness: 0 },
      encounters: [],
      plan: "No survivors",
      floor: state.floor,
      dataSource: "fallback",
      warning: "No living party members remain. Edit a fallen adventurer to revive them.",
    };
    renderForecast();
    if (message) showToast(message);
    return;
  }
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
        settings: state.settings,
        learning: modelState(),
        controls: state.encounterControls,
      }),
    });
    if (!response.ok) throw new Error("Forecast API unavailable");
    forecast = await response.json();
  } catch {
    forecast = buildEncounterForecast(state.party, state.seed, state.completed, state.floor, {
      ...modelState(),
      settings: state.settings,
    });
    showToast("Running the local prediction model");
  } finally {
    button.disabled = false;
  }
  applyClassProfiles(forecast.classProfiles);
  forecast.encounters = placeEncounters(forecast.encounters, dungeon, state.completed);
  forecast.encounters = forecast.encounters.map((encounter, index) =>
    state.encounterLocks[encounterKey(index)] ?? encounter
  );
  renderForecast();
  if (message) showToast(message);
}

function renderForecast() {
  const percent = Math.round(forecast.profile.readiness * 100);
  const liveSrd = forecast.dataSource?.includes("dnd5eapi.co");
  $("#srd-status").classList.toggle("offline", !liveSrd);
  $("#srd-status").innerHTML = liveSrd
    ? `<span>✓</span><div><b>Live 2014 SRD data</b><small>Official XP rules · 5e-bits monsters and items</small></div>`
    : `<span>!</span><div><b>Local fallback active</b><small>${
      escapeHtml(forecast.warning ?? "SRD API data unavailable")
    }</small></div>`;
  $("#pacing-label").textContent =
    `${forecast.plan} · floor ${forecast.floor} · alert ${state.awareness}`;
  $("#readiness-value").textContent = `${percent}%`;
  $("#readiness-ring").style.setProperty("--readiness", `${percent}%`);
  $("#readiness-label").textContent = percent > 76
    ? "Ready to press deeper"
    : percent > 55
    ? "Capable, with caution"
    : "Rest would be wise";
  $("#encounter-list").innerHTML = forecast.encounters.map((encounter, index) => {
    const combat = encounter.combat;
    const displayedRating = combat
      ? combat.difficulty[0].toUpperCase() + combat.difficulty.slice(1)
      : encounter.rating;
    const combatMarkup = combat
      ? `<div class="combat-roster">
          <div class="combat-title"><span>SRD COMBAT</span><b>${combat.count} × ${
        escapeHtml(combat.monster.name)
      }</b></div>
          <div class="monster-stats"><span>CR ${combat.monster.cr}</span><span>AC ${combat.monster.ac}</span><span>HP ${combat.monster.hp} each</span><span>${
        escapeHtml(combat.monster.type)
      }</span></div>
          <p>${escapeHtml(combat.monster.size)} ${escapeHtml(combat.monster.type)} · ${
        escapeHtml(combat.monster.actions.join(" · ") || "See stat block")
      }</p>
          <div class="xp-proof"><span>${combat.baseXp.toLocaleString()} base XP</span><b>× ${combat.multiplier}</b><span>${combat.adjustedXp.toLocaleString()} adjusted XP</span></div>
          <small>${
        escapeHtml(combat.scaling)
      } · target ${combat.conditionTargetXp.toLocaleString()} XP<br>${
        escapeHtml(combat.rule)
      } · ${displayedRating} threshold ${
        combat.thresholds[combat.difficulty].toLocaleString()
      } XP<br>${escapeHtml(combat.safety)} · <a href="${
        escapeHtml(combat.monster.source)
      }" target="_blank" rel="noreferrer">SRD stat block ↗</a></small>
          ${
        combat.analysis
          ? `<div class="combat-analysis risk-${combat.analysis.risk}"><b>${combat.analysis.risk.toUpperCase()} TACTICAL RISK</b>${
            combat.analysis.signals.map((signal) => `<span>${escapeHtml(signal)}</span>`).join("")
          }</div>`
          : ""
      }
        </div>`
      : "";
    return `<article class="encounter-card" id="encounter-${encounter.marker}" data-encounter="${encounter.marker}" style="animation-delay:${
      index * 80
    }ms">
      <button class="encounter-node locate-encounter" data-encounter="${encounter.marker}" title="Show room ${encounter.marker} on the map">${encounter.marker}</button>
      <div>
        <div class="encounter-order"><span>0${
      index + 1
    } · ${encounter.intent.toUpperCase()}</span><span class="rating ${displayedRating}">${displayedRating}</span></div>
        <h3>${escapeHtml(encounter.title)}</h3>
        <button class="encounter-location locate-encounter" data-encounter="${encounter.marker}"><b>ROOM ${encounter.marker}</b> ${
      escapeHtml(encounter.room.name)
    } · ${encounter.room.coordinates}</button>
        <p><b>Objective:</b> ${escapeHtml(encounter.objective)}</p>
        <p class="encounter-twist"><b>Twist:</b> ${escapeHtml(encounter.twist)}</p>
        ${combatMarkup}
        <div class="encounter-meta"><span>${encounter.tone}</span><span>${
      combat ? "Adjusted XP" : "Pressure"
    } ${encounter.budget}</span><span>~${encounter.rounds} rounds</span></div>
        ${encounter.recovery ? `<p class="recovery-note">✦ ${encounter.recovery}</p>` : ""}
        <div class="encounter-controls">
          <button data-encounter-action="resolve" data-index="${index}">Resolve</button>
          <button data-encounter-action="reroll" data-index="${index}">↻ Reroll</button>
          <button data-encounter-action="lock" data-index="${index}">${
      state.encounterLocks[encounterKey(index)] ? "Unlock" : "Lock"
    }</button>
          <select data-encounter-action="rating" data-index="${index}" aria-label="Difficulty"><option value="">Model</option>${
      ["Low", "Moderate", "Hard", "Deadly"].map((rating) =>
        `<option ${
          state.encounterControls.ratings[index] === rating ? "selected" : ""
        }>${rating}</option>`
      ).join("")
    }</select>
          <select data-encounter-action="kind" data-index="${index}" aria-label="Encounter type">${
      ["auto", "combat", "social", "puzzle", "hazard", "discovery"].map((kind) =>
        `<option ${
          state.encounterControls.kinds[index] === kind ? "selected" : ""
        }>${kind}</option>`
      ).join("")
    }</select>
        </div>
      </div>
    </article>`;
  }).join("");
  renderDungeonLedger();
  renderEncounterMarkers();
  bindEncounterControls();
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

function bindEncounterControls() {
  document.querySelectorAll("[data-encounter-action]").forEach((control) => {
    const eventName = control.tagName === "SELECT" ? "change" : "click";
    control.addEventListener(eventName, (event) => {
      event.stopPropagation();
      const index = Number(control.dataset.index);
      const action = control.dataset.encounterAction;
      if (action === "resolve") return openResolveDialog(index);
      checkpoint(`${action} encounter ${index + 1}`);
      if (action === "reroll") {
        state.encounterControls.rerolls[index] =
          Number(state.encounterControls.rerolls[index] ?? 0) + 1;
        delete state.encounterLocks[encounterKey(index)];
        logEvent("forecast", `Rerolled encounter ${index + 1}`);
      } else if (action === "lock") {
        const key = encounterKey(index);
        if (state.encounterLocks[key]) {
          delete state.encounterLocks[key];
          logEvent("forecast", `Unlocked ${forecast.encounters[index].title}`);
        } else {
          state.encounterLocks[key] = clone(forecast.encounters[index]);
          logEvent("forecast", `Locked ${forecast.encounters[index].title}`);
        }
      } else if (action === "rating") {
        if (control.value) state.encounterControls.ratings[index] = control.value;
        else delete state.encounterControls.ratings[index];
        delete state.encounterLocks[encounterKey(index)];
        logEvent(
          "forecast",
          `Encounter ${index + 1} difficulty set to ${control.value || "Model"}`,
        );
      } else if (action === "kind") {
        state.encounterControls.kinds[index] = control.value;
        delete state.encounterLocks[encounterKey(index)];
        logEvent("forecast", `Encounter ${index + 1} type set to ${control.value}`);
      }
      saveState();
      if (action === "lock") renderForecast();
      else updateForecast("DM encounter controls applied");
    });
  });
}

function openResolveDialog(index) {
  const encounter = forecast.encounters[index];
  const form = $("#resolve-form");
  form.reset();
  form.elements.encounterIndex.value = index;
  form.elements.rounds.value = encounter.rounds ?? 3;
  $("#resolve-title").textContent = encounter.title;
  $("#resolution-members").innerHTML = state.party.filter((member) => !member.dead).map((member) =>
    `<section class="resolution-member"><b>${
      escapeHtml(member.name)
    }</b><span>${member.hp}/${member.maxHp} HP</span>
      <label>HP lost<input type="number" min="0" max="${
      member.hp + Number(member.tempHp ?? 0)
    }" value="0" data-resolution-member="${member.id}" data-field="hpLost"></label>
      <label class="resolution-resource">Resources spent<input type="number" min="0" max="${
      member.resource ?? 0
    }" value="0" data-resolution-member="${member.id}" data-field="resourcesSpent"></label>
      <label class="check-field"><input type="checkbox" data-resolution-member="${member.id}" data-field="downed"> Downed</label>
    </section>`
  ).join("");
  $("#resolve-dialog").showModal();
}

function resolveEncounter(event) {
  event.preventDefault();
  const form = $("#resolve-form");
  const data = Object.fromEntries(new FormData(form));
  const index = Number(data.encounterIndex);
  const encounter = forecast.encounters[index];
  const members = {};
  document.querySelectorAll("[data-resolution-member]").forEach((input) => {
    const id = input.dataset.resolutionMember;
    members[id] ??= {};
    members[id][input.dataset.field] = input.type === "checkbox"
      ? input.checked
      : Number(input.value);
  });
  const report = {
    outcome: data.outcome,
    rounds: Number(data.rounds),
    feedback: data.feedback,
    notes: data.notes,
    members,
  };
  checkpoint(`Resolve ${encounter.title}`);
  const beforeParty = clone(state.party);
  state.party = state.party.map((member) => {
    const result = members[member.id];
    if (!result || member.dead) return member;
    const loss = Math.max(0, Number(result.hpLost));
    const tempAbsorbed = Math.min(Number(member.tempHp ?? 0), loss);
    let updated = {
      ...member,
      tempHp: Number(member.tempHp ?? 0) - tempAbsorbed,
      hp: Math.max(0, Number(member.hp) - (loss - tempAbsorbed)),
    };
    if (Number(member.conditionRounds) > 0) {
      updated.conditionRounds = Math.max(
        0,
        Number(member.conditionRounds) - Number(report.rounds),
      );
      if (updated.conditionRounds === 0) updated.conditions = [];
    }
    if (result.downed) {
      updated.hp = 0;
      updated.concentration = false;
    }
    if (state.settings.trackResources) updated = spendResources(updated, result.resourcesSpent);
    return updated;
  });
  const sample = outcomeSample(encounter, beforeParty, report);
  state.learningSamples.push(sample);
  state.learningSamples = state.learningSamples.slice(-24);
  logEvent(
    "encounter",
    `${data.outcome}: ${encounter.title}`,
    `${data.rounds} rounds · ${data.feedback} · ${
      Object.values(members).reduce((sum, member) => sum + Number(member.hpLost), 0)
    } HP lost · ${data.notes || "No additional notes"}`,
  );
  state.completed += 1;
  state.encounterControls = { rerolls: {}, ratings: {}, kinds: {} };
  $("#resolve-dialog").close();
  saveState();
  renderParty();
  updateForecast(`Encounter resolved · model now has ${state.learningSamples.length} samples`);
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
  const defaults = member
    ? {
      ...member,
      conModifier: member.conModifier ?? 0,
      tempHp: member.tempHp ?? 0,
      exhaustion: member.exhaustion ?? 0,
      deathSuccesses: member.deathSaves?.successes ?? 0,
      deathFailures: member.deathSaves?.failures ?? 0,
      conditions: (member.conditions ?? []).join(", "),
      conditionRounds: member.conditionRounds ?? 0,
    }
    : {
      memberId: "",
      name: "",
      class: "Fighter",
      level: 1,
      hp: 10,
      maxHp: 10,
      ac: 14,
      conModifier: 0,
      resource: 1,
      maxResource: 1,
    };
  for (const [key, value] of Object.entries(defaults)) {
    if (form.elements[key]) form.elements[key].value = value;
  }
  form.elements.memberId.value = member?.id ?? "";
  form.elements.concentration.checked = Boolean(member?.concentration);
  form.elements.inspiration.checked = Boolean(member?.inspiration);
  dialog.showModal();
  dialogClassProfile = null;
  loadClassProfile();
  setTimeout(() => form.elements.name.focus(), 50);
}

async function loadClassProfile() {
  const requestId = ++classProfileRequest;
  const form = $("#member-form");
  const className = form.elements.class.value.toLowerCase();
  const level = Number(form.elements.level.value || 1);
  const list = $("#srd-resource-list");
  $("#save-member").disabled = true;
  list.innerHTML = "<p>Consulting the 2014 SRD…</p>";
  $("#class-source-label").textContent = `${form.elements.class.value} · level ${level}`;
  try {
    const response = await fetch(`/api/srd/classes/${className}/levels/${level}`);
    if (!response.ok) throw new Error("Class data unavailable");
    const profile = await response.json();
    if (requestId !== classProfileRequest) return;
    dialogClassProfile = profile;
    const member = state.party.find((item) => item.id === form.elements.memberId.value);
    const existing = new Map((member?.resources ?? []).map((pool) => [pool.key, pool]));
    const legacyRatio = Math.max(
      0,
      Math.min(
        1,
        Number(member?.resource ?? form.elements.resource.value) /
          Math.max(1, Number(member?.maxResource ?? form.elements.maxResource.value)),
      ),
    );
    form.classList.toggle("has-srd-resources", profile.resources.length > 0);
    list.innerHTML = profile.resources.length
      ? profile.resources.map((pool) => {
        const current = Math.min(
          Number(
            existing.get(pool.key)?.current ?? Math.round(Number(pool.maximum) * legacyRatio),
          ),
          Number(pool.maximum),
        );
        return `<label class="resource-pool"><span><b>${escapeHtml(pool.label)}</b><small>${
          escapeHtml(pool.recharge)
        }${
          pool.detail ? ` · ${escapeHtml(pool.detail)}` : ""
        }</small></span><input data-resource-key="${pool.key}" type="number" min="0" max="${pool.maximum}" value="${current}" aria-label="Current ${
          escapeHtml(pool.label)
        }"><em>/ ${pool.maximum}</em></label>`;
      }).join("")
      : "<p>This class has no expendable base-class pool in the API at this level.</p>";
    $("#srd-class-notes").innerHTML = [
      `Proficiency bonus +${profile.proficiencyBonus}`,
      ...profile.notes,
      ...(profile.features.length ? [`New at this level: ${profile.features.join(", ")}`] : []),
    ].map((note) => `<span>${escapeHtml(note)}</span>`).join("");
    $("#class-source-label").textContent = `Live data · ${profile.class} ${profile.level}`;
  } catch {
    if (requestId !== classProfileRequest) return;
    dialogClassProfile = null;
    form.classList.remove("has-srd-resources");
    list.innerHTML =
      "<p>Could not reach the SRD service. The fallback resource fields remain available.</p>";
    $("#srd-class-notes").innerHTML = "";
  } finally {
    if (requestId === classProfileRequest) $("#save-member").disabled = false;
  }
}

function queueClassProfile() {
  clearTimeout(classProfileTimer);
  classProfileTimer = setTimeout(loadClassProfile, 180);
}

function saveMember(event) {
  event.preventDefault();
  const form = $("#member-form");
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const existingMember = state.party.find((item) => item.id === data.memberId);
  const member = {
    id: data.memberId || crypto.randomUUID(),
    name: data.name.trim(),
    class: data.class,
    level: Number(data.level),
    hp: Number(data.hp),
    maxHp: Number(data.maxHp),
    ac: Number(data.ac),
    conModifier: Number(data.conModifier),
    tempHp: Number(data.tempHp),
    exhaustion: Number(data.exhaustion),
    deathSaves: {
      successes: Number(data.deathSuccesses),
      failures: Number(data.deathFailures),
    },
    conditions: String(data.conditions ?? "").split(",").map((condition) => condition.trim())
      .filter(Boolean),
    conditionRounds: Number(data.conditionRounds),
    concentration: data.concentration === "on",
    inspiration: data.inspiration === "on",
    resource: Number(data.resource),
    maxResource: Number(data.maxResource),
  };
  if (dialogClassProfile?.resources?.length) {
    member.resources = dialogClassProfile.resources.map((pool) => ({
      ...pool,
      current: Number(
        document.querySelector(`[data-resource-key="${pool.key}"]`)?.value ?? pool.current,
      ),
    }));
    member.resource = member.resources.reduce((sum, pool) => sum + Number(pool.current), 0);
    member.maxResource = member.resources.reduce((sum, pool) => sum + Number(pool.maximum), 0);
  }
  member.hp = Math.min(member.hp, member.maxHp);
  member.resource = Math.min(member.resource, member.maxResource);
  const index = state.party.findIndex((item) => item.id === member.id);
  checkpoint(existingMember ? `Edit ${member.name}` : `Add ${member.name}`);
  if (index >= 0) {
    member.hitDice = hitDiceState({
      ...member,
      hitDice: state.party[index].hitDice,
    });
    state.party[index] = member;
  } else state.party.push(member);
  logEvent("party", existingMember ? `Updated ${member.name}` : `Added ${member.name}`);
  saveState();
  dialogClose();
  renderParty();
  updateForecast("Party state saved · dungeon preserved");
}

function dialogClose() {
  $("#member-dialog").close();
}

function openShortRestDialog() {
  const living = state.party.filter((member) => !member.dead);
  $("#short-rest-members").innerHTML = living.length
    ? living.map((member) => {
      const dice = hitDiceState(member);
      const shortResources = (member.resources ?? []).filter((pool) =>
        String(pool.recharge ?? "").toLowerCase().includes("short rest") &&
        Number(pool.current) < Number(pool.maximum)
      );
      const resourceCopy = shortResources.length
        ? shortResources.map((pool) => `${escapeHtml(pool.label)} ${pool.current}/${pool.maximum}`)
          .join(
            " · ",
          )
        : "No depleted short-rest resources";
      return `<label class="short-rest-member">
      <span><b>${
        escapeHtml(member.name)
      }</b><small>${member.hp}/${member.maxHp} HP · ${resourceCopy}</small></span>
      <span class="hit-die-picker"><input name="${
        escapeHtml(member.id)
      }" type="number" min="0" max="${dice.current}" value="0" ${
        dice.current ? "" : "disabled"
      } aria-label="Hit Dice for ${
        escapeHtml(member.name)
      }"><em>/ ${dice.current}d${dice.size}</em></span>
    </label>`;
    }).join("")
    : `<p class="rest-dialog-copy">No living adventurers can benefit from a short rest.</p>`;
  $("#short-rest-dialog").showModal();
}

function applyShortRest(event) {
  event.preventDefault();
  checkpoint("Short rest");
  const rest = restLocation("short");
  if (rest.interrupted) {
    logEvent("rest", "Short rest interrupted", rest.detail);
    saveState();
    $("#short-rest-dialog").close();
    updateForecast("The short rest was interrupted by dungeon activity");
    return;
  }
  const selections = Object.fromEntries(new FormData($("#short-rest-form")));
  const result = takeShortRest(state.party, selections);
  state.party = result.party;
  saveState();
  $("#short-rest-dialog").close();
  renderParty();
  const healed = result.healing.reduce((sum, entry) => sum + entry.restored, 0);
  logEvent(
    "rest",
    "Short rest",
    `${rest.detail} · ${healed} HP and ${result.resourcesRecovered} resource uses restored`,
  );
  saveState();
  updateForecast(
    `Short rest · ${healed} HP restored · ${result.resourcesRecovered} resource uses recovered`,
  );
}

function applyLongRest() {
  checkpoint("Long rest");
  const rest = restLocation("long");
  if (rest.interrupted) {
    logEvent("rest", "Long rest interrupted", rest.detail);
    saveState();
    updateForecast("The long rest was interrupted · no recovery applied");
    return;
  }
  state.party = takeLongRest(state.party);
  logEvent("rest", "Long rest", `${rest.detail} · the living party was fully restored`);
  saveState();
  renderParty();
  updateForecast("Long rest · HP, Hit Dice, and all resources restored");
}

function restLocation(type) {
  if (!state.settings.safeRestRules) return { detail: "Rest rules disabled", interrupted: false };
  const key = `${state.floor}`;
  const safeRoom = dungeon.rooms.find((room) => room.role === "safe");
  if (safeRoom && !state.safeRoomsUsed[key]) {
    state.safeRoomsUsed[key] = true;
    state.awareness += type === "long" ? 1 : 0;
    return { detail: `Sheltered in ${safeRoom.name}`, interrupted: false };
  }
  state.awareness += type === "long" ? 2 : 1;
  const chance = type === "long" ? .35 : .2;
  const interrupted = Math.random() < chance;
  if (interrupted) state.completed += 1;
  return {
    detail: `Unsafe rest · dungeon awareness ${state.awareness}${
      interrupted ? " · wandering threat" : ""
    }`,
    interrupted,
  };
}

function openSettings() {
  const form = $("#settings-form");
  for (const [key, value] of Object.entries(state.settings)) {
    if (form.elements[key]) form.elements[key].checked = Boolean(value);
  }
  $("#settings-dialog").showModal();
}

function saveSettings(event) {
  event.preventDefault();
  checkpoint("Change tracking settings");
  const form = $("#settings-form");
  state.settings = {
    trackResources: form.elements.trackResources.checked,
    trackAfflictions: form.elements.trackAfflictions.checked,
    safeRestRules: form.elements.safeRestRules.checked,
  };
  logEvent("settings", "Tracking settings changed");
  saveState();
  $("#settings-dialog").close();
  renderParty();
  updateForecast("DM tracking settings applied");
}

function renderJournal() {
  const learned = modelState();
  $("#learning-summary").innerHTML = `<b>${
    escapeHtml(learned.label)
  }</b><span>${learned.samples} resolved encounter${
    learned.samples === 1 ? "" : "s"
  } · calibration ${learned.calibration.toFixed(2)} · ${
    Math.round(learned.confidence * 100)
  }% confidence</span><small>AoE ${
    forecast?.profile?.capabilities?.aoe?.toFixed(1) ?? "—"
  } · Control ${forecast?.profile?.capabilities?.control?.toFixed(1) ?? "—"} · Healing ${
    forecast?.profile?.capabilities?.healing?.toFixed(1) ?? "—"
  } · Ranged ${forecast?.profile?.capabilities?.ranged?.toFixed(1) ?? "—"}</small>`;
  const markup = state.history.length
    ? state.history.map((event) =>
      `<article><time>${new Date(event.at).toLocaleString()}</time><div><b>${
        escapeHtml(event.title)
      }</b><span>Floor ${event.floor} · ${escapeHtml(event.type)}</span><p>${
        escapeHtml(event.detail || "—")
      }</p></div></article>`
    ).join("")
    : "<p>No campaign events recorded yet.</p>";
  $("#journal-list").innerHTML = markup;
  return markup;
}

function openJournal() {
  renderJournal();
  $("#journal-dialog").showModal();
}

function printJournal() {
  const markup = renderJournal();
  $("#journal-print-content").innerHTML = markup;
  $("#journal-print-meta").textContent =
    `Expedition ${state.expedition} · ${state.history.length} events · ${modelState().samples} learning samples`;
  document.body.classList.add("print-journal");
  requestAnimationFrame(() => globalThis.print());
}

function undoLastAction() {
  const entry = state.undoStack.pop();
  if (!entry) return;
  Object.assign(state, clone(entry.snapshot));
  saveState();
  dungeon = generateDungeon(state.seed);
  renderMeta();
  renderParty();
  buildMapCells();
  updateForecast(`Undid: ${entry.label}`);
}

function newExpedition() {
  checkpoint("Descend a floor");
  state.seed = randomSeed();
  state.completed = 0;
  state.floor += 1;
  dungeon = generateDungeon(state.seed);
  logEvent("dungeon", `Descended to floor ${state.floor}`, `New seed ${state.seed}`);
  saveState();
  renderMeta();
  buildMapCells();
  playCollapse();
  updateForecast("A new dungeon takes shape");
}

function resetDungeon() {
  const confirmed = globalThis.confirm(
    "Reset this dungeon to floor 1? Your party will be kept, but the map and encounter history will be replaced.",
  );
  if (!confirmed) return;
  checkpoint("Reset dungeon");
  state.seed = randomSeed();
  state.completed = 0;
  state.floor = 1;
  state.expedition += 1;
  state.encounterControls = { rerolls: {}, ratings: {}, kinds: {} };
  state.encounterLocks = {};
  state.safeRoomsUsed = {};
  state.awareness = 0;
  dungeon = generateDungeon(state.seed);
  logEvent("dungeon", "Dungeon reset", `Expedition ${state.expedition} began at ${state.seed}`);
  saveState();
  renderMeta();
  buildMapCells();
  playCollapse();
  updateForecast("The old atlas was closed · a new dungeon begins");
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

function printMap() {
  document.body.classList.remove("print-journal");
  if (!forecast) {
    forecast = buildEncounterForecast(state.party, state.seed, state.completed, state.floor);
    forecast.encounters = placeEncounters(forecast.encounters, dungeon, state.completed);
  }
  const printable = dungeon.grid.map((row) => [...row]);
  forecast.encounters.forEach((encounter) => {
    printable[encounter.room.y][encounter.room.x] = String(encounter.marker);
  });
  $("#print-map-content").textContent = printable.map((row) => row.join("")).join("\n");
  $("#print-floor").textContent = state.floor;
  $("#print-seed").textContent = state.seed.toUpperCase();
  $("#print-rooms").textContent =
    `${dungeon.rooms.length} rooms · ${dungeon.steps.length} drawn tiles`;
  $("#print-sheet").setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => globalThis.print());
}

$("#add-member").addEventListener("click", () => openMemberDialog());
$("#add-member-wide").addEventListener("click", () => openMemberDialog());
$("#save-member").addEventListener("click", saveMember);
$("#resolve-form").addEventListener("submit", resolveEncounter);
$("#open-settings").addEventListener("click", openSettings);
$("#settings-form").addEventListener("submit", saveSettings);
$("#open-journal").addEventListener("click", openJournal);
$("#print-journal").addEventListener("click", printJournal);
$("#undo-action").addEventListener("click", undoLastAction);
$("#short-rest").addEventListener("click", openShortRestDialog);
$("#short-rest-form").addEventListener("submit", applyShortRest);
$("#long-rest").addEventListener("click", applyLongRest);
$("#member-form").elements.class.addEventListener("change", queueClassProfile);
$("#member-form").elements.level.addEventListener("input", queueClassProfile);
$("#new-expedition").addEventListener("click", newExpedition);
$("#reset-dungeon").addEventListener("click", resetDungeon);
$("#replay-collapse").addEventListener("click", playCollapse);
$("#refresh-forecast").addEventListener("click", () => {
  checkpoint("Advance forecast");
  state.completed += 1;
  state.encounterControls = { rerolls: {}, ratings: {}, kinds: {} };
  logEvent("forecast", "Advanced to the next three encounters");
  saveState();
  updateForecast("Next three encounters rebalanced");
});
$("#copy-seed").addEventListener("click", async () => {
  await navigator.clipboard?.writeText(state.seed);
  showToast("Seed copied");
});
$("#export-button").addEventListener("click", exportSession);
$("#print-map").addEventListener("click", printMap);
$("#theme-toggle").addEventListener("click", () => document.body.classList.toggle("high-contrast"));
globalThis.addEventListener("afterprint", () => document.body.classList.remove("print-journal"));
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
saveState();
buildMapCells();
playCollapse();
updateForecast("");
