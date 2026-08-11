import {
  analyzeParty,
  applyForecastControls,
  averageHitPointMaximum,
  buildEncounterForecast,
  classCapability,
  classResourceDependency,
  floorTheme,
  generateDungeon,
  hitDiceState,
  memberResourceState,
  placeEncounters,
  takeLongRest,
  takeShortRest,
} from "../public/lib/adventure.js";
import {
  chooseBossComposition,
  chooseComposition,
  classifyAdjustedXp,
  conditionBudgetBand,
  desiredCreatureCount,
  encounterMultiplier,
  monsterPreferenceWeight,
  normalizeClassLevel,
  partyThresholds,
  splitEncounterCount,
} from "../srd.ts";
import { learningModel, outcomeSample } from "../public/lib/campaign.js";

const PARTY = [
  { name: "Mira", level: 4, hp: 27, maxHp: 31, ac: 16, resource: 3, maxResource: 4 },
  { name: "Orin", level: 4, hp: 21, maxHp: 25, ac: 14, resource: 2, maxResource: 3 },
];

Deno.test("party analysis produces a bounded readiness score", () => {
  const profile = analyzeParty(PARTY);
  if (profile.readiness <= 0 || profile.readiness >= 1) throw new Error("unbounded readiness");
  if (profile.budget <= 0) throw new Error("missing budget");
});

Deno.test("average character HP uses class Hit Die and CON at every level", () => {
  if (averageHitPointMaximum({ class: "Fighter", level: 4, conModifier: 2 }) !== 36) {
    throw new Error("fighter average HP was calculated incorrectly");
  }
  if (averageHitPointMaximum({ class: "Wizard", level: 4, conModifier: 1 }) !== 22) {
    throw new Error("wizard average HP was calculated incorrectly");
  }
});

Deno.test("fresh party condition and planning readiness reach 100%", () => {
  const rested = PARTY.map((member) => ({
    ...member,
    hp: member.maxHp,
    resource: member.maxResource,
  }));
  const profile = analyzeParty(rested);
  if (profile.displayCondition !== 1) throw new Error("rested visual condition is not 100%");
  if (profile.readiness !== 1) {
    throw new Error("fresh party readiness was reduced by fixed capabilities");
  }
  const forecast = buildEncounterForecast(rested, "fresh-party", 0, 1, { calibration: 1 });
  if (forecast.profile.planningReadiness !== 1) {
    throw new Error("fresh party planning score was not 100%");
  }
});

Deno.test("AoE capability softly shifts group size without banning groups", () => {
  const lowAoe = desiredCreatureCount(4, .65, 1);
  const highAoe = desiredCreatureCount(4, .65, 5);
  if (lowAoe < 2) throw new Error("low AoE removed group encounters");
  if (highAoe <= lowAoe) throw new Error("AoE capability did not influence group preference");
});

Deno.test("limited AoE only attracts larger groups while its providers have resources", () => {
  const providers = Array.from({ length: 4 }, (_, index) => ({
    id: `cleric-${index}`,
    name: `Cleric ${index}`,
    class: "Cleric",
    level: 5,
    hp: 35,
    maxHp: 35,
    ac: 18,
    resource: 5,
    maxResource: 5,
  }));
  const supplied = analyzeParty(providers);
  const depleted = analyzeParty(providers.map((member) => ({ ...member, resource: 0 })));
  if (supplied.capabilities.aoe < 4) {
    throw new Error("supplied AoE providers were not recognized");
  }
  if (depleted.capabilities.aoe >= 3) {
    throw new Error("depleted limited AoE still attracted high-AoE encounters");
  }
  const suppliedCount = desiredCreatureCount(4, .8, supplied.capabilities.aoe);
  const depletedCount = desiredCreatureCount(4, .8, depleted.capabilities.aoe);
  if (suppliedCount <= depletedCount) {
    throw new Error("AoE resources did not affect the larger-group preference");
  }
  if (depletedCount < 2) throw new Error("depleted AoE incorrectly banned group encounters");
});

Deno.test("high armour favors player-save monsters without excluding attack rolls", () => {
  const saveMonster = { saves: ["DEX"], bypassesAc: true, control: false };
  const attackMonster = { saves: [], bypassesAc: false, control: false };
  const normalWeight = monsterPreferenceWeight(saveMonster, { defense: 14, weakSaves: ["DEX"] });
  const highArmorWeight = monsterPreferenceWeight(saveMonster, {
    defense: 20,
    weakSaves: ["DEX"],
  });
  const attackWeight = monsterPreferenceWeight(attackMonster, { defense: 20 });
  const specialistWeight = monsterPreferenceWeight(saveMonster, {
    defense: 14,
    maximumDefense: 21,
    weakSaves: ["DEX"],
  });
  const thresholdWeight = monsterPreferenceWeight(saveMonster, {
    defense: 14,
    maximumDefense: 20,
    weakSaves: ["DEX"],
  });
  if (highArmorWeight <= normalWeight) {
    throw new Error("high armour did not increase player-save monster preference");
  }
  if (specialistWeight <= normalWeight) {
    throw new Error("an individual above AC 20 did not activate save pressure");
  }
  if (thresholdWeight !== normalWeight) {
    throw new Error("individual armour pressure activated before exceeding AC 20");
  }
  if (attackWeight <= 0) throw new Error("high armour excluded ordinary attack-roll monsters");
});

Deno.test("fallen adventurers are excluded from readiness and XP thresholds", () => {
  const living = { ...PARTY[0] };
  const fallen = { ...PARTY[1], level: 20, hp: 0, dead: true };
  const profile = analyzeParty([living, fallen]);
  if (profile.members !== 1 || profile.averageLevel !== living.level) {
    throw new Error("fallen member still affects party analysis");
  }
  const thresholds = partyThresholds([living, fallen]);
  const expected = partyThresholds([living]);
  if (JSON.stringify(thresholds) !== JSON.stringify(expected)) {
    throw new Error("fallen member still affects encounter XP thresholds");
  }
});

Deno.test("dungeon geometry is deterministic", () => {
  const first = generateDungeon("vault-13");
  const second = generateDungeon("vault-13");
  if (JSON.stringify(first.grid) !== JSON.stringify(second.grid)) {
    throw new Error("geometry changed");
  }
  if (first.rooms.length < 4) throw new Error("not enough rooms generated");
});

Deno.test("floor size and requested room count independently shape generation", () => {
  const small = generateDungeon("sized-floor", 55, 31, {
    floorSize: "small",
    roomCount: 15,
    noveltyOpenRegions: false,
  });
  const large = generateDungeon("sized-floor", 55, 31, {
    floorSize: "large",
    roomCount: 15,
    noveltyOpenRegions: false,
  });
  if (small.rooms.length !== 15 || large.rooms.length !== 15) {
    throw new Error("requested room count was not produced");
  }
  if (small.width >= large.width || small.height >= large.height) {
    throw new Error("floor size did not change generation dimensions");
  }
  const massive = generateDungeon("sized-floor", 55, 31, {
    floorSize: "massive",
    roomCount: 12,
  });
  const zonedArea = massive.rooms.reduce((sum, room) => sum + room.w * room.h, 0);
  if (
    massive.layout !== "open-region" || massive.rooms.length !== 12 ||
    massive.rooms.some((room) => !room.openRegionZone) ||
    zonedArea !== (massive.width - 6) * (massive.height - 6) ||
    massive.rooms.filter((room) => room.role === "entry").length !== 1 ||
    massive.rooms.filter((room) => room.role === "exit").length !== 1
  ) {
    throw new Error("massive floors were not generated as one completely zoned open region");
  }
  const novelty = generateDungeon("novelty-5", 55, 31, {
    floorSize: "medium",
    roomCount: 8,
  });
  const ordinary = generateDungeon("novelty-0", 55, 31, {
    floorSize: "medium",
    roomCount: 8,
  });
  if (
    !novelty.noveltyOpenRegion || novelty.floorSize !== "super-massive" ||
    ordinary.noveltyOpenRegion
  ) {
    throw new Error("normal layouts do not occasionally produce a super-massive novelty floor");
  }
});

Deno.test("terrain and trap systems store gameplay data", () => {
  let chasm = false;
  let bridgedChasms = 0;
  let unbridgedChasms = 0;
  let forestFeatures = new Set();
  for (let index = 0; index < 12; index++) {
    const floor = generateDungeon(`terrain-${index}`, 55, 31, { floor: 1 });
    chasm ||= floor.rooms.some((room) => room.terrain.some((feature) => feature.tile === "O"));
    for (const room of floor.rooms) {
      const divide = room.terrain.filter((feature) => ["O", "="].includes(feature.tile));
      if (divide.length) {
        const sameX = new Set(divide.map((feature) => feature.x)).size === 1;
        const sameY = new Set(divide.map((feature) => feature.y)).size === 1;
        const expectedSpan = sameX ? room.h - 2 : room.w - 2;
        if ((!sameX && !sameY) || divide.length !== expectedSpan) {
          throw new Error("a chasm did not span its complete room");
        }
        if (divide.some((feature) => feature.tile === "=")) bridgedChasms += 1;
        else unbridgedChasms += 1;
      }
      for (const feature of room.terrain) {
        forestFeatures.add(feature.tile);
        if (!["_", "&"].includes(feature.tile)) continue;
        const connected = room.terrain.some((neighbor) =>
          neighbor !== feature && neighbor.tile === feature.tile &&
          Math.abs(neighbor.x - feature.x) + Math.abs(neighbor.y - feature.y) === 1
        );
        if (!connected) throw new Error("ice or bush terrain generated as an isolated symbol");
      }
    }
    if (
      !floor.traps.some((trap) => trap.locationType === "hallway") ||
      !floor.traps.some((trap) => trap.locationType === "room")
    ) {
      throw new Error("traps were not independently placed in rooms and hallways");
    }
  }
  if (!chasm || !["_", "w", "&"].every((tile) => forestFeatures.has(tile))) {
    throw new Error("structured chasm or forest terrain was not generated");
  }
  if (unbridgedChasms <= bridgedChasms) {
    throw new Error("most chasms should not contain a bridge");
  }
});

Deno.test("encounters react to party state without touching geometry", () => {
  const fresh = buildEncounterForecast(PARTY, "vault-13", 0);
  const tired = buildEncounterForecast(
    PARTY.map((member) => ({ ...member, hp: 2, resource: 0 })),
    "vault-13",
    1,
  );
  if (fresh.profile.readiness <= tired.profile.readiness) {
    throw new Error("state did not affect readiness");
  }
  if (fresh.encounters[0].id === tired.encounters[0].id) {
    throw new Error("encounter did not advance");
  }
  const freshAverage = fresh.encounters.reduce((sum, encounter) => sum + encounter.budget, 0) / 3;
  const tiredAverage = tired.encounters.reduce((sum, encounter) => sum + encounter.budget, 0) / 3;
  if (tiredAverage >= freshAverage) {
    throw new Error("wounded party did not receive an easier forecast overall");
  }
});

Deno.test("the model controls pacing while theme-ending boss floors end hard", () => {
  const firstFloor = buildEncounterForecast(PARTY, "vault-13", 0, 1);
  const bossFloor = buildEncounterForecast(PARTY, "vault-13", 0, 4);
  if (firstFloor.encounters.some((encounter) => encounter.rating === "Deadly")) {
    throw new Error("deadly encounter appeared outside a boss floor");
  }
  if (bossFloor.encounters[2].rating !== "Hard") {
    throw new Error("theme-ending floor did not end with a hard room");
  }
  const strongParty = PARTY.map((member) => ({
    ...member,
    hp: member.maxHp,
    resource: member.maxResource,
    ac: 20,
  }));
  const crucible = buildEncounterForecast(strongParty, "vault-13", 0, 4);
  if (crucible.encounters[2].rating !== "Deadly") {
    throw new Error("healthy party did not unlock the optional deadly milestone finale");
  }
});

Deno.test("dungeon includes useful room features and conditions", () => {
  const dungeon = generateDungeon("feature-vault");
  const tiles = new Set(dungeon.grid.flat());
  for (const expected of ["+", "S", "$", "^", "†", "~", "%", "?"]) {
    if (!tiles.has(expected)) throw new Error(`missing dungeon feature ${expected}`);
  }
  if (!dungeon.loot.length) throw new Error("missing loot table");
});

Deno.test("floors carry coherent themes, restrictions, and themed encounters", () => {
  const mossFloors = [1, 2, 3, 4].map((floor) => floorTheme(floor).id);
  if (mossFloors.some((id) => id !== "moss-forest")) throw new Error("theme arc ended early");
  const infernal = generateDungeon("theme-vault", 55, 31, { floor: 13 });
  if (infernal.theme.id !== "infernal-foundry") throw new Error("wrong floor theme");
  if (infernal.grid.flat().includes("~")) throw new Error("fire floor generated water");
  if (!infernal.grid.flat().includes("*")) throw new Error("fire floor lacks burning terrain");
  const burningRooms = infernal.rooms.filter((room) => {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (infernal.grid[y]?.[x] === "*") return true;
      }
    }
    return false;
  });
  if (burningRooms.length < Math.floor(infernal.rooms.length * .75)) {
    throw new Error("fire did not spread through enough infernal rooms");
  }
  if (!/no drinkable water/i.test(infernal.restriction)) {
    throw new Error("special floor restriction is not explained");
  }
  const forecast = buildEncounterForecast(PARTY, "theme-vault", 0, 13);
  if (!forecast.quest?.hook || forecast.theme.id !== infernal.theme.id) {
    throw new Error("forecast and map theme disagree");
  }
  if (
    forecast.encounters.some((encounter) =>
      encounter.themeId !== "infernal-foundry" || !encounter.strictThemeEnemies
    )
  ) {
    throw new Error("infernal forecast included an off-theme encounter");
  }
});

Deno.test("every biome exposes selectable feedback modifiers", () => {
  const cases = [
    ["moss-forest", 1, "wild-urges", "Wild Urges"],
    ["drowned-grotto", 5, "siren-song", "Siren Song"],
    ["ossuary", 8, "grave-call", "Grave Call"],
    ["infernal-foundry", 13, "spells-change", "Spells of Change"],
  ];
  for (const [biome, floor, selected, expectedName] of cases) {
    const theme = floorTheme(floor, {
      themeMode: "full-dungeon",
      dungeonTheme: biome,
      biomeOptions: { [biome]: selected },
    });
    if (theme.activeModifier?.name !== expectedName || !theme.activeModifier.rule) {
      throw new Error(`${biome} did not apply ${expectedName}`);
    }
  }
  const disabled = floorTheme(1, {
    themeMode: "full-dungeon",
    dungeonTheme: "moss-forest",
    biomeOptions: { "moss-forest": "none" },
  });
  if (disabled.activeModifier !== null) throw new Error("biome modifier could not be disabled");

  const combined = floorTheme(1, {
    themeMode: "full-dungeon",
    dungeonTheme: "moss-forest",
    biomeOptions: { "moss-forest": ["malicious-roots", "wild-urges"] },
  });
  if (
    combined.activeModifiers.map((modifier) => modifier.id).join(",") !==
      "malicious-roots,wild-urges" || combined.rules.length < 3
  ) {
    throw new Error("multiple modifiers replaced each other or removed base biome rules");
  }
});

Deno.test("random biome modifiers persist for a full dungeon or biome arc", () => {
  const fullContext = {
    themeMode: "full-dungeon",
    dungeonTheme: "moss-forest",
    dungeonSeed: "one-expedition",
    biomeOptions: { "moss-forest": ["random"] },
  };
  const fullModifiers = Array.from(
    { length: 10 },
    (_, index) => floorTheme(index + 1, fullContext).activeModifier.id,
  );
  if (new Set(fullModifiers).size !== 1) {
    throw new Error("a ten-floor biome changed its random modifier between floors");
  }

  const arcContext = {
    dungeonSeed: "arc-expedition",
    themeOrder: ["moss-forest", "drowned-grotto", "ossuary", "infernal-foundry"],
    biomeOptions: { "moss-forest": ["random"] },
  };
  const arcModifiers = [1, 2, 3, 4].map((floor) => floorTheme(floor, arcContext).activeModifier.id);
  if (new Set(arcModifiers).size !== 1) {
    throw new Error("a biome modifier changed during its arc");
  }

  const forecastContext = {
    dungeonSeed: "arc-expedition",
    themeOrder: arcContext.themeOrder,
    settings: { biomeOptions: arcContext.biomeOptions },
  };
  const firstForecast = buildEncounterForecast(PARTY, "floor-seed-a", 0, 1, forecastContext);
  const secondForecast = buildEncounterForecast(PARTY, "floor-seed-b", 0, 2, forecastContext);
  if (firstForecast.themeSignature !== secondForecast.themeSignature) {
    throw new Error("forecast modifiers used the changing floor seed instead of the dungeon seed");
  }

  const expeditionChoices = new Set(
    Array.from(
      { length: 12 },
      (_, index) =>
        floorTheme(1, { ...fullContext, dungeonSeed: `expedition-${index}` }).activeModifier.id,
    ),
  );
  if (expeditionChoices.size < 2) {
    throw new Error("new dungeons cannot receive new random biome modifiers");
  }
});

Deno.test("theme-ending floors add a new dedicated boss arena and lair actions", () => {
  const dungeon = generateDungeon("boss-vault", 55, 31, { floor: 4 });
  const bossRoom = dungeon.rooms.find((room) => room.role === "boss");
  if (!bossRoom?.dedicatedBoss || !bossRoom.bossMechanic || !bossRoom.lairActions?.length) {
    throw new Error("boss arena lacks dedicated mechanics");
  }
  if (!dungeon.rooms.some((room) => room.role === "exit")) {
    throw new Error("boss arena replaced the normal exit room");
  }
  const forecast = buildEncounterForecast(PARTY, "boss-vault", 0, 4);
  const placed = placeEncounters(forecast.encounters, dungeon, 0);
  const boss = placed[2];
  if (
    !boss.boss || !boss.bossMechanic || boss.lairActions.length < 3 || boss.room.x !== bossRoom.cx
  ) {
    throw new Error("dedicated boss was not placed in its arena");
  }
});

Deno.test("boss arenas vary in shape and random map position", () => {
  const variants = new Set();
  const positions = new Set();
  for (let index = 0; index < 18; index++) {
    const dungeon = generateDungeon(`boss-variant-${index}`, 55, 31, { floor: 4 });
    const boss = dungeon.rooms.find((room) => room.dedicatedBoss);
    variants.add(boss.arenaVariant.id);
    positions.add(`${boss.x}:${boss.y}`);
  }
  if (variants.size < 3) throw new Error("boss room variants are not varying");
  if (positions.size < 8) throw new Error("boss rooms are not placed randomly");
});

Deno.test("each theme boss has its own lair actions", () => {
  const moss = buildEncounterForecast(PARTY, "moss-boss", 0, 4).encounters[2];
  const drowned = buildEncounterForecast(PARTY, "drowned-boss", 0, 7).encounters[2];
  const ossuary = buildEncounterForecast(PARTY, "ossuary-boss", 0, 12).encounters[2];
  const infernal = buildEncounterForecast(PARTY, "infernal-boss", 0, 16).encounters[2];
  const actionSets = new Set(
    [moss, drowned, ossuary, infernal].map((boss) => boss.lairActions.join("|")),
  );
  if (actionSets.size !== 4) throw new Error("boss themes reused the same lair actions");
  if (!infernal.lairActions.some((action) => /lava|flame|fire/i.test(action))) {
    throw new Error("infernal boss lacks fire-based lair actions");
  }
});

Deno.test("theme arcs respect a campaign-specific randomized order", () => {
  const order = ["infernal-foundry", "ossuary", "moss-forest", "drowned-grotto"];
  if (floorTheme(1, { themeOrder: order }).id !== "infernal-foundry") {
    throw new Error("custom theme order did not control the first arc");
  }
  if (floorTheme(5, { themeOrder: order }).id !== "ossuary") {
    throw new Error("custom theme order did not advance to the second biome");
  }
  const alternate = ["drowned-grotto", "moss-forest", "infernal-foundry", "ossuary"];
  if (floorTheme(1, { themeOrder: alternate }).id !== "drowned-grotto") {
    throw new Error("different expeditions cannot vary their biome order");
  }
});

Deno.test("map and forecast expose the same complete theme signature", () => {
  const context = {
    themeOrder: ["infernal-foundry", "moss-forest", "ossuary", "drowned-grotto"],
    storyVariant: 1,
    settings: { themeMode: "arcs", dungeonTheme: "random" },
  };
  const dungeon = generateDungeon("matching-theme", 55, 31, {
    floor: 3,
    themeOrder: context.themeOrder,
    storyVariant: context.storyVariant,
    ...context.settings,
  });
  const forecast = buildEncounterForecast(PARTY, "matching-theme", 0, 3, context);
  if (dungeon.themeSignature !== forecast.themeSignature) {
    throw new Error(`${dungeon.themeSignature} did not match ${forecast.themeSignature}`);
  }
  if (dungeon.theme.story.title !== forecast.theme.story.title) {
    throw new Error("map and forecast selected different stories");
  }
});

Deno.test("a full ten-floor biome keeps one story and uses three themed bosses", () => {
  const context = {
    themeMode: "full-dungeon",
    dungeonTheme: "infernal-foundry",
    storyVariant: 1,
  };
  const themes = [1, 4, 7, 10].map((floor) => floorTheme(floor, context));
  if (
    themes.some((theme) =>
      theme.id !== "infernal-foundry" || theme.story.title !== themes[0].story.title
    )
  ) {
    throw new Error("ten-floor mode changed biome or story");
  }
  const bossFloors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((floor) =>
    floorTheme(floor, context).bossFloor
  );
  if (JSON.stringify(bossFloors) !== JSON.stringify([3, 6, 10])) {
    throw new Error(`wrong full-dungeon boss floors: ${bossFloors}`);
  }
  const bossNames = [3, 6, 10].map((floor) =>
    buildEncounterForecast(PARTY, `full-${floor}`, 0, floor, { settings: context }).encounters[2]
      .title
  );
  if (new Set(bossNames).size !== 3) throw new Error("full dungeon reused the same boss");
  const finalMap = generateDungeon("full-infernal", 55, 31, { floor: 10, ...context });
  if (!finalMap.rooms.some((room) => room.dedicatedBoss) || finalMap.grid.flat().includes("~")) {
    throw new Error("full-dungeon boss map broke biome rules");
  }
});

Deno.test("forecasts draw from a varied encounter library", () => {
  const titles = new Set();
  for (let index = 0; index < 20; index++) {
    const forecast = buildEncounterForecast(PARTY, `variety-${index}`, index, 1);
    if (!forecast.encounters.some((encounter) => encounter.kind === "combat")) {
      throw new Error("forecast has no rules-backed combat encounter");
    }
    for (const encounter of forecast.encounters) {
      titles.add(encounter.title);
      if (!encounter.objective || !encounter.twist) {
        throw new Error("encounter lacks playable detail");
      }
    }
  }
  if (titles.size < 18) throw new Error(`encounter variety too low: ${titles.size}`);
});

Deno.test("the next three encounters are assigned to distinct named map rooms", () => {
  const dungeon = generateDungeon("placed-vault");
  const forecast = buildEncounterForecast(PARTY, "placed-vault", 0, 1);
  const placed = placeEncounters(forecast.encounters, dungeon, 0);
  const coordinates = new Set(placed.map((encounter) => encounter.room.coordinates));
  if (coordinates.size !== 3) throw new Error("encounter markers overlap");
  if (placed.some((encounter) => !encounter.room.name)) throw new Error("unnamed encounter room");
});

Deno.test("2014 encounter thresholds reproduce the official mixed-party example", () => {
  const thresholds = partyThresholds([{ level: 3 }, { level: 3 }, { level: 3 }, { level: 2 }]);
  if (
    JSON.stringify(thresholds) !==
      JSON.stringify({ easy: 275, medium: 550, hard: 825, deadly: 1400 })
  ) {
    throw new Error(`incorrect thresholds: ${JSON.stringify(thresholds)}`);
  }
  if (encounterMultiplier(4, 4) !== 2) throw new Error("incorrect group multiplier");
  if (classifyAdjustedXp(1000, thresholds) !== "hard") {
    throw new Error("incorrect XP classification");
  }
});

Deno.test("mixed SRD groups preserve creature count and encounter multiplier", () => {
  for (const count of [2, 3, 4, 5, 8]) {
    const groups = splitEncounterCount(count);
    if (groups.length !== 2 || groups.reduce((sum, value) => sum + value, 0) !== count) {
      throw new Error(`invalid mixed composition for ${count} creatures`);
    }
    if (
      encounterMultiplier(groups.reduce((sum, value) => sum + value, 0), 4) !==
        encounterMultiplier(count, 4)
    ) {
      throw new Error("mixing same-CR creatures changed the official multiplier");
    }
  }
});

Deno.test("boss compositions use one larger enemy and a spawned minion pool", () => {
  const party = Array.from({ length: 4 }, () => ({ level: 5 }));
  const thresholds = partyThresholds(party);
  const composition = chooseBossComposition(
    "deadly",
    thresholds,
    party.length,
    7,
    { hpRatio: 1, resourceRatio: 1 },
  );
  if (!composition || composition.minionCount < 1 || composition.cr <= composition.minionCr) {
    throw new Error("boss did not receive a lower-CR spawned minion pool");
  }
  if (composition.count !== composition.minionCount + 1) {
    throw new Error("boss composition count does not include boss and minions exactly once");
  }
  if (classifyAdjustedXp(composition.adjustedXp, thresholds) !== "deadly") {
    throw new Error("boss composition escaped its selected XP band");
  }
});

Deno.test("party condition moves encounters within the selected official XP band", () => {
  const thresholds = partyThresholds([{ level: 5 }, { level: 5 }, { level: 5 }, { level: 5 }]);
  const wounded = { readiness: .48, hpRatio: .5, criticalMembers: 0 };
  const healthy = { readiness: .82, hpRatio: .9, criticalMembers: 0 };
  const woundedBand = conditionBudgetBand("medium", thresholds, wounded);
  const healthyBand = conditionBudgetBand("medium", thresholds, healthy);
  if (woundedBand.target >= healthyBand.target) {
    throw new Error("lower condition did not lower the target inside the Medium band");
  }
  const woundedFight = chooseComposition("medium", thresholds, 4, 5, "same-room", wounded);
  const healthyFight = chooseComposition("medium", thresholds, 4, 5, "same-room", healthy);
  if (woundedFight.adjustedXp >= healthyFight.adjustedXp) {
    throw new Error("wounded party did not receive a gentler Medium composition");
  }
  if (woundedFight.count > healthyFight.count) {
    throw new Error("wounded party received more enemies than the healthy party");
  }
  if (
    classifyAdjustedXp(woundedFight.adjustedXp, thresholds) !== "medium" ||
    classifyAdjustedXp(healthyFight.adjustedXp, thresholds) !== "medium"
  ) {
    throw new Error("condition scaling escaped the selected difficulty band");
  }
});

Deno.test("past easy outcomes cannot hide a currently depleted party", () => {
  const depleted = [
    {
      name: "Mira",
      class: "Ranger",
      level: 4,
      hp: 36,
      maxHp: 36,
      ac: 16,
      resource: 0,
      maxResource: 3,
    },
    {
      name: "Thorn",
      class: "Fighter",
      level: 4,
      hp: 14,
      maxHp: 42,
      ac: 18,
      resource: 1,
      maxResource: 1,
    },
    {
      name: "Sable",
      class: "Wizard",
      level: 4,
      hp: 7,
      maxHp: 26,
      ac: 13,
      resource: 3,
      maxResource: 7,
    },
    {
      name: "Orr",
      class: "Cleric",
      level: 4,
      hp: 7,
      maxHp: 33,
      ac: 17,
      resource: 0,
      maxResource: 8,
    },
  ];
  const forecast = buildEncounterForecast(depleted, "silent-reliquary-81", 0, 3, {
    calibration: .72,
    settings: {
      trackResources: true,
      trackAfflictions: true,
      themeMode: "full-dungeon",
      dungeonTheme: "ossuary",
    },
  });
  if (forecast.profile.wounded !== 3 || forecast.profile.critical !== 1) {
    throw new Error("depleted member distribution was not recognized");
  }
  if (forecast.profile.planningReadiness >= .55) {
    throw new Error(
      `historical calibration inflated depleted readiness to ${forecast.profile.planningReadiness}`,
    );
  }
  if (Math.abs(forecast.profile.learnedAdjustment) > .071) {
    throw new Error("learned performance adjustment escaped its safety cap");
  }
});

Deno.test("class level normalization exposes druid spell slots and Wild Shape separately", () => {
  const profile = normalizeClassLevel({
    level: 5,
    prof_bonus: 3,
    class: { name: "Druid" },
    features: [],
    spellcasting: {
      spell_slots_level_1: 4,
      spell_slots_level_2: 3,
      spell_slots_level_3: 2,
    },
    class_specific: { wild_shape_max_cr: 0.5, wild_shape_swim: true, wild_shape_fly: false },
  }, "Druid");
  const pools = Object.fromEntries(
    profile.resources.map((resource) => [resource.key, resource.maximum]),
  );
  if (pools["slot-1"] !== 4 || pools["slot-2"] !== 3 || pools["slot-3"] !== 2) {
    throw new Error("spell slots were not preserved");
  }
  if (pools["wild-shape"] !== 2) throw new Error("Wild Shape uses missing");
});

Deno.test("short and long rests update only the appropriate party resources", () => {
  const tired = [{
    id: "fighter",
    name: "Fenn",
    class: "Fighter",
    level: 4,
    hp: 10,
    maxHp: 40,
    conModifier: 2,
    resource: 1,
    maxResource: 5,
    hitDice: { current: 3, maximum: 4, size: 10 },
    resources: [
      { key: "surge", label: "Action Surge", current: 0, maximum: 1, recharge: "Short rest" },
      { key: "other", label: "Daily charge", current: 1, maximum: 4, recharge: "Long rest" },
    ],
  }];
  const short = takeShortRest(tired, { fighter: 2 }, () => .4);
  if (short.party[0].hp !== 24 || short.party[0].hitDice.current !== 1) {
    throw new Error("Hit Dice were not rolled and spent correctly");
  }
  if (short.party[0].resources[0].current !== 1 || short.party[0].resources[1].current !== 1) {
    throw new Error("short rest recovered the wrong resources");
  }
  const long = takeLongRest(short.party);
  if (long[0].hp !== 40 || long[0].resource !== 5 || long[0].hitDice.current !== 4) {
    throw new Error("long rest did not fully restore the adventurer");
  }
  if (hitDiceState({ class: "Wizard", level: 5 }).size !== 6) {
    throw new Error("class Hit Die size is incorrect");
  }
  const fallen = { ...tired[0], hp: 0, dead: true };
  if (
    takeLongRest([fallen])[0].hp !== 0 || takeShortRest([fallen], { fighter: 3 }).party[0].hp !== 0
  ) {
    throw new Error("resting revived a fallen adventurer");
  }
});

Deno.test("class capabilities and tracking settings work without spell bookkeeping", () => {
  if (
    classCapability({ class: "Wizard", level: 5 }).aoe <=
      classCapability({ class: "Fighter", level: 5 }).aoe
  ) {
    throw new Error("class AoE ratings are not differentiated");
  }
  const afflicted = PARTY.map((member) => ({ ...member, conditions: ["poisoned"], exhaustion: 2 }));
  const tracked = analyzeParty(afflicted, { trackAfflictions: true });
  const ignored = analyzeParty(afflicted, { trackAfflictions: false });
  if (tracked.readiness >= ignored.readiness) {
    throw new Error("afflictions did not affect readiness");
  }
});

Deno.test("adventure class profiles match class_proficiencies.json", () => {
  const artificer = classCapability({ class: "Artificer", level: 1 });
  if (
    artificer.singleTarget !== 4 || artificer.aoe !== 3 || artificer.damage !== 3 ||
    artificer.tank !== 4 || artificer.support !== 4 || artificer.melee !== 3 ||
    artificer.ranged !== 4 || classResourceDependency("Artificer") !== .6
  ) {
    throw new Error("Artificer proficiency values do not match the JSON source");
  }
  if (classResourceDependency("Wizard") !== 1 || classResourceDependency("Rogue") !== 0) {
    throw new Error("resource dependency values do not match the JSON 0–5 scale");
  }
});

Deno.test("empty resources penalize full casters more than martial classes", () => {
  const emptyWizard = memberResourceState({
    class: "Wizard",
    resource: 0,
    maxResource: 9,
  });
  const emptyFighter = memberResourceState({
    class: "Fighter",
    resource: 0,
    maxResource: 1,
  });
  if (
    classResourceDependency("Wizard") <= classResourceDependency("Fighter") ||
    emptyWizard.operational >= emptyFighter.operational ||
    emptyWizard.operational <= 0
  ) {
    throw new Error("class-sensitive resource floors are incorrect");
  }
  const base = { name: "A", level: 5, hp: 30, maxHp: 30, ac: 15, resource: 0 };
  const wizard = analyzeParty([{ ...base, class: "Wizard", maxResource: 9 }]);
  const fighter = analyzeParty([{ ...base, class: "Fighter", maxResource: 1 }]);
  if (wizard.capacity >= fighter.capacity || wizard.resourceRatio >= fighter.resourceRatio) {
    throw new Error("empty caster resources did not reduce modeled capacity enough");
  }
});

Deno.test("resolved outcomes train a bounded per-party calibration model", () => {
  const sample = outcomeSample({ id: "e1", rating: "Moderate" }, PARTY, {
    rounds: 8,
    feedback: "harder",
    members: {
      a: { hpLost: 25, resourcesSpent: 3, downed: true, killed: true },
      b: { hpLost: 15, resourcesSpent: 2, downed: false },
    },
  });
  const learned = learningModel(Array(8).fill(sample));
  if (learned.calibration <= 1 || learned.calibration > 1.35 || learned.samples !== 8) {
    throw new Error("learning calibration did not adapt safely");
  }
  if (!sample.killed || sample.objectiveCompleted) {
    throw new Error("outcome details were not retained for learning");
  }
  const rested = learningModel(Array(8).fill({ ratio: 1 }), { short: 12, long: 4 });
  const unrested = learningModel(Array(8).fill({ ratio: 1 }), { short: 0, long: 0 });
  if (rested.calibration <= unrested.calibration || rested.restFrequency !== 2) {
    throw new Error("rest frequency did not influence calibration");
  }
});

Deno.test("empty resolution reports have low learning weight", () => {
  const empty = outcomeSample({ id: "empty", rating: "Hard" }, PARTY, {
    rounds: 3,
    feedback: "accurate",
    members: { a: { hpLost: 0, resourcesSpent: 0 } },
  });
  const costly = outcomeSample({ id: "costly", rating: "Hard" }, PARTY, {
    rounds: 5,
    feedback: "harder",
    members: { a: { hpLost: 20, resourcesSpent: 2, downed: true } },
  });
  if (empty.evidenceWeight >= costly.evidenceWeight) {
    throw new Error("an empty report was treated as strong encounter evidence");
  }
});

Deno.test("DM encounter controls reroll and override type and difficulty", () => {
  const base = buildEncounterForecast(PARTY, "control-vault", 0, 1);
  const changed = applyForecastControls(base, PARTY, "control-vault", 0, 1, {
    rerolls: { 0: 1 },
    ratings: { 0: "Hard" },
    kinds: { 0: "puzzle" },
  });
  if (changed.encounters[0].rating !== "Hard" || changed.encounters[0].kind !== "puzzle") {
    throw new Error("DM encounter override was not applied");
  }
});
