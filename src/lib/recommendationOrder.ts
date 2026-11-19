import type { Recommendation } from "./analysis";
import { audienceOf } from "./moviePreferences";

export const SORTS = [
  { id: "balanced", label: "Dengeli" },
  { id: "match", label: "En uyumlu" },
  { id: "votes", label: "En çok oy alan" },
  { id: "runtime", label: "En kısa" },
] as const;

export type RecommendationSort = (typeof SORTS)[number]["id"];
export const RECOMMENDATION_PAGE_SIZE = 18;

export function orderRecommendations(recs: Recommendation[], sort: RecommendationSort) {
  if (sort === "match") return recs;
  if (sort === "votes") return [...recs].sort((a, b) => (b.meta.voteCount ?? 0) - (a.meta.voteCount ?? 0));
  if (sort === "runtime") return [...recs].sort((a, b) => (a.meta.runtime ?? Number.MAX_VALUE) - (b.meta.runtime ?? Number.MAX_VALUE));

  const pending = [...recs];
  const featured: Recommendation[] = [];
  const directors = new Map<string, number>();
  const genres = new Map<string, number>();
  let nicheCount = 0;
  const isNiche = (r: Recommendation) => audienceOf(r.meta.voteCount) === "niche";
  const reachBonus = { popular: 8, medium: 3, niche: 0 };
  const weightedScore = (r: Recommendation) => r.score
    + reachBonus[audienceOf(r.meta.voteCount) ?? "niche"]
    - Math.min(8, 4 * (directors.get(r.meta.directors[0]) ?? 0))
    - Math.min(6, 2 * (genres.get(r.meta.genres[0]) ?? 0));
  for (let i = 0; i < RECOMMENDATION_PAGE_SIZE && pending.length; i++) {
    const reserveForWiderAudience = nicheCount >= 4
      && pending.some((r) => audienceOf(r.meta.voteCount) === "popular" || audienceOf(r.meta.voteCount) === "medium");
    let index = -1;
    for (const [at, next] of pending.entries()) {
      if (reserveForWiderAudience && isNiche(next)) continue;
      if (index === -1 || weightedScore(next) > weightedScore(pending[index])) index = at;
    }
    const [next] = pending.splice(index, 1);
    featured.push(next);
    const director = next.meta.directors[0];
    const genre = next.meta.genres[0];
    if (director) directors.set(director, (directors.get(director) ?? 0) + 1);
    if (genre) genres.set(genre, (genres.get(genre) ?? 0) + 1);
    if (isNiche(next)) nicheCount++;
  }
  return [...featured, ...pending];
}
