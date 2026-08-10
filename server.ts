import { applyForecastControls, buildEncounterForecast } from "./public/lib/adventure.js";
import { enrichWithSrd, getClassProfile, getConditions, hydratePartyResources } from "./srd.ts";

const ROOT = new URL("./public/", import.meta.url);
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function safePath(pathname: string): URL | null {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  if (requested.includes("..")) return null;
  const url = new URL(requested, ROOT);
  return url.href.startsWith(ROOT.href) ? url : null;
}

const port = Number(Deno.env.get("PORT") ?? 8000);

Deno.serve({ port }, async (request) => {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/forecast") {
    try {
      const body = await request.json();
      let base = buildEncounterForecast(
        body.party,
        body.seed,
        body.completed ?? 0,
        body.floor ?? 1,
        {
          calibration: body.learning?.calibration,
          samples: body.learning?.samples,
          awareness: body.learning?.awareness,
          themeOrder: body.learning?.themeOrder,
          storyVariant: body.learning?.storyVariant,
          settings: body.settings,
        },
      );
      base = applyForecastControls(
        base,
        body.party,
        body.seed,
        body.completed ?? 0,
        body.floor ?? 1,
        body.controls,
        {
          calibration: body.learning?.calibration,
          samples: body.learning?.samples,
          awareness: body.learning?.awareness,
          themeOrder: body.learning?.themeOrder,
          storyVariant: body.learning?.storyVariant,
          settings: body.settings,
        },
      );
      try {
        const hydrated = await hydratePartyResources(body.party);
        base = buildEncounterForecast(
          hydrated.party,
          body.seed,
          body.completed ?? 0,
          body.floor ?? 1,
          {
            calibration: body.learning?.calibration,
            samples: body.learning?.samples,
            awareness: body.learning?.awareness,
            themeOrder: body.learning?.themeOrder,
            storyVariant: body.learning?.storyVariant,
            settings: body.settings,
          },
        );
        base = applyForecastControls(
          base,
          hydrated.party,
          body.seed,
          body.completed ?? 0,
          body.floor ?? 1,
          body.controls,
          {
            calibration: body.learning?.calibration,
            samples: body.learning?.samples,
            awareness: body.learning?.awareness,
            themeOrder: body.learning?.themeOrder,
            storyVariant: body.learning?.storyVariant,
            settings: body.settings,
          },
        );
        return json(
          await enrichWithSrd(hydrated.party, base, body.seed, hydrated.classProfiles),
        );
      } catch (error) {
        console.error("SRD enrichment unavailable:", error);
        return json({
          ...base,
          dataSource: "fallback",
          warning: "The live 5e SRD API is unavailable; showing local fallback content.",
        });
      }
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid request" }, 400);
    }
  }

  const classMatch = url.pathname.match(/^\/api\/srd\/classes\/([a-z-]+)\/levels\/(\d{1,2})$/);
  if (request.method === "GET" && classMatch) {
    try {
      return json(await getClassProfile(classMatch[1], Number(classMatch[2])));
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "Unable to load class data" },
        502,
      );
    }
  }

  if (request.method === "GET" && url.pathname === "/api/srd/conditions") {
    try {
      return json(await getConditions());
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "Unable to load conditions" },
        502,
      );
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const fileUrl = safePath(url.pathname);
  if (!fileUrl) return new Response("Not found", { status: 404 });

  try {
    const file = await Deno.readFile(fileUrl);
    const extension = fileUrl.pathname.slice(fileUrl.pathname.lastIndexOf("."));
    return new Response(request.method === "HEAD" ? null : file, {
      headers: {
        "content-type": MIME[extension] ?? "application/octet-stream",
        "cache-control": "no-cache",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});

console.log(`Delvewright is ready at http://localhost:${port}`);
