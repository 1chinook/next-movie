import { ratingFor, type WatchedTogether } from "@/lib/history";

export function SharedHistory({
  history, people, error, onRate, onRemove,
}: {
  history: WatchedTogether[];
  people: { id?: string; label: string }[];
  error: boolean;
  onRate: (key: string, profileId: string, rating?: number) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <section className="card" aria-label="Ortak izleme geçmişi">
      <h2 className="text-xl font-bold">Birlikte izledikleriniz ({history.length})</h2>
      {error && <p role="alert" className="text-sm text-lborange">Geçmiş tarayıcıya kaydedilemedi.</p>}
      {history.length === 0 && <p className="text-sm text-muted">Henüz birlikte izlenen film kaydı yok.</p>}
      <ul className="mt-2 divide-y divide-line">
        {history.map((film) => (
          <li key={film.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{film.name}{film.year ? " (" + film.year + ")" : ""}</p>
              <p className="text-xs text-muted">{new Date(film.markedAt).toLocaleDateString("tr-TR")}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {people.map(({ id, label }, index) => id && (
                <label key={index} className="grid gap-1 text-xs text-muted">
                  {label} · Puan
                  <select
                    aria-label={film.name + " — " + label + " puanı"}
                    className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-sm text-foreground"
                    value={ratingFor(film, id) ?? ""}
                    onChange={(event) => onRate(film.key, id, event.target.value ? Number(event.target.value) : undefined)}
                  >
                    <option value="">Puan yok</option>
                    {Array.from({ length: 10 }, (_, i) => (i + 1) / 2).map((value) => (
                      <option key={value} value={value}>{value.toLocaleString("tr-TR")} / 5</option>
                    ))}
                  </select>
                </label>
              ))}
              <button type="button" className="py-1.5 text-sm text-muted underline hover:text-lborange" onClick={() => onRemove(film.key)}>
                Kaydı kaldır
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
