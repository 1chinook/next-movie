/** Bir kullanıcının listesindeki film kaydı (export veya profilden). */
export interface FilmRef {
  /** Kaynaklar arası eşleştirme anahtarı: normalize(isim)|yıl */
  key: string;
  name: string;
  year?: number;
  /** boxd.it kısa linki (export'tan) */
  uri?: string;
  /** letterboxd.com/film/<slug>/ */
  slug?: string;
  /** 0.5 - 5 */
  rating?: number;
  liked?: boolean;
}

export interface UserData {
  label: string;
  source: "export" | "username";
  watched: FilmRef[];
  watchlist: FilmRef[];
}

/** Letterboxd film sayfasından çekilen detaylar. */
export interface FilmMeta {
  key: string;
  slug: string;
  name: string;
  year?: number;
  directors: string[];
  actors: string[];
  genres: string[];
  countries: string[];
  runtime?: number;
  /** Letterboxd ortalaması (0-5) */
  avgRating?: number;
  poster?: string;
  url: string;
  description?: string;
}

export interface FilmLookup {
  key: string;
  name: string;
  year?: number;
  uri?: string;
  slug?: string;
}
