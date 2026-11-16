import { filmKey, normalizeTitle } from "./keys";
import type { FilmLookup, FilmMeta } from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

const regionNames = new Intl.DisplayNames(["tr"], { type: "region" });

export function hasTmdbConfig(): boolean {
  return Boolean(process.env.TMDB_READ_TOKEN || process.env.TMDB_API_KEY);
}

async function tmdbGet<T>(endpoint: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const token = process.env.TMDB_READ_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && !apiKey) throw new Error("TMDB_API_KEY veya TMDB_READ_TOKEN tanımlı değil.");

  const url = new URL(`${TMDB_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  if (!token && apiKey) url.searchParams.set("api_key", apiKey);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), { headers, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`TMDB ${res.status} döndü: ${endpoint}`);
  return res.json() as Promise<T>;
}

interface TmdbMovieSummary {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
}

interface TmdbListResponse {
  results: TmdbMovieSummary[];
}

interface TmdbMovieDetail {
  id: number;
  title: string;
  original_title: string;
  original_language?: string;
  overview?: string;
  release_date?: string;
  runtime?: number | null;
  vote_average?: number;
  vote_count?: number;
  poster_path?: string | null;
  genres?: { id: number; name: string }[];
  production_countries?: { iso_3166_1: string; name: string }[];
  credits?: {
    cast?: { name: string; order?: number }[];
    crew?: { name: string; job?: string }[];
  };
}

function pickBestMatch(results: TmdbMovieSummary[], lookup: FilmLookup): TmdbMovieSummary | null {
  if (!results.length) return null;
  const target = normalizeTitle(lookup.name);
  const scored = results.map((item) => {
    const itemYear = item.release_date ? Number(item.release_date.slice(0, 4)) : undefined;
    const tNorm = normalizeTitle(item.title);
    const oNorm = normalizeTitle(item.original_title);
    let score = 0;
    const exactTitle = tNorm === target || oNorm === target;
    if (exactTitle) score += 100;
    else if (tNorm.includes(target) || oNorm.includes(target) || target.includes(tNorm)) score += 40;

    if (lookup.year && itemYear) {
      const diff = Math.abs(lookup.year - itemYear);
      if (diff === 0) score += 60;
      else if (diff === 1) score += 25;
      else if (!exactTitle || diff > 3) score -= diff * 20;
      else score -= diff * 5;
    }
    score += Math.min(15, (item.popularity ?? 0) / 5);
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].score >= 30 ? scored[0].item : null;
}

function countryLabel(c: { iso_3166_1: string; name: string }): string {
  try {
    return regionNames.of(c.iso_3166_1) || c.name;
  } catch {
    return c.name;
  }
}

/** Düşük oy sayılı filmlerde puan şişmesini önleyen Bayesian ortalama (0-5). */
function bayesianRating(voteAvg?: number, voteCount?: number): number | undefined {
  if (typeof voteAvg !== "number" || voteAvg <= 0) return undefined;
  const v = voteCount ?? 0;
  const r = voteAvg / 2;
  const m = 150;
  const prior = 3.25;
  return Math.round(((v * r + m * prior) / (v + m)) * 100) / 100;
}

export async function fetchTmdbMovieDetail(tmdbId: number, lookup?: Partial<FilmLookup>): Promise<FilmMeta> {
  const detail = await tmdbGet<TmdbMovieDetail>(`/movie/${tmdbId}`, {
    append_to_response: "credits",
    language: "tr-TR",
  });

  const year =
    lookup?.year ?? (detail.release_date && /^\d{4}/.test(detail.release_date) ? Number(detail.release_date.slice(0, 4)) : undefined);
  const directors = (detail.credits?.crew ?? [])
    .filter((c) => c.job === "Director")
    .map((c) => c.name)
    .filter(Boolean);
  const actors = (detail.credits?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 8)
    .map((c) => c.name)
    .filter(Boolean);

  const genres = [...new Set((detail.genres ?? []).map((g) => g.name.trim()).filter(Boolean))];
  const genreIds = (detail.genres ?? []).map((g) => g.id);
  const countries = [...new Set((detail.production_countries ?? []).map(countryLabel).filter(Boolean))];

  const key = lookup?.key ?? filmKey(detail.original_title || detail.title, year);
  const url = lookup?.slug
    ? `https://letterboxd.com/film/${lookup.slug}/`
    : lookup?.uri || `https://www.themoviedb.org/movie/${detail.id}`;

  return {
    key,
    slug: lookup?.slug || `tmdb-${detail.id}`,
    name: lookup?.name || detail.title || detail.original_title,
    originalName: detail.original_title,
    originalLanguage: detail.original_language || undefined,
    year,
    tmdbId: detail.id,
    genreIds,
    directors: [...new Set(directors)],
    actors,
    genres,
    countries,
    runtime: detail.runtime && detail.runtime > 0 ? detail.runtime : undefined,
    avgRating: bayesianRating(detail.vote_average, detail.vote_count),
    voteCount: detail.vote_count,
    poster: detail.poster_path ? `${TMDB_IMG}${detail.poster_path}` : undefined,
    url,
    description: detail.overview || undefined,
  };
}

export async function fetchTmdbFilmMeta(lookup: FilmLookup): Promise<FilmMeta | null> {
  let search = await tmdbGet<TmdbListResponse>("/search/movie", {
    query: lookup.name,
    year: lookup.year,
    include_adult: "false",
    language: "en-US",
  });

  if (!search.results.length && lookup.year) {
    search = await tmdbGet<TmdbListResponse>("/search/movie", {
      query: lookup.name,
      include_adult: "false",
      language: "en-US",
    });
  }

  const best = pickBestMatch(search.results, lookup);
  if (!best) return null;
  return fetchTmdbMovieDetail(best.id, lookup);
}

export interface DiscoverSeed {
  tmdbId: number;
  name: string;
  owner: "A" | "B" | "both";
}

export interface SeedHitInfo {
  fromSeeds: { name: string; owner: "A" | "B" | "both" }[];
}

export async function collectDiscoveryIds(
  seeds: DiscoverSeed[],
  genreIds: number[],
  excludeKeys: Set<string>,
  excludeTmdbIds: Set<number>,
): Promise<{ tmdbId: number; info: SeedHitInfo; key: string; name: string; year?: number; rank: number }[]> {
  const pool = new Map<number, { item: TmdbMovieSummary; fromSeeds: SeedHitInfo["fromSeeds"]; rank: number }>();

  const isExcluded = (m: TmdbMovieSummary) => {
    if (excludeTmdbIds.has(m.id)) return true;
    const y = m.release_date && /^\d{4}/.test(m.release_date) ? Number(m.release_date.slice(0, 4)) : undefined;
    if (excludeKeys.has(filmKey(m.title, y)) || excludeKeys.has(filmKey(m.original_title, y))) return true;
    // Yıl kayması (+/-1) için de kontrol
    if (y) {
      for (const d of [-1, 1]) {
        if (excludeKeys.has(filmKey(m.title, y + d)) || excludeKeys.has(filmKey(m.original_title, y + d))) return true;
      }
    }
    return false;
  };

  // 1. Favori filmlerden TMDB recommendations
  await Promise.all(
    seeds.slice(0, 12).map(async (seed) => {
      try {
        const res = await tmdbGet<TmdbListResponse>(`/movie/${seed.tmdbId}/recommendations`, { language: "en-US", page: 1 });
        for (const [idx, m] of res.results.slice(0, 14).entries()) {
          if ((m.vote_count ?? 0) < 120 || (m.vote_average ?? 0) < 6.4) continue;
          if (isExcluded(m)) continue;
          const entry = pool.get(m.id) ?? { item: m, fromSeeds: [], rank: 0 };
          if (!entry.fromSeeds.some((s) => s.name === seed.name)) {
            entry.fromSeeds.push({ name: seed.name, owner: seed.owner });
          }
          const ownerBonus = seed.owner === "both" ? 5 : 3.5;
          entry.rank += ownerBonus + Math.max(0, 14 - idx) * 0.15 + ((m.vote_average ?? 6.5) - 6.5) * 0.4;
          pool.set(m.id, entry);
        }
      } catch {
        /* Tekil seed hatasını yoksay */
      }
    }),
  );

  // 2. Ortak sevilen tür kombinasyonlarından yüksek oy sayılı keşif
  const genreQueries: string[] = [];
  if (genreIds.length >= 2) genreQueries.push(`${genreIds[0]},${genreIds[1]}`);
  if (genreIds.length >= 3) genreQueries.push(`${genreIds[0]},${genreIds[2]}`);
  if (genreIds.length >= 1) genreQueries.push(String(genreIds[0]));
  const withoutGenres = genreIds.includes(99) ? "10770" : "99,10770";

  await Promise.all(
    genreQueries.map(async (with_genres) => {
      try {
        const res = await tmdbGet<TmdbListResponse>("/discover/movie", {
          with_genres,
          without_genres: withoutGenres,
          sort_by: "vote_average.desc",
          "vote_count.gte": 1500,
          "vote_average.gte": 7.2,
          include_adult: "false",
          language: "en-US",
          page: 1,
        });
        for (const m of res.results.slice(0, 10)) {
          if (isExcluded(m)) continue;
          const entry = pool.get(m.id) ?? { item: m, fromSeeds: [], rank: 0 };
          entry.rank += 1.0 + ((m.vote_average ?? 7) - 7) * 0.5;
          pool.set(m.id, entry);
        }
      } catch {
        /* yoksay */
      }
    }),
  );

  return [...pool.entries()]
    .map(([tmdbId, e]) => {
      const year = e.item.release_date && /^\d{4}/.test(e.item.release_date) ? Number(e.item.release_date.slice(0, 4)) : undefined;
      return {
        tmdbId,
        info: { fromSeeds: e.fromSeeds },
        key: filmKey(e.item.title || e.item.original_title, year),
        name: e.item.title || e.item.original_title,
        year,
        rank: e.rank,
      };
    })
    .sort((a, b) => b.rank - a.rank);
}
