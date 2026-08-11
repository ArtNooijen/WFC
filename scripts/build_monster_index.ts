const API = "https://www.dnd5eapi.co/api/2014";
const output = new URL("../monster_index.json", import.meta.url);

async function fetchJson(url: string, attempts = 5): Promise<any> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === attempts - 1) {
      throw new Error(`${url} failed: ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }
}

function mechanics(monster: any) {
  const actions = [
    ...(monster.actions ?? []),
    ...(monster.special_abilities ?? []),
    ...(monster.legendary_actions ?? []),
  ];
  const text = actions.map((action: any) => `${action.name} ${action.desc ?? ""}`).join(" ");
  const saves = ["STR", "DEX", "CON", "INT", "WIS", "CHA"].filter((ability) =>
    new RegExp(
      `DC\\s*\\d+\\s*${ability}|${ability}(?:ength|terity|stitution|elligence|dom|risma)? saving throw`,
      "i",
    ).test(text)
  );
  const conditions = [
    ...new Set(actions.flatMap((action: any) =>
      (action.dc?.success_type || action.usage ||
          /grappled|restrained|frightened|charmed|poisoned|prone|stunned|paralyzed/i.test(
            action.desc ?? "",
          ))
        ? (String(action.desc ?? "").match(
          /grappled|restrained|frightened|charmed|poisoned|prone|stunned|paralyzed/gi,
        ) ?? []).map((value: string) => value.toLowerCase())
        : []
    )),
  ];
  return {
    index: monster.index,
    name: monster.name,
    cr: monster.challenge_rating,
    attackRoll: actions.some((action: any) =>
      Number.isFinite(action.attack_bonus) || /weapon attack:/i.test(action.desc ?? "")
    ),
    saves,
    aoe: /each creature|creatures? in a|cone|line that is|radius|sphere|cube/i.test(text),
    control: conditions.length > 0 || /grapple|restrain|speed becomes 0|can.?t move/i.test(text),
    conditions,
    bypassesAc: saves.length > 0 || /automatically hits|takes \d+d\d+|each creature/i.test(text),
  };
}

const list = await fetchJson(`${API}/monsters`);
const entries = [];
for (let offset = 0; offset < list.results.length; offset += 4) {
  const batch = list.results.slice(offset, offset + 4);
  entries.push(
    ...await Promise.all(batch.map(async (reference: any) => {
      return mechanics(await fetchJson(`${API}/monsters/${reference.index}`));
    })),
  );
  await new Promise((resolve) => setTimeout(resolve, 120));
}
const byCr = Object.groupBy(entries, (entry: any) => String(entry.cr));
await Deno.writeTextFile(
  output,
  `${
    JSON.stringify({ generatedAt: new Date().toISOString(), source: API, entries, byCr }, null, 2)
  }\n`,
);
console.log(`Indexed ${entries.length} monsters in ${output.pathname}`);
