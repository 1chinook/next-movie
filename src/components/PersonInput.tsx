"use client";

export interface PersonInputState {
  label: string;
  mode: "export" | "username";
  files: File[];
  username: string;
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
  const ring = accent === "orange" ? "border-lborange" : "border-lbblue";
  const text = accent === "orange" ? "text-lborange" : "text-lbblue";
  const bg = accent === "orange" ? "bg-lborange" : "bg-lbblue";

  return (
    <div className={`card border-t-4 ${ring} flex flex-col gap-4`}>
      <input
        className={`bg-transparent text-xl font-semibold outline-none ${text} placeholder:text-muted`}
        value={value.label}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, label: e.target.value })}
        placeholder="İsim"
        aria-label="Kişi adı"
      />

      <div className="flex rounded-lg bg-panel-2 p-1 text-sm">
        {(
          [
            ["export", "Export dosyası"],
            ["username", "Kullanıcı adı"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, mode })}
            className={`flex-1 rounded-md px-3 py-1.5 transition ${value.mode === mode ? `${bg} font-semibold text-black` : "text-muted hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {value.mode === "export" ? (
        <div className="flex flex-col gap-2">
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line px-4 py-6 text-center text-sm transition hover:border-muted ${disabled ? "pointer-events-none opacity-60" : ""}`}
          >
            <span className="text-2xl">📦</span>
            {value.files.length ? (
              <span className="font-medium">{value.files.map((f) => f.name).join(", ")}</span>
            ) : (
              <>
                <span className="font-medium">Letterboxd export ZIP&apos;ini seç</span>
                <span className="text-xs text-muted">veya watched / ratings / watchlist CSV dosyaları</span>
              </>
            )}
            <input
              type="file"
              multiple
              accept=".zip,.csv"
              className="hidden"
              onChange={(e) => onChange({ ...value, files: [...(e.target.files ?? [])] })}
            />
          </label>
          <p className="text-xs text-muted">
            Letterboxd → Settings → Data → <b>Export your data</b>. En doğru sonuç bunla alınır (puanlar + beğeniler).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center rounded-lg border border-line bg-panel-2 px-3">
            <span className="text-muted">letterboxd.com/</span>
            <input
              className="flex-1 bg-transparent py-2 outline-none"
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
