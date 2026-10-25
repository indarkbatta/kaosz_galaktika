import {DiscardChangesDialog} from './components/DecisionDialog';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { supabase } from "./lib/supabase";
import { notify } from "./lib/toast";
import {EditorFrame,EditorTabs,EditorRoster,EditorHeader,EditorFooter} from "./components/EditorTemplate";
import { EditorNavigation, type EditorSection } from "./components/EditorNavigation";
import { crewPositionName } from "./Cantina";
import {
  CREW_ROLES,
  CREW_RARITIES,
  crewAssetUrl,
  crewBonusKeys,
  crewBonusName,
} from "./lib/crewPresentation";
import { itemRarity } from "./lib/itemPresentation";
import "./crew-editor.css";
type Translation = { name: string; description: string };
export type CrewDraft = {
  id: string;
  slug: string;
  kind: "named" | "generated";
  name_hu: string;
  name_en: string;
  species_id: string | null;
  class_id: string | null;
  crew_class_id?: string | null;
  portrait_set_id: string | null;
  image_paths: string[];
  portrait_path: string | null;
  specialty: string;
  aptitude: number;
  rarity: string;
  weight: number;
  max_per_character: number;
  source: string;
  is_published: boolean;
  revision: number;
  translations: Record<string, Translation>;
  hull_bonus: number;
  shield_bonus: number;
  damage_bonus: number;
  speed_bonus: number;
};
type Option = {
  id: string;
  slug: string;
  image_path: string | null;
  translations: { locale: string; name: string }[];
};
export type CrewCatalog = {
  sets: CrewDraft[];
  templates: CrewDraft[];
  species: Option[];
  classes: Option[];
  crew_classes?: {id:string;name_hu:string;name_en:string}[];
  locales: { code: string; native_name: string }[];
};
type Mode = "named" | "generated" | "set";
const blank = (kind: Mode): CrewDraft => ({
  id: "",
  slug: "",
  kind: kind === "generated" ? "generated" : "named",
  name_hu: "",
  name_en: "",
  species_id: null,
  class_id: null,
  portrait_set_id: null,
  image_paths: [],
  portrait_path: null,
  specialty: "pilot",
  aptitude: 2,
  rarity: "common",
  weight: 10,
  max_per_character: kind === "named" ? 1 : 0,
  source: "cantina",
  is_published: false,
  revision: 0,
  translations: {
    hu: { name: "", description: "" },
    en: { name: "", description: "" },
  },
  hull_bonus: 0,
  shield_bonus: 0,
  damage_bonus: 0,
  speed_bonus: 0,
});
export default function CrewEditor({
  locale,
  onBack,
  onSectionSelect,
  initialData,
}: {
  locale: string;
  onBack: () => void;
  onSectionSelect?: (section: EditorSection) => void;
  initialData?: CrewCatalog;
}) {
  const en = locale === "en",
    tr = (hu: string, eng: string) => (en ? eng : hu);
  const [catalog, setCatalog] = useState<CrewCatalog>(
      initialData || {
        sets: [],
        templates: [],
        species: [],
        classes: [],
        locales: [],
      },
    ),
    [loading, setLoading] = useState(!initialData),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("named"),
    [tab, setTab] = useState("general"),
    [draft, setDraft] = useState<CrewDraft>(blank("named")),
    [dirty, setDirty] = useState(false),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [language, setLanguage] = useState(locale),
    [portraitPage, setPortraitPage] = useState(0),
    [discard, setDiscard] = useState(false),
    [imageText, setImageText] = useState("");
  const pending = useRef<null | (() => void)>(null),
    saving = useRef(false),
    generation = useRef(0);
  const label = (r: CrewDraft, m = mode) =>
    m === "set"
      ? en
        ? r.name_en
        : r.name_hu
      : r.translations?.[locale]?.name || r.translations?.hu?.name || r.slug;
  const optionLabel = (x: Option) =>
    x.translations?.find((t) => t.locale === locale)?.name || x.slug;
  const choose = (r: CrewDraft, m = mode) => {
    setDraft({ ...blank(m), ...structuredClone(r) });
    setDirty(false);
    setError("");
    setPortraitPage(0);
    setImageText((r.image_paths || []).join("\n"));
  };
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const r = await supabase.rpc("get_crew_editor_catalog");
      if (ticket !== generation.current) return;
      if (r.error) throw new Error(r.error.message);
      setCatalog(r.data as CrewCatalog);
      return r.data as CrewCatalog;
    } catch (e) {
      if (ticket === generation.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (initialData) {
      const first = initialData.templates.find((x) => x.kind === "named");
      if (first) choose(first, "named");
      return;
    }
    void load().then((c) => {
      const first = c?.templates.find((x) => x.kind === "named");
      if (first) choose(first, "named");
    });
    return () => {
      generation.current++;
    };
  }, [load, initialData]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function navigate(action: () => void) {
    if (busy) return;
    if (dirty) {
      pending.current = action;
      setDiscard(true);
    } else action();
  }
  const patch = (value: Partial<CrewDraft>) => {
    setDraft((d) => ({ ...d, ...value }));
    setDirty(true);
  };
  const setImages = (image_paths: string[]) => {
    patch({ image_paths });
    setImageText(image_paths.join("\n"));
  };
  const translate = (value: Partial<Translation>) =>
    patch({
      translations: {
        ...draft.translations,
        [language]: {
          ...(draft.translations[language] || { name: "", description: "" }),
          ...value,
        },
      },
    });
  const rows = (
    mode === "set"
      ? catalog.sets
      : catalog.templates.filter((x) => x.kind === mode)
  ).filter((x) =>
    (label(x) + " " + x.slug).toLowerCase().includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 5)),
    safePage = Math.min(page, pages - 1);
  const activeSet = catalog.sets.find((x) => x.id === draft.portrait_set_id),
    species = catalog.species.find((x) => x.id === draft.species_id);
  const matchingSets = catalog.sets.filter(
    (x) =>
      (!x.species_id || x.species_id === draft.species_id) &&
      (!x.class_id || x.class_id === draft.class_id),
  );
  const sourceImages = Array.from(
    new Map(
      [
        ...catalog.species,
        ...catalog.sets.flatMap((s) =>
          (s.image_paths || []).map((image_path, i) => ({
            id: s.id + "-" + i,
            slug: label(s, "set"),
            image_path,
            translations: [],
          })),
        ),
      ].map((x) => [x.image_path, x]),
    ).values(),
  ).filter((x) => x.image_path);
  const pictures =
    mode === "set"
      ? draft.image_paths
      : activeSet?.image_paths ||
        matchingSets.sort(
          (a, b) =>
            Number(!!b.species_id) +
            Number(!!b.class_id) -
            Number(!!a.species_id) -
            Number(!!a.class_id),
        )[0]?.image_paths ||
        ([species?.image_path].filter(Boolean) as string[]);
  const pp = Math.min(
      portraitPage,
      Math.max(0, Math.ceil(pictures.length / 6) - 1),
    ),
    portrait = draft.portrait_path || pictures[0];
  const dictionary = draft.translations[language] || {
    name: "",
    description: "",
  };
  const errors: Record<string, string> = {
    "Catalog changed; reload before saving": tr(
      "Más szerkesztő módosította. Újratöltés szükséges.",
      "Another editor changed this record. Reload before saving.",
    ),
    "Editor permission required": tr(
      "Szerkesztői jogosultság szükséges.",
      "Editor permission required.",
    ),
    "Hungarian and English crew names required": tr(
      "A magyar és angol név kötelező.",
      "Hungarian and English names are required.",
    ),
    "Portrait set requires 1–24 images": tr(
      "A portrékészlet 1–24 képet tartalmazhat.",
      "A portrait set requires 1–24 images.",
    ),
    "Invalid crew portrait path": tr(
      "Érvényes hatarvilag/ képútvonal szükséges.",
      "Use a valid hatarvilag/ image path.",
    ),
    "Named crew requires species and class": tr(
      "Az egyedi karakterhez faj és kaszt szükséges.",
      "Named crew requires a species and class.",
    ),
    "Portrait set incompatible with species or class": tr(
      "A portrékészlet faja vagy kasztja nem egyezik.",
      "Portrait set species or class does not match.",
    ),
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving.current || loading || initialData) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await supabase.rpc("save_crew_catalog", {
        p_kind: mode === "set" ? "set" : "template",
        p_id: draft.id || null,
        p_record: draft,
        p_expected_revision: draft.id ? draft.revision : null,
      });
      if (r.error) throw new Error(errors[r.error.message] || r.error.message);
      const c = await load();
      const row = (mode === "set" ? c?.sets : c?.templates)?.find(
        (x) => x.id === r.data.id,
      );
      if (row) choose(row);
      else {
        setDraft((d) => ({ ...d, id: r.data.id, revision: r.data.revision }));
        setDirty(false);
      }
      notify(
        tr("Legénységi katalógus mentve.", "Crew catalog saved."),
        "success",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const switchMode = (m: Mode) =>
    navigate(() => {
      setMode(m);
      setPage(0);
      setSearch("");
      setTab("general");
      choose(
        (m === "set"
          ? catalog.sets
          : catalog.templates.filter((x) => x.kind === m))[0] || blank(m),
        m,
      );
    });
  const optionSelect = (
    key: "species_id" | "class_id",
    title: string,
    values: Option[],
  ) => (
    <label>
      {title}
      <select
        value={draft[key] || ""}
        onChange={(e) =>
          patch({
            [key]: e.target.value || null,
            portrait_set_id: null,
            portrait_path: null,
          })
        }
      >
        <option value="">{tr("Bármelyik", "Any")}</option>
        {values.map((x) => (
          <option key={x.id} value={x.id}>
            {optionLabel(x)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <EditorFrame>
      <EditorNavigation locale={locale} active="crew" onBack={() => navigate(onBack)}
       onSelect={section => navigate(() => onSectionSelect?.(section))}/>
      <EditorRoster className="ce-roster">
        <header className="ed-roster-top">
          <strong>
            {tr("Legénység", "Crew")} · {rows.length}
          </strong>
          <button
            disabled={busy || loading}
            onClick={() =>
              navigate(() => {
                choose(blank(mode));
                setTab("general");
              })
            }
          >
            ＋ {tr("Új", "New")}
          </button>
        </header>
        <EditorTabs variant="catalog" label={tr("Katalógustípus","Catalog type")}
          selected={mode} onSelect={id=>{if(!busy)switchMode(id as Mode);}}
          items={[
            {id:"named",name:tr("Egyedi","Named")},
            {id:"generated",name:tr("Sablonok","Templates")},
            {id:"set",name:tr("Portrék","Portraits")}
          ]}/>
        <input
          className="ed-roster-search"
          aria-label={tr("Keresés", "Search")}
          placeholder={tr("Keresés…", "Search…")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <div className="ed-roster-list ce-list">
          {rows.slice(safePage * 5, safePage * 5 + 5).map((r) => {
            const path =
              r.portrait_path ||
              (mode === "set"
                ? r.image_paths?.[0]
                : catalog.sets.find((s) => s.id === r.portrait_set_id)
                    ?.image_paths?.[0]) ||
              catalog.species.find((s) => s.id === r.species_id)?.image_path;
            return (
              <button
                key={r.id}
                disabled={busy}
                className={"ed-record " + (draft.id === r.id ? "selected" : "")}
                onClick={() =>
                  navigate(() => {
                    choose(r);
                    setTab("general");
                  })
                }
              >
                <span className={"ed-thumbnail " + r.rarity}>
                  {crewAssetUrl(path) && (
                    <img src={crewAssetUrl(path)} alt="" />
                  )}
                </span>
                <span className="ed-record-name">
                  <strong>{label(r)}</strong>
                  <small>
                    {mode === "set"
                      ? r.image_paths.length + " " + tr("portré", "portraits")
                      : itemRarity(r.rarity, locale)}{" "}
                    ·{" "}
                    {r.is_published
                      ? tr("Publikált", "Published")
                      : tr("Piszkozat", "Draft")}
                  </small>
                </span>
              </button>
            );
          })}
          {!rows.length && (
            <p>
              {loading
                ? tr("Betöltés…", "Loading…")
                : tr("Nincs találat.", "No records.")}
            </p>
          )}
        </div>
        <div className="ed-pager">
          <button disabled={!safePage} onClick={() => setPage(safePage - 1)}>
            ‹
          </button>
          <span>
            {safePage + 1} / {pages}
          </span>
          <button
            disabled={safePage >= pages - 1}
            onClick={() => setPage(safePage + 1)}
          >
            ›
          </button>
        </div>
        <button
          className="ed-roster-action"
          disabled={!draft.id || busy}
          onClick={() =>
            navigate(() => {
              setDraft({
                ...structuredClone(draft),
                id: "",
                slug: draft.slug + "_copy",
                revision: 0,
                is_published: false,
              });
              setDirty(true);
            })
          }
        >
          {tr("MÁSOLAT KÉSZÍTÉSE", "DUPLICATE")}
        </button>
      </EditorRoster>
      <section className="ed-editor ce-editor">
        <EditorHeader>
          <strong>{draft.id ? label(draft) : tr("Új bejegyzés", "New record")}</strong>
          <span>{tr("Legénység", "Crew")}</span>
        </EditorHeader>
        <EditorTabs
          label={tr("Legénységszerkesztő fülek", "Crew editor tabs")}
          selected={tab}
          onSelect={setTab}
          items={[
            { id: "general", name: tr("Alapadatok", "General") },
            { id: "portraits", name: tr("Portrék", "Portraits") },
            ...(mode === "set"
              ? []
              : [
                  { id: "bonuses", name: tr("Képességek", "Abilities") },
                  { id: "dictionary", name: tr("Szótár", "Translations") },
                ]),
          ]}
        />
        {error && (
          <div className="ed-feedback ed-error ce-error" role="alert">
            {error}
            <button
              disabled={busy}
              onClick={() =>
                navigate(
                  () =>
                    void load().then((c) => {
                      const x = (mode === "set" ? c?.sets : c?.templates)?.find(
                        (x) => x.id === draft.id,
                      );
                      if (x) choose(x);
                    }),
                )
              }
            >
              {tr("Újratöltés", "Reload")}
            </button>
          </div>
        )}
        <form id="crew-editor-form" className="ed-form ce-form" onSubmit={save}>
          <fieldset disabled={busy || loading} className="ed-form-fields ce-fields">
            <div className="ce-inputs">
              {tab === "general" && (
                <>
                  <h3>{tr("ALAPADATOK", "GENERAL")}</h3>
                  <label>
                    {tr("Azonosító", "Slug")}
                    <input
                      required
                      pattern="[a-z][a-z0-9_]{1,79}"
                      maxLength={80}
                      value={draft.slug}
                      onChange={(e) => patch({ slug: e.target.value })}
                    />
                  </label>
                  {mode === "set" ? (
                    <>
                      <label>
                        {tr("Magyar név", "Hungarian name")}
                        <input
                          required
                          maxLength={100}
                          value={draft.name_hu}
                          onChange={(e) => patch({ name_hu: e.target.value })}
                        />
                      </label>
                      <label>
                        {tr("Angol név", "English name")}
                        <input
                          required
                          maxLength={100}
                          value={draft.name_en}
                          onChange={(e) => patch({ name_en: e.target.value })}
                        />
                      </label>
                    </>
                  ) : (
                    <label>
                      {tr("Név", "Name")} ({locale.toUpperCase()})
                      <input
                        required
                        maxLength={100}
                        value={draft.translations[locale]?.name || ""}
                        onChange={(e) =>
                          patch({
                            translations: {
                              ...draft.translations,
                              [locale]: {
                                name: e.target.value,
                                description:
                                  draft.translations[locale]?.description || "",
                              },
                            },
                          })
                        }
                      />
                    </label>
                  )}
                  <div className="ed-two-fields">
                    {optionSelect(
                      "species_id",
                      tr("Faj", "Species"),
                      catalog.species,
                    )}
                    {optionSelect(
                      "class_id",
                      tr("Portré kasztja", "Portrait class"),
                      catalog.classes,
                    )}
                  </div>
                  {mode !== "set" && <label>{tr("Legénységi kaszt", "Crew class")}<select value={draft.crew_class_id||''} onChange={e=>patch({crew_class_id:e.target.value||null})}><option value="">{tr("Szakterület szerinti alapértelmezés", "Default by specialty")}</option>{catalog.crew_classes?.map(c=><option key={c.id} value={c.id}>{en?c.name_en:c.name_hu}</option>)}</select></label>}
                  {mode !== "set" && (
                    <>
                      <div className="ed-two-fields">
                        <label>
                          {tr("Szakterület", "Specialty")}
                          <select
                            value={draft.specialty}
                            onChange={(e) =>
                              patch({ specialty: e.target.value })
                            }
                          >
                            {CREW_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {crewPositionName(r, en)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {tr("Jártasság", "Aptitude")}
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={draft.aptitude}
                            onChange={(e) =>
                              patch({ aptitude: Number(e.target.value) })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        {tr("Ritkaság", "Rarity")}
                        <select
                          value={draft.rarity}
                          onChange={(e) => patch({ rarity: e.target.value })}
                        >
                          {CREW_RARITIES.map((r) => (
                            <option key={r} value={r}>
                              {itemRarity(r, locale)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="ed-tab-help ce-help">
                        {tr(
                          "A faj és kaszt az identitás; a szakterület határozza meg a hajóállást.",
                          "Species and class define identity; specialty determines crew station compatibility.",
                        )}
                      </p>
                    </>
                  )}
                  <label className="ed-checkbox ce-check">
                    <input
                      type="checkbox"
                      checked={draft.is_published}
                      onChange={(e) =>
                        patch({ is_published: e.target.checked })
                      }
                    />
                    {tr("Publikált", "Published")}
                  </label>
                </>
              )}
              {tab === "portraits" && (
                <>
                  <h3>{tr("PORTRÉKÉSZLET", "PORTRAIT SET")}</h3>
                  {mode === "set" ? (
                    <>
                      <label>
                        {tr(
                          "Képútvonalak · soronként egy · maximum 24",
                          "Image paths · one per line · maximum 24",
                        )}
                        <textarea
                          className="ce-paths"
                          value={imageText}
                          placeholder="hatarvilag/crew/portraits/… .webp"
                          onChange={(e) => {
                            setImageText(e.target.value);
                            patch({
                              image_paths: e.target.value
                                .split("\n")
                                .map((x) => x.trim())
                                .filter(Boolean),
                            });
                          }}
                        />
                      </label>
                      <p className="ed-tab-help ce-help">
                        {tr(
                          "A képek a meglévő R2 assettárból választhatók vagy útvonallal adhatók hozzá.",
                          "Choose existing R2 catalog artwork or add image paths.",
                        )}
                      </p>
                      <div className="ce-source-grid">
                        {sourceImages.map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            title={optionLabel(x)}
                            disabled={
                              draft.image_paths.length >= 24 ||
                              draft.image_paths.includes(x.image_path!)
                            }
                            onClick={() =>
                              setImages([...draft.image_paths, x.image_path!])
                            }
                          >
                            <img
                              src={crewAssetUrl(x.image_path)}
                              alt={optionLabel(x)}
                            />
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <label>
                        {tr("Portrékészlet", "Portrait set")}
                        <select
                          value={draft.portrait_set_id || ""}
                          onChange={(e) => {
                            patch({
                              portrait_set_id: e.target.value || null,
                              portrait_path: null,
                            });
                            setPortraitPage(0);
                          }}
                        >
                          <option value="">
                            {tr(
                              "Automatikus faj + kaszt alapján",
                              "Automatic by species + class",
                            )}
                          </option>
                          {matchingSets.map((s) => (
                            <option key={s.id} value={s.id}>
                              {label(s, "set")}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {tr(
                          "Egyedi portré R2 útvonala",
                          "Custom portrait R2 path",
                        )}
                        <input
                          maxLength={300}
                          value={draft.portrait_path || ""}
                          onChange={(e) =>
                            patch({ portrait_path: e.target.value || null })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="ed-secondary-button"
                        onClick={() => patch({ portrait_path: null })}
                      >
                        {tr("Vissza a készlethez", "Use portrait set")}
                      </button>
                      <p className="ed-tab-help ce-help">
                        {tr(
                          "Faj + kaszt → faj → alapértelmezett portré. A toborzott tag portréja rögzül.",
                          "Species + class → species → default portrait. Recruited portraits are fixed.",
                        )}
                      </p>
                    </>
                  )}
                </>
              )}
              {tab === "bonuses" && (
                <>
                  <h3>{tr("AKTÍV ÁLLÁSBÓNUSZOK", "ACTIVE STATION BONUSES")}</h3>
                  <div className="ed-two-fields">
                    {crewBonusKeys.map((k) => (
                      <label key={k}>
                        {crewBonusName(k, en)} +
                        <input
                          type="number"
                          min={0}
                          max={k === "speed_bonus" ? 20 : 100}
                          value={draft[k]}
                          onChange={(e) =>
                            patch({ [k]: Number(e.target.value) })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <p className="ed-tab-help ce-help">
                    {tr(
                      "A bónusz a hajóállásba helyezett tagnál érvényesül.",
                      "Bonuses apply when the crew member occupies a ship station.",
                    )}
                  </p>
                  <h3>{tr("ELÉRHETŐSÉG", "AVAILABILITY")}</h3>
                  <label>
                    {tr("Forrás", "Source")}
                    <select
                      value={draft.source}
                      onChange={(e) => patch({ source: e.target.value })}
                    >
                      <option value="cantina">{tr("Kantin", "Cantina")}</option>
                      <option value="event">
                        {tr("Eseményhez fenntartva", "Reserved for events")}
                      </option>
                    </select>
                  </label>
                  <div className="ed-two-fields">
                    <label>
                      {tr("Megjelenési súly", "Appearance weight")}
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        value={draft.weight}
                        onChange={(e) =>
                          patch({ weight: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      {tr(
                        "Maximum / kapitány · 0: korlátlan",
                        "Maximum / captain · 0: unlimited",
                      )}
                      <input
                        type="number"
                        min={0}
                        max={24}
                        value={draft.max_per_character}
                        onChange={(e) =>
                          patch({ max_per_character: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <p className="ed-tab-help ce-help">
                    {tr(
                      "A ritkaság és a megjelenési súly külön beállítás. Eseményforrás nem kerül a kantin kínálatába.",
                      "Rarity and appearance weight are independent. Event sources do not enter the cantina pool.",
                    )}
                  </p>
                </>
              )}
              {tab === "dictionary" && (
                <>
                  <h3>{tr("FORDÍTÁSOK", "TRANSLATIONS")}</h3>
                  <label>
                    {tr("Nyelv", "Language")}
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      {catalog.locales.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.native_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tr("Név", "Name")}
                    <input
                      maxLength={100}
                      value={dictionary.name}
                      onChange={(e) => translate({ name: e.target.value })}
                    />
                  </label>
                  <label>
                    {tr("Leírás / történet", "Description / biography")}
                    <textarea
                      maxLength={4000}
                      value={dictionary.description}
                      onChange={(e) =>
                        translate({ description: e.target.value })
                      }
                    />
                  </label>
                  <p className="ed-tab-help ce-help">
                    {tr(
                      "A magyar és angol név kötelező.",
                      "Hungarian and English names are required.",
                    )}
                  </p>
                </>
              )}
            </div>
            <aside className="ce-preview">
              <h3>{tr("PORTRÉ", "PORTRAIT")}</h3>
              <div className={"ce-portrait " + draft.rarity}>
                {crewAssetUrl(portrait) ? (
                  <img
                    src={crewAssetUrl(portrait)}
                    alt={tr(
                      "Legénységi portré előnézete",
                      "Crew portrait preview",
                    )}
                  />
                ) : (
                  <span>
                    {tr("Válassz portrékészletet", "Choose a portrait set")}
                  </span>
                )}
              </div>
              <div className="ce-portrait-grid">
                {pictures.slice(pp * 6, pp * 6 + 6).map((path, i) => (
                  <div key={path + i}>
                    <button
                      type="button"
                      className={draft.portrait_path === path ? "active" : ""}
                      title={tr("Portré kiválasztása", "Select portrait")}
                      onClick={() =>
                        mode === "set"
                          ? setImages([
                              path,
                              ...draft.image_paths.filter((p) => p !== path),
                            ])
                          : patch({ portrait_path: path })
                      }
                    >
                      <img
                        src={crewAssetUrl(path)}
                        alt={tr("Portré", "Portrait") + " " + (pp * 6 + i + 1)}
                      />
                    </button>
                    {mode === "set" && (
                      <button
                        type="button"
                        className="ce-remove"
                        aria-label={tr(
                          "Portré eltávolítása",
                          "Remove portrait",
                        )}
                        onClick={() =>
                          setImages(
                            draft.image_paths.filter(
                              (_, n) => n !== pp * 6 + i,
                            ),
                          )
                        }
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {pictures.length > 6 && (
                <div className="ed-pager">
                  <button
                    type="button"
                    disabled={!pp}
                    onClick={() => setPortraitPage(pp - 1)}
                  >
                    ‹
                  </button>
                  <span>
                    {pp + 1} / {Math.ceil(pictures.length / 6)}
                  </span>
                  <button
                    type="button"
                    disabled={pp >= Math.ceil(pictures.length / 6) - 1}
                    onClick={() => setPortraitPage(pp + 1)}
                  >
                    ›
                  </button>
                </div>
              )}
              <strong>{label(draft) || "—"}</strong>
              {mode !== "set" && (
                <p>
                  {itemRarity(draft.rarity, locale)} ·{" "}
                  {crewPositionName(draft.specialty, en)} · ◆{draft.aptitude}
                </p>
              )}
              <p className="ed-tab-help ce-help">
                {tr(
                  "A már toborzott karakterek megőrzik a portréjukat és értékeiket.",
                  "Already recruited crew retain their portrait and stats.",
                )}
              </p>
            </aside>
          </fieldset>
        </form>
        <EditorFooter>
          <span className={dirty ? "ed-unsaved" : "ed-fine"}>
            {dirty
              ? tr("● Nem mentett módosítások", "● Unsaved changes")
              : tr("Minden módosítás mentve", "All changes saved")}
          </span>
          <button
            type="submit"
            form="crew-editor-form"
            disabled={busy || loading || !dirty || !!initialData}
            className="ed-submit"
          >
            {busy ? "…" : tr("MENTÉS", "SAVE")}
          </button>
        </EditorFooter>
      </section>
      {discard&&<DiscardChangesDialog locale={locale} onCancel={()=>{setDiscard(false);pending.current=null;}} onDiscard={()=>{setDiscard(false);setDirty(false);const action=pending.current;pending.current=null;action?.();}}/>}
    </EditorFrame>
  );
}
