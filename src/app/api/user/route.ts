import { BlockedError, NotFoundError, scrapeUser } from "@/lib/letterboxd";

export const maxDuration = 300;

export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get("username") ?? "";
  if (!username.trim()) return Response.json({ error: "Kullanıcı adı gerekli." }, { status: 400 });

  try {
    const data = await scrapeUser(username);
    if (!data.watched.length) {
      return Response.json({ error: `@${data.username} için izlenmiş film bulunamadı (profil gizli olabilir).` }, { status: 404 });
    }
    return Response.json(data);
  } catch (e) {
    if (e instanceof NotFoundError) return Response.json({ error: "Böyle bir Letterboxd kullanıcısı bulunamadı." }, { status: 404 });
    const status = e instanceof BlockedError ? 503 : 500;
    return Response.json({ error: e instanceof Error ? e.message : "Bilinmeyen hata" }, { status });
  }
}
