import type { Recommendation } from "./analysis";
import { audienceOf } from "./moviePreferences";

export const SORTS = [
  { id: "balanced", label: "Dengeli" },
  { id: "match", label: "En uyumlu" },
  { id: "votes", label: "En çok oy alan" },
  { id: "runtime", label: "En kısa" },
] as const;

export type RecommendationSort = (typeof SORTS)[number]["id"];

export function orderRecommendations(recs: Recommendation[], sort: RecommendationSort) {
  if (sort === "match") return recs;
  if (sort === "votes") return [...recs].sort((a, b) => (b.meta.voteCount ?? 0) - (a.meta.voteCount ?? 0));
  if (sort === "runtime") return [...recs].sort((a, b) => (a.meta.runtime ?? Number.MAX_VALUE) - (b.meta.runtime ?? Number.MAX_VALUE));

  const pending = [...recs];
  const featured: Recommendation[] = [];
  const directors = new Map<string, number>();
  const genres = new Map<string, number>();
  let nicheCount = 0;
  const weightedScore = (r: Recommendation) => r.score
    - Math.min(8, 4 * (directors.get(r.meta.directors[0]) ?? 0))
    - Math.min(6, 2 * (genres.get(r.meta.genres[0]) ?? 0))
    - (audienceOf(r.meta.voteCount) === "niche" ? Math.min(8, 2 * Math.max(0, nicheCount - 1)) : 0);
  for (let i = 0; i < 12 && pending.length; i++) {
    const index = pending.reduce((best, next, at) => weightedScore(next) > weightedScore(pending[best]) ? at : best, 0);
    const [next] = pending.splice(index, 1);
    featured.push(next);
    const director = next.meta.directors[0];
    const genre = next.meta.genres[0];
    if (director) directors.set(director, (directors.get(director) ?? 0) + 1);
    if (genre) genres.set(genre, (genres.get(genre) ?? 0) + 1);
    if (audienceOf(next.meta.voteCount) === "niche") nicheCount++;
  }
  return [...featured, ...pending];
}
