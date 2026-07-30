import {
  analyzeParty,
  buildEncounterForecast,
  generateDungeon,
  placeEncounters,
} from "../public/lib/adventure.js";

const PARTY = [
  { name: "Mira", level: 4, hp: 27, maxHp: 31, ac: 16, resource: 3, maxResource: 4 },
  { name: "Orin", level: 4, hp: 21, maxHp: 25, ac: 14, resource: 2, maxResource: 3 },
];

Deno.test("party analysis produces a bounded readiness score", () => {
  const profile = analyzeParty(PARTY);
  if (profile.readiness <= 0 || profile.readiness >= 1) throw new Error("unbounded readiness");
  if (profile.budget <= 0) throw new Error("missing budget");
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
