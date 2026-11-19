import { discoverFilms } from "@/lib/letterboxd";
import { hasTmdbConfig, type DiscoverSeed } from "@/lib/tmdb";

export const maxDuration = 90;

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
  if (!body) return Response.json({ error: "Geçersiz keşif isteği." }, { status: 400 });

  try {
    const res = await discoverFilms({
      seeds: body.seeds ?? [],
      genreIds: body.genreIds ?? [],
      excludeKeys: body.excludeKeys ?? [],
      excludeTmdbIds: body.excludeTmdbIds ?? [],
      limit: 72,
    });
    return Response.json({ ...res, enabled: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Keşif başarısız" }, { status: 500 });
  }
}
