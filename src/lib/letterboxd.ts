// Yalnızca sunucuda (route handler'larda) kullanılır.
import { promises as fs } from "fs";
import path from "path";
import { decodeEntities, filmKey, splitNameYear } from "./keys";
import type { FilmLookup, FilmMeta, FilmRef } from "./types";

const BASE = "https://letterboxd.com";
const HEADERS = {
  "User-Agent": "next-movie/0.1 (personal two-person film recommender)",
  Accept: "text/html,application/xhtml+xml",
};

export class BlockedError extends Error {
  constructor() {
    super(
      "Letterboxd bu isteği bot doğrulamasıyla (Cloudflare) engelledi. Biraz bekleyip tekrar dene ya da Letterboxd export ZIP dosyasını yükle.",
    );
  }
}

export class NotFoundError extends Error {}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow", cache: "no-store" });
  const html = await res.text();
  if (res.status === 403 || res.status === 429 || html.includes("_cf_chl_opt") || html.includes("<title>Just a moment")) {
    throw new BlockedError();
  }
  if (res.status === 404) throw new NotFoundError(`Bulunamadı: ${url}`);
  if (!res.ok) throw new Error(`Letterboxd ${res.status} döndü: ${url}`);
  return { html, finalUrl: res.url };
}

/** Basit eşzamanlılık sınırlayıcı. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// Kullanıcı profili (izlenenler + izleme listesi)
// ---------------------------------------------------------------------------

function parseGrid(html: string): FilmRef[] {
  const items: FilmRef[] = [];
  const chunks = html.split(/<li class="(?:griditem|poster-container)[^"]*"/).slice(1);
  for (const chunk of chunks) {
    const body = chunk.split("</li>")[0];
    const slug =
      body.match(/data-(?:item|film)-slug="([^"]+)"/)?.[1] ?? body.match(/data-target-link="\/film\/([^/"]+)\/?"/)?.[1];
    if (!slug) continue;
    const rawName = decodeEntities(
      body.match(/data-item-name="([^"]+)"/)?.[1] ?? body.match(/data-film-name="([^"]+)"/)?.[1] ?? body.match(/alt="([^"]+)"/)?.[1] ?? slug,
    );
    const parsed = splitNameYear(rawName);
    const name = parsed.name;
    let year = parsed.year;
    const relYear = body.match(/data-film-release-year="(\d{4})"/)?.[1];
    if (!year && relYear) year = Number(relYear);
    const rated = body.match(/\brated-(\d+)\b/)?.[1];
    items.push({
      key: filmKey(name, year),
      name,
      year,
      slug,
      rating: rated ? Number(rated) / 2 : undefined,
      liked: /\bliked-micro\b|icon-liked/.test(body) || undefined,
    });
  }
  return items;
}

function lastPage(html: string, section: string): number {
  const re = new RegExp(`/${section}/page/(\\d+)/`, "g");
  let max = 1;
  for (const m of html.matchAll(re)) max = Math.max(max, Number(m[1]));
  return max;
}

async function scrapeList(username: string, section: "films" | "watchlist", maxPages: number): Promise<FilmRef[]> {
  const first = await fetchHtml(`${BASE}/${username}/${section}/`);
  const total = Math.min(lastPage(first.html, section), maxPages);
  const pages = Array.from({ length: total - 1 }, (_, i) => i + 2);
  const rest = await mapLimit(pages, 3, async (p) => parseGrid((await fetchHtml(`${BASE}/${username}/${section}/page/${p}/`)).html));
  return [parseGrid(first.html), ...rest].flat();
}

export async function scrapeUser(rawUsername: string, maxPages = 40) {
  const username = rawUsername.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?letterboxd\.com\//, "").split("/")[0].toLowerCase();
  if (!/^[a-z0-9_]+$/.test(username)) throw new Error("Geçersiz Letterboxd kullanıcı adı.");

  const watched = await scrapeList(username, "films", maxPages);
  let watchlist: FilmRef[] = [];
  try {
    watchlist = await scrapeList(username, "watchlist", maxPages);
  } catch (e) {
    if (e instanceof BlockedError) throw e;
    // Gizli izleme listesi olabilir; boş geç.
  }
  const watchedKeys = new Set(watched.map((f) => f.key));
  return { username, watched, watchlist: watchlist.filter((f) => !watchedKeys.has(f.key)) };
}

// ---------------------------------------------------------------------------
// Film detayları (JSON-LD) + disk önbelleği
// ---------------------------------------------------------------------------

const CACHE_FILE = path.join(process.cwd(), ".cache", "films.json");
let memCache: Map<string, FilmMeta> | null = null;
let writeTimer: NodeJS.Timeout | null = null;

async function cache(): Promise<Map<string, FilmMeta>> {
  if (memCache) return memCache;
  try {
    memCache = new Map(Object.entries(JSON.parse(await fs.readFile(CACHE_FILE, "utf8"))));
  } catch {
    memCache = new Map();
  }
  return memCache;
}

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(async () => {
    writeTimer = null;
    if (!memCache) return;
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(memCache)));
  }, 1500);
}

type Named = { name?: string };
const names = (v: unknown): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).map((x: Named | string) => (typeof x === "string" ? x : x?.name ?? "")).filter(Boolean);

function parseFilmPage(html: string, finalUrl: string, lookup: FilmLookup): FilmMeta {
  const slug = finalUrl.match(/\/film\/([^/]+)\//)?.[1] ?? lookup.slug ?? "";
  const ldRaw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ld: any = {};
  try {
    ld = JSON.parse(ldRaw.replace(/\/\*\s*<!\[CDATA\[\s*\*\//, "").replace(/\/\*\s*\]\]>\s*\*\//, "").trim());
  } catch {
    /* JSON-LD yoksa aşağıdaki yedeklere düş */
  }

  const ogTitle = decodeEntities(html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? "");
  const fromOg = splitNameYear(ogTitle);
  const year = lookup.year ?? fromOg.year ?? (ld.dateCreated ? Number(String(ld.dateCreated).slice(0, 4)) : undefined);

  let genres: string[] = Array.isArray(ld.genre) ? ld.genre : ld.genre ? [ld.genre] : [];
  if (!genres.length) {
    genres = [...html.matchAll(/href="\/films\/genre\/([^/"]+)\/"/g)].map((m) => m[1].replace(/-/g, " "));
  }

  const runtime = Number(html.match(/(\d+)&nbsp;mins/)?.[1]) || undefined;
  const description = decodeEntities(html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ?? ld.description ?? "");

  return {
    key: lookup.key,
    slug,
    name: ld.name ?? fromOg.name ?? lookup.name,
    year,
    directors: names(ld.director),
    actors: names(ld.actor ?? ld.actors).slice(0, 8),
    genres: [...new Set(genres.map((g) => g.trim()).filter(Boolean))],
    countries: names(ld.countryOfOrigin),
    runtime,
    avgRating: typeof ld.aggregateRating?.ratingValue === "number" ? ld.aggregateRating.ratingValue : undefined,
    poster: typeof ld.image === "string" ? ld.image : undefined,
    url: slug ? `${BASE}/film/${slug}/` : finalUrl,
    description: description || undefined,
  };
}

export async function getFilmMeta(lookup: FilmLookup): Promise<FilmMeta | null> {
  const c = await cache();
  const cacheKey = lookup.slug ? `slug:${lookup.slug}` : lookup.uri ? `uri:${lookup.uri}` : null;
  if (!cacheKey) return null;
  const hit = c.get(cacheKey);
  if (hit) return { ...hit, key: lookup.key };

  const url = lookup.slug ? `${BASE}/film/${lookup.slug}/` : lookup.uri!;
  if (!/^https:\/\/(boxd\.it|letterboxd\.com)\//.test(url)) return null;

  try {
    const { html, finalUrl } = await fetchHtml(url);
    const meta = parseFilmPage(html, finalUrl, lookup);
    c.set(cacheKey, meta);
    if (meta.slug) c.set(`slug:${meta.slug}`, meta);
    scheduleWrite();
    return meta;
  } catch (e) {
    if (e instanceof BlockedError) throw e;
    return null;
  }
}
