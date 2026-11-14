import { BlockedError, getFilmMeta, mapLimit } from "@/lib/letterboxd";
import type { FilmLookup } from "@/lib/types";

export const maxDuration = 120;

/** POST { films: FilmLookup[] } -> { films: FilmMeta[], failed: string[] } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { films?: FilmLookup[] } | null;
  const films = (body?.films ?? []).slice(0, 40);

  try {
    const results = await mapLimit(films, 4, (f) => getFilmMeta(f));
    return Response.json({
      films: results.filter(Boolean),
      failed: films.filter((_, i) => !results[i]).map((f) => f.key),
    });
  } catch (e) {
    const status = e instanceof BlockedError ? 503 : 500;
    return Response.json({ error: e instanceof Error ? e.message : "Bilinmeyen hata" }, { status });
  }
}
