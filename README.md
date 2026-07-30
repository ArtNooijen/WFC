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
- Seeded dungeon geometry that stays stable for the life of an expedition.
- A constraint-propagated room/corridor generator with an animated hand-drawn reveal.
- Eleven map conditions including doors, locks, traps, loot, safe rooms, shrines, water, rubble, and
  secret passages.
- Three adaptive encounter forecasts with pressure, budget, and expected-round estimates.
- A library of 32 varied combat, social, puzzle, hazard, discovery, rescue, and bargain scenarios;
  each includes a concrete objective and a twist.
- Numbered `1–3` map markers that bind each forecast card to a named room and atlas coordinate.
- Local session persistence, encounter advancement, contrast controls, zoom, and JSON export.
- A small JSON API at `POST /api/forecast` with an in-browser fallback.

## Architecture

```text
party editor ──POST /api/forecast──> readiness model ──> 3 encounter budgets
     │
     └── expedition seed ──────────> dungeon generator ──> persistent geometry
                                                │
party state update ─────────────────────────────┴──> replace encounters only
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
Every third floor does end in a hard guardian room. The `Deadly` tier is restricted to those
milestone floors and only used when party condition makes it reasonable. Lower HP reduces the
forecast's overall pressure and can introduce recovery or non-combat choices.

This is deliberately an explainable baseline, not an untrained neural-network claim. To train a
useful model, capture one row after every encounter:

```json
{
  "party_before": { "levels": [4, 4, 4, 4], "hp_ratio": 0.84, "resource_ratio": 0.67 },
  "encounter": { "budget": 1280, "foes": 5, "terrain_pressure": 0.4 },
  "outcome": { "rounds": 4, "hp_lost": 31, "resources_spent": 5, "downed": 1 },
  "gm_rating": { "difficulty": 4, "fun": 5 }
}
```

Once there are a few hundred diverse encounters, train a gradient-boosted model first (it is usually
stronger and easier to explain on small tabular datasets). Export it to ONNX and replace
`buildEncounterForecast` behind the existing API. An LLM is most useful after budgeting: turn the
structured budget and room context into evocative creatures, clues, hazards, and treasure. It should
not be the only difficulty judge.

## Next production steps

1. Add campaign accounts and a database (party snapshots, seeds, room state, outcomes).
2. Replace browser local storage with server-side expedition/event persistence.
3. Add D&D ruleset-specific encounter math and monster data under an appropriate license.
4. Record outcomes and build an offline training/evaluation pipeline.
5. Add an LLM content adapter with schema validation, caching, and a GM approval step.
6. Add map editing, fog of war, room notes, shareable player view, and undo history.
