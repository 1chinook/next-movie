# Next Movie

İki kişinin Letterboxd verilerini analiz edip birlikte izlenecek sıradaki filmi öneren Next.js uygulaması.

| Alan | Değer |
|---|---|
| **Kategori** | Full-Stack Web Uygulaması |
| **Teknoloji** | Next.js 16 + React 19 + TypeScript |
| **Port / URL** | `3001` · `http://localhost:3001` |
| **Başlatıcı** | `BASLAT.bat` (`start.ps1`) |
| **Doğrulama** | `npm run lint && npx tsc --noEmit` |

## Özellikler

- **Veri Girişi:** Letterboxd export ZIP/CSV yükleme (önerilen) veya herkese açık kullanıcı adı.
- **Zevk Profili:** Puanları kişinin kendi ortalamasına göre normalize ederek tür, yönetmen, oyuncu, dönem ve ülke tercihlerini çıkarır.
- **Uyum Analizi:** Uyum skoru, puan korelasyonu, tür karşılaştırması, ortak favoriler ve çatışma noktaları.
- **Akıllı Öneri:** İki kişinin de izlemediği watchlist filmleri; ortak izleme listesi önceliklendirilir.
- **TMDB ve Gemini (Opsiyonel):** `TMDB_API_KEY` / `TMDB_READ_TOKEN` ile zengin film metadatası (`.cache/films.json` önbellekli) ve `GEMINI_API_KEY` ile kişiselleştirilmiş öneri gerekçeleri.

## Klasör Yapısı

```text
next-movie/
├── src/                    # Next.js App Router sayfaları, API rotaları ve analiz motoru
├── public/                 # Statik varlıklar
├── .env.example            # Örnek ortam değişkenleri şablonu
├── package.json            # Bağımlılıklar ve betikler (PORT=3001)
├── next.config.ts          # Next.js yapılandırması
├── tsconfig.json           # TypeScript yapılandırması
├── eslint.config.mjs       # ESLint yapılandırması
├── BASLAT.bat & start.ps1  # Tek tık otomatik yeniden başlatıcı
├── AGENTS.md               # Proje ve mühendislik kuralları
└── README.md
```

## Kurulum ve Çalıştırma

- **Windows Tek Tık Başlatıcı (Önerilen):** `BASLAT.bat` dosyasına çift tıklayın (eksikse `npm install` çalıştırır, `3001` portundaki eski süreci temizler ve tarayıcıyı açar).
- **Terminal:**

```sh
npm install
cp .env.example .env.local   # TMDB_API_KEY / TMDB_READ_TOKEN ve opsiyonel GEMINI_API_KEY ekleyin
npm run dev
```

### Letterboxd Export Nasıl Alınır?

Letterboxd → **Settings → Data → Export your data** yolundan inen ZIP dosyasını doğrudan yükleyin.

> Not: Kullanıcı adı modu herkese açık profil sayfalarını çeker ve bot doğrulamasına takılabilir. En sorunsuz yöntem Export ZIP + TMDB API kullanımıdır. Bu proje Letterboxd ve TMDB ile bağlantılı değildir.

## Testler ve Doğrulama

```sh
npm run lint
npx tsc --noEmit
```
