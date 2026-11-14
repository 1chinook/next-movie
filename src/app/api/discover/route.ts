import { discoverFilms } from "@/lib/letterboxd";
import { hasTmdbConfig, type DiscoverSeed } from "@/lib/tmdb";

export const maxDuration = 60;

interface DiscoverBody {
  seeds?: DiscoverSeed[];
  genreIds?: number[];
  excludeKeys?: string[];
  excludeTmdbIds?: number[];
}

export async function POST(request: Request) {
  if (!hasTmdbConfig()) {
    return Response.json({ films: [], seedMap: {}, enabled: false });
  }
  const body = (await request.json().catch(() => null)) as DiscoverBody | null;
  if (!body?.seeds?.length && !body?.genreIds?.length) {
    return Response.json({ films: [], seedMap: {}, enabled: true });
  }

  try {
    const res = await discoverFilms({
      seeds: body.seeds ?? [],
      genreIds: body.genreIds ?? [],
      excludeKeys: body.excludeKeys ?? [],
      excludeTmdbIds: body.excludeTmdbIds ?? [],
      limit: 30,
    });
    return Response.json({ ...res, enabled: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Keşif başarısız" }, { status: 500 });
  }
}
