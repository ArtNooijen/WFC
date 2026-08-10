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

export const FLOOR_THEMES = [
  {
    id: "moss-forest",
    name: "Moss Forest",
    tagline: "Poisoned roots and goblin paths have swallowed the old masonry.",
    conditions: ["Overgrown", "Spore-heavy", "Root-choked", "Damp"],
    enemyTags: ["goblin", "poison", "plant", "beast"],
    arcLength: 4,
    terrainDensity: .2,
    forbiddenRoles: [],
    terrainRole: "overgrown",
    terrainTile: "%",
    restriction:
      "Clean water is scarce: the moss taints open pools, so drinking requires purification.",
    hook:
      "Find the missing herbalist Ilyra before the Goblin Spore-King completes her transformation.",
    target: "the Goblin Spore-King",
    rules: [
      "Goblin patrols can use root tunnels to reinforce adjacent rooms.",
      "Poison pods create lightly obscured, poisonous areas when struck.",
      "Open water is moss-tainted and must be purified before drinking.",
    ],
  },
  {
    id: "drowned-grotto",
    name: "Drowned Grotto",
    tagline: "Black water, broken sluices, and amphibious hunters fill the drowned halls.",
    conditions: ["Flooded", "Dripping", "Silt-choked", "Cold"],
    enemyTags: ["aquatic", "ooze", "reptile", "drowned"],
    arcLength: 3,
    terrainDensity: .32,
    forbiddenRoles: ["shrine"],
    terrainRole: "flooded",
    terrainTile: "~",
    restriction:
      "Most water is brackish corpse-runoff and cannot safely refill the party's supplies.",
    hook: "Recover the stolen tide-key and stop the Drowned Oracle from flooding the valley above.",
    target: "the Drowned Oracle",
    rules: [
      "Water depth changes difficult terrain and extinguishes ordinary flame.",
      "Aquatic enemies can move between connected flooded rooms.",
      "Brackish water cannot replenish supplies without purification.",
    ],
  },
  {
    id: "ossuary",
    name: "Restless Ossuary",
    tagline: "A necromancer's mausoleum descends through vaults where no corpse stays quiet.",
    conditions: ["Bone-strewn", "Grave-cold", "Dust-choked", "Desecrated"],
    enemyTags: ["undead", "skeleton", "zombie", "necromancer"],
    arcLength: 5,
    terrainDensity: .24,
    forbiddenRoles: ["flooded"],
    terrainRole: "ossuary",
    terrainTile: "%",
    restriction:
      "Every corpse left intact can rise as a zombie when the dungeon becomes aware of it.",
    hook:
      "Enter the mausoleum, find the stolen villagers, and stop Necromancer Veyr at the bottom of the dungeon.",
    target: "Necromancer Veyr",
    rules: [
      "Every intact corpse can rise as a zombie at the end of a round.",
      "Consecrating or burning a corpse prevents it from returning.",
      "Necromantic alarms cause cleared crypts to repopulate faster.",
    ],
  },
  {
    id: "infernal-foundry",
    name: "Infernal Foundry",
    tagline: "Demonic smiths work above channels of fire and collapsing iron gantries.",
    conditions: ["Scorching", "Smoke-choked", "Ash-covered", "Unstable"],
    enemyTags: ["demon", "devil", "fiend", "fire"],
    arcLength: 4,
    terrainDensity: .52,
    strictEnemies: true,
    forbiddenRoles: ["flooded", "safe"],
    terrainRole: "burning",
    terrainTile: "*",
    restriction:
      "There is no drinkable water on this floor; exposed water boils or turns to bitter steam.",
    hook: "Break the soul-forge and kill the Ashen Foreman before it arms an invading demon host.",
    target: "the Ashen Foreman",
    rules: [
      "Only demons and devils appear as native enemies; other stat blocks are infernal reskins.",
      "Water, flooded rooms, and safe rooms cannot generate anywhere in the arc.",
      "Fire patches fill many rooms, deal environmental fire damage, and ignite unattended gear.",
      "Fire spreads one tile when a creature is shoved or falls into a burning patch.",
    ],
  },
];

const THEMED_ARCHETYPES = {
  "moss-forest": [
    {
      name: "Goblin venom-gardeners",
      kind: "combat",
      icon: "⚔",
      tone: "Poison",
      weight: .82,
      objective: "Stop the gardeners from bursting three poison pods.",
      twist: "Cut vines create cover but release choking spores.",
      tags: ["goblin", "poison"],
    },
    {
      name: "The walking mushroom ring",
      kind: "puzzle",
      icon: "◇",
      tone: "Spores",
      weight: .58,
      objective: "Turn the migrating fairy ring away from the party's trail.",
      twist: "Speaking a lie makes the mushrooms advance.",
      tags: ["plant"],
    },
    {
      name: "Root-snared wolf pack",
      kind: "combat",
      icon: "⚔",
      tone: "Rescue",
      weight: .7,
      objective: "Pass the wolves or free them from the carnivorous roots.",
      twist: "The roots are the greater predator.",
      tags: ["beast", "plant"],
    },
  ],
  "drowned-grotto": [
    {
      name: "Silt-stalker ambush",
      kind: "combat",
      icon: "⚔",
      tone: "Aquatic",
      weight: .8,
      objective: "Reach the dry ledge before the hunters pull anyone under.",
      twist: "Each missed attack clouds the water and hides movement.",
      tags: ["aquatic"],
    },
    {
      name: "The drowned ferryman",
      kind: "social",
      icon: "♜",
      tone: "Bargain",
      weight: .55,
      objective: "Convince the ferryman to cross a passage with no visible shore.",
      twist: "He accepts only memories of sunlight.",
      tags: ["drowned"],
    },
    {
      name: "Hungry sluice-ooze",
      kind: "combat",
      icon: "⚔",
      tone: "Flow",
      weight: .76,
      objective: "Open the sluice without feeding it metal equipment.",
      twist: "Changing the current splits or recombines the ooze.",
      tags: ["ooze"],
    },
  ],
  ossuary: [
    {
      name: "The newly risen",
      kind: "combat",
      icon: "⚔",
      tone: "Undead",
      weight: .72,
      objective: "Destroy or consecrate the corpses before they join the necromancer's host.",
      twist: "Every intact corpse in the room can rise as a zombie at the end of a round.",
      tags: ["undead", "zombie"],
    },
    {
      name: "Bone archivists",
      kind: "social",
      icon: "♜",
      tone: "Ossuary",
      weight: .54,
      objective: "Recover a prisoner's name from the catalogued dead.",
      twist: "Removing the wrong bone wakes its skeleton.",
      tags: ["skeleton"],
    },
    {
      name: "Veyr's grave-callers",
      kind: "combat",
      icon: "⚔",
      tone: "Necromancy",
      weight: .86,
      objective: "Silence the callers before their ritual reaches the next crypt.",
      twist: "A fallen creature rises as a zombie unless blessed or burned.",
      tags: ["necromancer", "undead"],
    },
  ],
  "infernal-foundry": [
    {
      name: "Demon chain-smiths",
      kind: "combat",
      icon: "⚔",
      tone: "Infernal",
      weight: .9,
      objective: "Break the chain winch before it drags the party across the fire channel.",
      twist: "The heated chain changes the battlefield each round.",
      tags: ["demon", "fire"],
    },
    {
      name: "Pit-fiend's furnace hounds",
      kind: "combat",
      icon: "⚔",
      tone: "Devils",
      weight: .92,
      objective: "Close the furnace kennels before the devil hounds surround the party.",
      twist: "Each open kennel feeds a different lava channel.",
      tags: ["devil", "fire"],
    },
    {
      name: "Devil at the dry cistern",
      kind: "social",
      icon: "♜",
      tone: "Temptation",
      weight: .62,
      objective: "Acquire water or directions without accepting an infernal debt.",
      twist: "The offered water is real, but its price transfers thirst to someone else.",
      tags: ["devil"],
    },
  ],
};

const BOSSES = {
  "moss-forest": {
    name: "The Goblin Spore-King",
    objective: "Destroy the heart-cap throne and defeat the Spore-King.",
    twist: "Four spore vents alternate between poison clouds and climbable updrafts.",
    mechanic:
      "At initiative 20, one vent erupts; sealing a vent weakens the boss but awakens root terrain.",
    lairActions: [
      "Spore eruption: one marked vent creates a poisonous 10-foot cloud until the next round.",
      "Grasping roots: a visible lane becomes difficult terrain and restrains on a failed save.",
      "Goblin scurry: two minions move through root tunnels without provoking opportunity attacks.",
    ],
  },
  "drowned-grotto": {
    name: "The Drowned Oracle",
    objective: "Take the tide-key and close the abyssal sluice.",
    twist: "The water level rises each round and exposes different walkways as it drains.",
    mechanic:
      "Two sluice wheels change water depth; the boss is shielded while both point the same way.",
    lairActions: [
      "Rising tide: water rises one stage, flooding low ground and moving loose creatures.",
      "Undertow: a channel pulls creatures toward the abyssal sluice.",
      "Oracle's reflection: a pool shows the next attack and grants the boss a defensive reaction.",
    ],
  },
  ossuary: {
    name: "Necromancer Veyr",
    objective: "Free the captives and end Veyr's mass-raising ritual.",
    twist: "Unconsecrated corpses rise as zombies, including fallen minions.",
    mechanic:
      "Break three soul anchors to stop the resurrection pulse; each anchor also removes the boss's reactions.",
    lairActions: [
      "Resurrection pulse: one unconsecrated corpse rises as a zombie.",
      "Soul-anchor flare: an intact anchor damages the living and restores a fallen undead minion.",
      "Grave grasp: spectral hands fill a marked zone and restrain creatures that remain there.",
    ],
  },
  "infernal-foundry": {
    name: "The Ashen Foreman",
    objective: "Shatter the soul-forge and defeat its demonic master.",
    twist: "Lava channels rotate when the forge bell rings.",
    mechanic:
      "Players can spend actions at three bellows to redirect fire, cool platforms, or strip the boss's fire ward.",
    lairActions: [
      "Lava rotation: every marked fire channel turns ninety degrees and ignites its new lane.",
      "Hellforge bell: demons and devils may move half their speed and one cooled platform reheats.",
      "Soul-fire bellows: an active bellows projects a cone of flame unless a character reverses it.",
    ],
  },
};

const BIOME_STORIES = {
  "moss-forest": [
    {
      hook:
        "Find the missing herbalist Ilyra before the Goblin Spore-King completes her transformation.",
      target: "the Goblin Spore-King",
      title: "The Stolen Herbalist",
    },
    {
      hook: "Recover three royal seed-vaults before a goblin court grows a walking fortress.",
      target: "the Briar Crown",
      title: "The Walking Fortress",
    },
    {
      hook: "Trace a dream-plague through the roots and wake the forest's imprisoned guardian.",
      target: "the Dreamcap Sovereign",
      title: "Sleep Beneath the Roots",
    },
  ],
  "drowned-grotto": [
    {
      hook:
        "Recover the stolen tide-key and stop the Drowned Oracle from flooding the valley above.",
      target: "the Drowned Oracle",
      title: "The Stolen Tide-Key",
    },
    {
      hook: "Find a vanished pilgrimage fleet whose bells still ring beneath the dungeon water.",
      target: "the Bell-Eater",
      title: "Bells Below the Water",
    },
    {
      hook:
        "Close the black spring that is replacing villagers' memories with those of drowned nobles.",
      target: "the Silt Regent",
      title: "The Borrowed Memories",
    },
  ],
  ossuary: [
    {
      hook:
        "Enter the mausoleum, find the stolen villagers, and stop Necromancer Veyr at the bottom of the dungeon.",
      target: "Necromancer Veyr",
      title: "Veyr's Mausoleum",
    },
    {
      hook: "Reassemble a saint's scattered remains before the dead elect a new, hungry saint.",
      target: "the Hollow Saint",
      title: "Election of the Dead",
    },
    {
      hook: "Destroy the census of souls before its scribes erase the living from history.",
      target: "the Pale Registrar",
      title: "The Final Census",
    },
  ],
  "infernal-foundry": [
    {
      hook:
        "Break the soul-forge and kill the Ashen Foreman before it arms an invading demon host.",
      target: "the Ashen Foreman",
      title: "The Soul-Forge",
    },
    {
      hook: "Steal back a city's true name before devils stamp it onto an infernal contract.",
      target: "the Contract Prince",
      title: "A City Under Contract",
    },
    {
      hook: "Sabotage the nine furnace seals before a demon legion marches through the final gate.",
      target: "the General of Cinders",
      title: "The Ninth Furnace",
    },
  ],
};

const BIOME_BOSSES = {
  "moss-forest": [
    {
      name: "Grib, Goblin Mycologist",
      objective: "Destroy Grib's walking laboratory before it inoculates the next floor.",
      twist: "Each smashed apparatus releases either healing pollen or poisonous spores.",
      mechanic:
        "Three mobile fungus vats change cover and spore effects whenever Grib commands them.",
      lairActions: [
        "Rolling vat: a fungus vat moves and knocks creatures aside.",
        "Volatile culture: one damaged vat erupts in poison spores.",
        "Emergency graft: Grib grows a temporary fungal shield on a minion.",
      ],
    },
    {
      name: "The Root-Maw",
      objective: "Sever the feeding roots and force the Root-Maw out of the dungeon foundation.",
      twist: "Damaging its exposed heart opens and closes passages around the arena.",
      mechanic:
        "Four feeding roots sustain the boss and reshape the room until individually severed.",
      lairActions: [
        "Root wall: a new wall divides one lane.",
        "Devouring soil: a marked patch opens into a grasping sinkhole.",
        "Sap surge: an intact feeding root restores the boss.",
      ],
    },
    BOSSES["moss-forest"],
  ],
  "drowned-grotto": [
    {
      name: "Captain Brine-Eye",
      objective: "Take the captain's flood chart before his drowned crew scuttles the floor.",
      twist: "The captain can cut ropes to rotate floating platforms.",
      mechanic:
        "Floating platforms drift between four mooring posts and can be redirected by creatures.",
      lairActions: [
        "Cut mooring: one platform drifts into a new lane.",
        "Drowned boarding party: two crew climb from the water.",
        "Black squall: ranged attacks through one half of the room are obscured.",
      ],
    },
    {
      name: "The Bell-Eater",
      objective: "Recover the swallowed pilgrimage bell and silence the creature's undertow song.",
      twist: "Striking the exposed bell interrupts one lair action but attracts drowned spirits.",
      mechanic:
        "The swallowed bell resonates at initiative 20 unless a character changes its pitch.",
      lairActions: [
        "Undertow note: creatures slide toward the central pool.",
        "Drowning peal: submerged creatures lose reactions.",
        "Call the lost: a drowned spirit appears beside an unoccupied pool.",
      ],
    },
    BOSSES["drowned-grotto"],
  ],
  ossuary: [
    {
      name: "The Bone Bailiff",
      objective: "Break the bailiff's sentence tablets and release the unlawfully condemned dead.",
      twist: "Each broken tablet frees a ghost that may accuse either side.",
      mechanic:
        "Three sentence tablets grant immunities until the party overturns their written laws.",
      lairActions: [
        "Contempt of court: one creature is silenced until it moves to the witness circle.",
        "Raise witness: a corpse stands and testifies as a zombie.",
        "Bone barrier: ribs rise across one approach.",
      ],
    },
    {
      name: "The Hollow Saint",
      objective: "Return the stolen relic-heart and end the saint's false resurrection.",
      twist: "Healing magic also fills the empty reliquaries that empower the saint.",
      mechanic: "Four reliquaries alternate between holy sanctuary and necrotic hazard.",
      lairActions: [
        "False miracle: one reliquary reverses healing and necrotic energy.",
        "Procession of bones: skeletons move in a fixed line across the room.",
        "Saint's demand: a creature must confess, move, or become frightened.",
      ],
    },
    BOSSES.ossuary,
  ],
  "infernal-foundry": [
    {
      name: "The Brass Tax-Devil",
      objective: "Destroy its debt seals before it repossesses the party's equipment.",
      twist: "Characters can accept short infernal debts to redirect attacks or hazards.",
      mechanic:
        "Three contract seals let the devil temporarily claim weapons, spells, or movement.",
      lairActions: [
        "Repossession: one unsecured item is pulled toward a contract seal.",
        "Interest due: a marked creature takes fire damage when it repeats its last action.",
        "Fine print: two fire patches exchange positions.",
      ],
    },
    {
      name: "General Cindervane",
      objective: "Break the general's command standards and close the legion gate.",
      twist: "Each fallen standard releases a bound demon that attacks the nearest commander.",
      mechanic: "Four standards coordinate devil movement and keep the legion gate partially open.",
      lairActions: [
        "Forced march: all devils move through fire without provoking reactions.",
        "Open the gate: a demon reinforcement begins to emerge.",
        "Cinder barrage: three marked tiles ignite until the next round.",
      ],
    },
    BOSSES["infernal-foundry"],
  ],
};

const BOSS_ROOM_VARIANTS = [
  {
    id: "vent-ring",
    name: "Vent Ring",
    shape: "ellipse",
    rule: "A ring of unstable vents divides the safe center from the outer path.",
  },
  {
    id: "divided-arena",
    name: "Divided Arena",
    shape: "rounded",
    rule: "A hazardous central divide has two narrow crossing points that can be controlled.",
  },
  {
    id: "four-altars",
    name: "Four Altars",
    shape: "rectangle",
    rule: "Four corner altars empower different lair actions until characters disable them.",
  },
  {
    id: "spiral-crucible",
    name: "Spiral Crucible",
    shape: "rounded",
    rule: "A spiral hazard lane forces the fight to rotate around the room's protected center.",
  },
];

export function floorTheme(floor = 1, context = {}) {
  const normalizedFloor = Math.max(1, Math.floor(Number(floor)));
  const requestedOrder = Array.isArray(context.themeOrder) ? context.themeOrder : [];
  const orderedThemes = [
    ...requestedOrder.map((id) => FLOOR_THEMES.find((theme) => theme.id === id)).filter(Boolean),
    ...FLOOR_THEMES.filter((theme) => !requestedOrder.includes(theme.id)),
  ];
  const storyIndex = Math.abs(Math.floor(Number(context.storyVariant ?? 0))) % 3;
  if (context.themeMode === "full-dungeon") {
    const selected = FLOOR_THEMES.find((theme) => theme.id === context.dungeonTheme) ??
      orderedThemes[0];
    const dungeonFloor = (normalizedFloor - 1) % 10 + 1;
    const cycle = Math.floor((normalizedFloor - 1) / 10);
    const bossFloors = [3, 6, 10];
    const bossStage = bossFloors.indexOf(dungeonFloor);
    const story = BIOME_STORIES[selected.id][storyIndex];
    return {
      ...selected,
      ...story,
      story,
      fullDungeon: true,
      arcLength: 10,
      arcStart: cycle * 10 + 1,
      arcEnd: cycle * 10 + 10,
      arcFloor: dungeonFloor,
      bossFloor: bossStage >= 0,
      bossStage,
    };
  }
  const cycleLength = orderedThemes.reduce((sum, theme) => sum + theme.arcLength, 0);
  const cycle = Math.floor((normalizedFloor - 1) / cycleLength);
  const cycleFloor = (normalizedFloor - 1) % cycleLength + 1;
  let cursor = 1;
  for (const theme of orderedThemes) {
    const arcStart = cycle * cycleLength + cursor;
    const arcEnd = arcStart + theme.arcLength - 1;
    if (cycleFloor < cursor + theme.arcLength) {
      const story = BIOME_STORIES[theme.id][storyIndex];
      return {
        ...theme,
        ...story,
        story,
        arcStart,
        arcEnd,
        arcFloor: normalizedFloor - arcStart + 1,
        bossFloor: normalizedFloor === arcEnd,
        bossStage: 2,
      };
    }
    cursor += theme.arcLength;
  }
  return orderedThemes[0];
}

function bossForTheme(theme) {
  const bosses = BIOME_BOSSES[theme.id];
  return bosses[clamp(Number(theme.bossStage ?? 2), 0, bosses.length - 1)];
}

function themeSignature(theme) {
  return [
    theme.id,
    theme.story?.title ?? theme.title ?? "story",
    theme.fullDungeon ? "full" : "arcs",
    theme.arcStart,
    theme.arcEnd,
  ].join(":");
}

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

export function averageHitPointMaximum(member) {
  const level = Math.max(1, Math.min(20, Math.floor(Number(member.level) || 1)));
  const constitution = Math.max(-5, Math.min(10, Math.floor(Number(member.conModifier) || 0)));
  const die = CLASS_HIT_DIE[member.class] ?? 8;
  const firstLevel = Math.max(1, die + constitution);
  const laterLevel = Math.max(1, Math.floor(die / 2) + 1 + constitution);
  return firstLevel + (level - 1) * laterLevel;
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
  const wounded = members.filter((member) => Number(member.hp) / Number(member.maxHp) < 0.5).length;
  const critical =
    members.filter((member) => Number(member.hp) / Number(member.maxHp) < 0.25).length;

  // Attrition is intentionally dominant: lowering HP must always lower readiness.
  // Defense and level describe capacity, while HP/resources describe current condition.
  const defenseFactor = clamp((defense - 10) / 12, 0, 1);
  const afflictionLoad = options.trackAfflictions === false ? 0 : members.reduce((sum, member) => {
    const conditions = member.conditions?.length ?? 0;
    const exhaustion = Number(member.exhaustion ?? 0);
    return sum + conditions * .035 + exhaustion * .055 + (member.concentration ? .01 : 0);
  }, 0) / members.length;
  const fragilityPenalty = wounded / members.length * .04 + critical / members.length * .12;
  const readiness = clamp(
    hpRatio * 0.58 + resourceRatio * 0.27 + defenseFactor * 0.15 - afflictionLoad -
      fragilityPenalty,
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
    fragilityPenalty,
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
  // Learned performance can nudge planning, but it must never overpower current attrition.
  const learnedAdjustment = clamp((1 - calibration) * .2, -.07, .07);
  const planningReadiness = clamp(profile.readiness + learnedAdjustment, 0, 1);
  const awarenessPressure = clamp(Number(modelContext.awareness ?? 0) * .025, 0, .16);
  profile.planningReadiness = planningReadiness;
  profile.calibration = calibration;
  profile.learnedAdjustment = learnedAdjustment;
  const rng = createRng(
    `${seed}:encounters:${completed}:${Math.round(profile.hpRatio * 20)}:${
      Math.round(profile.resourceRatio * 20)
    }`,
  );
  const theme = floorTheme(floor, { ...modelContext, ...(modelContext.settings ?? {}) });
  const milestoneFloor = theme.bossFloor;
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
    let pool = theme.strictEnemies ? [...THEMED_ARCHETYPES[theme.id]] : [
      ...(THEMED_ARCHETYPES[theme.id] ?? []),
      ...(THEMED_ARCHETYPES[theme.id] ?? []),
      ...(THEMED_ARCHETYPES[theme.id] ?? []),
      ...(THEMED_ARCHETYPES[theme.id] ?? []),
      ...(THEMED_ARCHETYPES[theme.id] ?? []),
      ...(THEMED_ARCHETYPES[theme.id] ?? []),
      ...(THEMED_ARCHETYPES[theme.id] ?? []),
      ...(THEMED_ARCHETYPES[theme.id] ?? []),
      ...ARCHETYPES,
    ];
    if (planningReadiness < 0.35 && index < 2) {
      pool = pool.filter((item) => item.kind !== "combat" || item.weight < 0.8);
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
      themeId: theme.id,
      enemyTags: theme.enemyTags,
      strictThemeEnemies: Boolean(theme.strictEnemies),
      storyTitle: theme.story?.title,
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
    const combatPool = (THEMED_ARCHETYPES[theme.id] ?? ARCHETYPES).filter((archetype) =>
      archetype.kind === "combat"
    );
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
  if (milestoneFloor && encounters[2]) {
    const boss = bossForTheme(theme);
    Object.assign(encounters[2], {
      title: boss.name,
      kind: "combat",
      icon: "♛",
      tone: "Dedicated boss",
      intent: "Floor boss",
      objective: boss.objective,
      twist: boss.twist,
      boss: true,
      bossMechanic: boss.mechanic,
      lairActions: boss.lairActions,
      foes: Math.max(1, encounters[2].foes),
    });
  }
  return {
    profile,
    encounters,
    plan: tier,
    pacing: pattern,
    floor,
    milestoneFloor,
    theme,
    themeSignature: themeSignature(theme),
    quest: {
      hook: theme.hook,
      target: theme.target,
      progress: milestoneFloor
        ? `The trail ends here: ${theme.target} is on this floor.`
        : `Arc floor ${theme.arcFloor} of ${theme.arcLength}. Clues point deeper toward ${theme.target}.`,
    },
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
  FIRE: "*",
  BOSS: "B",
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
  "*": { name: "Open flame", kind: "fire" },
  "B": { name: "Boss arena", kind: "boss" },
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
export function generateDungeon(seed, width = 55, height = 31, options = {}) {
  const floor = Number(options.floor ?? 1);
  const theme = floorTheme(floor, options);
  const floorBoss = bossForTheme(theme);
  const rng = createRng(`${seed}:geometry`);
  const grid = Array.from({ length: height }, () => Array(width).fill(TILE.VOID));
  const steps = [];
  const rooms = [];
  const bossFloor = theme.bossFloor;
  const regularRoomTarget = bossFloor ? 7 + Math.floor(rng() * 3) : 10 + Math.floor(rng() * 3);
  const roomTarget = regularRoomTarget + (bossFloor ? 1 : 0);

  if (bossFloor) {
    const variant = BOSS_ROOM_VARIANTS[Math.floor(rng() * BOSS_ROOM_VARIANTS.length)];
    const w = Math.min(14 + Math.floor(rng() * 5), width - 8);
    const h = Math.min(8 + Math.floor(rng() * 4), height - 8);
    const x = 3 + Math.floor(rng() * Math.max(1, width - w - 6));
    const y = 2 + Math.floor(rng() * Math.max(1, height - h - 4));
    rooms.push({
      x,
      y,
      w,
      h,
      cx: Math.floor(x + w / 2),
      cy: Math.floor(y + h / 2),
      role: "boss",
      condition: theme.conditions[0],
      dedicatedBoss: true,
      arenaVariant: variant,
    });
  }

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
  }

  rooms.sort((a, b) => a.cx - b.cx);
  const moves = options.roomMoves ?? {};
  const proposedRooms = rooms.map((room, index) => {
    const move = moves[index];
    if (!move) return { ...room };
    const x = clamp(Math.round(Number(move.x)), 2, width - room.w - 2);
    const y = clamp(Math.round(Number(move.y)), 2, height - room.h - 2);
    return { ...room, x, y, cx: Math.floor(x + room.w / 2), cy: Math.floor(y + room.h / 2) };
  });
  proposedRooms.forEach((proposed, index) => {
    if (!moves[index]) return;
    const overlaps = proposedRooms.some((other, otherIndex) =>
      otherIndex !== index &&
      proposed.x < other.x + other.w + 1 && proposed.x + proposed.w + 1 > other.x &&
      proposed.y < other.y + other.h + 1 && proposed.y + proposed.h + 1 > other.y
    );
    if (!overlaps) Object.assign(rooms[index], proposed);
  });
  // Rebuild room floors after applying persisted room edits.
  grid.forEach((row) => row.fill(TILE.VOID));
  rooms.forEach((room) => {
    for (let py = room.y; py < room.y + room.h; py++) {
      for (let px = room.x; px < room.x + room.w; px++) {
        if (room.dedicatedBoss) {
          const nx = (px + .5 - room.cx) / (room.w / 2);
          const ny = (py + .5 - room.cy) / (room.h / 2);
          if (room.arenaVariant.shape === "ellipse" && nx * nx + ny * ny > 1) continue;
          if (room.arenaVariant.shape === "rounded" && Math.pow(nx, 4) + Math.pow(ny, 4) > 1) {
            continue;
          }
        }
        grid[py][px] = TILE.FLOOR;
      }
    }
  });
  let roleIndex = 0;
  rooms.forEach((room) => {
    if (room.dedicatedBoss) {
      room.role = "boss";
      room.name = `Boss arena: ${floorBoss.name}`;
      room.bossMechanic = floorBoss.mechanic;
      room.lairActions = floorBoss.lairActions;
      room.arenaRule = room.arenaVariant.rule;
      room.name = `${room.arenaVariant.name}: ${floorBoss.name}`;
      return;
    }
    room.role = ROOM_ROLES[roleIndex % ROOM_ROLES.length];
    roleIndex += 1;
    if (theme.forbiddenRoles.includes(room.role)) room.role = theme.terrainRole;
    room.condition = theme.conditions[Math.floor(rng() * theme.conditions.length)];
    const names = ROOM_NAMES[room.role] ?? ROOM_NAMES.ordinary;
    room.name = names[Math.floor(rng() * names.length)];
  });
  const ordinaryRooms = rooms.filter((room) => !room.dedicatedBoss);
  const entry = ordinaryRooms[0];
  if (entry) entry.role = "entry";
  // The exit may loop close to the entrance. A shorter delve produces fewer caches.
  const exitCandidates = ordinaryRooms.slice(2).filter((room) =>
    ["encounter", "ordinary"].includes(room.role)
  );
  const exit = exitCandidates[Math.floor(rng() * exitCandidates.length)] ?? ordinaryRooms.at(-1);
  if (exit) {
    exit.role = "exit";
    exit.name = ROOM_NAMES.exit[Math.floor(rng() * ROOM_NAMES.exit.length)];
  }
  const maximumDistance = Math.max(
    ...exitCandidates.map((room) => Math.abs(room.cx - entry.cx) + Math.abs(room.cy - entry.cy)),
    1,
  );
  const exitDistance = exit && entry
    ? Math.abs(exit.cx - entry.cx) + Math.abs(exit.cy - entry.cy)
    : maximumDistance;
  const lootCount = clamp(Math.round(exitDistance / maximumDistance * 3), 1, 3);
  rooms.filter((room) => room !== entry && room !== exit && room.role === "loot").forEach(
    (room) => {
      room.role = "ordinary";
    },
  );
  rooms.filter((room) =>
    room !== entry && room !== exit && ["encounter", "ordinary"].includes(room.role)
  ).slice(0, lootCount).forEach((room) => {
    room.role = "loot";
    room.name = ROOM_NAMES.loot[Math.floor(rng() * ROOM_NAMES.loot.length)];
  });
  function carve(x, y) {
    if (x > 0 && y > 0 && x < width - 1 && y < height - 1) grid[y][x] = TILE.FLOOR;
  }
  const bossRoom = rooms.find((room) => room.dedicatedBoss);
  const connectionOrder = [...ordinaryRooms, ...(bossRoom ? [bossRoom] : [])];
  for (let index = 1; index < connectionOrder.length; index++) {
    let x = connectionOrder[index - 1].cx;
    let y = connectionOrder[index - 1].cy;
    const target = connectionOrder[index];
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
  rooms.filter((room) => room !== entry).forEach((room) => {
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
    boss: TILE.BOSS,
  };
  rooms.forEach((room) => {
    const feature = roleTiles[room.role];
    if (feature) grid[room.cy][room.cx] = feature;
    const specialTerrain = ["flooded", "ruined", "overgrown", "ossuary", "burning", "boss"]
      .includes(room.role);
    const themeTerrain = room.role !== "entry" &&
      rng() < (theme.id === "infernal-foundry" ? 1 : .72);
    if (specialTerrain || themeTerrain) {
      const conditionTile = room.role === "flooded"
        ? TILE.WATER
        : room.role === "boss" && theme.id === "drowned-grotto"
        ? TILE.WATER
        : room.role === "burning" || (room.role === "boss" && theme.id === "infernal-foundry")
        ? TILE.FIRE
        : theme.terrainTile ?? TILE.RUBBLE;
      for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
        for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
          const localX = x - room.x;
          const localY = y - room.y;
          const ringDistance = Math.abs(
            Math.hypot(x - room.cx, (y - room.cy) * 1.45) - Math.min(room.w, room.h) * .38,
          );
          const bossPattern = room.role === "boss" && (
            (room.arenaVariant.id === "vent-ring" && ringDistance < .75) ||
            (room.arenaVariant.id === "divided-arena" && localX === Math.floor(room.w / 2) &&
              localY % 4 !== 0) ||
            (room.arenaVariant.id === "four-altars" &&
              ((localX === 2 || localX === room.w - 3) &&
                (localY === 2 || localY === room.h - 3))) ||
            (room.arenaVariant.id === "spiral-crucible" &&
              (localX + localY * 2) % 6 === 0 && Math.abs(x - room.cx) + Math.abs(y - room.cy) > 2)
          );
          const density = room.role === "boss" ? .12 : theme.terrainDensity;
          if ((bossPattern || rng() < density) && grid[y][x] === TILE.FLOOR) {
            grid[y][x] = conditionTile;
          }
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

  return {
    seed,
    width,
    height,
    grid,
    rooms,
    steps,
    loot,
    tiles: TILE,
    theme,
    themeSignature: themeSignature(theme),
    restriction: theme.restriction,
    exitDistance,
    lootCount,
  };
}

/** Bind changing encounter content to stable rooms without mutating dungeon geometry. */
export function placeEncounters(encounters, dungeon, completed = 0) {
  const preferred = dungeon.rooms.filter((room) =>
    !["entry", "exit", "safe", "loot", "boss"].includes(room.role)
  );
  const candidates = preferred.length >= 3 ? preferred : dungeon.rooms.slice(1, -1);
  const start = (completed * 3) % candidates.length;
  return encounters.map((encounter, index) => {
    const bossRoom = encounter.boss && dungeon.rooms.find((candidate) => candidate.role === "boss");
    const room = bossRoom ?? candidates[(start + index) % candidates.length];
    return {
      ...encounter,
      marker: index + 1,
      room: {
        name: room.name,
        role: room.role,
        condition: room.condition,
        arenaRule: room.arenaRule,
        arenaVariant: room.arenaVariant?.name,
        x: room.cx,
        y: room.cy,
        coordinates: `${String.fromCharCode(65 + Math.floor(room.cx / 5))}${room.cy + 1}`,
      },
    };
  });
}
