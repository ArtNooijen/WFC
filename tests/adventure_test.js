import {
  analyzeParty,
  applyForecastControls,
  buildEncounterForecast,
  classCapability,
  generateDungeon,
  hitDiceState,
  placeEncounters,
  takeLongRest,
  takeShortRest,
} from "../public/lib/adventure.js";
import {
  chooseComposition,
  classifyAdjustedXp,
  conditionBudgetBand,
  encounterMultiplier,
  normalizeClassLevel,
  partyThresholds,
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

Deno.test("the model controls pacing while milestone floors end hard", () => {
  const firstFloor = buildEncounterForecast(PARTY, "vault-13", 0, 1);
  const thirdFloor = buildEncounterForecast(PARTY, "vault-13", 0, 3);
  if (firstFloor.encounters.some((encounter) => encounter.rating === "Deadly")) {
    throw new Error("deadly encounter appeared outside a third floor");
  }
  if (thirdFloor.encounters[2].rating !== "Hard") {
    throw new Error("milestone floor did not end with a hard room");
  }
  const strongParty = PARTY.map((member) => ({
    ...member,
    hp: member.maxHp,
    resource: member.maxResource,
    ac: 20,
  }));
  const crucible = buildEncounterForecast(strongParty, "vault-13", 0, 3);
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
