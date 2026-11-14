# Next Movie 🍿

İki kişinin Letterboxd verilerini analiz edip **birlikte izlenecek sıradaki filmi** öneren Next.js uygulaması.

## Özellikler
- **Veri girişi:** Letterboxd export ZIP/CSV'si veya herkese açık kullanıcı adı
- **Zevk profili:** Puanlar kişinin kendi ortalamasına göre normalize edilerek tür, yönetmen, oyuncu, dönem ve ülke tercihleri çıkarılır
- **Uyum analizi:** Uyum skoru, puan korelasyonu, tür karşılaştırması, ortak favoriler, çatışma noktaları
- **Öneri:** İkinizin de izlemediği, izleme listelerinizdeki filmler; ortak watchlist önceliklidir, sadece birine hitap eden filmler cezalandırılır
- **Gemini (opsiyonel):** Kişiselleştirilmiş öneri gerekçeleri ve "bu gecenin seçimi"

Film detayları (tür, yönetmen, oyuncu…) Letterboxd film sayfalarındaki JSON-LD'den alınır ve `.cache/films.json` içinde önbelleklenir.

## Kurulum
```bash
npm install
cp .env.example .env.local   # Gemini kullanacaksan GEMINI_API_KEY ekle
npm run dev
```
http://localhost:3000

## Export nasıl alınır?
Letterboxd → Settings → Data → **Export your data**. İnen ZIP'i olduğu gibi yükle.

> Not: Letterboxd zaman zaman otomatik istekleri bot doğrulamasıyla engelleyebilir. Uygulama bunu aşmaya çalışmaz; böyle durumda bir süre bekleyip tekrar deneyin.

Bu proje Letterboxd ile bağlantılı değildir.
