import type { FilmMeta } from "./types";

export const AUDIENCES = [
  { id: "popular", label: "Popüler", min: 1500 },
  { id: "medium", label: "Orta kitle", min: 300, max: 1499 },
  { id: "niche", label: "Niş", min: 1, max: 299 },
] as const;

export type Audience = (typeof AUDIENCES)[number]["id"];

export function audienceOf(voteCount?: number): Audience | undefined {
  if (voteCount && voteCount >= AUDIENCES[0].min) return "popular";
  if (voteCount && voteCount >= AUDIENCES[1].min) return "medium";
  return voteCount && voteCount > 0 ? "niche" : undefined;
}

export const MOODS = [
  { id: "light", label: "Kafa dağıtmalık", genres: [35, 10751, 16], except: [27, 53] },
  { id: "exciting", label: "Heyecanlı", genres: [28, 12, 53], except: [] },
  { id: "emotional", label: "Duygusal", genres: [18, 10749], except: [27, 28, 53] },
  { id: "thoughtful", label: "Düşündüren", genres: [99, 878, 9648, 36], except: [] },
  { id: "dark", label: "Karanlık", genres: [27, 80, 53, 10752], except: [10751] },
  { id: "escapist", label: "Başka dünyalar", genres: [12, 14, 878], except: [] },
] as const;

export type Mood = (typeof MOODS)[number]["id"];

const genreByName: Record<string, number> = {
  action: 28, aksiyon: 28, adventure: 12, macera: 12, animation: 16, animasyon: 16,
  comedy: 35, komedi: 35, crime: 80, suc: 80, documentary: 99, belgesel: 99,
  drama: 18, dram: 18, family: 10751, aile: 10751, fantasy: 14, fantastik: 14,
  history: 36, tarih: 36, horror: 27, korku: 27, mystery: 9648, gizem: 9648,
  romance: 10749, romantik: 10749, "science fiction": 878, "bilim kurgu": 878,
  thriller: 53, gerilim: 53, war: 10752, savas: 10752,
};

function genreName(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/[-_]/g, " ").trim();
}

export function moodsFor(meta: Pick<FilmMeta, "genreIds" | "genres">): Mood[] {
  const ids = new Set(meta.genreIds?.length ? meta.genreIds : meta.genres.map((genre) => genreByName[genreName(genre)]));
  return MOODS.filter(({ genres, except }) => genres.some((id) => ids.has(id)) && !except.some((id) => ids.has(id)))
    .map(({ id }) => id);
}

export function audienceReach(voteCount?: number) {
  return voteCount && voteCount > 0 ? Math.min(1, Math.log10(1 + voteCount) / 4) : 0;
}
