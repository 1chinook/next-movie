import JSZip from "jszip";
import { filmKey } from "./keys";
import type { FilmRef, UserData } from "./types";

/** RFC4180 uyumlu küçük CSV ayrıştırıcı. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ""));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

function toRef(r: Record<string, string>): FilmRef | null {
  const name = r["Name"];
  if (!name) return null;
  const year = r["Year"] ? Number(r["Year"]) : undefined;
  return {
    key: filmKey(name, year),
    name,
    year: Number.isFinite(year) ? year : undefined,
    uri: r["Letterboxd URI"] || undefined,
  };
}

type Kind = "watched" | "ratings" | "watchlist" | "likes";

function detectKind(path: string): Kind | null {
  const p = path.toLowerCase().replace(/\\/g, "/");
  if (p.includes("deleted/") || p.includes("orphaned/")) return null;
  if (p.endsWith("likes/films.csv")) return "likes";
  const base = p.split("/").pop()!;
  if (base === "watched.csv") return "watched";
  if (base === "ratings.csv") return "ratings";
  if (base === "watchlist.csv") return "watchlist";
  if (base === "films.csv" && p.includes("like")) return "likes";
  return null;
}

/**
 * Kullanıcının seçtiği dosyaları (export ZIP'i veya ayrı CSV'ler) okuyup UserData üretir.
 */
export async function importLetterboxdFiles(files: File[], label: string): Promise<UserData> {
  const tables: Partial<Record<Kind, Record<string, string>[]>> = {};

  const add = (kind: Kind | null, text: string) => {
    if (!kind) return;
    tables[kind] = [...(tables[kind] ?? []), ...parseCsv(text)];
  };

  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f) => !f.dir && f.name.toLowerCase().endsWith(".csv"));
      for (const entry of entries) add(detectKind(entry.name), await entry.async("string"));
    } else if (file.name.toLowerCase().endsWith(".csv")) {
      // Tek CSV'lerde "films.csv" beğeniler dosyasıdır (likes/ klasöründen).
      const kind = detectKind(file.webkitRelativePath || file.name) ?? (file.name.toLowerCase() === "films.csv" ? "likes" : null);
      add(kind, await file.text());
    }
  }

  if (!tables.watched && !tables.ratings && !tables.watchlist) {
    throw new Error("Dosyalarda watched.csv / ratings.csv / watchlist.csv bulunamadı. Letterboxd export ZIP'ini yükle.");
  }

  const watched = new Map<string, FilmRef>();
  for (const r of tables.watched ?? []) {
    const ref = toRef(r);
    if (ref) watched.set(ref.key, ref);
  }
  for (const r of tables.ratings ?? []) {
    const ref = toRef(r);
    if (!ref) continue;
    const rating = Number(r["Rating"]);
    const existing = watched.get(ref.key) ?? ref;
    if (Number.isFinite(rating) && rating > 0) existing.rating = rating;
    watched.set(ref.key, existing);
  }
  for (const r of tables.likes ?? []) {
    const ref = toRef(r);
    if (!ref) continue;
    const existing = watched.get(ref.key) ?? ref;
    existing.liked = true;
    watched.set(ref.key, existing);
  }

  const watchlist = new Map<string, FilmRef>();
  for (const r of tables.watchlist ?? []) {
    const ref = toRef(r);
    if (ref && !watched.has(ref.key)) watchlist.set(ref.key, ref);
  }

  return { label, source: "export", watched: [...watched.values()], watchlist: [...watchlist.values()] };
}
