"use client";

import { useEffect, useState } from "react";
import { PersonInput, emptyPerson, type PersonInputState } from "@/components/PersonInput";
import { CompatibilitySection, ProfileCard, Recommendations, type AiResult } from "@/components/Results";
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
import type { SeedHitInfo } from "@/lib/tmdb";
import type { FilmLookup, FilmMeta, UserData } from "@/lib/types";

interface Result {
  users: [UserData, UserData];
  profiles: [Profile, Profile];
  compat: Compatibility;
  recs: Recommendation[];
  warning?: string;
}

async function loadUser(p: PersonInputState): Promise<UserData> {
  const label = p.label.trim() || "?";
  if (p.mode === "export") {
    if (p.files.length) return importLetterboxdFiles(p.files, label);
    if (p.savedData) return { ...p.savedData, label };
    throw new Error(`${label}: export dosyası seçilmedi.`);
  }
  if (!p.username.trim()) throw new Error(`${label}: kullanıcı adı girilmedi.`);
  const res = await fetch(`/api/user?username=${encodeURIComponent(p.username)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`${label}: ${data.error}`);
  return { label, source: "username", watched: data.watched, watchlist: data.watchlist };
}

const BATCH = 20;
const STORAGE_KEY = "next-movie:saved-people-v1";

export default function Home() {
  const [people, setPeople] = useState<[PersonInputState, PersonInputState]>([emptyPerson("Ben"), emptyPerson("Sen")]);
  const [depth, setDepth] = useState<Depth>("normal");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [ai, setAi] = useState<AiResult | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    fetch("/api/explain")
      .then((r) => r.json())
      .then((d) => setAiEnabled(Boolean(d.enabled)))
      .catch(() => {});

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as [UserData | null, UserData | null];
      queueMicrotask(() => {
        setPeople((prev) => [
          saved[0] ? { ...prev[0], label: saved[0].label || prev[0].label, savedData: saved[0] } : prev[0],
          saved[1] ? { ...prev[1], label: saved[1].label || prev[1].label, savedData: saved[1] } : prev[1],
        ]);
      });
    } catch {
      /* bozuk localStorage verisini yoksay */
    }
  }, []);

  async function askAi(r: Result) {
    setAiState("loading");
    try {
      const top = r.recs.slice(0, 6);
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names: [r.profiles[0].label, r.profiles[1].label],
          profiles: [profileSummary(r.profiles[0]), profileSummary(r.profiles[1])],
          compatibility: `Uyum skoru %${r.compat.score}, ortak izlenen ${r.compat.commonWatched} film, puan korelasyonu ${r.compat.correlation?.toFixed(2) ?? "bilinmiyor"}. Ortak sevilenler: ${r.compat.sharedLoves
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
      setAi(data);
      setAiState("idle");
    } catch (e) {
      console.error(e);
      setAiState("error");
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    setAi(null);
    setAiState("idle");
    setProgress(0);
    try {
      setStep("Letterboxd verileri okunuyor…");
      const [a, b] = await Promise.all(people.map(loadUser));
      if (a.label === b.label) b.label = `${b.label} (2)`;

      // Bir sonraki açılışta tekrar ZIP seçmemek için tarayıcıda sakla
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([a, b]));
        setPeople((prev) => [
          { ...prev[0], files: [], savedData: a },
          { ...prev[1], files: [], savedData: b },
        ]);
      } catch {
        /* localStorage kotası dolduysa sessizce geç */
      }

      // Detayı çekilecek filmler
      const candidates = buildCandidates(a, b, depth);
      const lookups = new Map<string, FilmLookup>();
      for (const f of [...pickProfileFilms(a, depth), ...pickProfileFilms(b, depth), ...candidates.map((c) => c.ref)]) {
        if (!lookups.has(f.key) && f.name) lookups.set(f.key, { key: f.key, name: f.name, year: f.year, slug: f.slug, uri: f.uri });
      }
      const todo = [...lookups.values()];

      const metas = new Map<string, FilmMeta>();
      let warning: string | undefined;
      for (let i = 0; i < todo.length; i += BATCH) {
        setStep(`Film detayları çekiliyor… (${Math.min(i + BATCH, todo.length)}/${todo.length})`);
        const res = await fetch("/api/films", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ films: todo.slice(i, i + BATCH) }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (metas.size < 20) throw new Error(data.error);
          warning = `${data.error} Analiz şimdiye kadar çekilen ${metas.size} filmle yapıldı.`;
          break;
        }
        for (const m of data.films as FilmMeta[]) metas.set(m.key, m);
        setProgress((i + BATCH) / todo.length);
      }

      setStep("Zevk profilleri çıkarılıyor…");
      const pa = buildProfile(a, metas);
      const pb = buildProfile(b, metas);
      const compat = compare(a, b, pa, pb);

      const allCandidates: Candidate[] = [...candidates];
      const discPayload = buildDiscoveryPayload(a, b, pa, pb, compat, metas);
      if (discPayload.seeds.length || discPayload.genreIds.length) {
        setStep("Zevklerinize özel yeni filmler keşfediliyor…");
        const dRes = await fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(discPayload),
        });
        if (dRes.ok) {
          const dData = (await dRes.json()) as { films?: FilmMeta[]; seedMap?: Record<string, SeedHitInfo> };
          for (const m of dData.films ?? []) {
            metas.set(m.key, m);
            allCandidates.push({
              ref: { key: m.key, name: m.name, year: m.year, slug: m.slug },
              inA: false,
              inB: false,
              source: "discover",
              seedInfo: dData.seedMap?.[m.key],
            });
          }
        }
      }

      const recs = recommend(allCandidates, metas, pa, pb);
      const r: Result = { users: [a, b], profiles: [pa, pb], compat, recs, warning };
      setResult(r);
      if (aiEnabled && recs.length) askAi(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2 text-center">
        <div className="flex justify-center gap-1.5">
          <span className="h-4 w-4 rounded-full bg-lborange" />
          <span className="h-4 w-4 rounded-full bg-lbgreen" />
          <span className="h-4 w-4 rounded-full bg-lbblue" />
        </div>
        <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">Next Movie</h1>
        <p className="text-muted">İkinizin Letterboxd geçmişini analiz eder, birlikte izleyeceğiniz sıradaki filmi bulur.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {([0, 1] as const).map((idx) => (
          <PersonInput
            key={idx}
            value={people[idx]}
            onChange={(v) => {
              const next: [PersonInputState, PersonInputState] = idx === 0 ? [v, people[1]] : [people[0], v];
              setPeople(next);
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

      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Analiz derinliği:</span>
          {(
            [
              ["fast", "Hızlı"],
              ["normal", "Normal"],
              ["deep", "Derin"],
            ] as const
          ).map(([d, l]) => (
            <button
              key={d}
              disabled={busy}
              onClick={() => setDepth(d)}
              className={`rounded-full border px-3 py-1 ${depth === d ? "border-lbgreen text-lbgreen" : "border-line text-muted hover:text-foreground"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="rounded-xl bg-lbgreen px-8 py-3 text-lg font-bold text-black shadow-lg shadow-lbgreen/20 transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Analiz ediliyor…" : "Analiz et ve film öner"}
        </button>
        {busy && (
          <div className="w-full max-w-md">
            <div className="h-2 overflow-hidden rounded-full bg-panel-2">
              <div className="h-2 rounded-full bg-lbgreen transition-all" style={{ width: `${Math.max(4, Math.min(100, progress * 100))}%` }} />
            </div>
            <p className="mt-2 text-center text-sm text-muted">{step}</p>
            <p className="text-center text-xs text-muted">İlk analiz biraz sürebilir; film detayları önbelleğe alınır, sonrakiler hızlıdır.</p>
          </div>
        )}
        {error && <p className="max-w-xl rounded-lg border border-lborange/50 bg-lborange/10 px-4 py-2 text-center text-sm text-lborange">{error}</p>}
      </div>

      {result && (
        <>
          {result.warning && <p className="rounded-lg border border-lborange/50 bg-lborange/10 px-4 py-2 text-sm text-lborange">{result.warning}</p>}
          <Recommendations
            recs={result.recs}
            a={result.profiles[0].label}
            b={result.profiles[1].label}
            ai={ai}
            aiState={aiState}
            aiEnabled={aiEnabled}
            onAskAi={() => askAi(result)}
          />
          <CompatibilitySection c={result.compat} a={result.profiles[0]} b={result.profiles[1]} />
          <div className="grid gap-4 md:grid-cols-2">
            <ProfileCard p={result.profiles[0]} accent="orange" />
            <ProfileCard p={result.profiles[1]} accent="blue" />
          </div>
        </>
      )}

      <footer className="mt-auto pt-8 text-center text-xs text-muted">
        Veriler Letterboxd&apos;dan gelir; bu uygulama Letterboxd ile bağlantılı değildir.
      </footer>
    </main>
  );
}
