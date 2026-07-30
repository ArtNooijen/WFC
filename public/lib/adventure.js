/** A deterministic PRNG, so the same seed always preserves the same dungeon. */
export function createRng(seed) {
  let state = hashSeed(String(seed));
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const ARCHETYPES = [
  {
    name: "Mossbound sentries",
    kind: "combat",
    icon: "⚔",
    tone: "Guardians",
    weight: 1,
    objective: "Cross the chamber or break the oath animating its guardians.",
    twist: "The sentries only attack anyone carrying worked metal.",
  },
  {
    name: "The whispering reliquary",
    kind: "social",
    icon: "♜",
    tone: "Parley",
    weight: 0.72,
    objective: "Learn which of three confessing spirits is telling the truth.",
    twist: "The liar is trying to protect, not betray, the others.",
  },
  {
    name: "Flooded undercroft",
    kind: "hazard",
    icon: "≈",
    tone: "Skill trial",
    weight: 0.78,
    objective: "Reach the far stair before the old sluice fully opens.",
    twist: "Something below the water holds the missing valve chain.",
  },
  {
    name: "Hollow knight's toll",
    kind: "combat",
    icon: "⚔",
    tone: "Duel",
    weight: 0.92,
    objective: "Pay a meaningful toll or defeat the bridge's tireless keeper.",
    twist: "It accepts a cherished memory as readily as coin.",
  },
  {
    name: "A feast for no one",
    kind: "discovery",
    icon: "✦",
    tone: "Mystery",
    weight: 0.58,
    objective: "Discover why a warm banquet waits in a sealed ruin.",
    twist: "Each dish grants a memory belonging to a missing explorer.",
  },
  {
    name: "The cartographer's mimic",
    kind: "combat",
    icon: "⚔",
    tone: "Ambush",
    weight: 0.88,
    objective: "Recover the living map before it redraws the exits.",
    twist: "Damage to the creature temporarily changes nearby corridors.",
  },
  {
    name: "Pilgrims behind a barred door",
    kind: "social",
    icon: "♜",
    tone: "Aid",
    weight: 0.5,
    objective: "Decide whether to free strangers who claim sanctuary.",
    twist: "One pilgrim is a jailer keeping the others contained.",
  },
  {
    name: "A wounded owlbear",
    kind: "social",
    icon: "♜",
    tone: "Mercy",
    weight: 0.62,
    objective: "Pass, soothe, or aid the beast without provoking it.",
    twist: "Its cub has stolen the key the party needs.",
  },
  {
    name: "The bell without a rope",
    kind: "puzzle",
    icon: "◇",
    tone: "Riddle",
    weight: 0.55,
    objective: "Ring the suspended bell exactly once without touching it.",
    twist: "Every loud sound wakes one carved face in the walls.",
  },
  {
    name: "Choir of borrowed voices",
    kind: "social",
    icon: "♜",
    tone: "Unease",
    weight: 0.7,
    objective: "Persuade the choir to return a companion's stolen voice.",
    twist: "It will trade the voice for a secret spoken in unison.",
  },
  {
    name: "The upside-down gallows",
    kind: "hazard",
    icon: "^",
    tone: "Gravity",
    weight: 0.82,
    objective: "Cross the room while gravity shifts between floor and ceiling.",
    twist: "Cutting a hanging rope changes the direction of the next shift.",
  },
  {
    name: "Three goblins and a funeral",
    kind: "social",
    icon: "♜",
    tone: "Truce",
    weight: 0.46,
    objective: "Help complete a funeral without violating unfamiliar rites.",
    twist: "The deceased keeps interrupting to correct the ceremony.",
  },
  {
    name: "Wax dragon hatchery",
    kind: "hazard",
    icon: "♨",
    tone: "Heat",
    weight: 0.76,
    objective: "Retrieve a brass coffer before the wax brood melts free.",
    twist: "Open flame solves one problem and creates six smaller ones.",
  },
  {
    name: "The tax collector's ghost",
    kind: "social",
    icon: "♜",
    tone: "Bargain",
    weight: 0.52,
    objective: "Settle a century of impossible dungeon tolls.",
    twist: "The ledger lists debts belonging to people the party knows.",
  },
  {
    name: "Moonlight in a buried room",
    kind: "discovery",
    icon: "✦",
    tone: "Wonder",
    weight: 0.42,
    objective: "Catch impossible moonlight in the four empty basins.",
    twist: "Each filled basin reveals a different version of the room.",
  },
  {
    name: "The rust sermon",
    kind: "combat",
    icon: "⚔",
    tone: "Attrition",
    weight: 0.86,
    objective: "Silence a corroded priest before every weapon becomes brittle.",
    twist: "Discarding a weapon voluntarily weakens the priest.",
  },
  {
    name: "Bridge of sleeping bones",
    kind: "hazard",
    icon: "^",
    tone: "Stealth",
    weight: 0.68,
    objective: "Cross without waking the skeletons fitted into the bridge.",
    twist: "One skeleton quietly offers directions in exchange for escape.",
  },
  {
    name: "The room that takes attendance",
    kind: "puzzle",
    icon: "◇",
    tone: "Identity",
    weight: 0.6,
    objective: "Answer for every name called by the unseen schoolmaster.",
    twist: "Several names belong to people standing in the room.",
  },
  {
    name: "Lantern thieves",
    kind: "combat",
    icon: "⚔",
    tone: "Chase",
    weight: 0.74,
    objective: "Recover the party's light as nimble thieves flee across rafters.",
    twist: "The stolen flames reveal invisible paths while moving.",
  },
  {
    name: "The patient basilisk",
    kind: "social",
    icon: "♜",
    tone: "Parley",
    weight: 0.8,
    objective: "Negotiate passage with a creature tired of petrifying intruders.",
    twist: "Its stone victims loudly disagree with its version of events.",
  },
  {
    name: "Library of unfinished deaths",
    kind: "discovery",
    icon: "✦",
    tone: "Omen",
    weight: 0.64,
    objective: "Find the blank book describing the safest path onward.",
    twist: "Opening any other volume briefly stages a possible demise.",
  },
  {
    name: "Mill of the little storm",
    kind: "hazard",
    icon: "≈",
    tone: "Machinery",
    weight: 0.84,
    objective: "Stop a windmill grinding a thundercloud into bottled lightning.",
    twist: "The mill can be redirected against the next encounter.",
  },
  {
    name: "A crown shared by rats",
    kind: "social",
    icon: "♜",
    tone: "Court",
    weight: 0.48,
    objective: "Win a tiny court's permission to use its tunnel.",
    twist: "The crown changes wearer—and policy—every few sentences.",
  },
  {
    name: "The candle knight",
    kind: "combat",
    icon: "⚔",
    tone: "Countdown",
    weight: 0.9,
    objective: "End the duel before the knight burns down to something worse.",
    twist: "Cold damage preserves the knight and extends the fight.",
  },
  {
    name: "Garden of iron fruit",
    kind: "puzzle",
    icon: "◇",
    tone: "Alchemy",
    weight: 0.58,
    objective: "Harvest the single ripe key without touching poisonous fruit.",
    twist: "The trees grow toward spoken lies.",
  },
  {
    name: "Saint beneath the floorboards",
    kind: "social",
    icon: "♜",
    tone: "Confession",
    weight: 0.54,
    objective: "Convince a buried saint to release the door's holy seal.",
    twist: "The saint demands an honest account of the party's last fight.",
  },
  {
    name: "The paper menagerie",
    kind: "combat",
    icon: "⚔",
    tone: "Swarm",
    weight: 0.7,
    objective: "Protect a fragile paper phoenix from its folded predators.",
    twist: "Written words become temporary terrain when torn from the walls.",
  },
  {
    name: "The drowned auction",
    kind: "social",
    icon: "♜",
    tone: "Bidding",
    weight: 0.66,
    objective: "Win an item at an auction held waist-deep in black water.",
    twist: "Bids are made in years of life, favors, or treasured names.",
  },
  {
    name: "Staircase with a pulse",
    kind: "hazard",
    icon: "^",
    tone: "Timing",
    weight: 0.72,
    objective: "Climb living steps without being carried into the walls.",
    twist: "Its heartbeat matches the most frightened party member.",
  },
  {
    name: "The last door's first key",
    kind: "puzzle",
    icon: "◇",
    tone: "Paradox",
    weight: 0.62,
    objective: "Open a door whose key waits visibly on the other side.",
    twist: "The lock responds to an object the party has already discarded.",
  },
  {
    name: "Mercenaries on their lunch break",
    kind: "social",
    icon: "♜",
    tone: "Comedy",
    weight: 0.5,
    objective: "Pass armed rivals without ending an awkward temporary truce.",
    twist: "They were hired by a party member's anonymous admirer.",
  },
  {
    name: "The marrow tide",
    kind: "combat",
    icon: "⚔",
    tone: "Defense",
    weight: 1,
    objective: "Hold three chalk circles while bone fragments flood the chamber.",
    twist: "Broken bones assemble into shields if blessed or named.",
  },
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

const CLASS_HIT_DIE = {
  Barbarian: 12,
  Fighter: 10,
  Paladin: 10,
  Ranger: 10,
  Bard: 8,
  Cleric: 8,
  Druid: 8,
  Monk: 8,
  Rogue: 8,
  Warlock: 8,
  Sorcerer: 6,
  Wizard: 6,
};

export function hitDiceState(member) {
  const maximum = Math.max(1, Number(member.level || 1));
  const size = CLASS_HIT_DIE[member.class] ?? 8;
  return {
    current: clamp(Number(member.hitDice?.current ?? maximum), 0, maximum),
    maximum,
    size,
  };
}

function syncResourceTotals(member) {
  if (!member.resources?.length) return member;
  return {
    ...member,
    resource: member.resources.reduce((sum, pool) => sum + Number(pool.current), 0),
    maxResource: member.resources.reduce((sum, pool) => sum + Number(pool.maximum), 0),
  };
}

export function takeLongRest(party) {
  return party.map((original) => {
    if (original.dead) return { ...original, hp: 0 };
    const hitDice = hitDiceState(original);
    const member = {
      ...original,
      hp: Number(original.maxHp),
      resource: Number(original.maxResource),
      hitDice: { ...hitDice, current: hitDice.maximum },
      resources: original.resources?.map((pool) => ({
        ...pool,
        current: Number(pool.maximum),
      })),
    };
    return syncResourceTotals(member);
  });
}

export function takeShortRest(party, selections = {}, rng = Math.random) {
  const healing = [];
  let resourcesRecovered = 0;
  const restedParty = party.map((original) => {
    const hitDice = hitDiceState(original);
    const key = original.id ?? original.name;
    if (original.dead) {
      healing.push({
        id: key,
        name: original.name,
        spent: 0,
        rolls: [],
        restored: 0,
        rolled: 0,
      });
      return { ...original, hp: 0 };
    }
    const spent = clamp(Math.floor(Number(selections[key] ?? 0)), 0, hitDice.current);
    const constitution = clamp(Number(original.conModifier ?? 0), -5, 10);
    const rolls = Array.from(
      { length: spent },
      () => Math.floor(clamp(Number(rng()), 0, .999999) * hitDice.size) + 1,
    );
    const restoredHp = rolls.reduce((sum, roll) => sum + Math.max(0, roll + constitution), 0);
    const beforeHp = Number(original.hp);
    const hp = Math.min(Number(original.maxHp), beforeHp + restoredHp);
    const resources = original.resources?.map((pool) => {
      if (!String(pool.recharge ?? "").toLowerCase().includes("short rest")) return { ...pool };
      resourcesRecovered += Math.max(0, Number(pool.maximum) - Number(pool.current));
      return { ...pool, current: Number(pool.maximum) };
    });
    healing.push({
      id: key,
      name: original.name,
      spent,
      rolls,
      restored: hp - beforeHp,
      rolled: restoredHp,
    });
    return syncResourceTotals({
      ...original,
      hp,
      resources,
      hitDice: { ...hitDice, current: hitDice.current - spent },
    });
  });
  return { party: restedParty, healing, resourcesRecovered };
}

const CLASS_CAPABILITIES = {
  Barbarian: { aoe: 1, control: 2, healing: 1, ranged: 1 },
  Bard: { aoe: 3, control: 5, healing: 3, ranged: 3 },
  Cleric: { aoe: 4, control: 3, healing: 5, ranged: 3 },
  Druid: { aoe: 4, control: 5, healing: 4, ranged: 3 },
  Fighter: { aoe: 2, control: 2, healing: 1, ranged: 3 },
  Monk: { aoe: 2, control: 3, healing: 1, ranged: 2 },
  Paladin: { aoe: 2, control: 2, healing: 3, ranged: 1 },
  Ranger: { aoe: 3, control: 3, healing: 2, ranged: 5 },
  Rogue: { aoe: 1, control: 2, healing: 1, ranged: 4 },
  Sorcerer: { aoe: 5, control: 4, healing: 1, ranged: 4 },
  Warlock: { aoe: 3, control: 4, healing: 1, ranged: 5 },
  Wizard: { aoe: 5, control: 5, healing: 1, ranged: 5 },
};

const CLASS_RESOURCE_DEPENDENCY = {
  Wizard: .82,
  Sorcerer: .82,
  Cleric: .76,
  Druid: .76,
  Bard: .72,
  Warlock: .72,
  Monk: .55,
  Paladin: .48,
  Ranger: .45,
  Barbarian: .34,
  Fighter: .2,
  Rogue: .14,
};

export function classResourceDependency(className) {
  return CLASS_RESOURCE_DEPENDENCY[className] ?? .35;
}

export function memberResourceState(member) {
  const current = member.resources?.length
    ? member.resources.reduce((total, resource) => total + Number(resource.current ?? 0), 0)
    : Number(member.resource ?? 0);
  const maximum = member.resources?.length
    ? member.resources.reduce((total, resource) => total + Number(resource.maximum ?? 0), 0)
    : Number(member.maxResource ?? 0);
  const ratio = maximum > 0 ? clamp(current / maximum, 0, 1) : 1;
  const dependency = classResourceDependency(member.class);
  return {
    current,
    maximum,
    ratio,
    dependency,
    operational: clamp(1 - dependency * (1 - ratio), 0, 1),
  };
}

export function classCapability(member) {
  const base = CLASS_CAPABILITIES[member.class] ?? { aoe: 2, control: 2, healing: 1, ranged: 2 };
  const levelBonus = Number(member.level) >= 5 ? .5 : Number(member.level) >= 3 ? .25 : 0;
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, clamp(value + levelBonus, 1, 5)]),
  );
}

export function analyzeParty(party, options = {}) {
  const members = party.filter((member) => member.name.trim() && !member.dead);
  if (!members.length) throw new Error("Add at least one adventurer");

  const levelWeight = members.reduce((sum, member) => sum + Number(member.level || 1), 0);
  const hpRatio = members.reduce((sum, member) => {
    return sum + clamp(Number(member.hp) / Math.max(1, Number(member.maxHp)), 0, 1);
  }, 0) / members.length;
  const memberResources = members.map(memberResourceState);
  const measuredResourceRatio = memberResources.reduce((sum, resource) => sum + resource.ratio, 0) /
    members.length;
  const weightedResourceRatio = memberResources.reduce(
    (sum, resource) => sum + resource.operational,
    0,
  ) / members.length;
  const resourceRatio = options.trackResources === false ? 1 : weightedResourceRatio;
  const defense = members.reduce((sum, member) => sum + Number(member.ac || 10), 0) /
    members.length;

  // Attrition is intentionally dominant: lowering HP must always lower readiness.
  // Defense and level describe capacity, while HP/resources describe current condition.
  const defenseFactor = clamp((defense - 10) / 12, 0, 1);
  const afflictionLoad = options.trackAfflictions === false ? 0 : members.reduce((sum, member) => {
    const conditions = member.conditions?.length ?? 0;
    const exhaustion = Number(member.exhaustion ?? 0);
    return sum + conditions * .035 + exhaustion * .055 + (member.concentration ? .01 : 0);
  }, 0) / members.length;
  const readiness = clamp(
    hpRatio * 0.58 + resourceRatio * 0.27 + defenseFactor * 0.15 - afflictionLoad,
    0,
    1,
  );
  const displayCondition = clamp(
    options.trackResources === false ? hpRatio : hpRatio * .68 + measuredResourceRatio * .32,
    0,
    1,
  );
  const capabilities = members.reduce((totals, member) => {
    const profile = classCapability(member);
    const resource = options.trackResources === false
      ? { operational: 1 }
      : memberResourceState(member);
    const capabilityScale = .2 + resource.operational * .8;
    for (const key of Object.keys(totals)) totals[key] += profile[key] * capabilityScale;
    return totals;
  }, { aoe: 0, control: 0, healing: 0, ranged: 0 });
  for (const key of Object.keys(capabilities)) capabilities[key] /= members.length;
  const wounded = members.filter((member) => Number(member.hp) / Number(member.maxHp) < 0.5).length;
  const critical =
    members.filter((member) => Number(member.hp) / Number(member.maxHp) < 0.25).length;
  const capacity = members.reduce((sum, member) => {
    const memberDefense = clamp((Number(member.ac || 10) - 10) / 12, 0, 1);
    const resource = options.trackResources === false
      ? { operational: 1 }
      : memberResourceState(member);
    return sum + Number(member.level || 1) * 100 * (0.82 + memberDefense * .28) *
        resource.operational;
  }, 0);
  return {
    members: members.length,
    averageLevel: levelWeight / members.length,
    hpRatio,
    resourceRatio,
    measuredResourceRatio,
    weightedResourceRatio,
    resourceDependencies: members.map((member, index) => ({
      id: member.id,
      name: member.name,
      class: member.class,
      ...memberResources[index],
    })),
    afflictionLoad,
    capabilities,
    defense,
    readiness,
    displayCondition,
    wounded,
    critical,
    capacity: Math.round(capacity),
    budget: Math.round(capacity * (0.38 + readiness * 0.62)),
  };
}

export function buildEncounterForecast(
  party,
  seed = "ember-vault",
  completed = 0,
  floor = 1,
  modelContext = {},
) {
  const profile = analyzeParty(party, modelContext.settings ?? {});
  const calibration = clamp(Number(modelContext.calibration ?? 1), .72, 1.35);
  const planningReadiness = clamp(profile.readiness / calibration, 0, 1);
  const awarenessPressure = clamp(Number(modelContext.awareness ?? 0) * .025, 0, .16);
  profile.planningReadiness = planningReadiness;
  profile.calibration = calibration;
  const rng = createRng(
    `${seed}:encounters:${completed}:${Math.round(profile.hpRatio * 20)}:${
      Math.round(profile.resourceRatio * 20)
    }`,
  );
  const milestoneFloor = floor % 3 === 0;
  const tier = planningReadiness < 0.35
    ? "Shelter"
    : planningReadiness < 0.58
    ? "Cautious"
    : planningReadiness < 0.78
    ? "Steady"
    : "Bold";
  const pacingByTier = {
    Shelter: [[0.72, 0.45, 0.62], [0.5, 0.74, 0.42], [0.64, 0.54, 0.7]],
    Cautious: [[0.66, 0.88, 0.58], [0.82, 0.6, 0.9], [0.7, 0.92, 0.76]],
    Steady: [[0.82, 0.68, 1], [0.72, 1, 0.86], [0.94, 0.76, 0.88]],
    Bold: [[0.9, 1, 0.78], [0.84, 0.92, 1], [1, 0.8, 0.94]],
  };
  const patterns = pacingByTier[tier];
  const pattern = patterns[Math.floor(rng() * patterns.length)];
  const conditionCeiling = 0.38 + planningReadiness * 0.64;
  const pressures = pattern.map((value) =>
    clamp(value * conditionCeiling + awarenessPressure, 0.18, 0.94)
  );
  if (milestoneFloor) pressures[2] = planningReadiness >= 0.85 ? 1.06 : 0.9;

  const encounters = pressures.map((pressure, index) => {
    let pool = ARCHETYPES;
    if (planningReadiness < 0.35 && index < 2) {
      pool = ARCHETYPES.filter((item) => item.kind !== "combat" || item.weight < 0.7);
    }
    const archetype = pool[Math.floor(rng() * pool.length)];
    const variance = 0.98 + rng() * 0.04;
    const rating = pressure < 0.42
      ? "Low"
      : pressure < 0.78
      ? "Moderate"
      : pressure <= 1
      ? "Hard"
      : "Deadly";
    const intent = index === 2 && milestoneFloor
      ? "Floor guardian"
      : rating === "Low"
      ? "Breather"
      : rating === "Moderate"
      ? "Measured"
      : "Demanding";
    const budget = Math.round(profile.capacity * pressure * variance);
    return {
      id: `${hashSeed(`${seed}:${completed}:${index}`)}`,
      order: completed + index + 1,
      title: archetype.name,
      kind: archetype.kind,
      icon: archetype.icon,
      tone: archetype.tone,
      objective: archetype.objective,
      twist: archetype.twist,
      intent,
      rating,
      budget,
      foes: archetype.kind === "combat"
        ? clamp(Math.round(1 + pressure * archetype.weight * profile.members + rng()), 1, 8)
        : 0,
      rounds: clamp(Math.round(2 + pressure * 3 + rng()), 2, 6),
      recovery: planningReadiness < 0.58 && index === 1
        ? "A short rest is possible afterward."
        : null,
      clue: [
        "Footprints stop at the western wall.",
        "Cold blue wax marks the safe passage.",
        "Someone has recently reset the trap.",
        "The air tastes faintly of copper.",
      ][Math.floor(rng() * 4)],
    };
  });
  if (!encounters.some((encounter) => encounter.kind === "combat")) {
    const hardestIndex = pressures.indexOf(Math.max(...pressures));
    const combatPool = ARCHETYPES.filter((archetype) => archetype.kind === "combat");
    const archetype = combatPool[Math.floor(rng() * combatPool.length)];
    Object.assign(encounters[hardestIndex], {
      title: archetype.name,
      kind: archetype.kind,
      icon: archetype.icon,
      tone: archetype.tone,
      objective: archetype.objective,
      twist: archetype.twist,
    });
  }
  return {
    profile,
    encounters,
    plan: tier,
    pacing: pattern,
    floor,
    milestoneFloor,
    model: "adaptive-attrition-v3",
    learning: {
      calibration,
      samples: Number(modelContext.samples ?? 0),
      awareness: Number(modelContext.awareness ?? 0),
    },
  };
}

export function applyForecastControls(
  forecast,
  party,
  seed,
  completed,
  floor,
  controls = {},
  modelContext = {},
) {
  const encounters = forecast.encounters.map((encounter, index) => {
    const reroll = Number(controls.rerolls?.[index] ?? 0);
    let result = encounter;
    if (reroll > 0) {
      result = buildEncounterForecast(
        party,
        `${seed}:reroll:${index}:${reroll}`,
        completed,
        floor,
        modelContext,
      ).encounters[index];
    }
    const rating = controls.ratings?.[index];
    const kind = controls.kinds?.[index];
    if (rating) result = { ...result, rating };
    if (kind && kind !== "auto") {
      const changed = kind !== result.kind;
      result = {
        ...result,
        kind,
        title: changed ? `The DM's ${kind} challenge` : result.title,
        objective: changed
          ? `Resolve this ${kind} scene using the room and party state.`
          : result.objective,
        twist: changed ? "Use the room condition as the scene's complication." : result.twist,
      };
    }
    return result;
  });
  return { ...forecast, encounters };
}

const TILE = {
  VOID: " ",
  WALL: "#",
  FLOOR: "·",
  DOOR: "+",
  LOCKED: "╬",
  ENTRY: "@",
  EXIT: ">",
  EVENT: "!",
  LOOT: "$",
  TRAP: "^",
  SAFE: "S",
  SHRINE: "†",
  WATER: "~",
  RUBBLE: "%",
  SECRET: "?",
};

export const TILE_INFO = {
  "#": { name: "Stone wall", kind: "wall" },
  "·": { name: "Open floor", kind: "floor" },
  "+": { name: "Wooden door", kind: "door" },
  "╬": { name: "Locked door", kind: "locked" },
  "@": { name: "Party entrance", kind: "entry" },
  ">": { name: "Way deeper", kind: "exit" },
  "!": { name: "Encounter", kind: "event" },
  "$": { name: "Loot cache", kind: "loot" },
  "^": { name: "Trap", kind: "trap" },
  "S": { name: "Safe room", kind: "safe" },
  "†": { name: "Old shrine", kind: "shrine" },
  "~": { name: "Deep water", kind: "water" },
  "%": { name: "Rubble", kind: "rubble" },
  "?": { name: "Secret passage", kind: "secret" },
  " ": { name: "Unknown", kind: "void" },
};

const ROOM_ROLES = [
  "entry",
  "encounter",
  "safe",
  "loot",
  "hazard",
  "shrine",
  "flooded",
  "ruined",
  "secret",
  "encounter",
  "exit",
];

const ROOM_NAMES = {
  entry: ["The Broken Vestibule", "Pilgrim's Threshold"],
  encounter: ["The Long Hall", "Hall of Old Footsteps", "The Guarded Crossing"],
  safe: ["The Quiet Vestry", "Wayfarer's Nook"],
  loot: ["The Sealed Treasury", "Tithe-Keeper's Cache"],
  hazard: ["The Crooked Gallery", "Chamber of Warnings"],
  shrine: ["The Nameless Chapel", "Altar of Small Mercies"],
  flooded: ["The Sunken Refectory", "The Drowned Arcade"],
  ruined: ["The Fallen Scriptorium", "The Shattered Hall"],
  secret: ["The Unwritten Room", "The Mason's Secret"],
  exit: ["The Descending Gate", "The Deepward Stair"],
  ordinary: ["Antechamber", "Lower Passage"],
};

const LOOT_TABLE = [
  "2d6 silver and a moonstone button",
  "Potion of healing in a waxed leather tube",
  "A silvered dagger with a chipped saint's mark",
  "Three thunderstones wrapped in lambswool",
  "A map fragment showing a hidden stair",
  "Antitoxin, 18 gp, and a bone gaming set",
  "A spell scroll sealed with blue wax",
  "An old key tagged ‘vestry’",
];

/**
 * Room-and-corridor WFC: each cell starts as wall or floor. Room constraints are
 * collapsed first, corridors propagate guaranteed floor states, and decoration is
 * collapsed last. The state order is returned for the reveal animation.
 */
export function generateDungeon(seed, width = 55, height = 31) {
  const rng = createRng(`${seed}:geometry`);
  const grid = Array.from({ length: height }, () => Array(width).fill(TILE.VOID));
  const steps = [];
  const rooms = [];
  const roomTarget = 10 + Math.floor(rng() * 3);

  for (let attempt = 0; attempt < 180 && rooms.length < roomTarget; attempt++) {
    const w = 5 + Math.floor(rng() * 6);
    const h = 4 + Math.floor(rng() * 4);
    const x = 2 + Math.floor(rng() * Math.max(1, width - w - 4));
    const y = 2 + Math.floor(rng() * Math.max(1, height - h - 4));
    const overlaps = rooms.some((room) =>
      x < room.x + room.w + 2 && x + w + 2 > room.x && y < room.y + room.h + 2 && y + h + 2 > room.y
    );
    if (overlaps) continue;
    const room = {
      x,
      y,
      w,
      h,
      cx: Math.floor(x + w / 2),
      cy: Math.floor(y + h / 2),
      role: "ordinary",
      condition: "Dry",
    };
    rooms.push(room);
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) grid[py][px] = TILE.FLOOR;
    }
  }

  rooms.sort((a, b) => a.cx - b.cx);
  rooms.forEach((room, index) => {
    room.role = index === rooms.length - 1 ? "exit" : ROOM_ROLES[index % ROOM_ROLES.length];
    room.condition = ["Dry", "Damp", "Cold", "Overgrown", "Dust-choked"][Math.floor(rng() * 5)];
    const names = ROOM_NAMES[room.role] ?? ROOM_NAMES.ordinary;
    room.name = names[Math.floor(rng() * names.length)];
  });
  function carve(x, y) {
    if (x > 0 && y > 0 && x < width - 1 && y < height - 1) grid[y][x] = TILE.FLOOR;
  }
  for (let index = 1; index < rooms.length; index++) {
    let x = rooms[index - 1].cx;
    let y = rooms[index - 1].cy;
    const target = rooms[index];
    const horizontalFirst = rng() > 0.5;
    const moveX = () => {
      while (x !== target.cx) {
        carve(x, y);
        x += Math.sign(target.cx - x);
      }
    };
    const moveY = () => {
      while (y !== target.cy) {
        carve(x, y);
        y += Math.sign(target.cy - y);
      }
    };
    if (horizontalFirst) {
      moveX();
      moveY();
    } else {
      moveY();
      moveX();
    }
    carve(x, y);
  }

  // Doors collapse on room thresholds: a floor on a perimeter with passage beyond it.
  rooms.slice(1).forEach((room) => {
    const candidates = [];
    for (let x = room.x; x < room.x + room.w; x++) {
      if (grid[room.y - 1]?.[x] === TILE.FLOOR) candidates.push([x, room.y]);
      if (grid[room.y + room.h]?.[x] === TILE.FLOOR) candidates.push([x, room.y + room.h - 1]);
    }
    for (let y = room.y; y < room.y + room.h; y++) {
      if (grid[y]?.[room.x - 1] === TILE.FLOOR) candidates.push([room.x, y]);
      if (grid[y]?.[room.x + room.w] === TILE.FLOOR) candidates.push([room.x + room.w - 1, y]);
    }
    if (candidates.length) {
      const [dx, dy] = candidates[Math.floor(rng() * candidates.length)];
      grid[dy][dx] = rng() < 0.22 ? TILE.LOCKED : TILE.DOOR;
    }
  });

  // Propagate walls around every collapsed floor cell.
  const floorSnapshot = grid.map((row) => [...row]);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (floorSnapshot[y][x] !== TILE.FLOOR) continue;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (grid[y + oy][x + ox] === TILE.VOID) grid[y + oy][x + ox] = TILE.WALL;
        }
      }
    }
  }

  const roleTiles = {
    entry: TILE.ENTRY,
    exit: TILE.EXIT,
    encounter: TILE.FLOOR,
    safe: TILE.SAFE,
    loot: TILE.LOOT,
    hazard: TILE.TRAP,
    shrine: TILE.SHRINE,
    secret: TILE.SECRET,
  };
  rooms.forEach((room) => {
    const feature = roleTiles[room.role];
    if (feature) grid[room.cy][room.cx] = feature;
    if (room.role === "flooded" || room.role === "ruined") {
      const conditionTile = room.role === "flooded" ? TILE.WATER : TILE.RUBBLE;
      for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
        for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
          if (rng() < 0.32 && grid[y][x] === TILE.FLOOR) grid[y][x] = conditionTile;
        }
      }
    }
  });

  const loot = rooms.filter((room) => room.role === "loot").map((room, index) => ({
    room: `Cache ${index + 1}`,
    roll: Math.floor(rng() * LOOT_TABLE.length) + 1,
    result: LOOT_TABLE[Math.floor(rng() * LOOT_TABLE.length)],
    x: room.cx,
    y: room.cy,
  }));

  // Reveal follows distance from the entrance with a little entropy jitter.
  const origin = rooms[0] ?? { cx: 0, cy: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] !== TILE.VOID) {
        steps.push({
          x,
          y,
          tile: grid[y][x],
          rank: Math.abs(x - origin.cx) + Math.abs(y - origin.cy) + rng() * 8,
        });
      }
    }
  }
  steps.sort((a, b) => a.rank - b.rank);

  return { seed, width, height, grid, rooms, steps, loot, tiles: TILE };
}

/** Bind changing encounter content to stable rooms without mutating dungeon geometry. */
export function placeEncounters(encounters, dungeon, completed = 0) {
  const preferred = dungeon.rooms.filter((room) =>
    !["entry", "exit", "safe", "loot"].includes(room.role)
  );
  const candidates = preferred.length >= 3 ? preferred : dungeon.rooms.slice(1, -1);
  const start = (completed * 3) % candidates.length;
  return encounters.map((encounter, index) => {
    const room = candidates[(start + index) % candidates.length];
    return {
      ...encounter,
      marker: index + 1,
      room: {
        name: room.name,
        role: room.role,
        condition: room.condition,
        x: room.cx,
        y: room.cy,
        coordinates: `${String.fromCharCode(65 + Math.floor(room.cx / 5))}${room.cy + 1}`,
      },
    };
  });
}
