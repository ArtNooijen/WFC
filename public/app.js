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
  if (member.dead) return "dead";
  const ratio = member.hp / member.maxHp;
  return ratio < 0.3 ? "critical" : ratio < 0.65 ? "wounded" : "";
}

function resourceSummary(member) {
  if (!member.resources?.length) return `◈ ${member.resource}/${member.maxResource}`;
  const current = member.resources.reduce((sum, pool) => sum + Number(pool.current), 0);
  const maximum = member.resources.reduce((sum, pool) => sum + Number(pool.maximum), 0);
  return `${member.resources.length} pools · ${current}/${maximum}`;
}

function renderParty() {
  const living = state.party.filter((member) => !member.dead);
  const profile = living.length ? analyzeParty(state.party) : null;
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
  if (action === "hp") {
    member.hp = Math.max(0, Number(member.hp) - 1);
    message = `${member.name} loses 1 HP`;
  } else if (action === "resource") {
    if (member.resources?.length) {
      const pool = member.resources.find((candidate) => Number(candidate.current) > 0);
      if (!pool) {
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
  state.party = state.party.filter((item) => item.id !== id);
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
  applyClassProfiles(forecast.classProfiles);
  forecast.encounters = placeEncounters(forecast.encounters, dungeon, state.completed);
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
  $("#pacing-label").textContent = `${forecast.plan} pace · floor ${forecast.floor}`;
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
      </div>
    </article>`;
  }).join("");
  renderDungeonLedger();
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
  const defaults = member ? { ...member, conModifier: member.conModifier ?? 0 } : {
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
  const member = {
    id: data.memberId || crypto.randomUUID(),
    name: data.name.trim(),
    class: data.class,
    level: Number(data.level),
    hp: Number(data.hp),
    maxHp: Number(data.maxHp),
    ac: Number(data.ac),
    conModifier: Number(data.conModifier),
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
  if (index >= 0) {
    member.hitDice = hitDiceState({
      ...member,
      hitDice: state.party[index].hitDice,
    });
    state.party[index] = member;
  } else state.party.push(member);
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
  const selections = Object.fromEntries(new FormData($("#short-rest-form")));
  const result = takeShortRest(state.party, selections);
  state.party = result.party;
  saveState();
  $("#short-rest-dialog").close();
  renderParty();
  const healed = result.healing.reduce((sum, entry) => sum + entry.restored, 0);
  updateForecast(
    `Short rest · ${healed} HP restored · ${result.resourcesRecovered} resource uses recovered`,
  );
}

function applyLongRest() {
  state.party = takeLongRest(state.party);
  saveState();
  renderParty();
  updateForecast("Long rest · HP, Hit Dice, and all resources restored");
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

function resetDungeon() {
  const confirmed = globalThis.confirm(
    "Reset this dungeon to floor 1? Your party will be kept, but the map and encounter history will be replaced.",
  );
  if (!confirmed) return;
  state.seed = randomSeed();
  state.completed = 0;
  state.floor = 1;
  state.expedition += 1;
  dungeon = generateDungeon(state.seed);
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
$("#short-rest").addEventListener("click", openShortRestDialog);
$("#short-rest-form").addEventListener("submit", applyShortRest);
$("#long-rest").addEventListener("click", applyLongRest);
$("#member-form").elements.class.addEventListener("change", queueClassProfile);
$("#member-form").elements.level.addEventListener("input", queueClassProfile);
$("#new-expedition").addEventListener("click", newExpedition);
$("#reset-dungeon").addEventListener("click", resetDungeon);
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
$("#print-map").addEventListener("click", printMap);
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
