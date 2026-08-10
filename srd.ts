import { createRng, hashSeed } from "./public/lib/adventure.js";

const API_BASE = "https://www.dnd5eapi.co/api/2014";
const CACHE_TTL = 1000 * 60 * 60;
const cache = new Map<string, { expires: number; value: unknown }>();

export const XP_THRESHOLDS = [
  null,
  { easy: 25, medium: 50, hard: 75, deadly: 100 },
  { easy: 50, medium: 100, hard: 150, deadly: 200 },
  { easy: 75, medium: 150, hard: 225, deadly: 400 },
  { easy: 125, medium: 250, hard: 375, deadly: 500 },
  { easy: 250, medium: 500, hard: 750, deadly: 1100 },
  { easy: 300, medium: 600, hard: 900, deadly: 1400 },
  { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
  { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
  { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
  { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
  { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
  { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
  { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
  { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
  { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
  { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
  { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
  { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
  { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
  { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 },
];

export const CR_XP = [
  { cr: 0, xp: 10 },
  { cr: 0.125, xp: 25 },
  { cr: 0.25, xp: 50 },
  { cr: 0.5, xp: 100 },
  { cr: 1, xp: 200 },
  { cr: 2, xp: 450 },
  { cr: 3, xp: 700 },
  { cr: 4, xp: 1100 },
  { cr: 5, xp: 1800 },
  { cr: 6, xp: 2300 },
  { cr: 7, xp: 2900 },
  { cr: 8, xp: 3900 },
  { cr: 9, xp: 5000 },
  { cr: 10, xp: 5900 },
  { cr: 11, xp: 7200 },
  { cr: 12, xp: 8400 },
  { cr: 13, xp: 10000 },
  { cr: 14, xp: 11500 },
  { cr: 15, xp: 13000 },
  { cr: 16, xp: 15000 },
  { cr: 17, xp: 18000 },
  { cr: 18, xp: 20000 },
  { cr: 19, xp: 22000 },
  { cr: 20, xp: 25000 },
  { cr: 21, xp: 33000 },
];

type Difficulty = "easy" | "medium" | "hard" | "deadly";

async function api<T>(path: string): Promise<T> {
  const key = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value as T;
  const response = await fetch(key, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`5e SRD API returned ${response.status} for ${path}`);
  const value = await response.json();
  cache.set(key, { expires: Date.now() + CACHE_TTL, value });
  return value as T;
}

function classIndex(name: string): string {
  return name.trim().toLowerCase().replaceAll(" ", "-");
}

export function partyThresholds(party: Array<{ level: number }>) {
  return party.filter((member: any) => !member.dead).reduce((total, member) => {
    const row = XP_THRESHOLDS[Math.max(1, Math.min(20, Number(member.level)))]!;
    total.easy += row.easy;
    total.medium += row.medium;
    total.hard += row.hard;
    total.deadly += row.deadly;
    return total;
  }, { easy: 0, medium: 0, hard: 0, deadly: 0 });
}

export function encounterMultiplier(count: number, partySize: number): number {
  const bands = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
  let index = count <= 1
    ? 1
    : count === 2
    ? 2
    : count <= 6
    ? 3
    : count <= 10
    ? 4
    : count <= 14
    ? 5
    : 6;
  if (partySize < 3) index += 1;
  if (partySize >= 6) index -= 1;
  return bands[Math.max(0, Math.min(bands.length - 1, index))];
}

export function splitEncounterCount(count: number): number[] {
  const total = Math.max(1, Math.floor(Number(count)));
  if (total < 2) return [total];
  return [Math.ceil(total / 2), Math.floor(total / 2)];
}

export function classifyAdjustedXp(
  adjustedXp: number,
  thresholds: ReturnType<typeof partyThresholds>,
): Difficulty {
  if (adjustedXp >= thresholds.deadly) return "deadly";
  if (adjustedXp >= thresholds.hard) return "hard";
  if (adjustedXp >= thresholds.medium) return "medium";
  return "easy";
}

function desiredDifficulty(rating: string): Difficulty {
  return rating === "Deadly"
    ? "deadly"
    : rating === "Hard"
    ? "hard"
    : rating === "Moderate"
    ? "medium"
    : "easy";
}

type PartyCondition = {
  readiness?: number;
  hpRatio?: number;
  criticalMembers?: number;
  aoeRating?: number;
  rangedRating?: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function conditionBudgetBand(
  difficulty: Difficulty,
  thresholds: ReturnType<typeof partyThresholds>,
  condition: PartyCondition = {},
) {
  const order: Difficulty[] = ["easy", "medium", "hard", "deadly"];
  const index = order.indexOf(difficulty);
  const lower = thresholds[difficulty];
  const upper = index === order.length - 1
    ? Math.round(lower * 1.25)
    : thresholds[order[index + 1]] - 1;
  const readiness = clamp(Number(condition.readiness ?? .6), 0, 1);
  const hpRatio = clamp(Number(condition.hpRatio ?? readiness), 0, 1);
  const conditionScore = hpRatio * .7 + readiness * .3;
  let percentile = .12 + conditionScore * .72;
  if (Number(condition.criticalMembers ?? 0) > 0) percentile = Math.min(percentile, .22);
  percentile = clamp(percentile, .12, .84);
  return {
    lower,
    upper,
    target: Math.round(lower + (upper - lower) * percentile),
    percentile,
    conditionScore,
  };
}

export function chooseComposition(
  difficulty: Difficulty,
  thresholds: ReturnType<typeof partyThresholds>,
  partySize: number,
  maximumCr: number,
  seed: string,
  condition: PartyCondition = {},
) {
  const band = conditionBudgetBand(difficulty, thresholds, condition);
  const desiredCount = Math.max(
    1,
    Math.floor(
      1 + band.conditionScore * (Math.min(6, partySize + 1) - 1) +
        Math.max(0, Number(condition.aoeRating ?? 3) - 3) * .35,
    ),
  );
  const options = [];
  for (let count = 1; count <= 8; count++) {
    const multiplier = encounterMultiplier(count, partySize);
    for (const row of CR_XP) {
      if (row.cr > maximumCr) continue;
      const adjustedXp = Math.round(row.xp * count * multiplier);
      if (adjustedXp >= band.lower && adjustedXp <= band.upper) {
        options.push({
          count,
          cr: row.cr,
          baseXp: row.xp * count,
          adjustedXp,
          multiplier,
          error: Math.abs(adjustedXp - band.target),
          countError: Math.abs(count - desiredCount),
          score: Math.abs(adjustedXp - band.target) / Math.max(1, band.upper - band.lower) +
            Math.abs(count - desiredCount) * .2 +
            (band.conditionScore < .62 && adjustedXp > band.target
              ? Math.abs(adjustedXp - band.target) /
                Math.max(1, band.upper - band.lower) * 1.25
              : 0),
        });
      }
    }
  }
  if (!options.length) {
    const eligible = CR_XP.filter((row) => row.cr <= maximumCr);
    const nearest = eligible.reduce((best, row) =>
      Math.abs(row.xp - band.target) < Math.abs(best.xp - band.target) ? row : best
    );
    return {
      count: 1,
      cr: nearest.cr,
      baseXp: nearest.xp,
      adjustedXp: nearest.xp,
      multiplier: 1,
      band,
      desiredCount,
    };
  }
  options.sort((a, b) =>
    a.score - b.score || a.error - b.error || a.countError - b.countError || a.count - b.count ||
    a.cr - b.cr
  );
  const rng = createRng(seed);
  const bestScore = options[0].score;
  const equallyClose = options.filter((option) => Math.abs(option.score - bestScore) < .0001).slice(
    0,
    3,
  );
  return {
    ...equallyClose[Math.floor(rng() * equallyClose.length)],
    band,
    desiredCount,
  };
}

export function chooseBossComposition(
  difficulty: Difficulty,
  thresholds: ReturnType<typeof partyThresholds>,
  partySize: number,
  maximumCr: number,
  condition: PartyCondition = {},
) {
  const band = conditionBudgetBand(difficulty, thresholds, condition);
  const candidates = [];
  for (const boss of CR_XP.filter((entry) => entry.cr <= maximumCr && entry.cr >= .5)) {
    for (const minion of CR_XP.filter((entry) => entry.cr < boss.cr)) {
      for (let minionCount = 1; minionCount <= 4; minionCount++) {
        const count = 1 + minionCount;
        const baseXp = boss.xp + minion.xp * minionCount;
        const multiplier = encounterMultiplier(count, partySize);
        const adjustedXp = Math.round(baseXp * multiplier);
        if (adjustedXp < band.lower || adjustedXp > band.upper) continue;
        if (classifyAdjustedXp(adjustedXp, thresholds) !== difficulty) continue;
        if (boss.xp < minion.xp * minionCount * .6) continue;
        candidates.push({
          cr: boss.cr,
          minionCr: minion.cr,
          minionCount,
          count,
          baseXp,
          adjustedXp,
          multiplier,
          band,
          desiredCount: count,
          score: Math.abs(adjustedXp - band.target) - boss.xp * .015,
        });
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score || b.cr - a.cr);
  return candidates[0] ?? null;
}

function totalSlots(spellcasting: Record<string, number> | undefined) {
  if (!spellcasting) return 0;
  return Object.entries(spellcasting).filter(([key]) => key.startsWith("spell_slots_level_"))
    .reduce((sum, [, value]) => sum + Number(value || 0), 0);
}

export function normalizeClassLevel(data: any, className: string) {
  const index = classIndex(className);
  const resources: Array<Record<string, unknown>> = [];
  for (let level = 1; level <= 9; level++) {
    const maximum = Number(data.spellcasting?.[`spell_slots_level_${level}`] ?? 0);
    if (maximum > 0) {
      resources.push({
        key: `slot-${level}`,
        label: `Level ${level} spell slots`,
        current: maximum,
        maximum,
        recharge: index === "warlock" ? "Short rest" : "Long rest",
        source: "class level",
      });
    }
  }
  const specific = data.class_specific ?? {};
  const add = (key: string, label: string, maximum: unknown, recharge: string, detail?: string) => {
    if (Number(maximum) > 0) {
      resources.push({
        key,
        label,
        current: Number(maximum),
        maximum: Number(maximum),
        recharge,
        source: "class level",
        detail,
      });
    }
  };
  if (index === "barbarian") {
    add(
      "rage",
      "Rages",
      specific.rage_count,
      "Long rest",
      `+${specific.rage_damage_bonus ?? 0} rage damage`,
    );
  }
  if (index === "cleric") {
    add("channel-divinity", "Channel Divinity", specific.channel_divinity_charges, "Short rest");
  }
  if (index === "druid" && data.level >= 2) {
    add(
      "wild-shape",
      "Wild Shape",
      2,
      "Short rest",
      `Maximum CR ${specific.wild_shape_max_cr}; swim ${
        specific.wild_shape_swim ? "yes" : "no"
      }; fly ${specific.wild_shape_fly ? "yes" : "no"}`,
    );
    resources.at(-1)!.source = "linked Wild Shape feature";
  }
  if (index === "fighter") {
    add("action-surge", "Action Surge", specific.action_surges, "Short rest");
    add("indomitable", "Indomitable", specific.indomitable_uses, "Long rest");
  }
  if (index === "monk") add("ki", "Ki points", specific.ki_points, "Short rest");
  if (index === "sorcerer") add("sorcery", "Sorcery points", specific.sorcery_points, "Long rest");

  const notes = [];
  if (specific.bardic_inspiration_die) {
    notes.push(
      `Bardic Inspiration d${specific.bardic_inspiration_die}; uses depend on Charisma modifier.`,
    );
  }
  if (specific.arcane_recovery_levels) {
    notes.push(
      `Arcane Recovery restores up to ${specific.arcane_recovery_levels} combined spell levels once per day.`,
    );
  }
  if (specific.invocations_known) {
    notes.push(`${specific.invocations_known} eldritch invocations known.`);
  }
  return {
    class: data.class?.name ?? className,
    level: data.level,
    proficiencyBonus: data.prof_bonus,
    resources,
    resourceTotal: resources.reduce((sum, resource) => sum + Number(resource.maximum), 0),
    spellSlotTotal: totalSlots(data.spellcasting),
    features: (data.features ?? []).map((feature: any) => feature.name),
    notes,
    source: `${API_BASE}/classes/${index}/levels/${data.level}`,
  };
}

export async function getClassProfile(className: string, level: number) {
  const index = classIndex(className);
  const data = await api<any>(`/classes/${index}/levels/${Math.max(1, Math.min(20, level))}`);
  return normalizeClassLevel(data, className);
}

export async function getConditions() {
  const list = await api<any>("/conditions");
  return {
    conditions: (list.results ?? []).map((condition: any) => ({
      index: condition.index,
      name: condition.name,
      source: `${API_BASE}/conditions/${condition.index}`,
    })),
    dataSource: API_BASE,
  };
}

export async function hydratePartyResources(party: any[]) {
  const classProfiles = await Promise.all(
    party.map(async (member) => ({
      id: member.id,
      profile: await getClassProfile(member.class, member.level),
    })),
  );
  const hydratedParty = party.map((member) => {
    const profile = classProfiles.find((entry) => entry.id === member.id)!.profile;
    const existing = new Map(
      (member.resources ?? []).map((resource: any) => [resource.key, resource]),
    );
    const legacyRatio = Math.max(
      0,
      Math.min(1, Number(member.resource ?? 0) / Math.max(1, Number(member.maxResource ?? 1))),
    );
    const resources = profile.resources.map((resource: any) => ({
      ...resource,
      current: Math.min(
        Number(
          (existing.get(resource.key) as any)?.current ??
            Math.round(Number(resource.maximum) * legacyRatio),
        ),
        Number(resource.maximum),
      ),
    }));
    const resource = resources.reduce((sum: number, pool: any) => sum + Number(pool.current), 0);
    const maxResource = resources.reduce((sum: number, pool: any) => sum + Number(pool.maximum), 0);
    return {
      ...member,
      resources,
      resource: maxResource ? resource : member.resource,
      maxResource: maxResource || member.maxResource,
    };
  });
  return { party: hydratedParty, classProfiles };
}

function monsterNamePreferences(title: string) {
  const lowered = title.toLowerCase();
  if (/goblin|spore-king/.test(lowered)) {
    return ["goblin", "hobgoblin", "bugbear"];
  }
  if (/demon|devil|fiend|infernal|ashen foreman|chain-smith|furnace/.test(lowered)) {
    return [
      "demon",
      "devil",
      "imp",
      "quasit",
      "dretch",
      "vrock",
      "hezrou",
      "glabrezu",
      "balor",
    ];
  }
  if (/drowned|silt|sluice|grotto|oracle/.test(lowered)) {
    return ["merrow", "sahuagin", "water", "crocodile", "frog", "ooze", "chuul"];
  }
  if (/veyr|undead|zombie|grave|ossuary|bone/.test(lowered)) {
    return ["skeleton", "zombie", "ghoul", "specter", "shadow", "wight", "mummy"];
  }
  if (/bone|marrow|funeral|saint|death/.test(lowered)) {
    return ["skeleton", "zombie", "ghoul", "specter", "shadow", "wight"];
  }
  if (/paper|rust|candle|cartographer|armor/.test(lowered)) {
    return ["animated", "flying-sword", "rug-of-smothering", "golem", "gargoyle"];
  }
  if (/moss|garden|fruit|root/.test(lowered)) {
    return ["tree", "fungus", "dryad", "shambling", "vine"];
  }
  if (/storm|lantern|wax|mill|tide/.test(lowered)) {
    return ["mephit", "elemental", "magmin", "will-o-wisp"];
  }
  return [];
}

const THEME_MONSTER_PREFERENCES: Record<string, string[]> = {
  "moss-forest": [
    "goblin",
    "hobgoblin",
    "bugbear",
    "blight",
    "fungus",
    "dryad",
    "tree",
    "vine",
    "shambling",
    "spider",
    "snake",
    "frog",
    "toad",
    "wasp",
    "wolf",
    "boar",
    "bear",
    "ettercap",
  ],
  "drowned-grotto": [
    "sahuagin",
    "merrow",
    "water",
    "crocodile",
    "frog",
    "shark",
    "octopus",
    "crab",
    "sea-horse",
    "snake",
    "chuul",
    "ooze",
    "whale",
    "hydra",
  ],
  ossuary: [
    "skeleton",
    "zombie",
    "ghoul",
    "ghost",
    "specter",
    "shadow",
    "wight",
    "wraith",
    "mummy",
    "banshee",
    "revenant",
    "flameskull",
    "death-knight",
  ],
  "infernal-foundry": [
    "demon",
    "devil",
    "imp",
    "quasit",
    "dretch",
    "vrock",
    "hezrou",
    "glabrezu",
    "balor",
  ],
};

async function getMonsterForCr(cr: number, seed: string, encounter: any, excluded: string[] = []) {
  const list = await api<any>(`/monsters?challenge_rating=${cr}`);
  if (!list.results?.length) throw new Error(`No SRD monsters found for CR ${cr}`);
  const rng = createRng(seed);
  const preferences = [
    ...monsterNamePreferences(encounter.title),
    ...(THEME_MONSTER_PREFERENCES[encounter.themeId] ?? []),
  ];
  const thematic = list.results.filter((reference: any) => {
    const tokens = String(reference.index).split("-");
    return preferences.some((term) =>
      term.includes("-") ? reference.index.includes(term) : tokens.includes(term)
    );
  });
  const preferredPool = thematic.length ? thematic : list.results;
  let pool = preferredPool.filter((reference: any) => !excluded.includes(reference.index));
  if (!pool.length && thematic.length) {
    pool = list.results.filter((reference: any) => !excluded.includes(reference.index));
  }
  if (!pool.length) throw new Error(`No additional SRD monsters found for CR ${cr}`);
  const reference = pool[Math.floor(rng() * pool.length)];
  const monster = await api<any>(reference.url.replace("/api/2014", ""));
  return {
    index: monster.index,
    name: monster.name,
    cr: monster.challenge_rating,
    xp: monster.xp,
    type: monster.type,
    subtype: monster.subtype,
    size: monster.size,
    ac: Array.isArray(monster.armor_class)
      ? Math.max(...monster.armor_class.map((entry: any) => entry.value))
      : monster.armor_class,
    hp: monster.hit_points,
    dexterity: monster.dexterity,
    initiativeModifier: Math.floor((Number(monster.dexterity) - 10) / 2),
    hitDice: monster.hit_dice,
    speed: monster.speed,
    traits: (monster.special_abilities ?? []).slice(0, 2).map((trait: any) => trait.name),
    actions: (monster.actions ?? []).filter((action: any) =>
      action.attack_bonus || action.damage?.length
    ).slice(0, 2).map((action: any) => action.name),
    source: `${API_BASE}/monsters/${monster.index}`,
    themeMatched: thematic.some((candidate: any) => candidate.index === reference.index),
  };
}

function applyEncounterMonsterTheme(monster: any, encounter: any) {
  if (monster.themeMatched) return monster;
  const reskins: Record<string, { prefix: string; type?: string; subtype?: string }> = {
    "moss-forest": { prefix: "Mossbound" },
    "drowned-grotto": { prefix: "Drowned" },
    ossuary: { prefix: "Risen", type: "undead" },
    "infernal-foundry": { prefix: "Devilbound", type: "fiend", subtype: "devil" },
  };
  const reskin = reskins[encounter.themeId];
  if (!reskin) return monster;
  return {
    ...monster,
    originalName: monster.name,
    name: `${reskin.prefix} ${monster.name}`,
    type: reskin.type ?? monster.type,
    subtype: reskin.subtype ?? monster.subtype,
    themedReskin: `${
      encounter.themeId.replaceAll("-", " ")
    } reskin using the linked SRD statistics.`,
  };
}

async function buildMonsterEncounter(
  party: any[],
  encounter: any,
  thresholds: ReturnType<typeof partyThresholds>,
  seed: string,
  condition: PartyCondition,
) {
  const difficulty = desiredDifficulty(encounter.rating);
  const averageLevel = party.reduce((sum, member) => sum + Number(member.level), 0) /
    party.length;
  const maximumCr = difficulty === "deadly" ? averageLevel + 2 : averageLevel;
  const regularComposition = chooseComposition(
    difficulty,
    thresholds,
    party.length,
    maximumCr,
    seed,
    condition,
  );
  const composition: any = encounter.boss
    ? chooseBossComposition(difficulty, thresholds, party.length, maximumCr, condition) ??
      regularComposition
    : regularComposition;
  let monster: any = applyEncounterMonsterTheme(
    await getMonsterForCr(composition.cr, seed, encounter),
    encounter,
  );
  let secondaryMonster: any = null;
  if (encounter.boss && composition.minionCount) {
    try {
      secondaryMonster = applyEncounterMonsterTheme(
        await getMonsterForCr(
          composition.minionCr,
          `${seed}:spawned-minion`,
          encounter,
          [monster.index],
        ),
        encounter,
      );
    } catch {
      secondaryMonster = null;
    }
  } else if (composition.count >= 2) {
    try {
      const candidate = applyEncounterMonsterTheme(
        await getMonsterForCr(
          composition.cr,
          `${seed}:secondary`,
          encounter,
          [monster.index],
        ),
        encounter,
      );
      if (candidate.xp === monster.xp) secondaryMonster = candidate;
    } catch {
      // A CR with only one available stat block remains a single-creature-type encounter.
    }
  }
  const groups: any[] = secondaryMonster && encounter.boss
    ? [
      { count: 1, monster, role: "boss", spawned: false },
      {
        count: composition.minionCount,
        monster: secondaryMonster,
        role: "spawned minion",
        spawned: true,
      },
    ]
    : secondaryMonster
    ? splitEncounterCount(composition.count).map((count, index) => ({
      count,
      monster: index === 0 ? monster : secondaryMonster,
      role: "enemy",
      spawned: false,
    }))
    : [{ count: composition.count, monster }];
  const baseXp = groups.reduce((sum, group) => sum + group.monster.xp * group.count, 0);
  const adjustedXp = Math.round(baseXp * composition.multiplier);
  const aoeRating = Number(condition.aoeRating ?? 3);
  const actionRatio = composition.count / Math.max(1, party.length);
  const flying = groups.some((group) => Object.keys(group.monster.speed ?? {}).includes("fly"));
  const groupTraits = [...new Set(groups.flatMap((group) => group.monster.traits ?? []))];
  const riskSignals = [
    actionRatio >= 1.5
      ? aoeRating >= 4
        ? `Horde pressure moderated by party AoE ${aoeRating.toFixed(1)}/5`
        : `High action-economy risk; party AoE is only ${aoeRating.toFixed(1)}/5`
      : `Action economy ${composition.count}:${party.length}`,
    flying
      ? Number(condition.rangedRating ?? 3) >= 3.5
        ? "Flight covered by strong ranged capability"
        : "Flight may invalidate melee specialists"
      : null,
    groupTraits.length ? `Traits: ${groupTraits.slice(0, 4).join(", ")}` : null,
  ].filter(Boolean);
  return {
    difficulty: classifyAdjustedXp(adjustedXp, thresholds),
    target: difficulty,
    count: composition.count,
    monster,
    groups,
    composition: encounter.boss && groups.some((group) => group.spawned)
      ? "Solo boss with spawned minions"
      : groups.length > 1
      ? "Mixed SRD group"
      : "Single SRD creature type",
    spawnRule: encounter.boss && groups.some((group) => group.spawned)
      ? `The boss begins alone. Spawn one ${secondaryMonster.name} from its pool at initiative 20 or when the boss first falls below half HP.`
      : null,
    baseXp,
    adjustedXp,
    multiplier: composition.multiplier,
    thresholds,
    conditionTargetXp: composition.band.target,
    conditionPercentile: composition.band.percentile,
    conditionScore: composition.band.conditionScore,
    desiredCount: composition.desiredCount,
    analysis: {
      aoeRating,
      actionRatio,
      risk: actionRatio >= 1.5 && aoeRating < 3 ? "high" : actionRatio > 1 ? "watch" : "controlled",
      signals: riskSignals,
    },
    rule: `${composition.count} creature${
      composition.count === 1 ? "" : "s"
    } × ${composition.multiplier} encounter multiplier`,
    scaling: `${Math.round(composition.band.conditionScore * 100)}% party condition targets the ${
      Math.round(composition.band.percentile * 100)
    }% point of the ${difficulty} XP band`,
    safety: `${
      groups.length > 1 ? `${groups.length} same-CR stat blocks; ` : ""
    }CR ${monster.cr} checked against party average level ${averageLevel.toFixed(1)} (cap ${
      maximumCr.toFixed(1)
    })`,
  };
}

async function getLoot(level: number, seed: string, count = 3) {
  const rarityByTier = level <= 4
    ? ["Common", "Uncommon"]
    : level <= 10
    ? ["Uncommon", "Rare"]
    : level <= 16
    ? ["Rare", "Very Rare"]
    : ["Very Rare", "Legendary"];
  const magicCount = level <= 4 ? 1 : level <= 10 ? 2 : count;
  const gearCount = count - magicCount;
  const [list, gearList] = await Promise.all([
    api<any>("/magic-items"),
    api<any>("/equipment-categories/adventuring-gear"),
  ]);
  const rng = createRng(`${seed}:srd-loot`);
  const start = Math.floor(rng() * list.results.length);
  const references = Array.from(
    { length: 12 },
    (_, index) => list.results[(start + index * 17) % list.results.length],
  );
  const details = await Promise.all(
    references.map((reference: any) =>
      api<any>(reference.url.replace("/api/2014", "")).catch(() => null)
    ),
  );
  const selected = details.filter((item) =>
    item && rarityByTier.includes(item.rarity?.name) && item.rarity?.name !== "Varies"
  ).slice(0, magicCount);
  const rarityOrder = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"];
  const targetRanks = rarityByTier.map((rarity) => rarityOrder.indexOf(rarity));
  const fallback = details.filter(Boolean).filter((item) =>
    !selected.includes(item) && item.rarity?.name !== "Varies"
  ).sort((a, b) => {
    const distance = (item: any) =>
      Math.min(
        ...targetRanks.map((rank) => Math.abs(rarityOrder.indexOf(item.rarity?.name) - rank)),
      );
    return distance(a) - distance(b);
  }).slice(
    0,
    magicCount - selected.length,
  );
  const magicItems = [...selected, ...fallback].map((item) => ({
    index: item.index,
    name: item.name,
    rarity: item.rarity?.name ?? "Unknown",
    description: item.desc?.[0] ?? "See the SRD item entry.",
    source: `${API_BASE}/magic-items/${item.index}`,
  }));

  const usefulGear = new Set([
    "acid-vial",
    "alchemists-fire-flask",
    "antitoxin-vial",
    "ball-bearings-bag-of-1000",
    "caltrops",
    "healers-kit",
    "holy-water-flask",
    "hunting-trap",
    "poison-basic-vial",
    "rope-silk-50-feet",
  ]);
  const gearPool = gearList.equipment.filter((item: any) => usefulGear.has(item.index));
  const gearStart = Math.floor(rng() * gearPool.length);
  const gearReferences = Array.from(
    { length: gearCount },
    (_, index) => gearPool[(gearStart + index * 3) % gearPool.length],
  );
  const gearDetails = await Promise.all(
    gearReferences.map((reference: any) => api<any>(reference.url.replace("/api/2014", ""))),
  );
  const gearItems = gearDetails.map((item) => ({
    index: item.index,
    name: item.name,
    rarity: item.cost ? `${item.cost.quantity} ${item.cost.unit}` : "Adventuring gear",
    description: item.desc?.[0] ?? item.equipment_category?.name ?? "Adventuring gear",
    source: `${API_BASE}/equipment/${item.index}`,
  }));
  return [...magicItems, ...gearItems];
}

export async function enrichWithSrd(
  party: any[],
  forecast: any,
  seed: string,
  suppliedClassProfiles?: any[],
) {
  const activeParty = party.filter((member) => !member.dead);
  const thresholds = partyThresholds(activeParty);
  const averageLevel = activeParty.reduce((sum, member) => sum + Number(member.level), 0) /
    activeParty.length;
  const classProfilesPromise = suppliedClassProfiles
    ? Promise.resolve(suppliedClassProfiles)
    : Promise.all(
      party.map(async (member) => ({
        id: member.id,
        profile: await getClassProfile(member.class, member.level),
      })),
    );
  const encounterPromises = forecast.encounters.map(async (encounter: any, index: number) => {
    const shouldHaveMonsters = encounter.kind === "combat";
    if (!shouldHaveMonsters) {
      return { ...encounter, officialDifficulty: desiredDifficulty(encounter.rating), thresholds };
    }
    const combat = await buildMonsterEncounter(
      activeParty,
      encounter,
      thresholds,
      `${seed}:${index}:${hashSeed(encounter.title)}`,
      {
        readiness: forecast.profile?.planningReadiness ?? forecast.profile?.readiness,
        hpRatio: forecast.profile?.hpRatio,
        criticalMembers: forecast.profile?.critical,
        aoeRating: forecast.profile?.capabilities?.aoe,
        rangedRating: forecast.profile?.capabilities?.ranged,
      },
    );
    return {
      ...encounter,
      budget: combat.adjustedXp,
      officialDifficulty: combat.difficulty,
      combat,
    };
  });
  const [classProfiles, encounters, loot] = await Promise.all([
    classProfilesPromise,
    Promise.all(encounterPromises),
    getLoot(averageLevel, seed),
  ]);
  return {
    ...forecast,
    encounters,
    classProfiles,
    loot,
    rules: {
      edition: "2014 SRD",
      thresholds,
      source: "https://www.dndbeyond.com/sources/dnd/basic-rules-2014/building-combat-encounters",
    },
    dataSource: API_BASE,
  };
}
