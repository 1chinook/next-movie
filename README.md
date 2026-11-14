# Next Movie 🍿

İki kişinin Letterboxd verilerini analiz edip **birlikte izlenecek sıradaki filmi** öneren Next.js uygulaması.

## Özellikler
- **Veri girişi:** Letterboxd export ZIP/CSV'si (önerilen) veya herkese açık kullanıcı adı
- **Zevk profili:** Puanlar kişinin kendi ortalamasına göre normalize edilerek tür, yönetmen, oyuncu, dönem ve ülke tercihleri çıkarılır
- **Uyum analizi:** Uyum skoru, puan korelasyonu, tür karşılaştırması, ortak favoriler, çatışma noktaları
- **Öneri:** İkinizin de izlemediği, izleme listelerinizdeki filmler; ortak watchlist önceliklidir, sadece birine hitap eden filmler cezalandırılır
- **Gemini (opsiyonel):** Kişiselleştirilmiş öneri gerekçeleri ve "bu gecenin seçimi"

Film detayları (tür, yönetmen, oyuncu, süre, ülke, poster) `TMDB_API_KEY` veya `TMDB_READ_TOKEN` tanımlıysa **TMDB API**'den, aksi halde Letterboxd film sayfalarından alınır ve `.cache/films.json` içinde önbelleklenir.

## Kurulum
```bash
npm install
cp .env.example .env.local   # TMDB_API_KEY / TMDB_READ_TOKEN ve opsiyonel GEMINI_API_KEY ekle
npm run dev
```
http://localhost:3000

## Export nasıl alınır?
Letterboxd → Settings → Data → **Export your data**. İnen ZIP'i olduğu gibi yükle.

> Not: Kullanıcı adı modu herkese açık profil sayfalarını çeker ve Letterboxd zaman zaman otomatik istekleri bot doğrulamasıyla engelleyebilir. En sorunsuz yöntem Export ZIP + TMDB API kullanmaktır.

Bu proje Letterboxd ve TMDB ile bağlantılı değildir.
