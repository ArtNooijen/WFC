import {
  analyzeParty,
  applyForecastControls,
  averageHitPointMaximum,
  BIOME_MODIFIERS,
  buildEncounterForecast,
  generateDungeon,
  hitDiceState,
  placeEncounters,
  removeTerrainFeature,
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
    hp: 36,
    maxHp: 36,
    ac: 16,
    resource: 4,
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
    hp: 26,
    maxHp: 26,
    ac: 13,
    resource: 7,
    maxResource: 7,
  },
  {
    id: crypto.randomUUID(),
    name: "Brother Orr",
    class: "Cleric",
    level: 4,
    hp: 33,
    maxHp: 33,
    ac: 17,
    resource: 6,
    maxResource: 6,
  },
];

const $ = (selector) => document.querySelector(selector);
const state = loadState();
state.dungeonSeed ??= state.seed;
state.encounterBaseline ??= createEncounterBaseline(state.party);
state.floors ??= {};
state.visitedRooms ??= {};
let dungeon = ensureCurrentFloor();
let forecast = null;
let animationFrame = null;
let zoom = 1;
let dialogClassProfile = null;
let classProfileTimer = null;
let classProfileRequest = 0;
let quickForecastTimer = null;
let conditionRequest = null;
let forecastRequest = 0;

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
        inSafeRoom: false,
        restStats: { short: 0, long: 0, interrupted: 0 },
        clearedRooms: {},
        claimedLoot: [],
        pendingRestEncounter: null,
        initiative: null,
        forecastChanges: [],
        themeOrder: randomThemeOrder(),
        storyVariant: randomStoryVariant(),
        floors: {},
        visitedRooms: {},
        currentRoomId: null,
        ...saved,
        undoStack: compactUndoStack(saved.undoStack),
        settings: {
          ...DEFAULT_SETTINGS,
          ...(saved.settings ?? {}),
          biomeOptions: {
            ...DEFAULT_SETTINGS.biomeOptions,
            ...(saved.settings?.biomeOptions ?? {}),
          },
        },
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
    inSafeRoom: false,
    restStats: { short: 0, long: 0, interrupted: 0 },
    clearedRooms: {},
    claimedLoot: [],
    pendingRestEncounter: null,
    initiative: null,
    forecastChanges: [],
    themeOrder: randomThemeOrder(),
    storyVariant: randomStoryVariant(),
    floors: {},
    visitedRooms: {},
    currentRoomId: null,
  };
}

function compactUndoStack(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(-8).map((entry) => {
    const snapshot = entry?.snapshot && typeof entry.snapshot === "object"
      ? { ...entry.snapshot }
      : {};
    const floorData = snapshot.floorData ?? snapshot.floors?.[String(snapshot.floor)];
    delete snapshot.floors;
    if (validDungeonData(floorData)) snapshot.floorData = floorData;
    else delete snapshot.floorData;
    return { ...entry, snapshot };
  });
}

function floorKey(floor = state.floor) {
  return String(floor);
}

function validDungeonData(candidate) {
  return Boolean(
    candidate && Number(candidate.width) > 0 && Number(candidate.height) > 0 &&
      Array.isArray(candidate.grid) && candidate.grid.length === Number(candidate.height) &&
      candidate.grid.every((row) => Array.isArray(row) && row.length === Number(candidate.width)) &&
      Array.isArray(candidate.rooms) && candidate.rooms.length >= 4 &&
      Array.isArray(candidate.steps) && candidate.steps.length > 0,
  );
}

function ensureCurrentFloor() {
  const key = floorKey();
  const candidate = state.floors[key];
  if (!validDungeonData(candidate)) {
    state.floors[key] = generateDungeon(
      candidate?.seed ?? seedForDungeonFloor(state.floor),
      undefined,
      undefined,
      dungeonGenerationOptions(),
    );
  }
  const stored = state.floors[key];
  const template = generateDungeon(stored.seed, undefined, undefined, dungeonGenerationOptions());
  if (stored.themeSignature !== template.themeSignature) {
    if (state.initiative?.themeSignature === stored.themeSignature) {
      state.initiative.themeSignature = template.themeSignature;
    }
    stored.theme = template.theme;
    stored.themeSignature = template.themeSignature;
    stored.restriction = template.restriction;
  }
  state.seed = stored.seed;
  state.currentRoomId = stored.rooms.some((room) => room.id === state.currentRoomId)
    ? state.currentRoomId
    : (stored.rooms.find((room) => room.role === "entry") ?? stored.rooms[0])?.id;
  state.visitedRooms[key] ??= state.currentRoomId ? [state.currentRoomId] : [];
  return stored;
}

function persistDungeon(next = dungeon) {
  dungeon = next;
  state.floors[floorKey()] = dungeon;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    if (error?.name !== "QuotaExceededError") throw error;
    state.undoStack = compactUndoStack(state.undoStack).slice(-3);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (retryError) {
      console.error(
        "Session storage is full; continuing without persisting this change",
        retryError,
      );
    }
  }
  $("#undo-action")?.toggleAttribute("disabled", !state.undoStack.length);
}

function createEncounterBaseline(party = state.party) {
  return Object.fromEntries(party.map((member) => [member.id, {
    hp: Number(member.hp ?? 0),
    tempHp: Number(member.tempHp ?? 0),
    resource: Number(member.resource ?? 0),
  }]));
}

function resetEncounterBaseline() {
  state.encounterBaseline = createEncounterBaseline();
}

function resetPartyLearning() {
  const confirmed = globalThis.confirm(
    "Reset learned party history? This clears resolved-encounter performance and rest calibration, so the model treats this as a new party. Characters, current encounters, dungeon progress, and the journal stay unchanged.",
  );
  if (!confirmed) return;
  checkpoint("Reset learned party history");
  state.learningSamples = [];
  state.restStats = { short: 0, long: 0, interrupted: 0 };
  saveState();
  renderParty();
  updateForecast("Party learning reset · calibration returned to baseline");
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
      inSafeRoom: state.inSafeRoom,
      restStats: state.restStats,
      clearedRooms: state.clearedRooms,
      claimedLoot: state.claimedLoot,
      pendingRestEncounter: state.pendingRestEncounter,
      initiative: state.initiative,
      forecastChanges: state.forecastChanges,
      themeOrder: state.themeOrder,
      storyVariant: state.storyVariant,
      encounterBaseline: state.encounterBaseline,
      dungeonSeed: state.dungeonSeed,
      floorData: state.floors?.[floorKey()],
      visitedRooms: state.visitedRooms,
      currentRoomId: state.currentRoomId,
    }),
  });
  state.undoStack = compactUndoStack(state.undoStack);
}

function logEvent(type, title, detail = "") {
  const notable = new Set(["encounter", "loot", "room", "rest", "death", "dungeon"]);
  if (!notable.has(type)) return;
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
  return {
    ...learningModel(state.learningSamples, state.restStats),
    awareness: state.awareness,
    themeOrder: state.themeOrder,
    storyVariant: state.storyVariant,
    dungeonSeed: state.dungeonSeed,
  };
}

function randomThemeOrder() {
  const themes = ["moss-forest", "drowned-grotto", "ossuary", "infernal-foundry"];
  for (let index = themes.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [themes[index], themes[swap]] = [themes[swap], themes[index]];
  }
  return themes;
}

function randomStoryVariant() {
  return Math.floor(Math.random() * 3);
}

function dungeonGenerationOptions(overrides = {}) {
  const configuredTheme = state.settings?.dungeonTheme;
  return {
    floor: state.floor,
    themeMode: state.settings?.themeMode ?? "arcs",
    dungeonTheme: configuredTheme && configuredTheme !== "random"
      ? configuredTheme
      : state.themeOrder?.[0],
    themeOrder: state.themeOrder,
    storyVariant: state.storyVariant,
    dungeonSeed: state.dungeonSeed,
    floorSize: state.settings?.floorSize ?? "medium",
    roomCount: state.settings?.roomCount ?? 11,
    biomeOptions: state.settings?.biomeOptions ?? DEFAULT_SETTINGS.biomeOptions,
    ...overrides,
  };
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

function seedForDungeonFloor(floor) {
  return floor === 1 ? state.dungeonSeed : `${state.dungeonSeed}-floor-${floor}`;
}

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function healthClass(member) {
  if (member.dead) return "dead";
  const ratio = member.hp / member.maxHp;
  return ratio < 0.3 ? "critical" : ratio < 0.65 ? "wounded" : "";
}

function healthLabel(member) {
  if (member.dead) return "Fallen";
  const state = healthClass(member);
  return state === "critical" ? "Critical" : state === "wounded" ? "Wounded" : "Healthy";
}

function resourceSummary(member) {
  if (!state.settings.trackResources) return "resource tracking off";
  if (!member.resources?.length) return `◈ ${member.resource}/${member.maxResource}`;
  const current = member.resources.reduce((sum, pool) => sum + Number(pool.current), 0);
  const maximum = member.resources.reduce((sum, pool) => sum + Number(pool.maximum), 0);
  return `${member.resources.length} pools · ${current}/${maximum}`;
}

function restoreResources(member, amount) {
  let remaining = Math.max(0, Number(amount) || 0);
  if (member.resources?.length) {
    const resources = member.resources.map((pool) => {
      const space = Math.max(0, Number(pool.maximum) - Number(pool.current));
      const restored = Math.min(space, remaining);
      remaining -= restored;
      return { ...pool, current: Number(pool.current) + restored };
    });
    return {
      ...member,
      resources,
      resource: resources.reduce((sum, pool) => sum + Number(pool.current), 0),
    };
  }
  return {
    ...member,
    resource: Math.min(Number(member.maxResource ?? 0), Number(member.resource ?? 0) + remaining),
  };
}

function renderPartyProfile(profile) {
  const container = $("#party-profile-overview");
  if (!profile) {
    container.innerHTML = "<p>Add an adventurer to see party strengths and weaknesses.</p>";
    renderEncounterAugmenters(null);
    return;
  }
  const capabilityLabels = {
    singleTarget: "Single target",
    aoe: "Area damage",
    damage: "Damage",
    tank: "Defense",
    support: "Support",
    melee: "Melee",
    ranged: "Ranged",
    control: "Control",
    healing: "Healing",
  };
  const capabilities = Object.entries(profile.capabilities).map(([key, value]) => ({
    key,
    label: capabilityLabels[key] ?? key,
    value: Number(value),
  }));
  const strongest = [...capabilities].sort((a, b) => b.value - a.value).slice(0, 2);
  const weakest = [...capabilities].sort((a, b) => a.value - b.value).slice(0, 2);
  const tracked = [
    ["Vitality", `${Math.round(profile.hpRatio * 100)}%`],
    ...(state.settings.trackResources
      ? [["Resources", `${Math.round(profile.measuredResourceRatio * 100)}%`]]
      : []),
    ["Average AC", profile.defense.toFixed(1)],
    ["Readiness", `${Math.round(profile.readiness * 100)}%`],
    ["Wounded", String(profile.wounded)],
    ["Critical", String(profile.critical)],
    ...(state.settings.trackAfflictions
      ? [["Affliction load", `${Math.round(profile.afflictionLoad * 100)}%`]]
      : []),
  ];
  const feedbackLabels = {
    easier: "Easier than expected",
    accurate: "As expected",
    harder: "Harder than expected",
  };
  const resolvedLocks = Object.values(state.encounterLocks ?? {}).filter((encounter) =>
    encounter?.resolved
  );
  const recentOutcomes = (state.learningSamples ?? []).map((sample) => {
    const encounter = resolvedLocks.find((candidate) => candidate.id === sample.encounterId);
    const name = sample.roomName ?? encounter?.room?.name ?? sample.encounterTitle ??
      encounter?.title;
    return name && sample.feedback
      ? { name, feedback: sample.feedback, at: sample.at ?? "" }
      : null;
  }).filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5);
  container.innerHTML = `<header><span>Party profile</span><b>Strengths and weaknesses</b></header>
    <div class="party-profile-summary"><p><b>Strong</b>${
    strongest.map((item) => escapeHtml(item.label)).join(" · ")
  }</p><p><b>Weak</b>${weakest.map((item) => escapeHtml(item.label)).join(" · ")}</p></div>
    <div class="party-profile-capabilities">${
    capabilities.map((item) => {
      const level = item.value >= 3.5 ? "strong" : item.value <= 2.25 ? "weak" : "steady";
      return `<div class="${level}"><span>${escapeHtml(item.label)}</span><b>${
        item.value.toFixed(1)
      } / 5</b><i style="--score:${Math.max(0, Math.min(100, item.value / 5 * 100))}%"></i></div>`;
    }).join("")
  }</div>
    <dl>${
    tracked.map(([label, value]) =>
      `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    ).join("")
  }</dl>${
    recentOutcomes.length
      ? `<section class="party-room-outcomes"><b>Previous resolved rooms</b>${
        recentOutcomes.map((outcome) =>
          `<p class="outcome-${outcome.feedback}"><span>${escapeHtml(outcome.name)}</span><strong>${
            escapeHtml(feedbackLabels[outcome.feedback] ?? outcome.feedback)
          }</strong></p>`
        ).join("")
      }</section>`
      : ""
  }`;
  renderEncounterAugmenters(profile);
}

function renderEncounterAugmenters(profile) {
  const container = $("#encounter-augmenters");
  if (!container) return;
  if (!profile) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  const items = [];
  const aoe = Number(profile.capabilities?.aoe ?? 3);
  if (aoe > 3) {
    items.push({
      name: "Supplied area damage",
      effect: "Larger enemy groups become more likely while those resources remain.",
      value: `${aoe.toFixed(1)} / 5`,
      tone: "opportunity",
    });
  } else if (aoe < 3) {
    items.push({
      name: "Limited area damage",
      effect: "Smaller groups are preferred, but group encounters remain possible.",
      value: `${aoe.toFixed(1)} / 5`,
      tone: "caution",
    });
  }

  const defense = Number(profile.defense ?? 10);
  const maximumDefense = Number(profile.maximumDefense ?? defense);
  if (defense > 16 || maximumDefense > 20) {
    const specialistTrigger = defense <= 16 && maximumDefense > 20;
    items.push({
      name: "High armour",
      effect: specialistTrigger
        ? "One heavily armoured member makes monsters with player-saving-throw attacks more likely."
        : "Monsters whose attacks force players to make saving throws are more likely.",
      value: specialistTrigger ? `Peak AC ${maximumDefense}` : `Avg AC ${defense.toFixed(1)}`,
      tone: "counter",
    });
  }

  const learnedAdjustment = Number(forecast?.profile?.learnedAdjustment ?? 0);
  const planningReadiness = Math.max(
    0,
    Math.min(1, Number(profile.readiness ?? 0) + learnedAdjustment),
  );
  if (planningReadiness >= .78) {
    items.push({
      name: "Strong current condition",
      effect: "Encounters target the upper portion of their selected difficulty band.",
      value: `${Math.round(planningReadiness * 100)}%`,
      tone: "pressure",
    });
  } else if (planningReadiness < .58) {
    items.push({
      name: "Depleted condition",
      effect: "Encounters target the lower portion of their selected difficulty band.",
      value: `${Math.round(planningReadiness * 100)}%`,
      tone: "relief",
    });
  }

  if (Math.abs(learnedAdjustment) >= .005) {
    const raisesPressure = learnedAdjustment > 0;
    items.push({
      name: "Learned performance",
      effect: `Resolved encounters ${
        raisesPressure ? "raise" : "lower"
      } current planning pressure.`,
      value: `${raisesPressure ? "+" : ""}${(learnedAdjustment * 100).toFixed(1)}%`,
      tone: raisesPressure ? "pressure" : "relief",
    });
  }

  const alertPressure = Math.min(.16, Math.max(0, Number(state.awareness ?? 0) * .025));
  if (alertPressure > 0) {
    items.push({
      name: "Dungeon alert",
      effect: "The dungeon's awareness adds pressure to upcoming encounters.",
      value: `+${Math.round(alertPressure * 100)}%`,
      tone: "counter",
    });
  }

  container.hidden = false;
  container.innerHTML =
    `<header><span>Encounter augmenters</span><b>Currently in effect</b></header>
    <div class="encounter-augmenter-list">${
      items.length
        ? items.map((item) =>
          `<article class="${item.tone}">
          <i aria-hidden="true"></i><div><b>${escapeHtml(item.name)}</b><p>${
            escapeHtml(item.effect)
          }</p></div><strong>${escapeHtml(item.value)}</strong>
        </article>`
        ).join("")
        : `<p class="no-augmenters">No composition or pressure modifiers are active.</p>`
    }</div>`;
}

function renderParty() {
  const living = state.party.filter((member) => !member.dead);
  const profile = living.length ? analyzeParty(state.party, state.settings) : null;
  document.body.classList.toggle("hide-resources", !state.settings.trackResources);
  document.body.classList.toggle("hide-afflictions", !state.settings.trackAfflictions);
  $("#party-level").textContent = profile ? profile.averageLevel.toFixed(1) : "—";
  $("#party-hp").textContent = profile ? `${Math.round(profile.hpRatio * 100)}%` : "0%";
  $("#party-size").textContent = living.length;
  renderPartyProfile(profile);
  $("#party-list").innerHTML = state.party.map((member) => `
    <article class="member-card ${
    healthClass(member)
  }" data-member-id="${member.id}" tabindex="0" aria-label="Edit ${member.name}">
      <div class="member-main">
        <div class="avatar">${member.dead ? "X" : initials(member.name)}</div>
        <div class="member-identity"><strong>${escapeHtml(member.name)}</strong><span>${
    member.dead
      ? "FALLEN · EXCLUDED FROM FORECAST"
      : `LV ${member.level} · ${escapeHtml(member.class)}`
  }</span></div>
        <div class="hp-number"><small>${
    healthLabel(member)
  }</small><b>${member.hp}</b><span> / ${member.maxHp}</span></div>
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
        <div class="member-hp-controls"><span class="control-label">HP</span>
          <button type="button" data-member-hp-delta="-1" data-member-id="${member.id}" ${
    member.dead || member.hp <= 0 ? "disabled" : ""
  } title="Decrease HP by 1">-1</button>
          <input class="member-hp-input" data-member-hp-input data-member-id="${member.id}" type="number" min="0" max="${member.maxHp}" value="${member.hp}" aria-label="Current HP for ${
    escapeHtml(member.name)
  }">
          <button type="button" data-member-hp-delta="1" data-member-id="${member.id}" ${
    member.dead || member.hp >= member.maxHp ? "disabled" : ""
  } title="Increase HP by 1">+1</button>
          <input class="member-hp-slider" data-member-hp-slider data-member-id="${member.id}" type="range" min="0" max="${member.maxHp}" value="${member.hp}" aria-label="Quick HP for ${
    escapeHtml(member.name)
  }">
          <output class="member-hp-output">${member.hp}/${member.maxHp}</output>
        </div>
        <div class="member-resource-controls"><span class="control-label">RESOURCES · ${
    member.resource ?? 0
  }/${member.maxResource ?? 0}</span>
          <button type="button" data-quick-action="resource" data-resource-delta="-1" data-member-id="${member.id}" ${
    member.dead ? "disabled" : ""
  } title="Decrease resources by 1">-1</button>
          <button type="button" data-quick-action="resource" data-resource-delta="1" data-member-id="${member.id}" ${
    member.dead ? "disabled" : ""
  } title="Increase resources by 1">+1</button>
          <button class="kill-member ${
    member.dead ? "revive-member" : ""
  }" type="button" data-quick-action="kill" data-member-id="${member.id}" aria-label="${
    member.dead ? "Revive" : "Mark"
  } ${escapeHtml(member.name)}${member.dead ? "" : " dead"}" title="${
    member.dead
      ? "Revive at 1 HP and include in difficulty"
      : "Mark dead and exclude from difficulty"
  }">${member.dead ? "Revive" : "Fallen"}</button>
        </div>
      </div>
      <div class="member-statuses">${
    state.settings.trackAfflictions && !member.dead && Number(member.tempHp) > 0
      ? `<span>+${member.tempHp} temp HP</span>`
      : ""
  }${member.concentration ? "<span>Concentrating</span>" : ""}${
    member.inspiration ? "<span>Inspiration</span>" : ""
  }${Number(member.exhaustion) > 0 ? `<span>Exhaustion ${member.exhaustion}</span>` : ""}${
    member.hp <= 0 && member.deathSaves
      ? `<span>Death saves · ${member.deathSaves.successes} success · ${member.deathSaves.failures} failure</span>`
      : ""
  }${
    state.settings.trackAfflictions
      ? (member.conditions ?? []).map((condition) =>
        `<span class="editable-tag">${escapeHtml(condition)}${
          Number(member.conditionRounds) > 0 ? ` · ${member.conditionRounds}r` : ""
        }<button type="button" data-remove-member-tag="condition" data-tag-value="${
          escapeHtml(condition)
        }" data-member-id="${member.id}" aria-label="Remove ${
          escapeHtml(condition)
        }">×</button></span>`
      ).join("")
      : ""
  }${
    (member.customFeatures ?? []).map((feature) =>
      `<span class="editable-tag feature-tag">${
        escapeHtml(feature)
      }<button type="button" data-remove-member-tag="feature" data-tag-value="${
        escapeHtml(feature)
      }" data-member-id="${member.id}" aria-label="Remove ${escapeHtml(feature)}">×</button></span>`
    ).join("")
  }
        ${
    state.settings.trackAfflictions
      ? `<button type="button" class="add-member-tag" data-add-member-tag="condition" data-member-id="${member.id}">+ condition</button>`
      : ""
  }
        <button type="button" class="add-member-tag" data-add-member-tag="feature" data-member-id="${member.id}">+ feature</button>
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
      quickUpdateMember(
        button.dataset.memberId,
        button.dataset.quickAction,
        Number(button.dataset.resourceDelta ?? -1),
      );
    });
  });
  document.querySelectorAll("[data-member-hp-delta]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      changeMemberHp(button.dataset.memberId, Number(button.dataset.memberHpDelta));
    });
  });
  document.querySelectorAll("[data-member-hp-input]").forEach((input) => {
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", (event) => {
      event.stopPropagation();
      setMemberHp(input.dataset.memberId, Number(input.value));
    });
  });
  document.querySelectorAll("[data-member-hp-slider]").forEach((slider) => {
    slider.addEventListener("click", (event) => event.stopPropagation());
    slider.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      const member = state.party.find((item) => item.id === slider.dataset.memberId);
      if (member) checkpoint(`Change ${member.name}'s HP`);
    });
    slider.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (
        event.repeat ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
      ) return;
      const member = state.party.find((item) => item.id === slider.dataset.memberId);
      if (member) checkpoint(`Change ${member.name}'s HP`);
    });
    slider.addEventListener("input", (event) => {
      event.stopPropagation();
      previewMemberHp(slider.dataset.memberId, Number(slider.value));
    });
    slider.addEventListener("change", (event) => {
      event.stopPropagation();
      const member = state.party.find((item) => item.id === slider.dataset.memberId);
      if (member) {
        saveState();
        renderParty();
        queueQuickForecast(`${member.name} is now at ${member.hp}/${member.maxHp} HP`);
      }
    });
  });
  document.querySelectorAll("[data-add-member-tag]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      addMemberTag(button.dataset.memberId, button.dataset.addMemberTag);
    });
  });
  document.querySelectorAll("[data-remove-member-tag]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      removeMemberTag(
        button.dataset.memberId,
        button.dataset.removeMemberTag,
        button.dataset.tagValue,
      );
    });
  });
}

function queueQuickForecast(message) {
  clearTimeout(quickForecastTimer);
  quickForecastTimer = setTimeout(() => updateForecast(message), 280);
}

function setMemberHp(id, value) {
  const member = state.party.find((item) => item.id === id);
  if (!member || member.dead) return;
  const next = Math.max(0, Math.min(Number(member.maxHp), Number(value) || 0));
  if (next === Number(member.hp)) return;
  checkpoint(`Change ${member.name}'s HP`);
  const previous = Number(member.hp);
  member.hp = next;
  saveState();
  renderParty();
  queueQuickForecast(`${member.name}: ${previous} to ${next} HP`);
}

function previewMemberHp(id, value) {
  const member = state.party.find((item) => item.id === id);
  const card = document.querySelector(`.member-card[data-member-id="${id}"]`);
  if (!member || !card || member.dead) return;
  member.hp = Math.max(0, Math.min(Number(member.maxHp), Number(value) || 0));
  card.querySelector(".member-hp-input").value = member.hp;
  card.querySelector(".member-hp-output").textContent = `${member.hp}/${member.maxHp}`;
  card.querySelector(".hp-number b").textContent = member.hp;
  card.querySelector(".hp-bar i").style.width = `${Math.min(100, member.hp / member.maxHp * 100)}%`;
  card.classList.toggle("critical", member.hp / member.maxHp < .3);
  card.classList.toggle(
    "wounded",
    member.hp / member.maxHp >= .3 && member.hp / member.maxHp < .65,
  );
  saveState();
}

function changeMemberHp(id, delta) {
  const member = state.party.find((item) => item.id === id);
  if (member) setMemberHp(id, Number(member.hp) + delta);
}

function addMemberTag(id, type) {
  const member = state.party.find((item) => item.id === id);
  if (!member) return;
  if (type === "condition") {
    openConditionDialog(id);
    return;
  }
  const value = globalThis.prompt(`Add a ${type} for ${member.name}:`)?.trim();
  if (!value) return;
  addMemberTagValue(member, type, value);
}

function addMemberTagValue(member, type, value) {
  const field = type === "condition" ? "conditions" : "customFeatures";
  const tags = member[field] ?? [];
  if (tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) return;
  checkpoint(`Add ${type} to ${member.name}`);
  member[field] = [...tags, value];
  saveState();
  renderParty();
}

async function loadConditionOptions() {
  if (conditionRequest) return conditionRequest;
  conditionRequest = fetch("/api/srd/conditions").then(async (response) => {
    if (!response.ok) throw new Error("SRD conditions unavailable");
    const data = await response.json();
    $("#condition-options").innerHTML = data.conditions.map((condition) =>
      `<option value="${escapeHtml(condition.name)}"></option>`
    ).join("");
    $("#condition-source").textContent =
      `${data.conditions.length} official conditions · live 2014 SRD`;
    return data.conditions;
  }).catch(() => {
    const fallback = [
      "Blinded",
      "Charmed",
      "Deafened",
      "Exhaustion",
      "Frightened",
      "Grappled",
      "Incapacitated",
      "Invisible",
      "Paralyzed",
      "Petrified",
      "Poisoned",
      "Prone",
      "Restrained",
      "Stunned",
      "Unconscious",
    ];
    $("#condition-options").innerHTML = fallback.map((name) => `<option value="${name}"></option>`)
      .join("");
    $("#condition-source").textContent = "Offline SRD condition list";
    return fallback;
  });
  return conditionRequest;
}

function openConditionDialog(memberId) {
  const form = $("#condition-form");
  form.reset();
  form.elements.memberId.value = memberId;
  $("#condition-dialog").showModal();
  loadConditionOptions();
  setTimeout(() => form.elements.condition.focus(), 30);
}

function saveCondition(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const member = state.party.find((item) => item.id === form.elements.memberId.value);
  const value = form.elements.condition.value.trim();
  if (!member || !value) return;
  addMemberTagValue(member, "condition", value);
  $("#condition-dialog").close();
}

function removeMemberTag(id, type, value) {
  const member = state.party.find((item) => item.id === id);
  if (!member) return;
  const field = type === "condition" ? "conditions" : "customFeatures";
  checkpoint(`Remove ${type} from ${member.name}`);
  member[field] = (member[field] ?? []).filter((tag) => tag !== value);
  saveState();
  renderParty();
}

function quickUpdateMember(id, action, delta = -1) {
  let member = state.party.find((item) => item.id === id);
  if (!member || (member.dead && action !== "kill")) return;
  let message = `${member.name} updated`;
  checkpoint(message);
  if (action === "hp") {
    member.hp = Math.max(0, Number(member.hp) - 1);
    message = `${member.name} loses 1 HP`;
  } else if (action === "resource" && delta < 0) {
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
  } else if (action === "resource") {
    const before = Number(member.resource ?? 0);
    member = restoreResources(member, delta);
    const restored = Number(member.resource ?? 0) - before;
    if (!restored) {
      state.undoStack.pop();
      showToast(`${member.name}'s resources are already full`);
      return;
    }
    state.party[state.party.findIndex((item) => item.id === id)] = member;
    message = `${member.name} recovers ${restored} resource use`;
  } else if (action === "kill") {
    if (member.dead) {
      member.dead = false;
      member.hp = Math.max(1, Number(member.hp));
      message = `${member.name} returns at 1 HP · included in encounter difficulty`;
      logEvent("death", `${member.name} was revived`, "Returned to the active party at 1 HP");
    } else {
      member.hp = 0;
      member.dead = true;
      message = `${member.name} has fallen · excluded from encounter difficulty`;
      logEvent("death", `${member.name} was killed`, `Marked fallen on floor ${state.floor}`);
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
  delete state.encounterBaseline?.[id];
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

function formatMonsterSpeed(speed) {
  if (!speed) return "—";
  if (typeof speed === "string") return speed;
  return Object.entries(speed).map(([mode, value]) => `${mode} ${value}`).join(" · ");
}

function renderMonsterFeatures(items, emptyText) {
  if (!items?.length) return `<p class="monster-feature-empty">${escapeHtml(emptyText)}</p>`;
  return `<div class="monster-feature-list">${
    items.map((item) => {
      const attack = item.attackBonus === null || item.attackBonus === undefined
        ? ""
        : `Attack ${Number(item.attackBonus) >= 0 ? "+" : ""}${item.attackBonus}`;
      const damage = (item.damages ?? []).map((part) => `${part.dice} ${part.type}`).join(" + ");
      const save = item.dc ? `${item.dc.ability} save DC ${item.dc.value}` : "";
      const mechanics = [attack, damage, save].filter(Boolean).join(" · ");
      return `<article><b>${escapeHtml(item.name)}</b>${
        mechanics ? `<small>${escapeHtml(mechanics)}</small>` : ""
      }<p>${escapeHtml(item.description)}</p></article>`;
    }).join("")
  }</div>`;
}

function renderMonsterAbilities(scores) {
  if (!scores) return "";
  return `<dl class="monster-abilities">${
    ["STR", "DEX", "CON", "INT", "WIS", "CHA"].map(
      (ability) => {
        const score = Number(scores[ability] ?? 10);
        const modifier = Math.floor((score - 10) / 2);
        return `<div><dt>${ability}</dt><dd>${score} (${
          modifier >= 0 ? "+" : ""
        }${modifier})</dd></div>`;
      },
    ).join("")
  }</dl>`;
}

function renderMonsterDefenses(monster) {
  const rows = [
    ["Immune", monster.damageImmunities],
    ["Resistant", monster.damageResistances],
    ["Condition immune", monster.conditionImmunities],
  ].filter(([, values]) => values?.length);
  if (!rows.length) return "";
  return `<section class="monster-defenses"><strong>Defenses</strong>${
    rows.map(([label, values]) =>
      `<p><b>${escapeHtml(label)}</b> ${escapeHtml(values.join(", "))}</p>`
    ).join("")
  }</section>`;
}

function randomDie(sides) {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % sides + 1;
}

function rollDiceExpression(expression) {
  const match = String(expression).trim().match(/^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/i);
  if (!match) return null;
  const count = Math.max(1, Math.min(100, Number(match[1])));
  const sides = Math.max(2, Math.min(1000, Number(match[2])));
  const modifier = match[4] ? Number(match[4]) * (match[3] === "-" ? -1 : 1) : 0;
  const rolls = Array.from({ length: count }, () => randomDie(sides));
  return { rolls, modifier, total: rolls.reduce((sum, roll) => sum + roll, modifier) };
}

function buildMapCells() {
  const map = $("#ascii-map");
  map.style.gridTemplateColumns = `repeat(${dungeon.width}, var(--cell-width, 9px))`;
  map.innerHTML = dungeon.grid.flatMap((row, y) =>
    row.map((tile, x) => {
      const info = TILE_INFO[tile] ?? TILE_INFO[" "];
      const trap = dungeon.traps?.find((candidate) => candidate.x === x && candidate.y === y);
      const title = trap
        ? `${trap.name}: ${trap.trigger}. Detect ${trap.detection.method} DC ${trap.detection.dc}. ${trap.effect}`
        : info.name;
      const jitterX = (((x * 17 + y * 11) % 5) - 2) * 0.16;
      const jitterY = (((x * 7 + y * 19) % 5) - 2) * 0.12;
      const jitterRotation = (((x * 13 + y * 23) % 7) - 3) * 0.28;
      return `<button class="map-cell ${info.kind}" data-x="${x}" data-y="${y}" data-tile="${tile}" data-title="${
        escapeHtml(title)
      }" title="${
        escapeHtml(title)
      }" tabindex="-1" style="--jitter-x:${jitterX}px;--jitter-y:${jitterY}px;--jitter-r:${jitterRotation}deg">${tile}</button>`;
    })
  ).join("");
  for (const room of dungeon.rooms) {
    const roomIndex = dungeon.rooms.indexOf(room);
    const coordinates = `${String.fromCharCode(65 + Math.floor(room.cx / 5))}${room.cy + 1}`;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const roomCell = document.querySelector(`.map-cell[data-x="${x}"][data-y="${y}"]`);
        if (roomCell) roomCell.dataset.roomIndex = roomIndex;
      }
    }
    const cell = document.querySelector(`.map-cell[data-x="${room.cx}"][data-y="${room.cy}"]`);
    if (cell) {
      cell.dataset.roomCenter = "true";
      cell.setAttribute("aria-label", room.name);
    }
    if (!state.clearedRooms[coordinates]) continue;
    cell?.classList.add("cleared-room");
  }
  renderDungeonLedger();
  renderSafeRoomToggle();
  bindMapTerrainInteractions();
}

function bindMapTerrainInteractions() {
  $("#ascii-map").onclick = (event) => {
    const cell = event.target.closest(".map-cell.bush[data-room-index]");
    if (!cell || !globalThis.confirm("Cut down this bush and clear the tile?")) return;
    const room = dungeon.rooms[Number(cell.dataset.roomIndex)];
    if (!room) return;
    checkpoint(`Cut down a bush in ${room.name}`);
    persistDungeon(removeTerrainFeature(
      dungeon,
      room.id,
      Number(cell.dataset.x) - room.x,
      Number(cell.dataset.y) - room.y,
    ));
    saveState();
    buildMapCells();
    showToast("Bush cut down");
  };
}

function navigateFloor(delta) {
  const target = state.floor + delta;
  if (target < 1) return;
  if (delta > 0 && !state.floors[floorKey(target)]) {
    newExpedition();
    return;
  }
  checkpoint(`Navigate to floor ${target}`);
  state.floor = target;
  dungeon = ensureCurrentFloor();
  state.inSafeRoom = false;
  forecast = null;
  saveState();
  renderMeta();
  buildMapCells();
  playCollapse();
  updateForecast(`Returned to stored floor ${target}`);
}

function renderClearedRooms() {
  document.querySelectorAll(".map-cell.cleared-room").forEach((cell) =>
    cell.classList.remove("cleared-room")
  );
  for (const room of dungeon.rooms) {
    const coordinates = `${String.fromCharCode(65 + Math.floor(room.cx / 5))}${room.cy + 1}`;
    if (!state.clearedRooms[coordinates]) continue;
    document.querySelector(`.map-cell[data-x="${room.cx}"][data-y="${room.cy}"]`)?.classList.add(
      "cleared-room",
    );
  }
}

function renderSafeRoomToggle() {
  const button = $("#safe-room-toggle");
  const safeRoom = dungeon.rooms.find((room) => room.role === "safe");
  if (!safeRoom) state.inSafeRoom = false;
  button.disabled = !safeRoom;
  button.classList.toggle("active", Boolean(state.inSafeRoom));
  button.querySelector("b").textContent = !safeRoom
    ? "No safe room on this floor"
    : state.inSafeRoom
    ? `Inside ${safeRoom?.name ?? "a safe room"}`
    : "Party is not in a safe room";
}

function toggleSafeRoom() {
  if (!dungeon.rooms.some((room) => room.role === "safe")) {
    showToast("This floor offers no safe sanctuary");
    return;
  }
  checkpoint("Change party location");
  state.inSafeRoom = !state.inSafeRoom;
  saveState();
  renderSafeRoomToggle();
  showToast(state.inSafeRoom ? "Safe-room protection enabled" : "Party left the safe room");
}

function renderDungeonLedger() {
  const lootEntries = forecast?.loot?.length ? forecast.loot : dungeon.loot;
  $("#loot-table").innerHTML = lootEntries.length
    ? lootEntries.map((loot) =>
      loot.name
        ? `<p class="api-loot"><b>${escapeHtml(loot.rarity)}</b><span><a href="${
          escapeHtml(loot.source)
        }" target="_blank" rel="noreferrer">${escapeHtml(loot.name)}</a><small>${
          escapeHtml(loot.description)
        }</small></span><button class="claim-loot" data-loot-name="${escapeHtml(loot.name)}" ${
          state.claimedLoot.includes(loot.name) ? "disabled" : ""
        }>${state.claimedLoot.includes(loot.name) ? "Claimed" : "+ Claim"}</button></p>`
        : `<p><b>d8 · ${loot.roll}</b><span>${escapeHtml(loot.result)}</span></p>`
    ).join("")
    : "<p><span>No marked cache on this floor.</span></p>";
  document.querySelectorAll(".claim-loot").forEach((button) => {
    button.addEventListener("click", () => claimLoot(button.dataset.lootName));
  });
}

function claimLoot(name) {
  if (!name || state.claimedLoot.includes(name)) return;
  checkpoint(`Claim ${name}`);
  state.claimedLoot.push(name);
  logEvent("loot", `Loot gained: ${name}`, `Claimed on floor ${state.floor}`);
  saveState();
  renderDungeonLedger();
  showToast(`${name} added to the campaign record`);
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
  const batch = Math.max(20, Math.ceil(dungeon.steps.length / 18));
  const tick = () => {
    for (let n = 0; n < batch && index < dungeon.steps.length; n++, index++) {
      const step = dungeon.steps[index];
      document.querySelector(`.map-cell[data-x="${step.x}"][data-y="${step.y}"]`)?.classList.add(
        "resolved",
      );
    }
    $("#collapse-count").textContent = `${index} / ${dungeon.steps.length} marks drawn`;
    if (index < dungeon.steps.length) animationFrame = requestAnimationFrame(tick);
    else setTimeout(() => $("#collapse-status").classList.add("done"), 70);
  };
  animationFrame = requestAnimationFrame(tick);
}

async function updateForecast(message = "Forecast updated") {
  const requestId = ++forecastRequest;
  const button = $("#refresh-forecast");
  const previousForecast = forecast ? clone(forecast) : null;
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
  let nextForecast;
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
        controls: forecastControls(),
      }),
    });
    if (!response.ok) throw new Error("Forecast API unavailable");
    nextForecast = await response.json();
  } catch {
    nextForecast = buildLocalForecastForCurrentTheme();
    if (requestId === forecastRequest) showToast("Running the local prediction model");
  } finally {
    if (requestId === forecastRequest) button.disabled = false;
  }
  if (requestId !== forecastRequest) return;
  forecast = nextForecast;
  forecast = synchronizeForecastTheme(forecast);
  applyClassProfiles(forecast.classProfiles);
  forecast.encounters = placeEncounters(forecast.encounters, dungeon, state.completed);
  let removedStaleLock = false;
  forecast.encounters = forecast.encounters.map((encounter, index) => {
    const locked = state.encounterLocks[encounterKey(index)];
    const lockMatchesTheme = locked?.themeId === dungeon.theme.id &&
      locked?.storyTitle === dungeon.theme.story?.title;
    if (locked && !lockMatchesTheme) {
      delete state.encounterLocks[encounterKey(index)];
      removedStaleLock = true;
    }
    return lockMatchesTheme ? locked : encounter;
  });
  if (state.initiative && state.initiative.themeSignature !== dungeon.themeSignature) {
    state.initiative = null;
    removedStaleLock = true;
  }
  if (removedStaleLock) saveState();
  if (previousForecast && /resolved|re-read|controls|updated/i.test(message)) {
    const encounterChanges = forecast.encounters.flatMap((encounter, index) => {
      const before = previousForecast.encounters?.[index];
      if (!before) return [`Room ${index + 1} added: ${encounter.title}`];
      const changes = [];
      if (before.title !== encounter.title) {
        changes.push(`Room ${index + 1}: ${before.title} → ${encounter.title}`);
      }
      if (before.rating !== encounter.rating) {
        changes.push(`Room ${index + 1} difficulty: ${before.rating} → ${encounter.rating}`);
      }
      if (before.budget !== encounter.budget) {
        changes.push(`Room ${index + 1} pressure: ${before.budget} → ${encounter.budget}`);
      }
      return changes;
    });
    state.forecastChanges = [...(state.forecastChanges ?? []), ...encounterChanges].slice(-8);
    saveState();
  }
  if (state.pendingRestEncounter && forecast.encounters[0]) {
    const existing = forecast.encounters[0];
    forecast.encounters[0] = {
      ...existing,
      ...state.pendingRestEncounter,
      room: existing.room,
      marker: existing.marker,
      combat: state.pendingRestEncounter.kind === "combat" ? existing.combat : undefined,
    };
  }
  if (synchronizeInitiativeMonsters()) saveState();
  renderForecast();
  if (message) showToast(message);
}

function synchronizeInitiativeMonsters() {
  if (!state.initiative || !forecast?.encounters?.length) return false;
  const [initiativeFloor, initiativeCompleted, encounterIndex] = String(
    state.initiative.encounterKey,
  ).split(":").map(Number);
  if (initiativeFloor !== state.floor || initiativeCompleted !== state.completed) return false;
  const encounter = forecast.encounters[encounterIndex];
  const groups = encounter?.combat?.groups?.length
    ? encounter.combat.groups
    : encounter?.combat?.monster
    ? [{ count: encounter.combat.count, monster: encounter.combat.monster }]
    : [];
  const roster = groups.filter((group) => !group.spawned).flatMap((group) =>
    Array.from({ length: Math.max(1, Number(group.count) || 1) }, (_, index) => ({
      monster: group.monster,
      name: Number(group.count) > 1 ? `${group.monster.name} ${index + 1}` : group.monster.name,
    }))
  );
  const entries = state.initiative.entries.filter((entry) => entry.side === "monster");
  let changed = false;
  entries.forEach((entry, index) => {
    const replacement = roster[index];
    if (!replacement) return;
    const { monster, name } = replacement;
    const wasPlaceholder = !entry.monsterIndex || Number(entry.maxHp ?? 1) <= 1;
    if (wasPlaceholder) {
      entry.name = name;
      entry.hp = Number(monster.hp ?? entry.hp);
      entry.maxHp = Number(monster.hp ?? entry.maxHp);
      entry.monsterIndex = monster.index;
      changed = true;
    }
    if (!entry.actionDetails?.length && monster.actionDetails?.length) {
      entry.actionDetails = clone(monster.actionDetails);
      changed = true;
    }
    if (!Object.keys(entry.savingThrows ?? {}).length && monster.savingThrows) {
      entry.savingThrows = clone(monster.savingThrows);
      changed = true;
    }
  });
  const minionGroup = groups.find((group) => group.spawned);
  if (minionGroup && state.initiative.minionPool && !state.initiative.minionPool.monster?.index) {
    state.initiative.minionPool.monster = clone(minionGroup.monster);
    changed = true;
  }
  return changed;
}

function forecastControls() {
  const controls = clone(state.encounterControls);
  controls.rerolls ??= {};
  controls.ratings ??= {};
  controls.kinds ??= {};
  if (state.pendingRestEncounter) {
    controls.ratings[0] = state.pendingRestEncounter.rating;
    controls.kinds[0] = state.pendingRestEncounter.kind;
  }
  return controls;
}

function buildLocalForecastForCurrentTheme() {
  let local = buildEncounterForecast(state.party, state.seed, state.completed, state.floor, {
    ...modelState(),
    settings: state.settings,
  });
  local = applyForecastControls(
    local,
    state.party,
    state.seed,
    state.completed,
    state.floor,
    forecastControls(),
    { ...modelState(), settings: state.settings },
  );
  return local;
}

function synchronizeForecastTheme(candidate) {
  if (candidate?.themeSignature === dungeon.themeSignature) return candidate;
  const local = buildLocalForecastForCurrentTheme();
  return {
    ...local,
    classProfiles: candidate?.classProfiles,
    dataSource: "fallback",
    warning:
      "The forecast service had stale biome data. The browser resynchronized the story, encounters, and map.",
  };
}

function renderForecast() {
  const currentProfile = state.party.some((member) => !member.dead)
    ? analyzeParty(state.party, state.settings)
    : null;
  const currentLearning = modelState();
  if (currentProfile) {
    const calibration = Math.max(.72, Math.min(1.35, Number(currentLearning.calibration ?? 1)));
    const learnedAdjustment = Math.max(-.07, Math.min(.07, (1 - calibration) * .2));
    forecast.profile = {
      ...(forecast.profile ?? {}),
      ...currentProfile,
      calibration,
      learnedAdjustment,
      planningReadiness: Math.max(
        0,
        Math.min(1, Number(currentProfile.readiness) + learnedAdjustment),
      ),
    };
    forecast.learning = { ...(forecast.learning ?? {}), ...currentLearning };
  }
  const themeMatchesMap = forecast.themeSignature === dungeon.themeSignature;
  const displayTheme = themeMatchesMap ? forecast.theme : dungeon.theme;
  const displayProgress = themeMatchesMap
    ? forecast.quest?.progress
    : `Floor ${displayTheme.arcFloor} of ${displayTheme.arcLength}. The forecast is being synchronized.`;
  const percent = Math.round(
    Number(forecast.profile.displayCondition ?? forecast.profile.readiness) * 100,
  );
  const liveSrd = forecast.dataSource?.includes("dnd5eapi.co");
  $("#srd-status").classList.toggle("offline", !liveSrd);
  $("#srd-status").innerHTML = liveSrd
    ? `<span>LIVE</span><div><b>Live 2014 SRD data</b><small>Official XP rules · 5e-bits monsters and items</small></div>`
    : `<span>!</span><div><b>Local fallback active</b><small>${
      escapeHtml(forecast.warning ?? "SRD API data unavailable")
    }</small></div>`;
  $("#pacing-label").textContent =
    `${forecast.plan} · floor ${forecast.floor} · alert ${state.awareness}`;
  $("#readiness-value").textContent = `${percent}%`;
  $("#readiness-ring").style.setProperty("--readiness", `${percent}%`);
  $("#condition-breakdown").innerHTML = `<span><b>${
    Math.round(Number(forecast.profile.hpRatio ?? 0) * 100)
  }%</b> health</span><span><b>${
    state.settings.trackResources
      ? `${Math.round(Number(forecast.profile.measuredResourceRatio ?? 0) * 100)}%`
      : "off"
  }</b> supplies</span><span><b>${
    Number(forecast.profile.defense ?? 0).toFixed(1)
  }</b> armour</span><span><b>${
    Number(forecast.profile.averageLevel ?? 0).toFixed(1)
  }</b> level</span>`;
  const modelPercent = Math.round(
    Number(forecast.profile.planningReadiness ?? forecast.profile.readiness ?? 0) * 100,
  );
  const calibration = Number(forecast.profile.calibration ?? 1);
  $("#model-score-value").textContent = `${modelPercent}%`;
  const learnedAdjustment = Number(forecast.profile.learnedAdjustment ?? 0) * 100;
  $("#model-score-context").textContent = `${forecast.learning?.samples ?? 0} outcomes · learned ${
    learnedAdjustment >= 0 ? "+" : ""
  }${learnedAdjustment.toFixed(1)} · weighted supplies ${
    Math.round(Number(forecast.profile.weightedResourceRatio ?? 1) * 100)
  }% · calibration ${calibration.toFixed(2)}`;
  $("#readiness-label").textContent = percent > 76
    ? "Ready to press deeper"
    : percent > 55
    ? "Capable, with caution"
    : "Rest would be wise";
  renderEncounterAugmenters(currentProfile);
  $("#adventure-premise").innerHTML = `<div><span>${
    escapeHtml(
      `${displayTheme.name} · ${displayTheme.story?.title ?? "Dungeon arc"}`,
    )
  }</span><b>${escapeHtml(displayTheme.hook)}</b><small>${
    escapeHtml(displayProgress ?? displayTheme.tagline)
  }</small></div><p>${escapeHtml(displayTheme.restriction)}</p>${
    (displayTheme.activeModifiers ?? []).map((modifier) =>
      `<section class="biome-modifier"><b>${escapeHtml(modifier.name)}</b><span>${
        escapeHtml(modifier.rule)
      }</span></section>`
    ).join("")
  }<ul>${(displayTheme.rules ?? []).map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul>`;
  const changes = state.forecastChanges ?? [];
  $("#forecast-changes").innerHTML = changes.length
    ? `<b>CHANGED SINCE THE LAST ENCOUNTER</b>${
      changes.map((change) => `<span>${escapeHtml(change)}</span>`).join("")
    }`
    : `<b>CHANGED SINCE THE LAST ENCOUNTER</b><span>No recorded changes yet.</span>`;
  $("#encounter-list").innerHTML = forecast.encounters.map((encounter, index) => {
    const isLocked = Boolean(
      state.encounterLocks[encounterKey(index)] && !encounter.resolved,
    );
    const combat = encounter.combat;
    const combatGroups = combat?.groups?.length
      ? combat.groups
      : combat
      ? [{ count: combat.count, monster: combat.monster }]
      : [];
    const displayedRating = combat
      ? combat.difficulty[0].toUpperCase() + combat.difficulty.slice(1)
      : encounter.rating;
    const nearDeadly = Boolean(
      combat?.difficulty === "hard" &&
        Number(combat.adjustedXp) / Math.max(1, Number(combat.thresholds?.deadly)) >= .9,
    );
    const displayedRatingLabel = nearDeadly
      ? "Hard — near Deadly"
      : combat?.difficultyLabel ?? displayedRating;
    const effectiveRisk = nearDeadly && combat?.analysis?.risk !== "high"
      ? "high"
      : combat?.analysis?.risk;
    const analysisSignals = combat?.analysis
      ? [
        ...(nearDeadly &&
            !(combat.analysis.signals ?? []).some((signal) => /near deadly/i.test(signal))
          ? [
            `Near Deadly: ${combat.adjustedXp.toLocaleString()} adjusted XP is ${
              Math.round(combat.adjustedXp / combat.thresholds.deadly * 100)
            }% of the ${combat.thresholds.deadly.toLocaleString()} Deadly threshold`,
          ]
          : []),
        ...(combat.analysis.signals ?? []),
      ]
      : [];
    const combatMarkup = combat
      ? `<div class="combat-roster">
          <div class="combat-title"><span>SRD COMBAT · ${
        escapeHtml(combat.composition ?? "COMPOSITION")
      }</span><b>${
        combatGroups.map((group) => `${group.count} × ${escapeHtml(group.monster.name)}`).join(
          " + ",
        )
      }</b></div>
          <div class="combat-groups">${
        combatGroups.map((group) =>
          `<div class="${
            group.spawned ? "spawned-group" : ""
          }"><b class="monster-name"><small class="monster-role">${
            escapeHtml(group.role ?? (group.spawned ? "REINFORCEMENT" : "MONSTER"))
          }</small>${group.count} × ${
            escapeHtml(group.monster.name)
          }</b><span class="monster-summary">CR ${group.monster.cr} · AC ${group.monster.ac} · HP ${group.monster.hp} each · ${
            escapeHtml(group.monster.size)
          } ${escapeHtml(group.monster.type)}<small class="monster-actions-summary">${
            escapeHtml(group.monster.actions.join(" · ") || "See stat block")
          }</small></span>
            <details class="monster-statblock"><summary>Show stat block</summary>
              <div><b>AC ${group.monster.ac}</b><b>HP ${group.monster.hp} (${
            escapeHtml(group.monster.hitDice ?? "—")
          })</b><b>Speed ${escapeHtml(formatMonsterSpeed(group.monster.speed))}</b></div>
              ${renderMonsterAbilities(group.monster.abilityScores)}
              ${renderMonsterDefenses(group.monster)}
              <section><strong>Traits</strong>${
            renderMonsterFeatures(
              group.monster.traitDetails,
              "None listed",
            )
          }</section>
              <section><strong>Actions</strong>${
            renderMonsterFeatures(
              group.monster.actionDetails,
              "See the full SRD entry",
            )
          }</section>
            </details><a href="${
            escapeHtml(group.monster.source)
          }" target="_blank" rel="noreferrer">Stat block</a></div>`
        ).join("")
      }</div>
          ${
        combat.spawnRule
          ? `<p class="spawn-rule"><b>Minion spawning:</b> ${escapeHtml(combat.spawnRule)}</p>`
          : ""
      }
          ${
        combatGroups.filter((group) => group.monster.themedReskin).map((group) =>
          `<p class="theme-reskin">${escapeHtml(group.monster.name)}: ${
            escapeHtml(group.monster.themedReskin)
          } Base statistics: ${escapeHtml(group.monster.originalName)}.</p>`
        ).join("")
      }
          <div class="xp-proof"><span>${combat.baseXp.toLocaleString()} base XP</span><b>× ${combat.multiplier}</b><span>${combat.adjustedXp.toLocaleString()} adjusted XP</span></div>
          <details class="combat-math"><summary>How difficulty was calculated</summary><p>${
        escapeHtml(combat.scaling)
      } · target ${combat.conditionTargetXp.toLocaleString()} XP<br>${
        escapeHtml(combat.rule)
      } · ${displayedRating} threshold ${combat.thresholds[combat.difficulty].toLocaleString()} XP${
        combat.difficulty === "hard"
          ? ` · Deadly threshold ${combat.thresholds.deadly.toLocaleString()} XP`
          : ""
      }<br>${escapeHtml(combat.safety)}</p></details>
          ${
        combat.analysis
          ? `<div class="combat-analysis risk-${effectiveRisk}"><b>${effectiveRisk.toUpperCase()} TACTICAL RISK</b>${
            analysisSignals.map((signal) => `<span>${escapeHtml(signal)}</span>`).join("")
          }${
            combat.analysis.details?.length
              ? `<details><summary>Why these abilities matter</summary>${
                combat.analysis.details.map((detail) =>
                  `<article><b>${escapeHtml(detail.monster)} · ${escapeHtml(detail.kind)} · ${
                    escapeHtml(detail.name)
                  }</b><p>${escapeHtml(detail.description)}</p></article>`
                ).join("")
              }</details>`
              : ""
          }</div>`
          : ""
      }
        </div>`
      : "";
    return `<article class="encounter-card ${encounter.resolved ? "resolved-encounter" : ""} ${
      isLocked ? "locked-encounter" : ""
    }" id="encounter-${encounter.marker}" data-encounter="${encounter.marker}" style="animation-delay:${
      index * 80
    }ms">
      <button class="encounter-node locate-encounter" data-encounter="${encounter.marker}" title="Show room ${encounter.marker} on the map">${
      encounter.resolved ? "✓" : encounter.marker
    }</button>
      <div>
        <div class="encounter-order"><span>0${
      index + 1
    } · ${encounter.intent.toUpperCase()}</span><div class="encounter-order-status">${
      isLocked
        ? `<span class="encounter-lock-badge"><svg aria-hidden="true" viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1"></rect><path d="M5 7V5a3 3 0 0 1 6 0v2"></path></svg>Locked</span>`
        : ""
    }<span class="rating ${displayedRating} ${nearDeadly ? "near-deadly" : ""}">${
      escapeHtml(displayedRatingLabel)
    }</span></div></div>
        <h3>${escapeHtml(encounter.title)}</h3>
        ${
      isLocked
        ? `<p class="locked-calculation-note"><svg aria-hidden="true" viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1"></rect><path d="M5 7V5a3 3 0 0 1 6 0v2"></path></svg><span><b>Party snapshot frozen</b>${
          encounter.lockedFor
            ? `${encounter.lockedFor.members} members · average level ${
              Number(encounter.lockedFor.averageLevel).toFixed(1)
            } · ${Math.round(Number(encounter.lockedFor.planningReadiness) * 100)}% planning`
            : "Difficulty and roster use the party state from when this encounter was locked."
        }</span></p>`
        : ""
    }
        <button class="encounter-location locate-encounter" data-encounter="${encounter.marker}"><b>ROOM ${encounter.marker}</b> ${
      escapeHtml(encounter.room.name)
    } · ${encounter.room.coordinates}</button>
        <p class="encounter-objective"><b>Objective</b><span>${
      escapeHtml(encounter.objective)
    }</span></p>
        <p class="encounter-twist"><b>Complication</b><span>${
      escapeHtml(encounter.twist)
    }</span></p>
        ${
      encounter.bossMechanic
        ? `<p class="boss-mechanic"><b>Boss room mechanic:</b> ${
          escapeHtml(encounter.bossMechanic)
        }${
          encounter.room.arenaRule
            ? `<br><span>${escapeHtml(encounter.room.arenaVariant)}: ${
              escapeHtml(encounter.room.arenaRule)
            }</span>`
            : ""
        }</p>
        <div class="lair-actions"><b>LAIR ACTIONS · INITIATIVE 20</b>${
          (encounter.lairActions ?? []).map((action) => `<span>${escapeHtml(action)}</span>`).join(
            "",
          )
        }</div>`
        : ""
    }
        ${combatMarkup}
        <div class="encounter-meta"><span>${encounter.tone}</span><span>${
      combat ? "Adjusted XP" : "Pressure"
    } ${encounter.budget}</span><span>~${encounter.rounds} rounds</span></div>
        ${encounter.recovery ? `<p class="recovery-note">${encounter.recovery}</p>` : ""}
        ${
      encounter.resolved
        ? `<div class="resolved-banner"><b>✓ RESOLVED</b><span>${
          escapeHtml(encounter.resolution?.outcome ?? "Completed")
        } · ${encounter.resolution?.rounds ?? "—"} rounds</span></div>`
        : `<div class="encounter-controls">
          <button data-encounter-action="resolve" data-index="${index}">Resolve</button>
          <button data-encounter-action="reroll" data-index="${index}">Reroll</button>
          <button class="${
          isLocked ? "active-lock" : ""
        }" data-encounter-action="lock" data-index="${index}" aria-pressed="${isLocked}"><svg aria-hidden="true" viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1"></rect><path d="M5 7V5a3 3 0 0 1 6 0v2"></path></svg>${
          isLocked ? "Unlock" : "Lock"
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
        </div>`
    }
      </div>
    </article>`;
  }).join("");
  renderDungeonLedger();
  renderEncounterMarkers();
  bindEncounterControls();
  const nextCombat = nextInitiativeEncounter();
  $("#start-initiative").disabled = !nextCombat;
  $("#start-initiative").textContent = nextCombat ? "Start initiative" : "No combat pending";
  renderInitiativeTracker();
}

function nextInitiativeEncounter() {
  return forecast?.encounters?.map((encounter, index) => ({ encounter, index })).find((
    { encounter },
  ) => !encounter.resolved && (encounter.kind === "combat" || encounter.combat));
}

function openInitiativeDialog() {
  const target = nextInitiativeEncounter();
  if (!target) {
    showToast("No unresolved combat encounter is waiting");
    return;
  }
  const { encounter, index } = target;
  const form = $("#initiative-form");
  form.reset();
  form.dataset.encounterIndex = index;
  $("#initiative-target").innerHTML = `<b>${
    escapeHtml(encounter.title)
  }</b><span>Room ${encounter.marker} · ${escapeHtml(encounter.room.name)}</span><small>${
    encounter.combat
      ? (encounter.combat.groups ??
        [{ count: encounter.combat.count, monster: encounter.combat.monster }])
        .map((group) => `${group.count} × ${escapeHtml(group.monster.name)}`).join(" + ")
      : `${encounter.foes || 1} enemies`
  }</small>`;
  $("#initiative-player-rolls").innerHTML = state.party.filter((member) => !member.dead).map((
    member,
  ) =>
    `<label><span><b>${escapeHtml(member.name)}</b><small>${
      escapeHtml(member.class)
    } · level ${member.level}</small></span><input type="number" min="-10" max="99" value="10" data-player-initiative="${member.id}"></label>`
  ).join("");
  $("#initiative-dialog").showModal();
}

function rollD20() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % 20 + 1;
}

function beginInitiative(event) {
  event.preventDefault();
  const index = Number($("#initiative-form").dataset.encounterIndex);
  const encounter = forecast.encounters[index];
  if (!encounter || encounter.resolved) return;
  checkpoint(`Start initiative for ${encounter.title}`);
  const entries = [];
  document.querySelectorAll("[data-player-initiative]").forEach((input) => {
    const member = state.party.find((candidate) => candidate.id === input.dataset.playerInitiative);
    if (!member) return;
    entries.push({
      id: crypto.randomUUID(),
      name: member.name,
      initiative: Number(input.value),
      side: "player",
    });
  });
  const count = Math.max(1, Number(encounter.combat?.count ?? encounter.foes ?? 1));
  const monsterGroups = encounter.combat?.groups?.length
    ? encounter.combat.groups
    : [{ count, monster: encounter.combat?.monster ?? { name: "Enemy", hp: 1 } }];
  const minionGroup = monsterGroups.find((group) => group.spawned);
  if (encounter.boss && encounter.lairActions?.length) {
    entries.push({
      id: crypto.randomUUID(),
      name: `Lair actions — ${encounter.title}`,
      initiative: 20,
      side: "lair",
      actions: encounter.lairActions,
    });
  }
  for (const group of monsterGroups.filter((candidate) => !candidate.spawned)) {
    const groupCount = Math.max(1, Number(group.count));
    const monsterName = group.monster.name ?? "Enemy";
    const modifier = Number(group.monster.initiativeModifier ?? 0);
    const monsterHp = Math.max(1, Number(group.monster.hp ?? 1));
    for (let number = 1; number <= groupCount; number++) {
      const natural = rollD20();
      entries.push({
        id: crypto.randomUUID(),
        name: groupCount > 1 ? `${monsterName} ${number}` : monsterName,
        initiative: natural + modifier,
        roll: natural,
        modifier,
        side: "monster",
        hp: monsterHp,
        maxHp: monsterHp,
        monsterIndex: group.monster.index,
        actionDetails: clone(group.monster.actionDetails ?? []),
        savingThrows: clone(group.monster.savingThrows ?? {}),
      });
    }
  }
  entries.sort((a, b) => b.initiative - a.initiative || (a.side === "player" ? -1 : 1));
  state.initiative = {
    encounterKey: encounterKey(index),
    encounterTitle: encounter.title,
    entries,
    activeIndex: 0,
    position: state.initiative?.position ?? null,
    themeSignature: dungeon.themeSignature,
    minionPool: minionGroup
      ? { remaining: minionGroup.count, monster: clone(minionGroup.monster) }
      : null,
  };
  saveState();
  $("#initiative-dialog").close();
  renderInitiativeTracker();
}

function renderInitiativeTracker() {
  const tracker = $("#initiative-tracker");
  if (!state.initiative) {
    tracker.hidden = true;
    return;
  }
  tracker.hidden = false;
  $("#initiative-encounter-title").textContent = state.initiative.encounterTitle;
  const spawnButton = $("#spawn-initiative-minion");
  const minionPool = state.initiative.minionPool;
  spawnButton.hidden = !minionPool || minionPool.remaining <= 0;
  if (minionPool) {
    spawnButton.textContent = `Spawn ${minionPool.monster.name} (${minionPool.remaining})`;
  }
  if (state.initiative.position) {
    const x = Math.max(
      8,
      Math.min(globalThis.innerWidth - tracker.offsetWidth - 8, state.initiative.position.x),
    );
    const y = Math.max(
      8,
      Math.min(globalThis.innerHeight - tracker.offsetHeight - 8, state.initiative.position.y),
    );
    tracker.style.left = `${x}px`;
    tracker.style.top = `${y}px`;
    tracker.style.right = "auto";
  }
  $("#initiative-entries").innerHTML = state.initiative.entries.map((entry, index) =>
    `<div class="initiative-entry ${entry.side} ${
      index === state.initiative.activeIndex ? "active" : ""
    }" data-initiative-id="${entry.id}">
      <span class="turn-mark">${index === state.initiative.activeIndex ? "◆" : "·"}</span>
      <input class="initiative-name" value="${
      escapeHtml(entry.name)
    }" aria-label="Participant name">
      <input class="initiative-score" type="number" min="-10" max="99" value="${entry.initiative}" aria-label="Initiative score">
      ${
      entry.side === "monster"
        ? `<div class="initiative-hp"><span>HP</span><button type="button" data-init-hp-delta="-1" aria-label="Remove one HP" title="Decrease HP by 1">-1</button><input class="initiative-hp-number" type="number" min="0" max="${
          Number(entry.maxHp ?? entry.hp ?? 1)
        }" value="${Number(entry.hp ?? entry.maxHp ?? 1)}" aria-label="Current HP for ${
          escapeHtml(entry.name)
        }"><small>/ ${
          Number(entry.maxHp ?? entry.hp ?? 1)
        }</small><button type="button" data-init-hp-delta="1" aria-label="Add one HP" title="Increase HP by 1">+1</button><input class="initiative-hp-slider" type="range" min="0" max="${
          Number(entry.maxHp ?? entry.hp ?? 1)
        }" value="${Number(entry.hp ?? entry.maxHp ?? 1)}" aria-label="Quick HP for ${
          escapeHtml(entry.name)
        }"></div>`
        : `<span class="initiative-hp-empty">—</span>`
    }
      <span class="initiative-roll">${
      entry.side === "lair"
        ? "LAIR · INIT 20"
        : entry.side === "monster"
        ? `d20 ${entry.roll ?? "—"} ${Number(entry.modifier) >= 0 ? "+" : ""}${entry.modifier ?? 0}`
        : "PLAYER"
    }</span>
      <button data-init-move="up" title="Move up">Up</button><button data-init-move="down" title="Move down">Down</button><button data-init-remove title="Remove">Remove</button>
      ${
      entry.side === "lair"
        ? `<div class="initiative-lair-options">${
          (entry.actions ?? []).map((action) => `<span>${escapeHtml(action)}</span>`).join("")
        }</div>`
        : ""
    }
      ${
      entry.side === "monster" &&
        (entry.actionDetails?.length || Object.keys(entry.savingThrows ?? {}).length)
        ? `<div class="initiative-monster-actions">${
          entry.actionDetails?.length
            ? `<span>Attacks</span><div>${
              entry.actionDetails.map((action, actionIndex) => {
                const damage = (action.damages ?? []).map((part) => part.dice).join(" + ");
                return `<button type="button" data-init-action="${actionIndex}" title="Roll damage for ${
                  escapeHtml(action.name)
                }">${escapeHtml(action.name)}${damage ? ` · ${escapeHtml(damage)}` : ""}</button>`;
              }).join("")
            }</div>`
            : ""
        }${entry.lastActionResult ? `<output>${escapeHtml(entry.lastActionResult)}</output>` : ""}${
          Object.keys(entry.savingThrows ?? {}).length
            ? `<div class="initiative-monster-save"><label>Monster saving throw<select data-init-save>${
              Object.entries(entry.savingThrows).map(([ability, modifier]) =>
                `<option value="${ability}" ${
                  (entry.selectedSave ?? "DEX") === ability ? "selected" : ""
                }>${ability} ${Number(modifier) >= 0 ? "+" : ""}${modifier}</option>`
              ).join("")
            }</select></label><button type="button" data-roll-init-save>Roll d20</button></div>${
              entry.lastSaveResult ? `<output>${escapeHtml(entry.lastSaveResult)}</output>` : ""
            }`
            : ""
        }</div>`
        : ""
    }
    </div>`
  ).join("");
  document.querySelectorAll(".initiative-entry").forEach((row) => {
    const id = row.dataset.initiativeId;
    row.querySelector(".initiative-name").addEventListener(
      "change",
      (event) => editInitiativeEntry(id, "name", event.target.value),
    );
    row.querySelector(".initiative-score").addEventListener(
      "change",
      (event) => editInitiativeEntry(id, "initiative", Number(event.target.value)),
    );
    row.querySelector(".initiative-hp-number")?.addEventListener(
      "change",
      (event) => setInitiativeHp(id, Number(event.target.value)),
    );
    row.querySelector(".initiative-hp-slider")?.addEventListener(
      "input",
      (event) => setInitiativeHp(id, Number(event.target.value), false),
    );
    row.querySelectorAll("[data-init-hp-delta]").forEach((button) =>
      button.addEventListener("click", () => {
        const entry = state.initiative?.entries.find((candidate) => candidate.id === id);
        if (entry) setInitiativeHp(id, Number(entry.hp) + Number(button.dataset.initHpDelta));
      })
    );
    row.querySelectorAll("[data-init-action]").forEach((button) =>
      button.addEventListener(
        "click",
        () => rollInitiativeAction(id, Number(button.dataset.initAction)),
      )
    );
    row.querySelector("[data-init-save]")?.addEventListener("change", (event) => {
      const entry = state.initiative?.entries.find((candidate) => candidate.id === id);
      if (!entry) return;
      entry.selectedSave = event.target.value;
      saveState();
    });
    row.querySelector("[data-roll-init-save]")?.addEventListener(
      "click",
      () => rollInitiativeSave(id),
    );
    row.querySelectorAll("[data-init-move]").forEach((button) =>
      button.addEventListener("click", () => moveInitiativeEntry(id, button.dataset.initMove))
    );
    row.querySelector("[data-init-remove]").addEventListener(
      "click",
      () => removeInitiativeEntry(id),
    );
  });
}

function rollInitiativeAction(id, actionIndex) {
  const entry = state.initiative?.entries.find((candidate) => candidate.id === id);
  const action = entry?.actionDetails?.[actionIndex];
  if (!entry || !action) return;
  const results = (action.damages ?? []).map((damage) => ({
    ...damage,
    result: rollDiceExpression(damage.dice),
  })).filter((damage) => damage.result);
  entry.lastActionResult = results.length
    ? `${action.name}: ${
      results.map((damage) =>
        `${damage.result.total} ${damage.type} (${damage.dice}: ${damage.result.rolls.join(", ")}${
          damage.result.modifier
            ? `${damage.result.modifier > 0 ? " + " : " - "}${Math.abs(damage.result.modifier)}`
            : ""
        })`
      ).join(" + ")
    }`
    : `${action.name}: no damage dice listed`;
  saveState();
  renderInitiativeTracker();
}

function rollInitiativeSave(id) {
  const entry = state.initiative?.entries.find((candidate) => candidate.id === id);
  if (!entry?.savingThrows) return;
  const ability = entry.selectedSave ?? "DEX";
  const modifier = Number(entry.savingThrows[ability] ?? 0);
  const natural = rollD20();
  const total = natural + modifier;
  entry.selectedSave = ability;
  entry.lastSaveResult = `${ability} save: ${natural} ${modifier >= 0 ? "+" : "-"} ${
    Math.abs(modifier)
  } = ${total}`;
  saveState();
  renderInitiativeTracker();
}

function setInitiativeHp(id, value, rerender = true) {
  const entry = state.initiative?.entries.find((candidate) => candidate.id === id);
  if (!entry) return;
  entry.hp = Math.max(0, Math.min(Number(entry.maxHp ?? 9999), Number(value) || 0));
  saveState();
  if (rerender) renderInitiativeTracker();
  else {
    const row = document.querySelector(`[data-initiative-id="${id}"]`);
    if (row) row.querySelector(".initiative-hp-number").value = entry.hp;
  }
}

function editInitiativeEntry(id, field, value) {
  const entry = state.initiative?.entries.find((candidate) => candidate.id === id);
  if (!entry) return;
  entry[field] = value;
  saveState();
}

function moveInitiativeEntry(id, direction) {
  const entries = state.initiative?.entries;
  if (!entries) return;
  const activeId = entries[state.initiative.activeIndex]?.id;
  const from = entries.findIndex((entry) => entry.id === id);
  const to = Math.max(0, Math.min(entries.length - 1, from + (direction === "up" ? -1 : 1)));
  if (from === to) return;
  [entries[from], entries[to]] = [entries[to], entries[from]];
  state.initiative.activeIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.id === activeId),
  );
  saveState();
  renderInitiativeTracker();
}

function removeInitiativeEntry(id) {
  if (!state.initiative) return;
  state.initiative.entries = state.initiative.entries.filter((entry) => entry.id !== id);
  state.initiative.activeIndex = Math.min(
    state.initiative.activeIndex,
    Math.max(0, state.initiative.entries.length - 1),
  );
  saveState();
  renderInitiativeTracker();
}

function addInitiativeEntry() {
  if (!state.initiative) return;
  state.initiative.entries.push({
    id: crypto.randomUUID(),
    name: "New participant",
    initiative: 10,
    side: "other",
  });
  saveState();
  renderInitiativeTracker();
}

function spawnInitiativeMinion() {
  const pool = state.initiative?.minionPool;
  if (!pool || pool.remaining <= 0) return;
  const natural = rollD20();
  const modifier = Number(pool.monster.initiativeModifier ?? 0);
  const sequence = Number(pool.spawned ?? 0) + 1;
  pool.spawned = sequence;
  pool.remaining -= 1;
  state.initiative.entries.push({
    id: crypto.randomUUID(),
    name: `${pool.monster.name} ${sequence}`,
    initiative: natural + modifier,
    roll: natural,
    modifier,
    side: "monster",
    hp: Number(pool.monster.hp),
    maxHp: Number(pool.monster.hp),
    monsterIndex: pool.monster.index,
    actionDetails: clone(pool.monster.actionDetails ?? []),
    savingThrows: clone(pool.monster.savingThrows ?? {}),
  });
  state.initiative.entries.sort((a, b) => Number(b.initiative) - Number(a.initiative));
  saveState();
  renderInitiativeTracker();
}

function sortInitiative() {
  if (!state.initiative) return;
  state.initiative.entries.sort((a, b) => Number(b.initiative) - Number(a.initiative));
  state.initiative.activeIndex = 0;
  saveState();
  renderInitiativeTracker();
}

function nextInitiativeTurn() {
  if (!state.initiative?.entries.length) return;
  state.initiative.activeIndex = (Number(state.initiative.activeIndex) + 1) %
    state.initiative.entries.length;
  saveState();
  renderInitiativeTracker();
}

function closeInitiative() {
  state.initiative = null;
  saveState();
  renderInitiativeTracker();
}

function renderEncounterMarkers() {
  document.querySelectorAll(".map-cell.encounter-marker").forEach((cell) => {
    cell.textContent = cell.dataset.tile;
    cell.title = cell.dataset.title;
    cell.classList.remove(
      "encounter-marker",
      "marker-1",
      "marker-2",
      "marker-3",
      "resolved-marker",
      "focused",
    );
    delete cell.dataset.encounter;
    cell.onclick = null;
    cell.tabIndex = -1;
  });
  forecast.encounters.forEach((encounter) => {
    const marker = document.querySelector(
      `.map-cell[data-x="${encounter.room.x}"][data-y="${encounter.room.y}"]`,
    );
    if (!marker) return;
    marker.textContent = encounter.resolved ? "✓" : encounter.marker;
    marker.title = `Encounter ${encounter.marker}: ${encounter.title} — ${encounter.room.name}`;
    marker.classList.add("encounter-marker", `marker-${encounter.marker}`);
    if (encounter.resolved) marker.classList.add("resolved-marker");
    marker.dataset.encounter = encounter.marker;
    marker.tabIndex = 0;
    marker.onclick = () => {
      focusEncounter(encounter.marker, "card");
    };
  });
  renderClearedRooms();
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
          state.encounterLocks[key] = {
            ...clone(forecast.encounters[index]),
            lockedAt: new Date().toISOString(),
            lockedFor: {
              members: Number(forecast.profile?.members ?? 0),
              averageLevel: Number(forecast.profile?.averageLevel ?? 0),
              planningReadiness: Number(
                forecast.profile?.planningReadiness ?? forecast.profile?.readiness ?? 0,
              ),
            },
          };
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
  $("#resolution-members").innerHTML = state.party.filter((member) => !member.dead).map(
    (member) => {
      const baseline = state.encounterBaseline?.[member.id] ?? {
        hp: Number(member.hp),
        tempHp: Number(member.tempHp ?? 0),
        resource: Number(member.resource ?? 0),
      };
      const hpLost = Math.max(
        0,
        Number(baseline.hp) + Number(baseline.tempHp ?? 0) -
          Number(member.hp) - Number(member.tempHp ?? 0),
      );
      const resourcesSpent = Math.max(0, Number(baseline.resource) - Number(member.resource ?? 0));
      return `<section class="resolution-member"><b>${
        escapeHtml(member.name)
      }</b><span>${member.hp}/${member.maxHp} HP${
        hpLost ? ` · ${hpLost} loss already entered` : ""
      }</span>
      <label>HP lost<input type="number" min="0" max="${
        Number(baseline.hp) + Number(baseline.tempHp ?? 0)
      }" value="${hpLost}" data-resolution-member="${member.id}" data-field="hpLost"></label>
      <input type="hidden" value="${hpLost}" data-resolution-member="${member.id}" data-field="hpAlreadyApplied">
      <label class="resolution-resource">Resources spent<input type="number" min="0" max="${
        baseline.resource ?? 0
      }" value="${resourcesSpent}" data-resolution-member="${member.id}" data-field="resourcesSpent"></label>
      <input type="hidden" value="${resourcesSpent}" data-resolution-member="${member.id}" data-field="resourcesAlreadyApplied">
      <label class="check-field"><input type="checkbox" data-resolution-member="${member.id}" data-field="downed"> Downed</label>
      <label class="check-field"><input type="checkbox" data-resolution-member="${member.id}" data-field="killed"> Killed</label>
    </section>`;
    },
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
    objectiveCompleted: data.objectiveCompleted === "on",
    withoutCombat: data.withoutCombat === "on",
    members,
  };
  checkpoint(`Resolve ${encounter.title}`);
  const beforeParty = clone(state.party);
  state.party = state.party.map((member) => {
    const result = members[member.id];
    if (!result || member.dead) return member;
    const loss = Math.max(0, Number(result.hpLost));
    const newLoss = loss - Math.max(0, Number(result.hpAlreadyApplied));
    const tempAbsorbed = Math.min(Number(member.tempHp ?? 0), Math.max(0, newLoss));
    let updated = {
      ...member,
      tempHp: Number(member.tempHp ?? 0) - tempAbsorbed,
      hp: newLoss >= 0
        ? Math.max(0, Number(member.hp) - (newLoss - tempAbsorbed))
        : Math.min(Number(member.maxHp), Number(member.hp) - newLoss),
    };
    if (Number(member.conditionRounds) > 0) {
      updated.conditionRounds = Math.max(
        0,
        Number(member.conditionRounds) - Number(report.rounds),
      );
      if (updated.conditionRounds === 0) updated.conditions = [];
    }
    if (result.downed || result.killed) {
      updated.hp = 0;
      updated.concentration = false;
    }
    if (result.killed) updated.dead = true;
    if (state.settings.trackResources) {
      const resourceDifference = Number(result.resourcesSpent) -
        Number(result.resourcesAlreadyApplied);
      updated = resourceDifference >= 0
        ? spendResources(updated, resourceDifference)
        : restoreResources(updated, -resourceDifference);
    }
    return updated;
  });
  state.forecastChanges = state.party.flatMap((member) => {
    const before = beforeParty.find((candidate) => candidate.id === member.id);
    if (!before) return [];
    const changes = [];
    if (Number(before.hp) !== Number(member.hp)) {
      changes.push(`${member.name}: ${before.hp} → ${member.hp} HP`);
    }
    if (Number(before.resource) !== Number(member.resource)) {
      changes.push(`${member.name}: ${before.resource} → ${member.resource} supplies`);
    }
    if (!before.dead && member.dead) {
      changes.push(`${member.name} is now fallen and excluded from difficulty`);
    }
    return changes;
  });
  const sample = outcomeSample(encounter, beforeParty, report);
  sample.encounterTitle = encounter.title;
  sample.roomName = encounter.room?.name ?? null;
  sample.floor = state.floor;
  sample.rating = encounter.rating;
  state.learningSamples.push(sample);
  state.learningSamples = state.learningSamples.slice(-24);
  logEvent(
    "encounter",
    `${data.outcome}: ${encounter.title}`,
    `${data.rounds} rounds · ${data.feedback} · ${
      Object.values(members).reduce((sum, member) => sum + Number(member.hpLost), 0)
    } HP lost · ${report.objectiveCompleted ? "objective completed" : "objective failed"}${
      report.withoutCombat ? " without combat" : ""
    } · ${data.notes || "No additional notes"}`,
  );
  for (const [id, result] of Object.entries(members)) {
    if (result.killed) {
      const member = beforeParty.find((candidate) => candidate.id === id);
      if (member) logEvent("death", `${member.name} was killed`, `During ${encounter.title}`);
    }
  }
  if (report.objectiveCompleted && encounter.room) {
    state.clearedRooms[encounter.room.coordinates] = {
      name: encounter.room.name,
      coordinates: encounter.room.coordinates,
      floor: state.floor,
    };
    logEvent(
      "room",
      `Room cleared: ${encounter.room.name}`,
      `${encounter.room.coordinates}${report.withoutCombat ? " · without combat" : ""}`,
    );
  }
  if (state.pendingRestEncounter && index === 0) state.pendingRestEncounter = null;
  if (state.initiative?.encounterKey === encounterKey(index)) state.initiative = null;
  state.encounterLocks[encounterKey(index)] = {
    ...clone(encounter),
    resolved: true,
    resolution: {
      outcome: data.outcome,
      rounds: Number(data.rounds),
      feedback: data.feedback,
      objectiveCompleted: report.objectiveCompleted,
      withoutCombat: report.withoutCombat,
    },
  };
  resetEncounterBaseline();
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
  updateAverageHpPreview(!member);
  dialog.showModal();
  dialogClassProfile = null;
  loadClassProfile();
  setTimeout(() => form.elements.name.focus(), 50);
}

function updateAverageHpPreview(apply = false) {
  const form = $("#member-form");
  const details = {
    class: form.elements.class.value,
    level: Number(form.elements.level.value || 1),
    conModifier: Number(form.elements.conModifier.value || 0),
  };
  const die = hitDiceState(details).size;
  const average = Math.floor(die / 2) + 1;
  const maximum = averageHitPointMaximum(details);
  $("#average-hp-detail").textContent =
    `d${die} · level 1 maximum, then ${average} + CON each level · ${maximum} HP`;
  if (!apply) return;
  form.elements.maxHp.value = maximum;
  form.elements.hp.value = maximum;
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
    customFeatures: existingMember?.customFeatures ?? [],
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
  } else {
    state.party.push(member);
    state.encounterBaseline[member.id] = createEncounterBaseline([member])[member.id];
  }
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
  state.restStats.short += 1;
  if (rest.interrupted) {
    state.restStats.interrupted += 1;
    logEvent("rest", "Short rest interrupted", rest.detail);
    saveState();
    $("#short-rest-dialog").close();
    updateForecast("The short rest was interrupted by dungeon activity");
    return;
  }
  const selections = Object.fromEntries(new FormData($("#short-rest-form")));
  const result = takeShortRest(state.party, selections);
  state.party = result.party;
  resetEncounterBaseline();
  saveState();
  $("#short-rest-dialog").close();
  renderParty();
  const healed = result.healing.reduce((sum, entry) => sum + entry.restored, 0);
  saveState();
  updateForecast(
    `Short rest · ${healed} HP restored · ${result.resourcesRecovered} resource uses recovered`,
  );
}

function applyLongRest() {
  checkpoint("Long rest");
  const rest = restLocation("long");
  state.restStats.long += 1;
  if (rest.interrupted) {
    state.restStats.interrupted += 1;
    logEvent("rest", "Long rest interrupted", rest.detail);
    saveState();
    updateForecast("The long rest was interrupted · no recovery applied");
    return;
  }
  state.party = takeLongRest(state.party);
  resetEncounterBaseline();
  const reoccupied = maybeReoccupyRoom();
  logEvent("rest", "Long rest", `${rest.detail} · the living party was fully restored`);
  if (reoccupied) {
    logEvent(
      "room",
      `Room reoccupied: ${reoccupied.name}`,
      `${reoccupied.coordinates} changed while the party slept`,
    );
  }
  saveState();
  renderParty();
  updateForecast("Long rest · HP, Hit Dice, and all resources restored");
}

function restLocation(type) {
  if (!state.settings.safeRestRules) return { detail: "Rest rules disabled", interrupted: false };
  const safeRoom = dungeon.rooms.find((room) => room.role === "safe");
  if (state.inSafeRoom && safeRoom) {
    state.awareness += type === "long" ? 1 : 0;
    maybeCreateRestEncounter(type, false, true);
    return {
      detail: `Sheltered in ${safeRoom.name} · dungeon awareness ${state.awareness}`,
      interrupted: false,
    };
  }
  state.awareness += type === "long" ? 2 : 1;
  const chance = type === "long" ? .35 : .2;
  const interrupted = Math.random() < chance;
  if (interrupted) state.completed += 1;
  maybeCreateRestEncounter(type, interrupted, false);
  return {
    detail: `Unsafe rest · dungeon awareness ${state.awareness}${
      interrupted ? " · wandering threat" : ""
    }`,
    interrupted,
  };
}

function maybeCreateRestEncounter(type, interrupted, safe) {
  const createQuietEvent = !interrupted && Math.random() < (type === "long" ? .28 : .14);
  if (!interrupted && !createQuietEvent) return;
  delete state.encounterLocks[encounterKey(0)];
  if (interrupted) {
    state.pendingRestEncounter = {
      title: type === "long" ? "Raid upon the sleeping camp" : "The watchman's sudden alarm",
      kind: "combat",
      rating: type === "long" && state.awareness >= 4 ? "Hard" : "Moderate",
      icon: "C",
      tone: "Interruption",
      intent: "Wandering threat",
      objective: "Protect the resting party and secure the camp before recovery can continue.",
      twist: type === "long"
        ? "The attackers have followed the party's earlier trail and know one of their tactics."
        : "Bedrolls and packs divide the room into awkward, vulnerable ground.",
      recovery: "The interrupted rest grants no recovery until this threat is resolved.",
    };
  } else {
    state.pendingRestEncounter = {
      title: safe ? "A visitor at the sanctuary" : "Whispers during the watch",
      kind: "social",
      rating: "Low",
      icon: "S",
      tone: "Rest event",
      intent: "Camp complication",
      objective: "Decide whether the nocturnal visitor is a warning, an opportunity, or a threat.",
      twist: type === "long"
        ? "The visitor knows which cleared chamber has become occupied again."
        : "Accepting its help will increase dungeon awareness by one.",
    };
  }
}

function maybeReoccupyRoom() {
  const entries = Object.entries(state.clearedRooms).filter(([, room]) =>
    room.floor === state.floor
  );
  if (!entries.length || Math.random() >= (state.inSafeRoom ? .25 : .5)) return null;
  const [coordinates, room] = entries[Math.floor(Math.random() * entries.length)];
  delete state.clearedRooms[coordinates];
  state.pendingRestEncounter = {
    title: `New occupants in ${room.name}`,
    kind: "combat",
    rating: state.awareness >= 4 ? "Hard" : "Moderate",
    icon: "C",
    tone: "Reoccupation",
    intent: "Dungeon response",
    objective: `Reclaim ${room.name}, which changed hands while the party rested.`,
    twist: "The new occupants have used evidence from the previous battle to prepare the room.",
  };
  return room;
}

function openSettings() {
  const form = $("#settings-form");
  for (const [key, value] of Object.entries(state.settings)) {
    if (!form.elements[key]) continue;
    if (form.elements[key].type === "checkbox") form.elements[key].checked = Boolean(value);
    else form.elements[key].value = value;
  }
  renderBiomeModifierSettings();
  $("#settings-dialog").showModal();
}

function normalizedBiomeSelections(value) {
  if (Array.isArray(value)) return value;
  if (!value || value === "none") return [];
  return [value];
}

function renderBiomeModifierSettings() {
  const names = {
    "moss-forest": "Moss Forest",
    "drowned-grotto": "Drowned Grotto",
    ossuary: "Ossuary",
    "infernal-foundry": "Infernal Foundry",
  };
  const container = $("#biome-modifier-settings");
  container.innerHTML = Object.entries(BIOME_MODIFIERS).map(([biome, modifiers]) => {
    const selected = normalizedBiomeSelections(state.settings.biomeOptions?.[biome]);
    const random = selected.includes("random");
    return `<fieldset data-biome="${biome}"><legend>${escapeHtml(names[biome])} modifiers</legend>
      <small>Base biome rules always apply. Choose several extras, or one random extra that persists for the complete arc or ten-floor dungeon.</small>
      <label class="modifier-random"><input type="checkbox" data-random ${
      random ? "checked" : ""
    }> Random for this biome run</label>
      <div>${
      modifiers.map((modifier) =>
        `<label><input type="checkbox" data-modifier="${modifier.id}" ${
          selected.includes(modifier.id) ? "checked" : ""
        } ${random ? "disabled" : ""}><span><b>${escapeHtml(modifier.name)}</b><small>${
          escapeHtml(modifier.rule)
        }</small></span></label>`
      ).join("")
    }</div>
    </fieldset>`;
  }).join("");
  container.querySelectorAll("[data-random]").forEach((input) => {
    input.addEventListener("change", () => {
      input.closest("fieldset").querySelectorAll("[data-modifier]").forEach((modifier) => {
        modifier.disabled = input.checked;
      });
    });
  });
}

function collectBiomeModifierSettings() {
  return Object.fromEntries(
    [...document.querySelectorAll("#biome-modifier-settings fieldset")].map((fieldset) => {
      const selected = fieldset.querySelector("[data-random]").checked
        ? ["random"]
        : [...fieldset.querySelectorAll("[data-modifier]:checked")].map((input) =>
          input.dataset.modifier
        );
      return [fieldset.dataset.biome, selected];
    }),
  );
}

function saveSettings(event) {
  event.preventDefault();
  checkpoint("Change tracking settings");
  const form = $("#settings-form");
  const previousThemeMode = state.settings.themeMode;
  const previousDungeonTheme = state.settings.dungeonTheme;
  const previousFloorSize = state.settings.floorSize;
  const previousRoomCount = state.settings.roomCount;
  const previousBiomeOptions = JSON.stringify(state.settings.biomeOptions ?? {});
  state.settings = {
    trackResources: form.elements.trackResources.checked,
    trackAfflictions: form.elements.trackAfflictions.checked,
    safeRestRules: form.elements.safeRestRules.checked,
    themeMode: form.elements.themeMode.value,
    dungeonTheme: form.elements.dungeonTheme.value,
    floorSize: form.elements.floorSize.value,
    roomCount: Math.max(4, Math.min(30, Number(form.elements.roomCount.value) || 11)),
    biomeOptions: collectBiomeModifierSettings(),
  };
  const geometryChanged = previousThemeMode !== state.settings.themeMode ||
    previousDungeonTheme !== state.settings.dungeonTheme ||
    previousFloorSize !== state.settings.floorSize ||
    previousRoomCount !== state.settings.roomCount;
  const biomeChanged = previousBiomeOptions !== JSON.stringify(state.settings.biomeOptions);
  const themeChanged = geometryChanged || biomeChanged;
  if (themeChanged) {
    state.encounterLocks = {};
    state.encounterControls = { rerolls: {}, ratings: {}, kinds: {} };
    state.pendingRestEncounter = null;
    state.inSafeRoom = false;
    const generated = generateDungeon(
      state.seed,
      undefined,
      undefined,
      dungeonGenerationOptions(),
    );
    if (geometryChanged) persistDungeon(generated);
    else {
      dungeon.theme = generated.theme;
      dungeon.themeSignature = generated.themeSignature;
      dungeon.restriction = generated.restriction;
      persistDungeon(dungeon);
    }
  }
  logEvent("settings", "Tracking settings changed");
  saveState();
  $("#settings-dialog").close();
  renderParty();
  if (themeChanged) {
    renderMeta();
    buildMapCells();
    playCollapse();
  }
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
  }% confidence · ${learned.restCount} rests (${
    learned.restFrequency.toFixed(1)
  }/encounter)</span><small>AoE ${
    forecast?.profile?.capabilities?.aoe?.toFixed(1) ?? "—"
  } · Control ${forecast?.profile?.capabilities?.control?.toFixed(1) ?? "—"} · Healing ${
    forecast?.profile?.capabilities?.healing?.toFixed(1) ?? "—"
  } · Ranged ${forecast?.profile?.capabilities?.ranged?.toFixed(1) ?? "—"}</small>`;
  const notableTypes = new Set(["encounter", "loot", "room", "rest", "death", "dungeon"]);
  const notableHistory = state.history.filter((event) => notableTypes.has(event.type));
  const markup = notableHistory.length
    ? notableHistory.map((event) =>
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
  const majorEvents =
    state.history.filter((event) =>
      ["encounter", "loot", "room", "rest", "death", "dungeon"].includes(event.type)
    ).length;
  $("#journal-print-meta").textContent =
    `Expedition ${state.expedition} · ${majorEvents} major events · ${modelState().samples} learning samples`;
  document.body.classList.add("print-journal");
  requestAnimationFrame(() => globalThis.print());
}

function undoLastAction() {
  const entry = state.undoStack.pop();
  if (!entry) return;
  const snapshot = clone(entry.snapshot);
  const floorData = snapshot.floorData;
  delete snapshot.floorData;
  Object.assign(state, snapshot);
  state.floors ??= {};
  if (validDungeonData(floorData)) state.floors[floorKey(state.floor)] = floorData;
  dungeon = ensureCurrentFloor();
  saveState();
  renderMeta();
  renderParty();
  buildMapCells();
  updateForecast(`Undid: ${entry.label}`);
}

function newExpedition() {
  checkpoint("Descend a floor");
  const targetFloor = state.floor + 1;
  state.seed = state.floors?.[floorKey(targetFloor)]?.seed ?? seedForDungeonFloor(targetFloor);
  state.completed = 0;
  state.floor = targetFloor;
  state.inSafeRoom = false;
  state.encounterControls = { rerolls: {}, ratings: {}, kinds: {} };
  state.encounterLocks = {};
  state.pendingRestEncounter = null;
  state.initiative = null;
  state.forecastChanges = [];
  dungeon = ensureCurrentFloor();
  logEvent("dungeon", `Descended to floor ${state.floor}`, `New seed ${state.seed}`);
  saveState();
  renderMeta();
  buildMapCells();
  playCollapse();
  updateForecast("A new dungeon takes shape");
}

function resetDungeon() {
  const confirmed = globalThis.confirm(
    "Reset this dungeon to floor 1? The party will be fully resupplied, while the map, resolved encounters, and journal will be cleared.",
  );
  if (!confirmed) return;
  checkpoint("Reset dungeon");
  state.seed = randomSeed();
  state.dungeonSeed = state.seed;
  state.completed = 0;
  state.floor = 1;
  state.expedition += 1;
  state.encounterControls = { rerolls: {}, ratings: {}, kinds: {} };
  state.encounterLocks = {};
  state.safeRoomsUsed = {};
  state.awareness = 0;
  state.inSafeRoom = false;
  state.pendingRestEncounter = null;
  state.initiative = null;
  state.forecastChanges = [];
  state.themeOrder = randomThemeOrder();
  state.storyVariant = randomStoryVariant();
  state.floors = {};
  state.visitedRooms = {};
  state.currentRoomId = null;
  state.party = takeLongRest(state.party).map((member) => {
    if (!member.dead) return member;
    const hitDice = hitDiceState(member);
    const resources = member.resources?.map((pool) => ({
      ...pool,
      current: Number(pool.maximum),
    }));
    return {
      ...member,
      hp: 0,
      resource: resources?.length
        ? resources.reduce((sum, pool) => sum + Number(pool.current), 0)
        : Number(member.maxResource),
      resources,
      hitDice: { ...hitDice, current: hitDice.maximum },
    };
  });
  resetEncounterBaseline();
  state.history = [];
  state.clearedRooms = {};
  state.claimedLoot = [];
  dungeon = ensureCurrentFloor();
  saveState();
  renderMeta();
  buildMapCells();
  playCollapse();
  updateForecast("New dungeon · party resources restored · journal cleared");
}

function renderMeta() {
  $("#seed-label").textContent = state.seed.toUpperCase();
  $("#expedition-number").textContent = String(state.expedition).padStart(2, "0");
  $("#floor-number").textContent = state.floor;
  $("#floor-theme-name").textContent = dungeon.theme.name;
  $("#floor-folio").textContent = `Folio ${state.floor}`;
  document.body.dataset.floorTheme = dungeon.theme.id;
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

function normalizeImportedSession(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.party) || !data.party.length) {
    throw new Error("This file does not contain a Delvewright party");
  }
  if (typeof data.seed !== "string" || !data.seed.trim()) {
    throw new Error("The imported session has no dungeon seed");
  }
  const party = data.party.slice(0, 20).map((member, index) => {
    if (!member || typeof member.name !== "string" || !member.name.trim()) {
      throw new Error(`Party member ${index + 1} has no name`);
    }
    const maxHp = Number(member.maxHp);
    const level = Number(member.level);
    if (!Number.isFinite(maxHp) || maxHp < 1 || !Number.isFinite(level) || level < 1) {
      throw new Error(`${member.name} has invalid HP or level data`);
    }
    return {
      ...member,
      id: typeof member.id === "string" && member.id ? member.id : crypto.randomUUID(),
      name: member.name.trim().slice(0, 64),
      level: Math.max(1, Math.min(20, level)),
      maxHp: Math.max(1, maxHp),
      hp: Math.max(0, Math.min(maxHp, Number(member.hp) || 0)),
      ac: Math.max(1, Number(member.ac) || 10),
      resource: Math.max(0, Number(member.resource) || 0),
      maxResource: Math.max(0, Number(member.maxResource) || 0),
    };
  });
  const encounterBaseline = data.encounterBaseline && typeof data.encounterBaseline === "object"
    ? { ...data.encounterBaseline }
    : createEncounterBaseline(party);
  for (const member of party) {
    encounterBaseline[member.id] ??= createEncounterBaseline([member])[member.id];
  }
  const knownThemes = ["moss-forest", "drowned-grotto", "ossuary", "infernal-foundry"];
  const importedThemeOrder = Array.isArray(data.themeOrder)
    ? data.themeOrder.filter((theme) => knownThemes.includes(theme))
    : [];
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(data.settings ?? {}),
    biomeOptions: {
      ...DEFAULT_SETTINGS.biomeOptions,
      ...(data.settings?.biomeOptions ?? {}),
    },
  };
  if (!["arcs", "full-dungeon"].includes(settings.themeMode)) settings.themeMode = "arcs";
  if (!["random", ...knownThemes].includes(settings.dungeonTheme)) {
    settings.dungeonTheme = "random";
  }
  if (!["small", "medium", "large", "massive"].includes(settings.floorSize)) {
    settings.floorSize = "medium";
  }
  settings.roomCount = Math.max(4, Math.min(30, Number(settings.roomCount) || 11));
  const biomeOptionIds = {
    "moss-forest": [
      "random",
      "none",
      "malicious-roots",
      "from-up-high",
      "tea-or-poison",
      "wild-urges",
    ],
    "drowned-grotto": [
      "random",
      "none",
      "sea-stirs",
      "feeding-frenzy",
      "crushing-weight",
      "siren-song",
      "seas-toll",
    ],
    ossuary: [
      "random",
      "none",
      "illusionary-hallways",
      "grave-call",
      "soul-drag",
      "undying-fortitude",
      "no-hope",
      "realm-damned",
    ],
    "infernal-foundry": [
      "random",
      "none",
      "allure-depravity",
      "gift-endurance",
      "spells-change",
      "promise-strength",
      "survival-desperate",
    ],
  };
  for (const [biome, allowed] of Object.entries(biomeOptionIds)) {
    const selected = normalizedBiomeSelections(settings.biomeOptions[biome]).filter((id) =>
      allowed.includes(id)
    );
    settings.biomeOptions[biome] = selected.includes("random") ? ["random"] : selected;
  }
  return {
    party,
    seed: data.seed.trim().slice(0, 128),
    dungeonSeed: typeof data.dungeonSeed === "string" && data.dungeonSeed
      ? data.dungeonSeed.slice(0, 128)
      : data.seed.trim().slice(0, 128),
    completed: Math.max(0, Number(data.completed) || 0),
    expedition: Math.max(1, Number(data.expedition) || 1),
    floor: Math.max(1, Math.min(999, Number(data.floor) || 1)),
    history: Array.isArray(data.history) ? data.history.slice(0, 150) : [],
    undoStack: [],
    learningSamples: Array.isArray(data.learningSamples) ? data.learningSamples.slice(-24) : [],
    encounterControls: {
      rerolls: {},
      ratings: {},
      kinds: {},
      ...(data.encounterControls ?? {}),
    },
    encounterLocks: data.encounterLocks ?? {},
    settings,
    awareness: Math.max(0, Number(data.awareness) || 0),
    safeRoomsUsed: data.safeRoomsUsed ?? {},
    inSafeRoom: Boolean(data.inSafeRoom),
    restStats: { short: 0, long: 0, interrupted: 0, ...(data.restStats ?? {}) },
    clearedRooms: data.clearedRooms ?? {},
    claimedLoot: Array.isArray(data.claimedLoot) ? data.claimedLoot : [],
    pendingRestEncounter: data.pendingRestEncounter ?? null,
    initiative: data.initiative ?? null,
    forecastChanges: Array.isArray(data.forecastChanges) ? data.forecastChanges : [],
    themeOrder: importedThemeOrder.length === knownThemes.length
      ? importedThemeOrder
      : randomThemeOrder(),
    storyVariant: Number.isFinite(Number(data.storyVariant))
      ? Number(data.storyVariant)
      : randomStoryVariant(),
    encounterBaseline,
    floors: data.floors && typeof data.floors === "object" ? data.floors : {},
    visitedRooms: data.visitedRooms && typeof data.visitedRooms === "object"
      ? data.visitedRooms
      : {},
    currentRoomId: typeof data.currentRoomId === "string" ? data.currentRoomId : null,
  };
}

async function importSession(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const imported = normalizeImportedSession(JSON.parse(await file.text()));
    if (
      !globalThis.confirm(
        `Import ${file.name}? This replaces the current session with expedition ${imported.expedition}, floor ${imported.floor}.`,
      )
    ) return;
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, imported);
    forecast = null;
    dungeon = ensureCurrentFloor();
    saveState();
    renderMeta();
    renderParty();
    renderInitiativeTracker();
    buildMapCells();
    playCollapse();
    updateForecast(`Imported ${file.name} · expedition ${state.expedition}, floor ${state.floor}`);
  } catch (error) {
    globalThis.alert(error instanceof Error ? error.message : "The session could not be imported");
  } finally {
    input.value = "";
  }
}

function playerPrintableGrid(floorDungeon) {
  const hiddenMarkers = new Set(["@", ">", "!", "$", "^", "S", "†", "?", "B"]);
  const printable = floorDungeon.grid.map((row) =>
    row.map((tile) => hiddenMarkers.has(tile) ? "·" : tile)
  );
  const start = floorDungeon.rooms.find((room) => room.role === "entry") ??
    floorDungeon.rooms[0];
  if (start) printable[start.cy][start.cx] = "@";
  return printable.map((row) => row.join("")).join("\n");
}

function dungeonFloorForPrint(floor) {
  return state.floors?.[floorKey(floor)] ?? generateDungeon(
    seedForDungeonFloor(floor),
    undefined,
    undefined,
    dungeonGenerationOptions({ floor }),
  );
}

function printFloorPage(floorDungeon, floor) {
  const fontSize = Math.max(
    5.5,
    Math.min(
      9.5,
      140 / (floorDungeon.height * .3528 * 1.05),
      250 / (floorDungeon.width * .3528 * .68),
    ),
  );
  const areaLabel = floorDungeon.layout === "open-region" ? "zones" : "floor";
  return `<article class="print-floor-sheet" style="--print-map-font:${fontSize.toFixed(2)}pt">
    <header class="print-header">
      <div><span>DELVEWRIGHT PLAYER ATLAS</span><h1>${
    escapeHtml(floorDungeon.theme.name)
  }</h1></div>
      <dl><div><dt>Floor</dt><dd>${floor}</dd></div><div><dt>Map</dt><dd>${
    escapeHtml(areaLabel)
  }</dd></div></dl>
    </header>
    <div class="print-map-frame"><pre class="print-map-content">${
    escapeHtml(
      playerPrintableGrid(floorDungeon),
    )
  }</pre></div>
    <div class="print-key"><span><b>@</b> start</span><span><b>+</b> door</span><span><b>╬</b> locked</span><span><b>~</b> water</span><span><b>*</b> fire</span><span><b>O</b> chasm</span><span><b>=</b> bridge</span><span><b>_</b> ice</span><span><b>w</b> webs</span><span><b>&amp;</b> bushes</span><span><b>%</b> rough</span></div>
    <footer class="print-footer"><span>Player map · obstacles shown</span><span>Floor ${floor}</span></footer>
  </article>`;
}

function printDungeonFloors(floors) {
  document.body.classList.remove("print-journal");
  $("#print-sheet").innerHTML = floors.map((floor) =>
    printFloorPage(dungeonFloorForPrint(floor), floor)
  ).join("");
  $("#print-sheet").setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => globalThis.print());
}

function printMap() {
  printDungeonFloors([state.floor]);
}

function printEntireDungeon() {
  const storedFloors = Object.keys(state.floors ?? {}).map(Number).filter(Number.isFinite);
  const lastFloor = Math.max(10, state.floor, ...storedFloors);
  printDungeonFloors(Array.from({ length: lastFloor }, (_, index) => index + 1));
}

function setupInitiativeDrag() {
  const tracker = $("#initiative-tracker");
  const handle = $("#initiative-drag-handle");
  let drag = null;
  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const bounds = tracker.getBoundingClientRect();
    drag = { offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const x = Math.max(
      8,
      Math.min(globalThis.innerWidth - tracker.offsetWidth - 8, event.clientX - drag.offsetX),
    );
    const y = Math.max(8, Math.min(globalThis.innerHeight - 70, event.clientY - drag.offsetY));
    tracker.style.left = `${x}px`;
    tracker.style.top = `${y}px`;
    tracker.style.right = "auto";
  });
  const finish = () => {
    if (!drag || !state.initiative) return;
    state.initiative.position = {
      x: Number.parseFloat(tracker.style.left),
      y: Number.parseFloat(tracker.style.top),
    };
    drag = null;
    saveState();
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
}

$("#add-member").addEventListener("click", () => openMemberDialog());
$("#reset-party").addEventListener("click", resetPartyLearning);
$("#add-member-wide").addEventListener("click", () => openMemberDialog());
$("#save-member").addEventListener("click", saveMember);
$("#condition-form").addEventListener("submit", saveCondition);
$("#cancel-condition").addEventListener("click", () => $("#condition-dialog").close());
$("#cancel-condition-secondary").addEventListener(
  "click",
  () => $("#condition-dialog").close(),
);
$("#resolve-form").addEventListener("submit", resolveEncounter);
$("#start-initiative").addEventListener("click", openInitiativeDialog);
$("#initiative-form").addEventListener("submit", beginInitiative);
$("#close-initiative").addEventListener("click", closeInitiative);
$("#add-initiative-entry").addEventListener("click", addInitiativeEntry);
$("#spawn-initiative-minion").addEventListener("click", spawnInitiativeMinion);
$("#sort-initiative").addEventListener("click", sortInitiative);
$("#next-initiative-turn").addEventListener("click", nextInitiativeTurn);
$("#open-settings").addEventListener("click", openSettings);
$("#settings-form").addEventListener("submit", saveSettings);
document.querySelectorAll("[data-setting-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = $("#settings-form").elements.roomCount;
    const next = Number(input.value || 11) + Number(button.dataset.settingStep);
    input.value = Math.max(Number(input.min), Math.min(Number(input.max), next));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
});
$("#open-journal").addEventListener("click", openJournal);
$("#print-journal").addEventListener("click", printJournal);
$("#undo-action").addEventListener("click", undoLastAction);
$("#short-rest").addEventListener("click", openShortRestDialog);
$("#short-rest-form").addEventListener("submit", applyShortRest);
$("#long-rest").addEventListener("click", applyLongRest);
$("#safe-room-toggle").addEventListener("click", toggleSafeRoom);
$("#member-form").elements.class.addEventListener("change", queueClassProfile);
$("#member-form").elements.level.addEventListener("input", queueClassProfile);
for (const field of ["class", "level", "conModifier"]) {
  $("#member-form").elements[field].addEventListener("input", () => {
    updateAverageHpPreview(!$("#member-form").elements.memberId.value);
  });
}
$("#calculate-average-hp").addEventListener("click", () => updateAverageHpPreview(true));
$("#new-expedition").addEventListener("click", () => navigateFloor(1));
$("#reset-dungeon").addEventListener("click", resetDungeon);
$("#replay-collapse").addEventListener("click", playCollapse);
$("#floor-up").addEventListener("click", () => navigateFloor(-1));
$("#refresh-forecast").addEventListener("click", () => {
  checkpoint("Read the party again");
  saveState();
  updateForecast("Party re-read · locked encounters preserved");
});
$("#copy-seed").addEventListener("click", async () => {
  await navigator.clipboard?.writeText(state.seed);
  showToast("Seed copied");
});
$("#export-button").addEventListener("click", exportSession);
$("#import-button").addEventListener("click", () => $("#import-session-file").click());
$("#import-session-file").addEventListener("change", importSession);
$("#print-map").addEventListener("click", printMap);
$("#print-dungeon").addEventListener("click", printEntireDungeon);
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
setupInitiativeDrag();
loadConditionOptions();
buildMapCells();
playCollapse();
updateForecast("");
