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
  return party.reduce((total, member) => {
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

function budgetBand(difficulty: Difficulty, thresholds: ReturnType<typeof partyThresholds>) {
  const order: Difficulty[] = ["easy", "medium", "hard", "deadly"];
  const index = order.indexOf(difficulty);
  const lower = thresholds[difficulty];
  const upper = index === order.length - 1
    ? Math.round(lower * 1.25)
    : thresholds[order[index + 1]] - 1;
  return { lower, upper, target: Math.round(lower + (upper - lower) * 0.55) };
}

function chooseComposition(
  difficulty: Difficulty,
  thresholds: ReturnType<typeof partyThresholds>,
  partySize: number,
  maximumCr: number,
  seed: string,
) {
  const band = budgetBand(difficulty, thresholds);
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
        });
      }
    }
  }
  if (!options.length) {
    const eligible = CR_XP.filter((row) => row.cr <= maximumCr);
    const nearest = eligible.reduce((best, row) =>
      Math.abs(row.xp - band.target) < Math.abs(best.xp - band.target) ? row : best
    );
    return { count: 1, cr: nearest.cr, baseXp: nearest.xp, adjustedXp: nearest.xp, multiplier: 1 };
  }
  options.sort((a, b) => a.error - b.error || a.count - b.count);
  const rng = createRng(seed);
  return options[Math.floor(rng() * Math.min(5, options.length))];
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

async function getMonsterForCr(cr: number, seed: string, title: string) {
  const list = await api<any>(`/monsters?challenge_rating=${cr}`);
  if (!list.results?.length) throw new Error(`No SRD monsters found for CR ${cr}`);
  const rng = createRng(seed);
  const preferences = monsterNamePreferences(title);
  const thematic = list.results.filter((reference: any) =>
    preferences.some((term) => reference.index.includes(term))
  );
  const pool = thematic.length ? thematic : list.results;
  const reference = pool[Math.floor(rng() * pool.length)];
  const monster = await api<any>(reference.url.replace("/api/2014", ""));
  return {
    index: monster.index,
    name: monster.name,
    cr: monster.challenge_rating,
    xp: monster.xp,
    type: monster.type,
    size: monster.size,
    ac: Array.isArray(monster.armor_class)
      ? Math.max(...monster.armor_class.map((entry: any) => entry.value))
      : monster.armor_class,
    hp: monster.hit_points,
    hitDice: monster.hit_dice,
    speed: monster.speed,
    traits: (monster.special_abilities ?? []).slice(0, 2).map((trait: any) => trait.name),
    actions: (monster.actions ?? []).filter((action: any) =>
      action.attack_bonus || action.damage?.length
    ).slice(0, 2).map((action: any) => action.name),
    source: `${API_BASE}/monsters/${monster.index}`,
  };
}

async function buildMonsterEncounter(
  party: any[],
  encounter: any,
  thresholds: ReturnType<typeof partyThresholds>,
  seed: string,
) {
  const difficulty = desiredDifficulty(encounter.rating);
  const averageLevel = party.reduce((sum, member) => sum + Number(member.level), 0) /
    party.length;
  const maximumCr = difficulty === "deadly" ? averageLevel + 2 : averageLevel;
  const composition = chooseComposition(
    difficulty,
    thresholds,
    party.length,
    maximumCr,
    seed,
  );
  const monster = await getMonsterForCr(composition.cr, seed, encounter.title);
  const baseXp = monster.xp * composition.count;
  const adjustedXp = Math.round(baseXp * composition.multiplier);
  return {
    difficulty: classifyAdjustedXp(adjustedXp, thresholds),
    target: difficulty,
    count: composition.count,
    monster,
    baseXp,
    adjustedXp,
    multiplier: composition.multiplier,
    thresholds,
    rule: `${composition.count} creature${
      composition.count === 1 ? "" : "s"
    } × ${composition.multiplier} encounter multiplier`,
    safety: `CR ${monster.cr} checked against party average level ${averageLevel.toFixed(1)} (cap ${
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
  const thresholds = partyThresholds(party);
  const averageLevel = party.reduce((sum, member) => sum + Number(member.level), 0) / party.length;
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
      party,
      encounter,
      thresholds,
      `${seed}:${index}:${hashSeed(encounter.title)}`,
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
