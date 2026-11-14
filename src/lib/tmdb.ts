import type { FilmLookup, FilmMeta } from "./types";
import { normalizeTitle } from "./keys";

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

  const res = await fetch(url.toString(), { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`TMDB ${res.status} döndü: ${endpoint}`);
  }
  return res.json() as Promise<T>;
}

interface TmdbSearchItem {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  popularity?: number;
}

interface TmdbSearchResponse {
  results: TmdbSearchItem[];
}

interface TmdbMovieDetail {
  id: number;
  title: string;
  original_title: string;
  overview?: string;
  release_date?: string;
  runtime?: number | null;
  vote_average?: number;
  poster_path?: string | null;
  genres?: { id: number; name: string }[];
  production_countries?: { iso_3166_1: string; name: string }[];
  credits?: {
    cast?: { name: string; order?: number }[];
    crew?: { name: string; job?: string }[];
  };
}

function pickBestMatch(results: TmdbSearchItem[], lookup: FilmLookup): TmdbSearchItem | null {
  if (!results.length) return null;
  const target = normalizeTitle(lookup.name);
  const scored = results.map((item) => {
    const itemYear = item.release_date ? Number(item.release_date.slice(0, 4)) : undefined;
    const tNorm = normalizeTitle(item.title);
    const oNorm = normalizeTitle(item.original_title);
    let score = 0;
    if (tNorm === target || oNorm === target) score += 100;
    else if (tNorm.includes(target) || oNorm.includes(target)) score += 40;

    if (lookup.year && itemYear) {
      const diff = Math.abs(lookup.year - itemYear);
      if (diff === 0) score += 60;
      else if (diff === 1) score += 25;
      else score -= diff * 10;
    }
    score += Math.min(20, (item.popularity ?? 0) / 5);
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].item;
}

function countryLabel(c: { iso_3166_1: string; name: string }): string {
  try {
    return regionNames.of(c.iso_3166_1) || c.name;
  } catch {
    return c.name;
  }
}

export async function fetchTmdbFilmMeta(lookup: FilmLookup): Promise<FilmMeta | null> {
  // Önce yılla ara; bulunamazsa yıl kısıtı olmadan ara (festival/vizyon yılı farkı için).
  let search = await tmdbGet<TmdbSearchResponse>("/search/movie", {
    query: lookup.name,
    year: lookup.year,
    include_adult: "false",
    language: "en-US",
  });

  if (!search.results.length && lookup.year) {
    search = await tmdbGet<TmdbSearchResponse>("/search/movie", {
      query: lookup.name,
      include_adult: "false",
      language: "en-US",
    });
  }

  const best = pickBestMatch(search.results, lookup);
  if (!best) return null;

  const detail = await tmdbGet<TmdbMovieDetail>(`/movie/${best.id}`, {
    append_to_response: "credits",
    language: "tr-TR",
  });

  const year =
    lookup.year ?? (detail.release_date && /^\d{4}/.test(detail.release_date) ? Number(detail.release_date.slice(0, 4)) : undefined);
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
  const countries = [...new Set((detail.production_countries ?? []).map(countryLabel).filter(Boolean))];

  const fallbackUrl = lookup.slug
    ? `https://letterboxd.com/film/${lookup.slug}/`
    : lookup.uri || `https://www.themoviedb.org/movie/${detail.id}`;

  return {
    key: lookup.key,
    slug: lookup.slug || `tmdb-${detail.id}`,
    name: lookup.name || detail.title || detail.original_title,
    year,
    directors: [...new Set(directors)],
    actors,
    genres,
    countries,
    runtime: detail.runtime && detail.runtime > 0 ? detail.runtime : undefined,
    avgRating: typeof detail.vote_average === "number" && detail.vote_average > 0 ? Math.round((detail.vote_average / 2) * 100) / 100 : undefined,
    poster: detail.poster_path ? `${TMDB_IMG}${detail.poster_path}` : undefined,
    url: fallbackUrl,
    description: detail.overview || undefined,
  };
}
