import type { DiscoverSeed, SeedHitInfo } from "./tmdb";
import type { FilmMeta, FilmRef, UserData } from "./types";

export type FeatureKind = "genre" | "director" | "actor" | "decade" | "country";

const KIND_WEIGHT: Record<FeatureKind, number> = { genre: 1.0, director: 2.4, actor: 0.9, decade: 0.5, country: 0.55 };
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
  fast: { profile: 70, candidates: 80 },
  normal: { profile: 140, candidates: 160 },
  deep: { profile: 260, candidates: 320 },
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
// Hangi filmlerin detayı çekilecek? (Dengeli örnekleme)
// ---------------------------------------------------------------------------

export function pickProfileFilms(user: UserData, depth: Depth): FilmRef[] {
  const limit = DEPTH_LIMITS[depth].profile;
  if (user.watched.length <= limit) return [...user.watched];

  const picked = new Map<string, FilmRef>();
  const addAll = (items: FilmRef[], cap: number) => {
    for (const f of items) {
      if (picked.size >= limit || cap <= 0) break;
      if (!picked.has(f.key)) {
        picked.set(f.key, f);
        cap--;
      }
    }
  };

  // 1. %55: En yüksek puanlı / beğenilen favoriler (kişinin sevdiği ana omurga)
  const positives = user.watched
    .filter((f) => (f.rating !== undefined && f.rating >= 3.5) || f.liked)
    .sort((a, b) => (b.rating ?? 4.1) + (b.liked ? 0.4 : 0) - ((a.rating ?? 4.1) + (a.liked ? 0.4 : 0)));
  addAll(positives, Math.round(limit * 0.55));

  // 2. %20: En düşük puanlılar (neyi sevmediğini öğrenmek için)
  const negatives = user.watched
    .filter((f) => f.rating !== undefined && f.rating <= 3)
    .sort((a, b) => (a.rating ?? 3) - (b.rating ?? 3));
  addAll(negatives, Math.round(limit * 0.2));

  // 3. Kalan kota: izleme geçmişine eşit yayılmış filmler (en yeniler + aradakiler)
  const rest = user.watched.filter((f) => !picked.has(f.key));
  const remaining = limit - picked.size;
  if (remaining > 0 && rest.length) {
    const step = rest.length / remaining;
    for (let i = 0; i < remaining && Math.floor(i * step) < rest.length; i++) {
      const f = rest[Math.floor(i * step)];
      picked.set(f.key, f);
    }
  }

  return [...picked.values()];
}

export interface Candidate {
  ref: FilmRef;
  inA: boolean;
  inB: boolean;
  source: "watchlist" | "discover";
  seedInfo?: SeedHitInfo;
}

function sampleEvenly<T>(arr: T[], count: number): T[] {
  if (arr.length <= count) return arr;
  const out: T[] = [];
  const step = arr.length / count;
  for (let i = 0; i < count; i++) out.push(arr[Math.floor(i * step)]);
  return out;
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
      const c = map.get(ref.key) ?? { ref: { ...ref }, inA: false, inB: false, source: "watchlist" as const };
      if (side === "A") c.inA = true;
      else c.inB = true;
      c.ref.slug ??= ref.slug;
      c.ref.uri ??= ref.uri;
      map.set(ref.key, c);
    }
  }
  const all = [...map.values()];
  const both = all.filter((c) => c.inA && c.inB);
  const onlyA = all.filter((c) => c.inA && !c.inB);
  const onlyB = all.filter((c) => c.inB && !c.inA);

  const singleCap = Math.max(0, DEPTH_LIMITS[depth].candidates - both.length);
  const half = Math.ceil(singleCap / 2);
  const pickedA = sampleEvenly(onlyA, half);
  const pickedB = sampleEvenly(onlyB, singleCap - pickedA.length);
  return [...both, ...pickedA, ...pickedB];
}

// ---------------------------------------------------------------------------
// Zevk profili
// ---------------------------------------------------------------------------

export function buildProfile(user: UserData, metas: Map<string, FilmMeta>): Profile {
  const ratings = user.watched.flatMap((f) => (f.rating ? [f.rating] : []));
  const { mean, sd } = meanSd(ratings);
  // Yüksek puan veren kullanıcılarda 4★ filmler negatif çıkmasın diye yumuşatılmış referans
  const baseline = mean !== undefined ? 0.7 * mean + 0.3 * 3.3 : 3.4;

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
    if (f.rating) w = Math.max(-2.2, Math.min(2.2, (f.rating - baseline) / Math.max(sd, 0.55))) + (f.liked ? 0.5 : 0);
    else if (f.liked) w = 1.1;
    else w = 0.25;

    if ((f.rating && f.rating >= 4) || f.liked) {
      favorites.push({ meta: m, rating: f.rating, liked: f.liked });
    }

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
    // Genel türlerde ("Dram" gibi %50'de çıkan) sıklığı aşırı ödüllendirme yerine ortalama kalite + shrinkage
    const denom = s.kind === "genre" ? Math.pow(s.count + 2, 0.65) : Math.sqrt(s.count + 1.5);
    final.set(k, {
      kind: s.kind,
      name: s.name,
      count: s.count,
      ratedCount: s.ratedCount,
      avgRating: s.ratedCount ? s.sumR / s.ratedCount : undefined,
      score: s.sumW / denom,
    });
  }

  const minCount: Record<FeatureKind, number> = { genre: 2, director: 2, actor: 2, decade: 2, country: 2 };
  const top = {} as Profile["top"];
  (Object.keys(KIND_WEIGHT) as FeatureKind[]).forEach((kind) => {
    top[kind] = [...final.values()]
      .filter((s) => s.kind === kind && s.count >= minCount[kind] && s.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  });
  const disliked = [...final.values()]
    .filter((s) => (s.kind === "genre" || s.kind === "director") && s.count >= 2 && s.score < -0.25)
    .sort((a, b) => a.score - b.score)
    .slice(0, 6);

  favorites.sort((x, y) => {
    const sx = (x.rating ?? 4.0) + (x.liked ? 0.35 : 0);
    const sy = (y.rating ?? 4.0) + (y.liked ? 0.35 : 0);
    return sy - sx;
  });

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
    favorites: favorites.slice(0, 18),
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

  const sharedLoves: FeatureStat[] = [];
  const clashes: Compatibility["clashes"] = [];
  for (const [k, sa] of pa.features) {
    const sb = pb.features.get(k);
    if (!sb || sa.kind === "decade") continue;
    if (sa.score > 0.2 && sb.score > 0.2 && sa.count + sb.count >= 3) {
      sharedLoves.push({ ...sa, score: Math.min(sa.score, sb.score), count: sa.count + sb.count });
    } else if ((sa.kind === "genre" || sa.kind === "director") && sa.count >= 2 && sb.count >= 2) {
      if (sa.score > 0.35 && sb.score < -0.3) clashes.push({ kind: sa.kind, name: sa.name, lover: pa.label, hater: pb.label });
      if (sb.score > 0.35 && sa.score < -0.3) clashes.push({ kind: sa.kind, name: sa.name, lover: pb.label, hater: pa.label });
    }
  }
  sharedLoves.sort((x, y) => KIND_WEIGHT[y.kind] * y.score - KIND_WEIGHT[x.kind] * x.score);

  const share = (p: Profile, g: string) => ((p.features.get(fkey("genre", g))?.count ?? 0) / Math.max(1, p.analyzedCount)) * 100;
  const genreCompare = [...genres]
    .map((g) => ({ genre: g, a: share(pa, g), b: share(pb, g) }))
    .sort((x, y) => y.a + y.b - (x.a + x.b))
    .slice(0, 10);

  const corrPart = correlation !== undefined && pairs.length >= 5 ? (correlation + 1) / 2 : 0.55;
  const overlapPart = Math.min(1, (common.length / Math.max(1, union)) * 4);
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
// Keşif tohumları (TMDB Recommendations + Discover için)
// ---------------------------------------------------------------------------

export function buildDiscoveryPayload(
  a: UserData,
  b: UserData,
  pa: Profile,
  pb: Profile,
  compat: Compatibility,
  metas: Map<string, FilmMeta>,
): { seeds: DiscoverSeed[]; genreIds: number[]; excludeKeys: string[]; excludeTmdbIds: number[] } {
  const bFavMap = new Map(pb.favorites.map((f) => [f.meta.key, f]));
  const seeds: DiscoverSeed[] = [];
  const usedTmdb = new Set<number>();

  // 1. İkisinin de ortak sevdiği filmler
  for (const fa of pa.favorites) {
    const fb = bFavMap.get(fa.meta.key);
    if (fb && fa.meta.tmdbId && !usedTmdb.has(fa.meta.tmdbId)) {
      usedTmdb.add(fa.meta.tmdbId);
      seeds.push({ tmdbId: fa.meta.tmdbId, name: fa.meta.name, owner: "both" });
    }
    if (seeds.length >= 4) break;
  }

  // 2. A ve B'den dönüşümlü en iyi favoriler
  let ia = 0,
    ib = 0;
  while (seeds.length < 12 && (ia < pa.favorites.length || ib < pb.favorites.length)) {
    while (ia < pa.favorites.length) {
      const f = pa.favorites[ia++];
      if (f.meta.tmdbId && !usedTmdb.has(f.meta.tmdbId)) {
        usedTmdb.add(f.meta.tmdbId);
        seeds.push({ tmdbId: f.meta.tmdbId, name: f.meta.name, owner: "A" });
        break;
      }
    }
    if (seeds.length >= 12) break;
    while (ib < pb.favorites.length) {
      const f = pb.favorites[ib++];
      if (f.meta.tmdbId && !usedTmdb.has(f.meta.tmdbId)) {
        usedTmdb.add(f.meta.tmdbId);
        seeds.push({ tmdbId: f.meta.tmdbId, name: f.meta.name, owner: "B" });
        break;
      }
    }
  }

  // Ortak sevilen tür isimlerini TMDB genreId'lerine eşle
  const genreNameToId = new Map<string, number>();
  for (const m of metas.values()) {
    if (m.genres.length && m.genreIds?.length && m.genres.length === m.genreIds.length) {
      m.genres.forEach((g, idx) => {
        if (!genreNameToId.has(g)) genreNameToId.set(g, m.genreIds![idx]);
      });
    }
  }
  const genreIds = compat.sharedLoves
    .filter((s) => s.kind === "genre")
    .map((s) => genreNameToId.get(s.name))
    .filter((id): id is number => Boolean(id))
    .slice(0, 4);

  const excludeKeys = [...new Set([...a.watched, ...b.watched].map((f) => f.key))];
  const excludeTmdbIds = [...new Set([...a.watched, ...b.watched].map((f) => metas.get(f.key)?.tmdbId).filter((x): x is number => Boolean(x)))];

  return { seeds, genreIds, excludeKeys, excludeTmdbIds };
}

// ---------------------------------------------------------------------------
// Öneri skoru (Saf zevk uyumu + şeffaf gerekçeler)
// ---------------------------------------------------------------------------

export interface Recommendation {
  meta: FilmMeta;
  source: "watchlist" | "discover";
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
      // Tekil uç değerin tüm skoru patlatmasını önlemek için yumuşak doygunluk
      const bounded = Math.tanh(c.value / 1.4) * 1.4;
      const v = (KIND_WEIGHT[kind] * bounded) / Math.sqrt(n);
      total += v;
      contribs.push({ ...c, value: v });
    }
  }
  return { total, contribs };
}

function findFavoriteOverlap(p: Profile, m: FilmMeta): { name: string; rating?: number; how: string } | null {
  const dirSet = new Set(m.directors);
  const actSet = new Set(m.actors.slice(0, 5));
  const genreSet = new Set(m.genres);

  let best: { name: string; rating?: number; how: string; rank: number } | null = null;
  for (const fav of p.favorites) {
    if (fav.meta.key === m.key) continue;
    const sameDir = fav.meta.directors.find((d) => dirSet.has(d));
    const sameActors = fav.meta.actors.filter((a) => actSet.has(a));
    const sameGenres = fav.meta.genres.filter((g) => genreSet.has(g));

    let rank = 0;
    let how = "";
    if (sameDir) {
      rank = 10 + (fav.rating ?? 4);
      how = `aynı yönetmen (${sameDir})`;
    } else if (sameActors.length >= 2) {
      rank = 7 + (fav.rating ?? 4);
      how = `ortak oyuncular (${sameActors.slice(0, 2).join(", ")})`;
    } else if (sameGenres.length >= 2) {
      rank = sameGenres.length * 1.5 + (fav.rating ?? 4) * 0.5;
      how = `${sameGenres.slice(0, 2).join(" & ")} çizgisinde`;
    }
    if (rank > 0 && (!best || rank > best.rank)) {
      best = { name: fav.meta.name, rating: fav.rating, how, rank };
    }
  }
  return best ? { name: best.name, rating: best.rating, how: best.how } : null;
}

/** Ham zevk skorunu gerçekçi 5-98 uyum yüzdesine çevirir (0 = %50 nötr). */
const toMatchPct = (raw: number) => Math.round(100 / (1 + Math.exp(-raw * 0.72)));
const fmtStar = (r?: number) => (r ? `${r.toFixed(1)}★` : "");

export function recommend(
  candidates: Candidate[],
  metas: Map<string, FilmMeta>,
  pa: Profile,
  pb: Profile,
): Recommendation[] {
  const dedup = new Map<string, Candidate>();
  for (const c of candidates) {
    const existing = dedup.get(c.ref.key);
    if (!existing) dedup.set(c.ref.key, c);
    else {
      // Aynı film hem watchlist hem discover'daysa watchlist öncelikli kalsın, seedInfo birleşsin
      dedup.set(c.ref.key, {
        ...existing,
        inA: existing.inA || c.inA,
        inB: existing.inB || c.inB,
        source: existing.source === "watchlist" || c.source === "watchlist" ? "watchlist" : "discover",
        seedInfo: existing.seedInfo ?? c.seedInfo,
      });
    }
  }

  const recs: Recommendation[] = [];
  for (const c of dedup.values()) {
    const m = metas.get(c.ref.key);
    if (!m) continue;

    const ra = rawScore(pa, m);
    const rb = rawScore(pb, m);
    const matchA = toMatchPct(ra.total);
    const matchB = toMatchPct(rb.total);

    // Ortak skor: ikisinin uyumu - aralarındaki dengesizlik cezası
    let score = 0.5 * (matchA + matchB) - 0.35 * Math.abs(matchA - matchB);
    if (c.inA && c.inB) score += 12;
    else if (c.inA || c.inB) score += 3;

    const seedCount = c.seedInfo?.fromSeeds.length ?? 0;
    const hasBothSeed = c.seedInfo?.fromSeeds.some((s) => s.owner === "both");
    if (seedCount > 0) score += Math.min(11, seedCount * 3.5 + (hasBothSeed ? 3 : 0));

    if (m.avgRating) score += (m.avgRating - 3.3) * 7;
    score = Math.max(10, Math.min(99, Math.round(score)));

    const reasons: string[] = [];
    const warnings: string[] = [];

    if (c.inA && c.inB) reasons.push("İkinizin de izleme listesinde 🎯");
    else if (c.inA) reasons.push(`${pa.label} izleme listesine eklemiş`);
    else if (c.inB) reasons.push(`${pb.label} izleme listesine eklemiş`);

    if (c.seedInfo?.fromSeeds.length) {
      const names = c.seedInfo.fromSeeds
        .slice(0, 2)
        .map((s) => s.name)
        .join(" & ");
      reasons.push(`Favorilerinizden ${names} ile doğrudan benzer öneri`);
    }

    // Ortak pozitif özellikler
    const shared = ra.contribs
      .filter((x) => x.value > 0.12)
      .flatMap((x) => {
        const y = rb.contribs.find((z) => z.kind === x.kind && z.name === x.name && z.value > 0.12);
        return y ? [{ ...x, both: x.value + y.value }] : [];
      })
      .sort((p, q) => q.both - p.both);

    for (const s of shared.slice(0, 2)) {
      const what = s.kind === "genre" ? "türü" : s.kind === "decade" ? "dönemi" : s.kind === "country" ? "sineması" : "";
      reasons.push(
        s.kind === "director" || s.kind === "actor"
          ? `İkinizin de sevdiği ${KIND_LABEL[s.kind].toLowerCase()}: ${s.name}`
          : `İkinizin de sevdiği ${s.name} ${what}`,
      );
    }

    // Kişiye özel yönetmen/oyuncu + benzer favori film bağlantısı
    for (const [p, r] of [
      [pa, ra],
      [pb, rb],
    ] as const) {
      const best = r.contribs
        .filter((x) => x.value > 0.25 && (x.kind === "director" || x.kind === "actor") && !shared.some((s) => s.name === x.name))
        .sort((x, y) => y.value - x.value)[0];
      if (best) {
        reasons.push(
          `${p.label}, ${best.name} ${best.kind === "director" ? "filmlerini" : "oynadığı filmleri"} seviyor (${best.stat.count} film${best.stat.avgRating ? `, ort. ${fmtStar(best.stat.avgRating)}` : ""})`,
        );
      } else if (!c.seedInfo?.fromSeeds.length) {
        const favMatch = findFavoriteOverlap(p, m);
        if (favMatch) {
          reasons.push(`${p.label}'ın sevdiği ${favMatch.name}${favMatch.rating ? ` (${fmtStar(favMatch.rating)})` : ""} ile ${favMatch.how}`);
        }
      }

      const worst = r.contribs
        .filter((x) => x.value < -0.35 && (x.kind === "genre" || x.kind === "director"))
        .sort((x, y) => x.value - y.value)[0];
      if (worst) warnings.push(`${p.label} genelde ${worst.name}${worst.kind === "genre" ? " türünü" : " filmlerini"} pek sevmiyor`);
    }

    if (m.avgRating && m.avgRating >= 3.85) {
      reasons.push(`Ortalama puanı yüksek (${fmtStar(m.avgRating)})`);
    }

    if (!reasons.length) reasons.push("Genel zevk profilinize dengeli uyum");

    recs.push({
      meta: m,
      source: c.source,
      inA: c.inA,
      inB: c.inB,
      matchA,
      matchB,
      score,
      reasons: [...new Set(reasons)].slice(0, 5),
      warnings: [...new Set(warnings)],
    });
  }

  recs.sort((x, y) => y.score - x.score);
  return recs;
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
