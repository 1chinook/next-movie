import type { FilmMeta, FilmRef, UserData } from "./types";

export interface WatchedTogether {
  key: string;
  tmdbId?: number;
  name: string;
  year?: number;
  markedAt: string;
  meta?: FilmMeta;
  ratings?: Record<string, number>;
}

export function ratingFor(film: WatchedTogether, profileId?: string) {
  const value = profileId ? film.ratings?.[profileId] : undefined;
  return typeof value === "number" && value >= 0.5 && value <= 5 && Number.isInteger(value * 2)
    ? value
    : undefined;
}

export function matchesWatchedFilm(film: WatchedTogether, meta: Pick<FilmMeta, "key" | "tmdbId">) {
  return film.key === meta.key || (film.tmdbId !== undefined && film.tmdbId === meta.tmdbId);
}

export function includeSharedHistory(user: UserData, history: WatchedTogether[], metas: Map<string, FilmMeta>): UserData {
  const sharedKeys = new Set(history.map((film) => film.key));
  const sharedIds = new Map(history.flatMap((film) => film.tmdbId === undefined ? [] : [[film.tmdbId, film.key] as const]));
  function sharedKey(ref: FilmRef) {
    const id = metas.get(ref.key)?.tmdbId;
    return sharedKeys.has(ref.key) ? ref.key : id === undefined ? undefined : sharedIds.get(id);
  }

  const watched = new Map<string, FilmRef>();
  for (const ref of user.watched) {
    const key = sharedKey(ref) ?? ref.key;
    const previous = watched.get(key);
    watched.set(key, previous ? { ...previous, rating: previous.rating ?? ref.rating, liked: previous.liked || ref.liked } : { ...ref, key });
  }
  for (const film of history) {
    const previous = watched.get(film.key);
    watched.set(film.key, {
      key: film.key,
      name: film.name,
      year: film.year,
      slug: film.meta?.slug || undefined,
      ...previous,
      rating: ratingFor(film, user.profileId) ?? previous?.rating,
    });
  }
  return { ...user, watched: [...watched.values()], watchlist: user.watchlist.filter((ref) => !sharedKey(ref)) };
}

export function withHistoryMetadata(metas: Map<string, FilmMeta>, history: WatchedTogether[]) {
  const merged = new Map(metas);
  const byId = new Map([...metas.values()].flatMap((meta) => meta.tmdbId === undefined ? [] : [[meta.tmdbId, meta] as const]));
  for (const film of history) {
    if (merged.has(film.key)) continue;
    const known = film.tmdbId === undefined ? undefined : byId.get(film.tmdbId);
    const meta = known ?? film.meta;
    if (meta) merged.set(film.key, { ...meta, key: film.key });
  }
  return merged;
}
