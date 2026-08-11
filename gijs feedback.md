go down to the previous room. 
load all the rooms . so  you can print out the entire dungeon in the begginning or you can go back up floors.

want to manualy add rooms and remove rooms. but it does not have to be regenerated it just has to create the new room or remoce the room and lfix so you can place all the rooms. (i want the decode to be seperated from the generations.)

casms added to map generation with bridges.

ice and webbing to the map generation in the moss/forest floor. busches that can be cut down
implement traps

3 size floors. small, medium, large. with different room sizes and layouts.
also chooice of amount of rooms per floor/ 

change armor. /moster generation if there are people with high armor . (maybe a script that runns ones through the entire api finds the mosnters with saves in stead of just damage) and then create a new list where they can be chosen from when party has high armor.

place traps in halways. create a list of traps that can be placed in hallways and rooms. 



reverse rooms for the massive rooms biome for a road/map / ruins or interest in the architecture

split the dmg into consistent dmg, resource dependent dmg, 
dependent:paladin wizard, sorcerer, bard, cleric
not: fighter, barbarian, rogue, ranger,
apply resources to damage of players,

# biome ideas

## Ossuary

### Illusionary Hallways

Fake doors and walls appear, or hallways seem to fill back in.

### Grave Call
Healing is reduced by 50%.

### Soul Drag
When a PC goes down, they must make a CON save or gain 1 level of exhaustion.

### Undying Fortitude
When a monster is killed, it makes a CON save. On a success, the monster is not slain.

### There Is No Hope
Visibility is reduced to 15 ft.

### Realm of the Damned
Necrotic damage is increased.

Radiant damage is reduced.


---

## Forest

### Malicious Roots
If a PC starts their turn next to a tree, the roots attempt to grapple them.

### From Up High
Every round, 1d6 random tiles are targeted by falling acorns.

The acorns fall at the end of the round.

### Delectable Tea or Poison?
A tree spawns 1d6 delicious-looking fruits.

The fruits can be either:
- Poisonous — causes damage.
- Delicious — restores health.

A PC can make a Survival check to determine which type a fruit is.

### Wild Urges
Enemies can become beset with bestial rage.

When an enemy falls below 50% HP, it gains an extra attack.


---

## Drowned

### The Sea Stirs
As a lair action during combat, the dungeon shakes with the waves. 5% of the time.

All creatures must make a DEX save or become prone.

### Feeding Frenzy
When a creature falls below 50% HP, an adjacent creature can use its reaction to make a melee weapon attack against it.

### Crushing Weight of the Dark Below
Upon entering the floor, make a WIS save.

On a failure, the creature is frightened until it exits the floor.

### Siren Song
You always know the direction of the exit.

Whenever you attempt to move away from the exit, you must make a WIS save.

On a failure, you cannot move away from the exit.

### The Sea's Toll
A ghost pirate haunts the party.

The ghost pirate joins the monsters during combat unless the party bribes it with gold.


---

## Hell / Inferno

### Allure of Depravity
Can only target a creature once per floor.

As a lair action during combat, a whispered promise of excess reaches a party member.

The target must make a WIS save or become charmed until they are damaged by an enemy.

### Gift of Endurance
Can trigger once per floor for each creature.

When a creature is reduced to 0 HP, it instead returns to 10% of its maximum HP.

The creature becomes poisoned for the rest of the floor.

### Spells of Change
Whenever someone casts a spell, roll a d20.

On a roll of 4 or lower, roll on the Wild Magic table.

### Promise of Strength
When making an attack, a creature can choose to make it a Reckless Attack, using the Barbarian Reckless Attack rules.

### Survival of the Desperate
When you take damage, you can use your reaction to make an ally within 5 ft take all of the damage instead.




---

# prompt
I received feedback on the current Delvewright dungeon generator. Implement the following improvements while keeping the existing functionality intact.

Before making changes, inspect the current dungeon generation, room generation, map rendering, monster selection, and floor state logic so the new features integrate cleanly with the existing architecture.

## 1. Persistent Dungeon and Floor Navigation

Currently, dungeon generation is too focused on the current room/floor.

Change this so the entire generated dungeon is stored and remains accessible.

Requirements:

- Load/store all generated rooms for a floor.
- Allow the player/DM to move back to previously visited rooms.
- Allow navigation back up to previous floors.
- Previously generated rooms must remain exactly as they were.
- Do not regenerate rooms when returning to them.
- The complete dungeon/floor should be available from the beginning so it can eventually be:
  - viewed as one complete map;
  - printed;
  - exported;
  - navigated forwards and backwards.

The dungeon data should therefore exist independently from which room is currently being displayed.

---

## 2. Separate Dungeon Data From Dungeon Generation

Refactor the system so that **the generated dungeon data is separate from the generation logic**.

Generation should produce a dungeon/floor data structure.

Rendering and navigation should consume that data structure without needing to regenerate anything.

For example, conceptually:

`Generator -> Dungeon Data -> Renderer/UI`

rather than:

`Generator -> Renderer`

This is important because rooms need to be manually editable after generation.

---

## 3. Manually Add and Remove Rooms

Allow the DM to manually modify a generated floor.

The DM should be able to:

- add a room;
- remove a room;
- connect a new room to an existing room;
- remove connections where necessary.

Adding/removing a room should **not regenerate the entire dungeon**.

When a room is added:

1. Generate only the new room.
2. Add it to the existing dungeon data.
3. Recalculate/reflow the map layout if necessary so rooms do not overlap.
4. Preserve all existing room contents wherever possible.

When a room is removed:

1. Remove only that room.
2. Remove/update its connections.
3. Recalculate the visual layout if necessary.
4. Do not regenerate unrelated rooms.

---

# Map Generation Improvements

## 4. Chasms and Bridges

Add chasms as a possible map-generation feature.

Chasms should:

- occupy actual tiles/areas of a room;
- block normal movement across them;
- be visually distinguishable from normal floor tiles;
- support bridges that allow creatures to cross;
- be generated in layouts where they create interesting movement decisions rather than simply blocking the room.

Rooms should be able to contain one or multiple bridges where appropriate.

---

## 5. Forest / Moss Environmental Features

Expand generation for the moss/forest biome.

Possible terrain features should include:

### Ice
Add slippery/frozen areas as a terrain feature where appropriate.

### Webbing
Add areas covered in webs that can affect movement or positioning.

### Bushes
Add bushes to rooms.

Bushes should:

- occupy map tiles;
- act as terrain/obstacles;
- be removable/cut down during play.

These features should be represented in the dungeon data rather than existing only visually.

---

# Traps

## 6. Trap System

Implement a reusable trap system.

Create a collection/list of traps that the generator can select from.

A trap should have structured data such as:

- name;
- description;
- trigger;
- location type;
- detection method/DC;
- saving throw if applicable;
- damage/effect;
- biome restrictions if applicable.

Traps should be able to appear in:

- rooms;
- hallways.

Hallway traps should be generated independently from room encounters.

The system should make it easy to add additional traps later without modifying the main dungeon-generation logic.

---

# Floor Generation Options

## 7. Floor Sizes

Add three selectable floor sizes:

- Small
- Medium
- Large

Floor size should influence generation rather than simply scaling the rendered map.

It can affect things such as:

- overall map dimensions;
- possible room sizes;
- hallway lengths;
- room layout;
- complexity;
- available space for environmental features.

---

## 8. Number of Rooms

Allow the user to choose the desired number of rooms on a floor.

For example, the UI could provide either:

- a specific room count; or
- sensible presets based on Small / Medium / Large.

The generator should then attempt to produce that number of rooms while maintaining a valid dungeon layout.

Floor size and room count should remain separate settings.

For example:

- Large floor + few rooms = large, spread-out rooms and long corridors.
- Small floor + many rooms = smaller, denser rooms.
- Large floor + many rooms = large and complex dungeon.

---

# Encounter Generation

## 9. Account for High-Armor Parties

Improve monster selection so encounters can respond to party composition.

Currently, a party with very high AC can make monsters that primarily rely on attack rolls significantly less threatening.

When the party has unusually high AC, the encounter generator should give more consideration to monsters whose abilities require saving throws rather than attack rolls.

Do **not** simply give monsters arbitrary attack bonuses to compensate for player AC.

Instead, use the monster data to identify monsters that naturally counter or challenge high-AC characters.

---

## 10. Preprocess Monster Data

Do not repeatedly scan the entire monster API during encounter generation.

Create a preprocessing/indexing script that runs through the available monster data and categorizes monsters based on their mechanics.

At minimum, identify monsters with:

- attack-roll-based actions;
- STR saves;
- DEX saves;
- CON saves;
- INT saves;
- WIS saves;
- CHA saves;
- AoE abilities;
- control abilities;
- conditions;
- other abilities that bypass or reduce the importance of AC.

Store the resulting information in a generated/indexed data file.

The encounter generator can then quickly select from these categories.

Conceptually:

`Monster API/Data`
↓
`Preprocessing Script`
↓
`Monster Index`
↓
`Encounter Generator`

For example, if the party has very high AC but poor WIS saves, the generator could slightly increase the weighting of appropriate monsters with WIS-save abilities.

This should influence encounter selection rather than becoming a hard rule. The generator should still produce varied encounters.

---

# Important Architecture Requirement

Keep these systems modular.

Ideally, the project should have separate responsibilities for:

- dungeon generation;
- dungeon/floor state;
- room generation;
- map layout;
- map rendering;
- environmental terrain/features;
- traps;
- monster indexing;
- encounter generation;
- party analysis.

Avoid putting all of this logic into one generation function.

The main goal is to make Delvewright's generated dungeon **persistent and editable**. Generation should create data; the UI should display and modify that data without requiring the dungeon to be regenerated.