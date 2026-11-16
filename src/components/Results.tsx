"use client";

import { useState } from "react";
import { AUDIENCES, MOODS, audienceOf, moodsFor, type Audience, type Mood } from "@/lib/moviePreferences";
import { orderRecommendations, SORTS, type RecommendationSort } from "@/lib/recommendationOrder";
import type { Compatibility, FeatureKind, Profile, Recommendation } from "@/lib/analysis";
import { KIND_LABEL } from "@/lib/analysis";

export interface AiResult {
  pick?: string;
  summary?: string;
  items?: { key: string; text: string }[];
}

const star = (r?: number) => (r === undefined ? "–" : `${r.toFixed(1)}★`);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-panel-2 p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "#00e054" : score >= 55 ? "#40bcf4" : "#ff8000";
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
      <circle cx="70" cy="70" r={r} stroke="#2c3440" strokeWidth="12" fill="none" />
      <circle
        cx="70"
        cy="70"
        r={r}
        stroke={color}
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${(c * score) / 100} ${c}`}
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="78" textAnchor="middle" fontSize="32" fontWeight="700" fill="#fff">
        %{score}
      </text>
    </svg>
  );
}

function compatText(c: Compatibility) {
  if (c.score >= 80) return "Sinema ruh ikizleri. Seçim yapmak kolay olacak.";
  if (c.score >= 65) return "Zevkleriniz büyük ölçüde örtüşüyor, ufak sürtüşmeler var.";
  if (c.score >= 50) return "Ortak bir zemin var ama dikkatli seçmek lazım.";
  return "Zıt kutuplar! Orta yolu bulan filmler kritik.";
}

export function CompatibilitySection({ c, a, b }: { c: Compatibility; a: Profile; b: Profile }) {
  const maxShare = Math.max(1, ...c.genreCompare.flatMap((g) => [g.a, g.b]));
  return (
    <section className="card flex flex-col gap-6">
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        {c.hasEvidence && <ScoreRing score={c.score} />}
        <div className="flex-1">
          <h2 className="text-2xl font-bold">
            <span className="text-lborange">{a.label}</span> & <span className="text-lbblue">{b.label}</span> uyumu
          </h2>
          <p className="mt-1 text-muted">{c.hasEvidence ? compatText(c) : "Uyum puanı için yeterli veri yok."}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Ortak izlenen" value={String(c.commonWatched)} hint={`Jaccard %${(c.jaccard * 100).toFixed(1)}`} />
            <Stat label="İkisi de puanlamış" value={String(c.bothRated)} />
            <Stat
              label="Puan korelasyonu"
              value={c.correlation === undefined ? "–" : c.correlation.toFixed(2)}
              hint={c.meanAbsDiff !== undefined ? `ort. fark ${c.meanAbsDiff.toFixed(2)}★` : "en az 3 ortak puan gerekir"}
            />
            <Stat label="Tür benzerliği" value={c.genreSimilarity === undefined ? "-" : `%${Math.round(((c.genreSimilarity + 1) / 2) * 100)}`} />
            <Stat label="Göreli puan uyumu" value={c.ratingAgreement === undefined ? "-" : `%${Math.round(c.ratingAgreement * 100)}`} hint="Kişisel puan ortalamalarına göre" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 font-semibold">Tür dağılımı</h3>
          <div className="flex flex-col gap-2">
            {c.genreCompare.map((g) => (
              <div key={g.genre} className="grid grid-cols-[110px_1fr] items-center gap-2 text-sm">
                <span className="truncate text-muted">{g.genre}</span>
                <div className="flex flex-col gap-0.5">
                  <div className="h-2 rounded-full bg-lborange" style={{ width: `${(g.a / maxShare) * 100}%` }} title={`${a.label}: %${g.a.toFixed(0)}`} />
                  <div className="h-2 rounded-full bg-lbblue" style={{ width: `${(g.b / maxShare) * 100}%` }} title={`${b.label}: %${g.b.toFixed(0)}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 font-semibold">💚 Ortak sevdikleriniz</h3>
            <div className="flex flex-wrap gap-2">
              {c.sharedLoves.length ? (
                c.sharedLoves.map((s) => (
                  <span key={s.kind + s.name} className="chip">
                    <span className="text-muted">{KIND_LABEL[s.kind]}:</span> {s.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted">Belirgin bir ortak favori bulunamadı.</span>
              )}
            </div>
          </div>
          {c.clashes.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">⚔️ Çatışma noktaları</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {c.clashes.map((x) => (
                  <li key={x.kind + x.name + x.lover}>
                    <b>{x.name}</b> <span className="text-muted">({KIND_LABEL[x.kind].toLowerCase()})</span>: {x.lover} seviyor, {x.hater} sevmiyor
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FilmPairs title="🤝 İkinizin de bayıldıkları" rows={c.agreements} a={a.label} b={b.label} />
            <FilmPairs title="💥 En çok ayrıştığınız" rows={c.disagreements} a={a.label} b={b.label} />
          </div>
        </div>
      </div>
    </section>
  );
}

function FilmPairs({ title, rows, a, b }: { title: string; rows: Compatibility["agreements"]; a: string; b: string }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {rows.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((r) => (
            <li key={r.name + r.year} className="flex justify-between gap-2">
              <span className="truncate">
                {r.name} <span className="text-muted">{r.year}</span>
              </span>
              <span className="shrink-0 font-mono text-xs">
                <span className="text-lborange" title={a}>
                  {r.a}
                </span>{" "}
                /{" "}
                <span className="text-lbblue" title={b}>
                  {r.b}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Yeterli ortak puan yok.</p>
      )}
    </div>
  );
}

const KINDS: FeatureKind[] = ["genre", "director", "actor", "decade", "country", "language", "runtime"];
const PLURAL: Record<FeatureKind, string> = {
  genre: "türler",
  director: "yönetmenler",
  actor: "oyuncular",
  decade: "dönemler",
  country: "ülkeler",
  language: "diller",
  runtime: "süreler",
};

export function ProfileCard({ p, accent }: { p: Profile; accent: "orange" | "blue" }) {
  const text = accent === "orange" ? "text-lborange" : "text-lbblue";
  const bar = accent === "orange" ? "bg-lborange" : "bg-lbblue";
  const maxH = Math.max(1, ...p.ratingHist);
  return (
    <section className="card flex flex-col gap-4">
      <h2 className={`text-xl font-bold ${text}`}>{p.label}</h2>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="İzlenen" value={String(p.watchedCount)} />
        <Stat label="Ort. puan" value={star(p.avgRating)} hint={`${p.ratedCount} puan`} />
        <Stat label="Watchlist" value={String(p.watchlistCount)} />
      </div>
      {p.ratedCount > 0 && (
        <div>
          <div className="flex h-16 items-end gap-1">
            {p.ratingHist.map((n, i) => (
              <div key={i} className={`flex-1 rounded-t ${bar} opacity-80`} style={{ height: `${(n / maxH) * 100}%` }} title={`${(i + 1) / 2}★: ${n}`} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>½★</span>
            <span>5★</span>
          </div>
        </div>
      )}
      <div className="text-xs text-muted">
        {p.analyzedCount} film detaylı analiz edildi
        {p.avgRuntime ? ` · ort. süre ${Math.round(p.avgRuntime)} dk` : ""}
        {p.avgYear ? ` · ort. yıl ${Math.round(p.avgYear)}` : ""}
      </div>
      {KINDS.map((k) =>
        p.top[k].length ? (
          <div key={k}>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted">Sevdiği {PLURAL[k]}</div>
            <div className="flex flex-wrap gap-1.5">
              {p.top[k].slice(0, k === "genre" || k === "director" ? 8 : 6).map((s) => (
                <span key={s.name} className="chip" title={`${s.count} film${s.avgRating ? `, ort. ${star(s.avgRating)}` : ""}`}>
                  {s.name}
                  {s.avgRating && <span className="text-muted">{s.avgRating.toFixed(1)}</span>}
                </span>
              ))}
            </div>
          </div>
        ) : null,
      )}
      {p.disliked.length > 0 && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-muted">Pek sevmedikleri</div>
          <div className="flex flex-wrap gap-1.5">
            {p.disliked.map((s) => (
              <span key={s.name} className="chip opacity-70">
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {p.favorites.length > 0 && (
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">Favorileri</div>
          <div className="grid grid-cols-6 gap-1.5">
            {p.favorites.slice(0, 6).map((f) => (
              <a key={f.meta.key} href={f.meta.url} target="_blank" rel="noreferrer" title={`${f.meta.name} ${star(f.rating)}`}>
                {f.meta.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.meta.poster} alt={f.meta.name} className="aspect-[2/3] w-full rounded object-cover" />
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center rounded bg-panel-2 p-1 text-center text-[10px]">{f.meta.name}</div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function Recommendations({
  recs,
  a,
  b,
  ai,
  aiState,
  aiEnabled,
  onAskAi,
  onWatched,
}: {
  recs: Recommendation[];
  a: string;
  b: string;
  ai: AiResult | null;
  aiState: "idle" | "loading" | "error";
  aiEnabled: boolean;
  onAskAi: (visible: Recommendation[]) => void;
  onWatched: (meta: Recommendation["meta"]) => void;
}) {
  const [shown, setShown] = useState(12);
  const initialFields = { runtime: "", genre: "", year: "", language: "", country: "", rating: "" };
  const [fields, setFields] = useState(initialFields);
  const [mood, setMood] = useState<Mood | "">("");
  const [audience, setAudience] = useState<Audience | "">("");
  const [sort, setSort] = useState<RecommendationSort>("balanced");
  const languageNames = new Intl.DisplayNames(["tr"], { type: "language", fallback: "code" });
  const options = (values: string[], selected: string) => [...new Set([...values, selected].filter(Boolean))].sort((x, y) => x.localeCompare(y, "tr"));
  const genres = options(recs.flatMap((r) => r.meta.genres), fields.genre);
  const countries = options(recs.flatMap((r) => r.meta.countries), fields.country);
  const languages = options(recs.flatMap((r) => r.meta.originalLanguage && /^[a-z]{2,3}$/i.test(r.meta.originalLanguage) ? [r.meta.originalLanguage] : []), fields.language);
  const decades = options(recs.flatMap((r) => r.meta.year ? [String(Math.floor(r.meta.year / 10) * 10)] : []), fields.year)
    .map(Number).sort((x, y) => y - x);
  const [filter, setFilter] = useState<"all" | "both" | "watchlist" | "discover">("all");
  const aiText = new Map((ai?.items ?? []).map((i) => [i.key, i.text]));

  const metadataMatches = recs.filter(({ meta }) => {
    if (mood && !moodsFor(meta).includes(mood)) return false;
    if (audience && audienceOf(meta.voteCount) !== audience) return false;
    if (fields.runtime && (!meta.runtime || meta.runtime > Number(fields.runtime))) return false;
    if (fields.genre && !meta.genres.includes(fields.genre)) return false;
    if (fields.year && (!meta.year || Math.floor(meta.year / 10) * 10 !== Number(fields.year))) return false;
    if (fields.language && meta.originalLanguage !== fields.language) return false;
    if (fields.country && !meta.countries.includes(fields.country)) return false;
    if (fields.rating && (meta.avgRating ?? 0) < Number(fields.rating)) return false;
    return true;
  });
  const filtered = metadataMatches.filter((r) => {
    if (filter === "both") return r.inA && r.inB;
    if (filter === "watchlist") return r.source === "watchlist";
    if (filter === "discover") return r.source === "discover";
    return true;
  });
  const ordered = orderRecommendations(filtered, sort);

  const counts = {
    all: metadataMatches.length,
    both: metadataMatches.filter((r) => r.inA && r.inB).length,
    watchlist: metadataMatches.filter((r) => r.source === "watchlist").length,
    discover: metadataMatches.filter((r) => r.source === "discover").length,
  };

  const selects: { key: keyof typeof fields; label: string; choices: [string, string][] }[] = [
    { key: "genre", label: "Tür", choices: genres.map((value) => [value, value]) },
    { key: "year", label: "Çıkış dönemi", choices: decades.map((value) => [String(value), value + "–" + (value + 9)]) },
    { key: "language", label: "Orijinal dil", choices: languages.map((value) => [value, languageNames.of(value) ?? value]) },
    { key: "country", label: "Yapım ülkesi", choices: countries.map((value) => [value, value]) },
    { key: "rating", label: "En düşük ortalama puan", choices: [["3", "3 / 5"], ["3.5", "3,5 / 5"], ["4", "4 / 5"]] },
  ];
  const changeFilter = (key: keyof typeof fields, value: string) => {
    setFields((previous) => ({ ...previous, [key]: value }));
    setShown(12);
  };
  const clearFilters = () => {
    setFields(initialFields);
    setMood("");
    setAudience("");
    setFilter("all");
    setSort("balanced");
    setShown(12);
  };
  const hasMetadataFilters = Object.values(fields).some(Boolean);
  const inputClass = "min-w-0 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-foreground";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Sıradaki filminiz</h2>
          <p className="text-sm text-muted">
            İkinizin de izlemediği filmler: izleme listeleriniz ve zevklerinize özel yeni keşifler birlikte sıralandı.
          </p>
        </div>
        {aiEnabled && (
          <button
            onClick={() => onAskAi(ordered)}
            disabled={aiState === "loading" || !ordered.length}
            className="rounded-lg border border-lbgreen px-4 py-2 text-sm font-semibold text-lbgreen transition hover:bg-lbgreen hover:text-black disabled:opacity-50"
          >
            {aiState === "loading" ? "Gemini düşünüyor…" : ai ? "✨ Yeniden yorumlat" : "✨ Gemini ile yorumlat"}
          </button>
        )}
      </div>

      <div className="card grid gap-4">
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-semibold text-white">Bu akşam ne izlemek istersiniz?</legend>
          <div className="flex flex-wrap gap-2">
            {[{ id: "", label: "Her ruh hâli" } as const, ...MOODS].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={mood === id}
                onClick={() => { setMood(id); setShown(12); }}
                className={`rounded-full border px-3 py-2 text-sm ${mood === id ? "border-lbgreen bg-lbgreen/15 text-lbgreen" : "border-line text-muted hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Ruh hâli etiketleri film türlerinden tahmin edilir.</p>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm text-muted">
            Popülerlik
            <select className={inputClass} value={audience} onChange={(event) => { setAudience(event.target.value as Audience | ""); setShown(12); }}>
              <option value="">Tüm filmler</option>
              {AUDIENCES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-muted">
            Zaman
            <select className={inputClass} value={["", "90", "120", "150"].includes(fields.runtime) ? fields.runtime : "custom"}
              onChange={(event) => changeFilter("runtime", event.target.value)}>
              <option value="">Süre sınırı yok</option>
              <option value="90">En fazla 90 dk</option>
              <option value="120">En fazla 2 saat</option>
              <option value="150">En fazla 2,5 saat</option>
              {fields.runtime && !["90", "120", "150"].includes(fields.runtime) && <option value="custom" disabled>{fields.runtime} dk</option>}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-muted">
            Sıralama
            <select className={inputClass} value={sort} onChange={(event) => { setSort(event.target.value as RecommendationSort); setShown(12); }}>
              {SORTS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
        </div>
        {audience && <p className="text-xs text-muted">Niş: 1–299 oy · Orta kitle: 300–1.499 oy · Popüler: 1.500 ve üzeri oy. Oy sayısı bilinmeyenler bu filtreye girmez.</p>}
      </div>

      <details className="card py-3">
        <summary className="cursor-pointer text-sm font-semibold marker:text-lbgreen">Film filtreleri{hasMetadataFilters ? " · Etkin" : ""}</summary>
        <fieldset className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Film filtreleri">
          <label className="grid gap-1 text-sm text-muted">
            En fazla süre (dk)
            <input className={inputClass} type="number" min="1" step="1" inputMode="numeric" placeholder="Örn. 90"
              value={fields.runtime} onChange={(event) => changeFilter("runtime", event.target.value)} />
          </label>
          {selects.map(({ key, label, choices }) => (
            <label key={key} className="grid gap-1 text-sm text-muted">
              {label}
              <select className={inputClass} value={fields[key]} onChange={(event) => changeFilter(key, event.target.value)}>
                <option value="">Tümü</option>
                {choices.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </label>
          ))}
          <button type="button" className="justify-self-start text-sm text-muted underline hover:text-foreground"
            onClick={clearFilters}>
            Filtreleri temizle
          </button>
        </fieldset>
      </details>
      <div className="flex flex-wrap gap-2 text-xs">
        {(
          [
            ["all", `Tümü (${counts.all})`],
            ["both", `Ortak Watchlist (${counts.both})`],
            ["watchlist", `Watchlist'ten (${counts.watchlist})`],
            ["discover", `Yeni Keşifler (${counts.discover})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => {
              setFilter(k);
              setShown(12);
            }}
            className={`rounded-full border px-3 py-1.5 ${
              filter === k ? "border-lbgreen bg-lbgreen/15 font-semibold text-lbgreen" : "border-line text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aiState === "error" && <p className="text-sm text-lborange">Gemini yorumu alınamadı, kural tabanlı gerekçeler gösteriliyor.</p>}
      {ai?.summary && ordered.some((film) => film.meta.key === ai.pick) && <div className="card border-lbgreen/40 text-sm">✨ {ai.summary}</div>}

      {ordered.length === 0 && (
        <div className="card text-muted">
          {recs.length ? "Bu filtrelere uyan film bulunamadı." : "Şu anda önerilecek film bulunamadı."}
          {recs.length > 0 && <button type="button" className="ml-3 font-medium text-lbgreen underline" onClick={clearFilters}>Filtreleri temizle</button>}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {ordered.slice(0, shown).map((r, i) => {
          const isPick = ai?.pick === r.meta.key;
          const reach = AUDIENCES.find(({ id }) => id === audienceOf(r.meta.voteCount));
          const moods = moodsFor(r.meta);
          return (
            <article key={r.meta.key} className={`card movie-card flex gap-3 sm:gap-5 ${i === 0 ? "movie-card-featured" : ""}`}>
              <a href={r.meta.url} target="_blank" rel="noreferrer" className="movie-poster block w-20 shrink-0 self-start overflow-hidden rounded-lg border border-line bg-background sm:w-32">
                {r.meta.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.meta.poster} alt={r.meta.name} loading={i === 0 ? "eager" : "lazy"} className="aspect-[2/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center rounded-lg bg-panel-2 p-2 text-center text-xs">{r.meta.name}</div>
                )}
              </a>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="mb-1 flex flex-wrap gap-1.5">
                      {isPick && <span className="text-xs font-bold uppercase tracking-wide text-lbgreen">Bu gecenin seçimi</span>}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          r.inA && r.inB
                            ? "bg-lbgreen/20 text-lbgreen"
                            : r.source === "watchlist"
                              ? "bg-lbblue/15 text-lbblue"
                              : "bg-lborange/15 text-lborange"
                        }`}
                      >
                        {r.inA && r.inB ? "Ortak Watchlist" : r.source === "watchlist" ? "Watchlist" : "Yeni Keşif"}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                      <a href={r.meta.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {r.meta.name}
                      </a>{" "}
                      <span className="font-normal text-muted">{r.meta.year}</span>
                    </h3>
                    <div className="text-sm text-muted">{[
                      r.meta.directors.join(", "),
                      r.meta.runtime && `${r.meta.runtime} dk`,
                      r.meta.avgRating && star(r.meta.avgRating),
                    ].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-right">
                    {!r.detailsUnavailable && <div aria-label="Öneri skoru" className="rounded-lg border border-lbgreen/30 bg-lbgreen/10 px-2.5 py-1 text-lg font-bold text-lbgreen">{r.score}</div>}
                    <button
                      type="button"
                      onClick={() => onWatched(r.meta)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-foreground hover:border-lbgreen hover:text-lbgreen sm:px-3 sm:text-sm"
                    >
                      Birlikte izledik
                    </button>
                  </div>
                </div>

                {r.detailsUnavailable ? <p className="text-xs text-muted">Film detayları alınamadı.</p> : <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    [a, r.matchA, "bg-lborange"],
                    [b, r.matchB, "bg-lbblue"],
                  ].map(([name, v, color]) => (
                    <div key={String(name)}>
                      <div className="mb-0.5 flex justify-between">
                        <span className="truncate">{name}</span>
                        <span>%{v}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-panel-2">
                        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${v}%` }} />
                      </div>
                    </div>
                  ))}
                </div>}

                <div className="flex flex-wrap gap-1.5">
                  {reach && <span className="chip" title={r.meta.voteCount?.toLocaleString("tr-TR") + " oy"}>{reach.label}</span>}
                  {mood && <span className="chip">{MOODS.find(({ id }) => mood === id)?.label}</span>}
                  {!mood && moods.length > 0 && <span className="chip">{MOODS.find(({ id }) => moods[0] === id)?.label}</span>}
                  {r.meta.genres.slice(0, 4).map((g) => (
                    <span key={g} className="chip">
                      {g}
                    </span>
                  ))}
                </div>

                {aiText.get(r.meta.key) ? (
                  <p className="text-sm leading-relaxed">✨ {aiText.get(r.meta.key)}</p>
                ) : (
                  <ul className="list-inside list-disc text-sm text-foreground/90">
                    {r.reasons.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                )}
                {r.warnings.map((w) => (
                  <p key={w} className="text-xs text-lborange">
                    ⚠ {w}
                  </p>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      {shown < ordered.length && (
        <button onClick={() => setShown((s) => s + 10)} className="self-center rounded-lg border border-line px-4 py-2 text-sm hover:bg-panel-2">
          Daha fazla göster ({ordered.length - shown})
        </button>
      )}
    </section>
  );
}
