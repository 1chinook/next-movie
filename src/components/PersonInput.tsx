"use client";

import type { UserData } from "@/lib/types";

export interface PersonInputState {
  label: string;
  mode: "export" | "username";
  files: File[];
  username: string;
  savedData?: UserData;
}

export const emptyPerson = (label: string): PersonInputState => ({ label, mode: "export", files: [], username: "" });

export function PersonInput({
  value,
  onChange,
  accent,
  disabled,
}: {
  value: PersonInputState;
  onChange: (v: PersonInputState) => void;
  accent: "orange" | "blue";
  disabled?: boolean;
}) {
  const ring = accent === "orange" ? "border-t-lborange/75" : "border-t-lbblue/75";
  const text = accent === "orange" ? "text-lborange" : "text-lbblue";
  const bg = accent === "orange" ? "bg-lborange" : "bg-lbblue";

  return (
    <div className={`card border-t-2 ${ring} flex min-w-0 flex-col gap-4`}>
      <label className="grid gap-1 text-xs font-medium text-muted">
        Profil adı
        <input
          className={`w-full rounded-lg border border-line bg-background px-3 py-2 text-base font-semibold ${text} placeholder:text-muted`}
          value={value.label}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
          placeholder="İsim"
        />
      </label>

      <div role="group" aria-label="Letterboxd veri kaynağı" className="flex gap-1 rounded-lg bg-background p-1 text-sm">
        {(
          [
            ["export", "Export dosyası"],
            ["username", "Kullanıcı adı"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={value.mode === mode}
            disabled={disabled}
            onClick={() => onChange({ ...value, mode })}
            className={`flex-1 rounded-md px-2 py-2 font-medium ${value.mode === mode ? `${bg} font-semibold text-black` : "text-muted hover:bg-panel-2 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {value.mode === "export" ? (
        <div className="flex flex-col gap-2">
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-panel-2/55 px-4 py-5 text-center text-sm hover:border-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-lbgreen ${disabled ? "pointer-events-none opacity-60" : ""}`}
          >
            {value.files.length ? (
              <span className="font-medium">{value.files.map((f) => f.name).join(", ")}</span>
            ) : value.savedData ? (
              <div className="flex flex-col items-center gap-1">
                <span className="font-semibold text-lbgreen">✓ Kayıtlı veri hazır</span>
                <span className="text-xs text-muted">
                  {value.savedData.watched.length} izlenen · {value.savedData.watchlist.length} watchlist
                </span>
                <span className="text-[11px] text-muted">(Değiştirmek için yeni ZIP seçebilirsin)</span>
              </div>
            ) : (
              <>
                <span className="font-medium">Letterboxd export ZIP&apos;ini seç</span>
                <span className="text-xs text-muted">veya watched / ratings / watchlist CSV dosyaları</span>
              </>
            )}
            <input
              type="file"
              multiple
              disabled={disabled}
              accept=".zip,.csv"
              className="sr-only"
              onChange={(e) => onChange({ ...value, files: [...(e.target.files ?? [])] })}
            />
          </label>
          {value.savedData && !value.files.length && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...value, savedData: undefined })}
              className="self-end text-xs text-muted underline hover:text-lborange"
            >
              Kayıtlı veriyi temizle
            </button>
          )}
          <p className="text-xs text-muted">
            Letterboxd → Settings → Data → <b>Export your data</b>. En doğru sonuç bunla alınır (puanlar + beğeniler).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex min-w-0 items-center rounded-lg border border-line bg-panel-2 px-3">
            <span className="text-muted">letterboxd.com/</span>
            <input
              className="min-w-0 flex-1 bg-transparent py-2"
              aria-label="Letterboxd kullanıcı adı"
              placeholder="kullaniciadi"
              disabled={disabled}
              value={value.username}
              onChange={(e) => onChange({ ...value, username: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted">Herkese açık profil gerekir. Letterboxd bazen otomatik istekleri engelleyebilir; o durumda export&apos;u kullan.</p>
        </div>
      )}
    </div>
  );
}
