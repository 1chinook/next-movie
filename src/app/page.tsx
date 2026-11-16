"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PersonInput, emptyPerson, type PersonInputState } from "@/components/PersonInput";
import { CompatibilitySection, ProfileCard, Recommendations, type AiResult } from "@/components/Results";
import { SharedHistory } from "@/components/SharedHistory";
import {
  buildCandidates,
  buildDiscoveryPayload,
  buildProfile,
  compare,
  pickProfileFilms,
  profileSummary,
  recommend,
  type Candidate,
  type Compatibility,
  type Depth,
  type Profile,
  type Recommendation,
} from "@/lib/analysis";
import { importLetterboxdFiles } from "@/lib/exportImport";
import { includeSharedHistory, matchesWatchedFilm, withHistoryMetadata, type WatchedTogether } from "@/lib/history";
import type { SeedHitInfo } from "@/lib/tmdb";
import type { FilmLookup, FilmMeta, UserData } from "@/lib/types";

interface Result {
  profiles: [Profile, Profile];
  compat: Compatibility;
  recs: Recommendation[];
  warning?: string;
}

interface AnalysisData {
  users: [UserData, UserData];
  depth: Depth;
  metas: Map<string, FilmMeta>;
  discoveries: Candidate[];
  warning?: string;
}

function analyzeProfiles(users: [UserData, UserData], metas: Map<string, FilmMeta>, history: WatchedTogether[]) {
  const metadata = withHistoryMetadata(metas, history);
  const [a, b] = users.map((user) => includeSharedHistory(user, history, metadata));
  const pa = buildProfile(a, metadata);
  const pb = buildProfile(b, metadata);
  return { a, b, pa, pb, compat: compare(a, b, pa, pb), metadata };
}

function evaluate(data: AnalysisData, history: WatchedTogether[]): Result {
  const { a, b, pa, pb, compat, metadata } = analyzeProfiles(data.users, data.metas, history);
  const candidates = [...buildCandidates(a, b, data.depth), ...data.discoveries]
    .filter(({ ref }) => !history.some((film) => matchesWatchedFilm(film, metadata.get(ref.key) ?? ref)));
  return { profiles: [pa, pb], compat, recs: recommend(candidates, metadata, pa, pb), warning: data.warning };
}

function createProfileId(): string {
  // getRandomValues is available even on a local-network HTTP address.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function profilePairKey(a?: UserData | null, b?: UserData | null) {
  return a?.profileId && b?.profileId
    ? "next-movie:watched-together:" + JSON.stringify([a.profileId, b.profileId].sort())
    : null;
}

function restorePerson(person: PersonInputState, saved: UserData | null) {
  if (!saved || !Array.isArray(saved.watched) || !Array.isArray(saved.watchlist)) return person;
  const username = saved.profileId?.startsWith("letterboxd:") ? saved.profileId.slice("letterboxd:".length) : "";
  return { ...person, label: saved.label || person.label, mode: username ? "username" as const : "export" as const, username, savedData: saved };
}

async function loadUser(p: PersonInputState): Promise<UserData> {
  const label = p.label.trim() || "?";
  if (p.mode === "export") {
    if (p.files.length) {
      const data = await importLetterboxdFiles(p.files, label);
      const saved = p.savedData;
      const sameFilms = (left: UserData["watched"], right: UserData["watched"]) => {
        const keys = new Set(left.map((f) => f.key));
        return keys.size === right.length && right.every((f) => keys.has(f.key));
      };
      const sameExport = saved?.source === "export" && sameFilms(saved.watched, data.watched)
        && sameFilms(saved.watchlist, data.watchlist);
      return { ...data, profileId: (sameExport ? saved.profileId : undefined) ?? createProfileId() };
    }
    if (p.savedData) return { ...p.savedData, label };
    throw new Error(`${label}: export dosyası seçilmedi.`);
  }
  if (!p.username.trim()) throw new Error(`${label}: kullanıcı adı girilmedi.`);
  const res = await fetch(`/api/user?username=${encodeURIComponent(p.username)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`${label}: ${data.error}`);
  return { label, source: "username", profileId: "letterboxd:" + data.username, watched: data.watched, watchlist: data.watchlist };
}

const BATCH = 20;
const STORAGE_KEY = "next-movie:saved-people-v1";

function readHistory(key: string): WatchedTogether[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (Array.isArray(value)) return value.filter((film) => film && typeof film.key === "string"
      && typeof film.name === "string" && typeof film.markedAt === "string");
  } catch {
    return [];
  }
  return [];
}

export default function Home() {
  const [people, setPeople] = useState<[PersonInputState, PersonInputState]>([emptyPerson("Ben"), emptyPerson("Sen")]);
  const [depth, setDepth] = useState<Depth>("normal");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [history, setHistory] = useState<WatchedTogether[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [ai, setAi] = useState<AiResult | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");
  const aiRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/explain")
      .then((r) => r.json())
      .then((d) => setAiEnabled(Boolean(d.enabled)))
      .catch(() => {});

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) as [UserData | null, UserData | null] : null;
      if (Array.isArray(saved)) {
        queueMicrotask(() => {
          setPeople((prev) => [restorePerson(prev[0], saved[0]), restorePerson(prev[1], saved[1])]);
          const key = profilePairKey(saved[0], saved[1]);
          setHistoryKey(key);
          setHistory(key ? readHistory(key) : []);
        });
      }
    } catch {
      /* bozuk localStorage verisini yoksay */
    }
    return () => aiRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (!historyKey) return;
    const sync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== historyKey) return;
      setHistory(readHistory(historyKey));
      aiRequest.current?.abort();
      setAi(null);
      setAiState("idle");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [historyKey]);

  function resetAi() {
    aiRequest.current?.abort();
    setAi(null);
    setAiState("idle");
  }

  function updateHistory(key: string, change: (existing: WatchedTogether[]) => WatchedTogether[]) {
    try {
      const next = change(readHistory(key));
      localStorage.setItem(key, JSON.stringify(next));
      setHistory(next);
      setHistoryError(false);
      resetAi();
    } catch {
      setHistoryError(true);
    }
  }

  async function askAi(r: Result) {
    aiRequest.current?.abort();
    const request = new AbortController();
    aiRequest.current = request;
    setAiState("loading");
    try {
      const top = r.recs.slice(0, 6);
      const res = await fetch("/api/explain", {
        method: "POST",
        signal: request.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names: [r.profiles[0].label, r.profiles[1].label],
          profiles: [profileSummary(r.profiles[0]), profileSummary(r.profiles[1])],
          compatibility: `Uyum skoru ${r.compat.hasEvidence ? "%" + r.compat.score : "hesaplanamadı"}, ortak izlenen ${r.compat.commonWatched} film, puan korelasyonu ${r.compat.correlation?.toFixed(2) ?? "bilinmiyor"}. Ortak sevilenler: ${r.compat.sharedLoves
            .slice(0, 6)
            .map((s) => s.name)
            .join(", ")}.`,
          films: top.map((x) => ({
            key: x.meta.key,
            name: x.meta.name,
            year: x.meta.year,
            directors: x.meta.directors,
            genres: x.meta.genres,
            reasons: x.reasons,
            warnings: x.warnings,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (request.signal.aborted) return;
      setAi(data);
      setAiState("idle");
    } catch (e) {
      if (request.signal.aborted) return;
      console.error(e);
      setAiState("error");
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    setAnalysisData(null);
    resetAi();
    setProgress(0);
    try {
      setStep("Letterboxd verileri okunuyor…");
      const [a, b] = await Promise.all(people.map(loadUser));
      setProgress(0.12);
      a.profileId ??= createProfileId();
      b.profileId ??= createProfileId();
      if (a.profileId === b.profileId) throw new Error("Karşılaştırma için iki farklı profil seç.");
      const key = profilePairKey(a, b)!;
      setHistoryKey(key);
      const currentHistory = readHistory(key);
      setHistory(currentHistory);
      setHistoryError(false);
      if (a.label === b.label) b.label = `${b.label} (2)`;

      // Bir sonraki açılışta tekrar ZIP seçmemek için tarayıcıda sakla
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([a, b]));
      } catch {
        /* localStorage kotası dolduysa sessizce geç */
      }
      setPeople((prev) => [
        { ...prev[0], files: [], savedData: a },
        { ...prev[1], files: [], savedData: b },
      ]);

      // Detayı çekilecek filmler
      const [analyzedA, analyzedB] = [a, b].map((user) => includeSharedHistory(user, currentHistory, new Map()));
      const candidates = buildCandidates(analyzedA, analyzedB, depth);
      const lookups = new Map<string, FilmLookup>();
      for (const f of [...pickProfileFilms(a, depth), ...pickProfileFilms(b, depth), ...candidates.map((c) => c.ref)]) {
        if (!lookups.has(f.key) && f.name) lookups.set(f.key, { key: f.key, name: f.name, year: f.year, slug: f.slug, uri: f.uri });
      }
      for (const film of currentHistory) {
        if (!lookups.has(film.key)) lookups.set(film.key, { key: film.key, name: film.name, year: film.year });
      }
      const metas = withHistoryMetadata(new Map(), currentHistory);
      const todo = [...lookups.values()].filter((lookup) => !metas.has(lookup.key));
      let warning: string | undefined;
      for (let i = 0; i < todo.length; i += BATCH) {
        setStep(`Film detayları çekiliyor… (${Math.min(i + BATCH, todo.length)}/${todo.length})`);
        try {
          const res = await fetch("/api/films", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ films: todo.slice(i, i + BATCH) }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          for (const m of data.films as FilmMeta[]) metas.set(m.key, m);
        } catch {
          warning = "Film detaylarının bir kısmı alınamadı. İzleme listelerinizdeki filmler yine de önerilerde gösteriliyor.";
          break;
        }
        setProgress(0.12 + 0.68 * Math.min(i + BATCH, todo.length) / todo.length);
      }
      if (!warning && metas.size < lookups.size) {
        warning = "Bazı film detayları eksik. Süre, tür, dil, ülke ve puan filtreleri mevcut bilgilere göre çalışır.";
      }

      setStep("Zevk profilleri çıkarılıyor…");
      setProgress(0.82);
      const profiles = analyzeProfiles([a, b], metas, readHistory(key));
      const discoveries: Candidate[] = [];
      const discPayload = buildDiscoveryPayload(profiles.a, profiles.b, profiles.pa, profiles.pb, profiles.compat, profiles.metadata);
      if (discPayload.seeds.length || discPayload.genreIds.length) {
        setStep("Zevklerinize özel yeni filmler keşfediliyor…");
        setProgress(0.9);
        try {
          const dRes = await fetch("/api/discover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(discPayload),
          });
          if (!dRes.ok) throw new Error("Keşif isteği başarısız.");
          const dData = (await dRes.json()) as { films?: FilmMeta[]; seedMap?: Record<string, SeedHitInfo> };
          for (const m of dData.films ?? []) {
            if (!metas.has(m.key)) metas.set(m.key, m);
            discoveries.push({
              ref: { key: m.key, name: m.name, year: m.year, slug: m.slug },
              inA: false,
              inB: false,
              source: "discover",
              seedInfo: dData.seedMap?.[m.key],
            });
          }
        } catch {
          warning = [warning, "Yeni keşifler alınamadı. İzleme listelerinizle analiz tamamlandı."].filter(Boolean).join(" ");
        }
      }

      const data = { users: [a, b] as [UserData, UserData], depth, metas, discoveries, warning };
      const latestHistory = readHistory(key);
      setHistory(latestHistory);
      setAnalysisData(data);
      if (aiEnabled) {
        const r = evaluate(data, latestHistory);
        if (r.recs.length) askAi(r);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  const result = useMemo(() => analysisData && evaluate(analysisData, history), [analysisData, history]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:gap-7 sm:px-6 sm:py-9">
      <header className="movie-hero">
        <div className="relative z-10">
          <div aria-hidden="true" className="mb-5 flex gap-1.5">
            <span className="size-2.5 rounded-full bg-lborange" />
            <span className="size-2.5 rounded-full bg-lbgreen" />
            <span className="size-2.5 rounded-full bg-lbblue" />
          </div>
          <h1 className="text-5xl leading-[0.95] font-black tracking-tight text-white sm:text-7xl">Next Movie</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-200 sm:text-base">
            İki Letterboxd profilini karşılaştır ve birlikte izleyeceğiniz filmi bul.
          </p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-film" />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {([0, 1] as const).map((idx) => (
          <PersonInput
            key={idx}
            value={people[idx]}
            onChange={(v) => {
              const next: [PersonInputState, PersonInputState] = idx === 0 ? [v, people[1]] : [people[0], v];
              setPeople(next);
              const previous = people[idx];
              if (v.mode !== previous.mode || v.username !== previous.username || v.files !== previous.files || v.savedData !== previous.savedData) {
                setAnalysisData(null);
                setHistoryKey(null);
                setHistory([]);
                setHistoryError(false);
                resetAi();
              }
              if (!v.savedData) {
                try {
                  localStorage.setItem(STORAGE_KEY, JSON.stringify([next[0].savedData ?? null, next[1].savedData ?? null]));
                } catch {}
              }
            }}
            accent={idx === 0 ? "orange" : "blue"}
            disabled={busy}
          />
        ))}
      </div>

      <section className="card flex flex-col gap-4" aria-label="Film analizi">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p id="analysis-depth" className="mb-2 text-sm font-medium text-muted">Analiz derinliği</p>
            <div role="group" aria-labelledby="analysis-depth" className="inline-flex gap-1 rounded-xl border border-line bg-background p-1">
              {([
                ["fast", "Hızlı"],
                ["normal", "Normal"],
                ["deep", "Derin"],
              ] as const).map(([d, label]) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={depth === d}
                  disabled={busy}
                  onClick={() => setDepth(d)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${depth === d ? "bg-panel-2 text-white shadow-sm" : "text-muted hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="rounded-xl bg-lbgreen px-6 py-3.5 text-base font-bold text-black shadow-lg shadow-lbgreen/15 hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Analiz ediliyor…" : "Analiz et ve film öner"}
          </button>
        </div>
        {busy && (
          <div className="grid gap-2 rounded-xl border border-line bg-background p-3">
            <div className="analysis-film" aria-hidden="true" />
            <div role="progressbar" aria-label="Analiz ilerlemesi" aria-valuenow={Math.round(progress * 100)} className="h-1.5 overflow-hidden rounded-full bg-panel-2">
              <div className="analysis-fill h-1.5 rounded-full bg-lbgreen" style={{ width: `${progress * 100}%` }} />
            </div>
            <p role="status" className="text-sm text-muted">{step}</p>
          </div>
        )}
        {error && <p role="alert" className="rounded-lg border border-lborange/50 bg-lborange/10 px-4 py-2 text-sm text-lborange">{error}</p>}
      </section>

      {historyKey && (
        <SharedHistory
          history={history}
          people={people.map((p) => ({ id: p.savedData?.profileId, label: p.label }))}
          error={historyError}
          onRate={(key, profileId, rating) => updateHistory(historyKey, (existing) => existing.map((film) => {
            if (film.key !== key) return film;
            const ratings = { ...film.ratings };
            if (rating === undefined) delete ratings[profileId];
            else ratings[profileId] = rating;
            return { ...film, ratings };
          }))}
          onRemove={(key) => updateHistory(historyKey, (existing) => existing.filter((film) => film.key !== key))}
        />
      )}

      {result && historyKey && (
        <div className="movie-results flex flex-col gap-5 sm:gap-7">
          {result.warning && <p className="rounded-lg border border-lborange/50 bg-lborange/10 px-4 py-2 text-sm text-lborange">{result.warning}</p>}
          <Recommendations
            recs={result.recs}
            onWatched={(meta) => updateHistory(historyKey, (existing) => existing.some((film) => matchesWatchedFilm(film, meta)) ? existing : [{
              key: meta.key, tmdbId: meta.tmdbId, name: meta.name, year: meta.year, markedAt: new Date().toISOString(), meta: analysisData?.metas.get(meta.key),
            }, ...existing])}
            a={result.profiles[0].label}
            b={result.profiles[1].label}
            ai={ai}
            aiState={aiState}
            aiEnabled={aiEnabled && result.recs.length > 0}
            onAskAi={() => askAi(result)}
          />
          <CompatibilitySection c={result.compat} a={result.profiles[0]} b={result.profiles[1]} />
          <div className="grid gap-4 md:grid-cols-2">
            <ProfileCard p={result.profiles[0]} accent="orange" />
            <ProfileCard p={result.profiles[1]} accent="blue" />
          </div>
        </div>
      )}

      <footer className="mt-auto pt-8 text-center text-xs text-muted">
        Veriler Letterboxd&apos;dan gelir; bu uygulama Letterboxd ile bağlantılı değildir.
      </footer>
    </main>
  );
}
