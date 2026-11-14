export const maxDuration = 60;

interface ExplainBody {
  names: [string, string];
  profiles: [string, string];
  compatibility: string;
  films: { key: string; name: string; year?: number; directors: string[]; genres: string[]; reasons: string[]; warnings: string[] }[];
}

/** Gemini anahtarı tanımlı mı? (Arayüz butonu göstermek için) */
export async function GET() {
  return Response.json({ enabled: Boolean(process.env.GEMINI_API_KEY) });
}

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "GEMINI_API_KEY tanımlı değil (.env.local)." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as ExplainBody | null;
  if (!body?.films?.length) return Response.json({ error: "Film listesi boş." }, { status: 400 });

  const [a, b] = body.names;
  const prompt = `Sen sıcak, esprili ama isabetli bir film küratörüsün. ${a} ve ${b} birlikte film izleyecek.
Aşağıda ikisinin Letterboxd verilerinden çıkarılmış zevk profilleri ve algoritmanın seçtiği aday filmler var.

PROFİLLER:
- ${body.profiles[0]}
- ${body.profiles[1]}

UYUM: ${body.compatibility}

ADAYLAR (algoritmanın sırasıyla):
${body.films
  .map(
    (f, i) =>
      `${i + 1}. [${f.key}] ${f.name} (${f.year ?? "?"}) — yön: ${f.directors.join(", ") || "?"}; türler: ${f.genres.join(", ") || "?"}; sinyaller: ${f.reasons.join(" | ")}${f.warnings.length ? `; riskler: ${f.warnings.join(" | ")}` : ""}`,
  )
  .join("\n")}

Görevler:
1. Her aday için Türkçe, 2-3 cümlelik, ikisine de hitap eden kişisel bir gerekçe yaz. Profil bilgilerine (sevdikleri yönetmen/tür/favori filmler) somut atıf yap. Uydurma bilgi verme.
2. Bu gece için tek bir "pick" seç (key).
3. Bir cümlelik genel yorum yaz (ikilinin film zevki uyumu hakkında).

Sadece şu JSON'u döndür:
{"pick": "<key>", "summary": "<metin>", "items": [{"key": "<key>", "text": "<gerekçe>"}]}`;

  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return Response.json({ error: `Gemini hatası (${res.status}): ${detail.slice(0, 300)}` }, { status: 502 });
  }

  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  try {
    return Response.json(JSON.parse(text.replace(/^```json\s*|```$/g, "").trim()));
  } catch {
    return Response.json({ error: "Gemini yanıtı çözümlenemedi." }, { status: 502 });
  }
}
