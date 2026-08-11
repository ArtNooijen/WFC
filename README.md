# Delvewright

A living D&D dungeon prototype: edit the party, forecast the next three encounters, and watch a
deterministic ASCII dungeon resolve cell by cell.

## Run it

This project uses Deno and has no third-party runtime dependencies.

```bash
deno task dev
```

Open [http://localhost:8000](http://localhost:8000). Run all checks with:

```bash
deno task check
```

## What is implemented

- A responsive party editor inspired by the compact density of initiative trackers.
- HP, maximum HP, AC, level, class, and expendable-resource tracking.
- Serialized floors that stay exact when navigating between rooms or returning upstairs.
- Independent Small, Medium, and Large floor dimensions plus a selectable 4–30 room count.
- A constraint-propagated room/corridor generator with an animated hand-drawn reveal.
- Structured room and hallway traps, chasms with bridges, and removable forest bushes alongside ice,
  webbing, doors, locks, loot, safe rooms, shrines, water, rubble, and secret passages.
- Three adaptive encounter forecasts with pressure, budget, and expected-round estimates.
- Shuffled three-to-five-floor biome arcs plus a selectable single-biome ten-floor campaign mode,
  with persistent stories and themed bosses on floors 3, 6, and 10.
- Per-biome optional floor modifiers from the Gijs feedback list. Several can be selected together,
  or one can be chosen deterministically for the full ten-floor biome or the complete 3–5 floor arc.
- A library of 32 varied combat, social, puzzle, hazard, discovery, rescue, and bargain scenarios;
  each includes a concrete objective and a twist.
- Numbered `1–3` map markers that bind each forecast card to a named room and atlas coordinate.
- Rough, doubled outlines and seeded glyph jitter inspired by hand-drawn whiteboard rendering.
- Separate descent and dungeon-reset controls; reset returns to floor 1, fully resupplies the party,
  and clears journal, room, encounter, loot-claim, and initiative state.
- A black-and-white A4 landscape print sheet that fits the full map, numbered encounters, seed,
  floor, and symbol key inside fixed print margins.
- Local session persistence, encounter advancement, contrast controls, zoom, and JSON export.
- DM-only encounter resolution with HP loss, resource expenditure, downed/killed characters,
  objective completion, no-combat completion, rounds, notes, and a table difficulty assessment.
- A bounded per-party learning calibration trained from the most recent 24 resolved encounters.
- Per-class single-target, AoE, damage, tank, support, melee, ranged, and resource-dependency values
  synchronized with `class_proficiencies.json`, plus action-economy, flight, and monster-trait risk
  notes.
- Encounter reroll, lock, difficulty, scene-type, and resolve controls.
- Resolved encounter cards remain pinned to their rooms until the DM descends; unresolved cards can
  continue adapting to party state.
- A draggable initiative plaque accepts physical player rolls, rolls each pending encounter monster
  with its SRD Dexterity modifier, and supports editable scores/names, manual ordering, extra
  participants, and turn advancement.
- Temporary HP, conditions with round durations, concentration, Inspiration, exhaustion, and death
  saves, with settings to disable resource or affliction tracking without deleting data.
- An explicit safe-room location toggle, named short/long-rest complications, unsafe-rest
  interruptions, rest-frequency learning, dungeon awareness, and cleared-room reoccupation.
- A 30-step undo stack and printable campaign journal filtered to major moments: encounters, loot,
  cleared/reoccupied rooms, deaths, notable rests, and dungeon transitions.
- A small JSON API at `POST /api/forecast` with an in-browser fallback.

## Architecture

```text
party editor ──POST /api/forecast──> readiness model ──> 3 encounter budgets
     │
     └── expedition seed ──> generator ──> serialized floor data ──> renderer/editor
                                      │
party state update ───────────────────┴────────────────────> replace encounters only
```

`public/lib/adventure.js` is shared by the Deno server and browser. Dungeon geometry uses
`${seed}:geometry`; encounters use party state and progression separately. This split is the
invariant that keeps the map unchanged after a fight.

## Model strategy

The prototype uses a transparent attrition planner. Its inputs are:

- current-to-maximum HP ratio;
- remaining-resource ratio;
- average AC;
- party level weight;
- party size.

Health is deliberately the dominant current-state signal. The planner chooses a pacing pattern—such
as a hard opening followed by relief, a valley between two threats, or a measured build—based on
party condition and deterministic encounter context. There is no forced easy-to-hard staircase.
Themes now span arcs of three to five floors, with a hard dedicated boss arena added on each arc's
final floor. The `Deadly` tier is restricted to those boss floors and only used when party condition
makes it reasonable. Lower HP reduces the forecast's overall pressure and can introduce recovery or
non-combat choices.

This remains an explainable model rather than an unsupported neural-network claim. The resolution
form now captures a compact outcome row after every encounter:

```json
{
  "party_before": { "levels": [4, 4, 4, 4], "hp_ratio": 0.84, "resource_ratio": 0.67 },
  "encounter": { "budget": 1280, "foes": 5, "terrain_pressure": 0.4 },
  "outcome": { "rounds": 4, "hp_lost": 31, "resources_spent": 5, "downed": 1 },
  "gm_rating": { "difficulty": 4, "fun": 5 }
}
```

The application immediately uses a bounded, recency-weighted per-party calibration so it can learn
with small amounts of data without producing extreme forecasts. Once there are a few hundred diverse
encounters, train a gradient-boosted model first (it is usually stronger and easier to explain on
small tabular datasets). Export it to ONNX and replace `buildEncounterForecast` behind the existing
API. An LLM is most useful after budgeting: turn the structured budget and room context into
evocative creatures, clues, hazards, and treasure. It should not be the only difficulty judge.

## 2014 SRD and 5e-bits integration

The Deno server talks to `https://www.dnd5eapi.co/api/2014` and keeps a one-hour in-memory cache.
The browser never needs to call the public service directly. If it is unavailable, the forecast
returns its local creative content with a visible fallback warning.

Class selection and level changes load the real class-level record. The editor separates spell-slot
levels and expendable class pools instead of treating them as one resource. Current integrations
include Rage, Channel Divinity, Wild Shape, Action Surge, Indomitable, Ki, Sorcery Points, Warlock
short-rest slots, and all available spell-slot levels. Informational values such as Bardic
Inspiration die size, Arcane Recovery capacity, invocation count, proficiency bonus, and newly
gained features are shown as notes. Wild Shape uses come from its linked SRD feature; its maximum CR
and movement limits come from the selected class-level record.

Combat uses the official 2014 encounter procedure:

1. Sum Easy, Medium, Hard, and Deadly XP thresholds for every character level.
2. Let the attrition planner choose the desired band from current party condition and dungeon pace.
3. Search valid CR/count combinations inside that XP band.
4. Apply the official multiple-monster multiplier, including small/large party adjustments.
5. Weight a local mechanics index toward natural save/control options for unusually high-AC parties,
   then fetch the selected monster's XP, AC, HP, type, actions, and stat-block source.
6. Apply the Basic Rules CR caution so non-deadly creatures do not exceed average party level.

Every forecast includes at least one combat encounter. Non-combat puzzles and negotiations do not
pretend to use monster XP rules. Loot combines actual magic-item records with useful
adventuring-gear records and their listed prices; magic-item rarity is filtered toward the party's
tier. These are suggestions, not a claim to reproduce the full DMG random-treasure tables (which are
not exposed by this SRD API).

## Next production steps

1. Add campaign accounts and a database (party snapshots, seeds, room state, outcomes).
2. Replace browser local storage with server-side expedition/event persistence.
3. Add D&D ruleset-specific encounter math and monster data under an appropriate license.
4. Export accumulated outcome rows into an offline training/evaluation pipeline.
5. Add an LLM content adapter with schema validation, caching, and a GM approval step.
6. Rebuild room-layout editing from a simpler interaction model, then add room notes.

Rebuild the checked-in monster mechanics index after changing data sources with
`deno task index-monsters`. Encounter generation reads that file rather than rescanning every SRD
monster.
