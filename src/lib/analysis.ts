import type { FilmMeta, FilmRef, UserData } from "./types";

export type FeatureKind = "genre" | "director" | "actor" | "decade" | "country";

const KIND_WEIGHT: Record<FeatureKind, number> = { genre: 1, director: 2.2, actor: 0.8, decade: 0.5, country: 0.5 };
export const KIND_LABEL: Record<FeatureKind, string> = {
  genre: "Tür",
  director: "Yönetmen",
  actor: "Oyuncu",
  decade: "Dönem",
  country: "Ülke",
};

export interface FeatureStat {
  kind: FeatureKind;
  name: string;
  /** Ağırlıklı beğeni skoru (pozitif = seviyor) */
  score: number;
  count: number;
  ratedCount: number;
  avgRating?: number;
}

export interface Profile {
  label: string;
  watchedCount: number;
  watchlistCount: number;
  ratedCount: number;
  likedCount: number;
  avgRating?: number;
  ratingHist: number[]; // 10 kova: 0.5 .. 5
  analyzedCount: number;
  avgRuntime?: number;
  avgYear?: number;
  features: Map<string, FeatureStat>;
  top: Record<FeatureKind, FeatureStat[]>;
  disliked: FeatureStat[];
  favorites: { meta: FilmMeta; rating?: number; liked?: boolean }[];
}

export type Depth = "fast" | "normal" | "deep";
export const DEPTH_LIMITS: Record<Depth, { profile: number; candidates: number }> = {
  fast: { profile: 60, candidates: 80 },
  normal: { profile: 120, candidates: 160 },
  deep: { profile: 250, candidates: 320 },
};

const fkey = (kind: FeatureKind, name: string) => `${kind}:${name}`;
const decadeOf = (y?: number) => (y ? `${Math.floor(y / 10) * 10}'ler` : null);

function featuresOf(m: FilmMeta): { kind: FeatureKind; name: string }[] {
  const out: { kind: FeatureKind; name: string }[] = [];
  m.genres.forEach((name) => out.push({ kind: "genre", name }));
  m.directors.forEach((name) => out.push({ kind: "director", name }));
  m.actors.slice(0, 5).forEach((name) => out.push({ kind: "actor", name }));
  m.countries.slice(0, 2).forEach((name) => out.push({ kind: "country", name }));
  const d = decadeOf(m.year);
  if (d) out.push({ kind: "decade", name: d });
  return out;
}

function meanSd(xs: number[]) {
  if (!xs.length) return { mean: undefined, sd: 1 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
  return { mean, sd };
}

// ---------------------------------------------------------------------------
// Hangi filmlerin detayı çekilecek?
// ---------------------------------------------------------------------------

export function pickProfileFilms(user: UserData, depth: Depth): FilmRef[] {
  const limit = DEPTH_LIMITS[depth].profile;
  const { mean = 3.5 } = meanSd(user.watched.flatMap((f) => (f.rating ? [f.rating] : [])));
  const signal = (f: FilmRef) => (f.rating ? Math.abs(f.rating - mean) + 0.5 : 0) + (f.liked ? 1 : 0);
  const informative = user.watched.filter((f) => f.rating || f.liked).sort((a, b) => signal(b) - signal(a));
  const picked = informative.slice(0, limit);
  if (picked.length < limit) {
    // Puansız izlenenlerden en yenileri (liste sonu genelde en yeni)
    const rest = user.watched.filter((f) => !f.rating && !f.liked).slice(-(limit - picked.length));
    picked.push(...rest);
  }
  return picked;
}

export interface Candidate {
  ref: FilmRef;
  inA: boolean;
  inB: boolean;
}

export function buildCandidates(a: UserData, b: UserData, depth: Depth): Candidate[] {
  const seenKeys = new Set([...a.watched, ...b.watched].map((f) => f.key));
  const seenSlugs = new Set([...a.watched, ...b.watched].flatMap((f) => (f.slug ? [f.slug] : [])));
  const map = new Map<string, Candidate>();
  for (const [list, side] of [
    [a.watchlist, "A"],
    [b.watchlist, "B"],
  ] as const) {
    for (const ref of list) {
      if (seenKeys.has(ref.key) || (ref.slug && seenSlugs.has(ref.slug))) continue;
      const c = map.get(ref.key) ?? { ref: { ...ref }, inA: false, inB: false };
      if (side === "A") c.inA = true;
      else c.inB = true;
      c.ref.slug ??= ref.slug;
      c.ref.uri ??= ref.uri;
      map.set(ref.key, c);
    }
  }
  const all = [...map.values()];
  const both = all.filter((c) => c.inA && c.inB);
  const single = all.filter((c) => !(c.inA && c.inB));
  // Tekli listelerden adil örnekleme: sırayla A ve B
  const onlyA = single.filter((c) => c.inA);
  const onlyB = single.filter((c) => c.inB);
  const mixed: Candidate[] = [];
  for (let i = 0; i < Math.max(onlyA.length, onlyB.length); i++) {
    if (onlyA[onlyA.length - 1 - i]) mixed.push(onlyA[onlyA.length - 1 - i]);
    if (onlyB[onlyB.length - 1 - i]) mixed.push(onlyB[onlyB.length - 1 - i]);
  }
  return [...both, ...mixed].slice(0, Math.max(DEPTH_LIMITS[depth].candidates, both.length));
}

// ---------------------------------------------------------------------------
// Zevk profili
// ---------------------------------------------------------------------------

export function buildProfile(user: UserData, metas: Map<string, FilmMeta>): Profile {
  const ratings = user.watched.flatMap((f) => (f.rating ? [f.rating] : []));
  const { mean, sd } = meanSd(ratings);
  const hist = new Array(10).fill(0);
  ratings.forEach((r) => hist[Math.min(9, Math.max(0, Math.round(r * 2) - 1))]++);

  const features = new Map<string, FeatureStat & { sumW: number; sumR: number }>();
  let analyzed = 0;
  const runtimes: number[] = [];
  const years: number[] = [];
  const favorites: Profile["favorites"] = [];

  for (const f of user.watched) {
    const m = metas.get(f.key);
    if (!m) continue;
    analyzed++;
    if (m.runtime) runtimes.push(m.runtime);
    if (m.year) years.push(m.year);

    let w: number;
    if (f.rating && mean !== undefined) w = Math.max(-2, Math.min(2, (f.rating - mean) / Math.max(sd, 0.5))) + (f.liked ? 0.6 : 0);
    else if (f.liked) w = 1;
    else w = 0.2;

    if ((f.rating && f.rating >= 4.5) || (f.liked && (!f.rating || f.rating >= 4))) favorites.push({ meta: m, rating: f.rating, liked: f.liked });

    for (const { kind, name } of featuresOf(m)) {
      const k = fkey(kind, name);
      const s = features.get(k) ?? { kind, name, score: 0, count: 0, ratedCount: 0, sumW: 0, sumR: 0 };
      s.count++;
      s.sumW += w;
      if (f.rating) {
        s.ratedCount++;
        s.sumR += f.rating;
      }
      features.set(k, s);
    }
  }

  const final = new Map<string, FeatureStat>();
  for (const [k, s] of features) {
    final.set(k, {
      kind: s.kind,
      name: s.name,
      count: s.count,
      ratedCount: s.ratedCount,
      avgRating: s.ratedCount ? s.sumR / s.ratedCount : undefined,
      // Az örnekli özellikleri bastır (shrinkage)
      score: s.sumW / Math.sqrt(s.count + 1),
    });
  }

  const minCount: Record<FeatureKind, number> = { genre: 2, director: 2, actor: 2, decade: 2, country: 2 };
  const top = {} as Profile["top"];
  (Object.keys(KIND_WEIGHT) as FeatureKind[]).forEach((kind) => {
    top[kind] = [...final.values()]
      .filter((s) => s.kind === kind && s.count >= minCount[kind] && s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  });
  const disliked = [...final.values()]
    .filter((s) => (s.kind === "genre" || s.kind === "director") && s.count >= 2 && s.score < -0.3)
    .sort((a, b) => a.score - b.score)
    .slice(0, 6);

  favorites.sort((x, y) => (y.rating ?? 4.2) - (x.rating ?? 4.2) + (y.liked ? 0.1 : 0) - (x.liked ? 0.1 : 0));

  return {
    label: user.label,
    watchedCount: user.watched.length,
    watchlistCount: user.watchlist.length,
    ratedCount: ratings.length,
    likedCount: user.watched.filter((f) => f.liked).length,
    avgRating: mean,
    ratingHist: hist,
    analyzedCount: analyzed,
    avgRuntime: runtimes.length ? runtimes.reduce((a, b) => a + b, 0) / runtimes.length : undefined,
    avgYear: years.length ? years.reduce((a, b) => a + b, 0) / years.length : undefined,
    features: final,
    top,
    disliked,
    favorites: favorites.slice(0, 12),
  };
}

// ---------------------------------------------------------------------------
// Uyum analizi
// ---------------------------------------------------------------------------

export interface Compatibility {
  score: number;
  commonWatched: number;
  jaccard: number;
  bothRated: number;
  correlation?: number;
  meanAbsDiff?: number;
  genreSimilarity: number;
  agreements: { name: string; year?: number; a: number; b: number }[];
  disagreements: { name: string; year?: number; a: number; b: number }[];
  sharedLoves: FeatureStat[];
  clashes: { kind: FeatureKind; name: string; lover: string; hater: string }[];
  genreCompare: { genre: string; a: number; b: number }[];
}

export function compare(a: UserData, b: UserData, pa: Profile, pb: Profile): Compatibility {
  const bMap = new Map(b.watched.map((f) => [f.key, f]));
  const common = a.watched.filter((f) => bMap.has(f.key));
  const union = a.watched.length + b.watched.length - common.length;
  const pairs = common.flatMap((f) => {
    const g = bMap.get(f.key)!;
    return f.rating && g.rating ? [{ name: f.name, year: f.year, a: f.rating, b: g.rating }] : [];
  });

  let correlation: number | undefined;
  let meanAbsDiff: number | undefined;
  if (pairs.length >= 3) {
    const ma = pairs.reduce((s, p) => s + p.a, 0) / pairs.length;
    const mb = pairs.reduce((s, p) => s + p.b, 0) / pairs.length;
    let num = 0,
      da = 0,
      db = 0;
    for (const p of pairs) {
      num += (p.a - ma) * (p.b - mb);
      da += (p.a - ma) ** 2;
      db += (p.b - mb) ** 2;
    }
    correlation = da && db ? num / Math.sqrt(da * db) : 0;
    meanAbsDiff = pairs.reduce((s, p) => s + Math.abs(p.a - p.b), 0) / pairs.length;
  }

  // Tür profili kosinüs benzerliği
  const genres = new Set<string>();
  for (const p of [pa, pb]) for (const s of p.features.values()) if (s.kind === "genre") genres.add(s.name);
  let dot = 0,
    na = 0,
    nb = 0;
  for (const g of genres) {
    const x = pa.features.get(fkey("genre", g))?.score ?? 0;
    const y = pb.features.get(fkey("genre", g))?.score ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const genreSimilarity = na && nb ? dot / Math.sqrt(na * nb) : 0;

  // Paylaşılan zevkler ve çatışmalar
  const sharedLoves: FeatureStat[] = [];
  const clashes: Compatibility["clashes"] = [];
  for (const [k, sa] of pa.features) {
    const sb = pb.features.get(k);
    if (!sb || sa.kind === "decade") continue;
    if (sa.score > 0.25 && sb.score > 0.25 && sa.count + sb.count >= 3) {
      sharedLoves.push({ ...sa, score: Math.min(sa.score, sb.score), count: sa.count + sb.count });
    } else if ((sa.kind === "genre" || sa.kind === "director") && sa.count >= 2 && sb.count >= 2) {
      if (sa.score > 0.4 && sb.score < -0.4) clashes.push({ kind: sa.kind, name: sa.name, lover: pa.label, hater: pb.label });
      if (sb.score > 0.4 && sa.score < -0.4) clashes.push({ kind: sa.kind, name: sa.name, lover: pb.label, hater: pa.label });
    }
  }
  sharedLoves.sort((x, y) => KIND_WEIGHT[y.kind] * y.score - KIND_WEIGHT[x.kind] * x.score);

  // Tür dağılımı karşılaştırması (analiz edilen filmler içindeki pay)
  const share = (p: Profile, g: string) => ((p.features.get(fkey("genre", g))?.count ?? 0) / Math.max(1, p.analyzedCount)) * 100;
  const genreCompare = [...genres]
    .map((g) => ({ genre: g, a: share(pa, g), b: share(pb, g) }))
    .sort((x, y) => y.a + y.b - (x.a + x.b))
    .slice(0, 10);

  const corrPart = correlation !== undefined && pairs.length >= 5 ? (correlation + 1) / 2 : 0.55;
  const overlapPart = Math.min(1, ((common.length / Math.max(1, union)) * 4));
  const score = Math.round(100 * (0.4 * corrPart + 0.4 * ((genreSimilarity + 1) / 2) + 0.2 * overlapPart));

  return {
    score,
    commonWatched: common.length,
    jaccard: common.length / Math.max(1, union),
    bothRated: pairs.length,
    correlation,
    meanAbsDiff,
    genreSimilarity,
    agreements: pairs
      .filter((p) => p.a >= 4 && p.b >= 4)
      .sort((x, y) => y.a + y.b - (x.a + x.b))
      .slice(0, 8),
    disagreements: pairs
      .filter((p) => Math.abs(p.a - p.b) >= 1.5)
      .sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))
      .slice(0, 8),
    sharedLoves: sharedLoves.slice(0, 12),
    clashes: clashes.slice(0, 8),
    genreCompare,
  };
}

// ---------------------------------------------------------------------------
// Öneri skoru
// ---------------------------------------------------------------------------

export interface Recommendation {
  meta: FilmMeta;
  inA: boolean;
  inB: boolean;
  matchA: number;
  matchB: number;
  score: number;
  reasons: string[];
  warnings: string[];
}

interface RawScore {
  total: number;
  contribs: { kind: FeatureKind; name: string; value: number; stat: FeatureStat }[];
}

function rawScore(p: Profile, m: FilmMeta): RawScore {
  const byKind = new Map<FeatureKind, { kind: FeatureKind; name: string; value: number; stat: FeatureStat }[]>();
  for (const { kind, name } of featuresOf(m)) {
    const stat = p.features.get(fkey(kind, name));
    if (!stat) continue;
    const arr = byKind.get(kind) ?? [];
    arr.push({ kind, name, value: stat.score, stat });
    byKind.set(kind, arr);
  }
  let total = 0;
  const contribs: RawScore["contribs"] = [];
  for (const [kind, arr] of byKind) {
    const n = kind === "genre" ? Math.max(1, m.genres.length) : arr.length;
    for (const c of arr) {
      const v = (KIND_WEIGHT[kind] * c.value) / Math.sqrt(n);
      total += v;
      contribs.push({ ...c, value: v });
    }
  }
  return { total, contribs };
}

const fmtStar = (r?: number) => (r ? `${r.toFixed(1)}★` : "");

export function recommend(
  candidates: Candidate[],
  metas: Map<string, FilmMeta>,
  pa: Profile,
  pb: Profile,
): Recommendation[] {
  const rows = candidates.flatMap((c) => {
    const m = metas.get(c.ref.key);
    if (!m) return [];
    const ra = rawScore(pa, m);
    const rb = rawScore(pb, m);
    if (c.inA) ra.total += 1.2;
    if (c.inB) rb.total += 1.2;
    return [{ c, m, ra, rb }];
  });
  if (!rows.length) return [];

  const norm = (vals: number[]) => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return (v: number) => (max - min < 1e-9 ? 60 : 20 + (80 * (v - min)) / (max - min));
  };
  const na = norm(rows.map((r) => r.ra.total));
  const nb = norm(rows.map((r) => r.rb.total));

  const recs = rows.map(({ c, m, ra, rb }) => {
    const matchA = na(ra.total);
    const matchB = nb(rb.total);
    let score = 0.5 * (matchA + matchB) - 0.3 * Math.abs(matchA - matchB);
    if (c.inA && c.inB) score += 15;
    if (m.avgRating) score += (m.avgRating - 3.3) * 8;

    const reasons: string[] = [];
    const warnings: string[] = [];
    if (c.inA && c.inB) reasons.push("İkinizin de izleme listesinde 🎯");
    else if (c.inA) reasons.push(`${pa.label} izleme listesine eklemiş`);
    else if (c.inB) reasons.push(`${pb.label} izleme listesine eklemiş`);

    // Ortak pozitif katkılar
    const shared = ra.contribs
      .filter((x) => x.value > 0.15)
      .flatMap((x) => {
        const y = rb.contribs.find((z) => z.kind === x.kind && z.name === x.name && z.value > 0.15);
        return y ? [{ ...x, both: x.value + y.value }] : [];
      })
      .sort((p, q) => q.both - p.both);
    for (const s of shared.slice(0, 2)) {
      const what = s.kind === "genre" ? `türü` : s.kind === "decade" ? "dönemi" : s.kind === "country" ? "sineması" : "";
      reasons.push(
        s.kind === "director" || s.kind === "actor"
          ? `İkinizin de sevdiği ${KIND_LABEL[s.kind].toLowerCase()}: ${s.name}`
          : `İkinizin de sevdiği ${s.name} ${what}`,
      );
    }
    // Kişiye özel en güçlü katkı
    for (const [p, r] of [
      [pa, ra],
      [pb, rb],
    ] as const) {
      const best = r.contribs
        .filter((x) => x.value > 0.3 && (x.kind === "director" || x.kind === "actor") && !shared.some((s) => s.name === x.name))
        .sort((x, y) => y.value - x.value)[0];
      if (best) {
        reasons.push(
          `${p.label}, ${best.name} ${best.kind === "director" ? "filmlerini" : "oynadığı filmleri"} seviyor (${best.stat.count} film${best.stat.avgRating ? `, ort. ${fmtStar(best.stat.avgRating)}` : ""})`,
        );
      }
      const worst = r.contribs.filter((x) => x.value < -0.4 && (x.kind === "genre" || x.kind === "director")).sort((x, y) => x.value - y.value)[0];
      if (worst) warnings.push(`${p.label} genelde ${worst.name}${worst.kind === "genre" ? " türünü" : " filmlerini"} pek sevmiyor`);
    }
    if (m.avgRating && m.avgRating >= 3.9) reasons.push(`Letterboxd ortalaması ${fmtStar(m.avgRating)}`);

    return { meta: m, inA: c.inA, inB: c.inB, matchA: Math.round(matchA), matchB: Math.round(matchB), score, reasons: reasons.slice(0, 5), warnings };
  });

  recs.sort((x, y) => y.score - x.score);
  const max = recs[0].score;
  const min = recs[recs.length - 1].score;
  return recs.map((r) => ({ ...r, score: Math.round(max - min < 1e-9 ? 80 : 55 + (44 * (r.score - min)) / (max - min)) }));
}

/** Gemini'ye gönderilecek kısa profil özeti. */
export function profileSummary(p: Profile): string {
  const list = (k: FeatureKind) => p.top[k].slice(0, 5).map((s) => s.name).join(", ") || "-";
  return [
    `${p.label}: ${p.watchedCount} film izlemiş, ortalama puan ${p.avgRating?.toFixed(2) ?? "?"}.`,
    `Sevdiği türler: ${list("genre")}. Sevdiği yönetmenler: ${list("director")}. Sevdiği oyuncular: ${list("actor")}. Dönemler: ${list("decade")}.`,
    `Pek sevmedikleri: ${p.disliked.map((s) => s.name).join(", ") || "-"}.`,
    `Favorilerinden bazıları: ${p.favorites.slice(0, 6).map((f) => `${f.meta.name} (${f.meta.year ?? ""})`).join(", ")}.`,
  ].join(" ");
}
