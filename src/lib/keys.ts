export function normalizeTitle(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function filmKey(name: string, year?: number): string {
  return `${normalizeTitle(name)}|${year ?? ""}`;
}

/** "Film Adı (2020)" -> { name, year } */
export function splitNameYear(raw: string): { name: string; year?: number } {
  const m = raw.trim().match(/^(.*)\s+\((\d{4})\)$/);
  if (m) return { name: m[1], year: Number(m[2]) };
  return { name: raw.trim() };
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
