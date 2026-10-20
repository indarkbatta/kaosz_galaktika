import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { supabase } from "./lib/supabase";
import { notify } from "./lib/toast";
import { ShipArt } from "./components/GameArt";
import { ShipSystemIcon } from "./components/ShipSystemIcon";
import { crewPositionName } from "./Cantina";
import {
  crewAssetUrl,
  crewBonusKeys,
  crewBonusName,
  type CrewIdentity,
} from "./lib/crewPresentation";
import { itemRarity } from "./lib/itemPresentation";
import "./ship-loadout.css";

type ModuleKind =
  | "engine"
  | "reactor"
  | "shield"
  | "weapon"
  | "hull"
  | "sensor"
  | "utility";
type Module = {
  item_id: string;
  slug: string;
  image_path: string | null;
  rarity?: string;
  module_kind: ModuleKind;
  size: number;
  quantity: number;
  is_published: boolean;
  power_draw: number;
  power_output: number;
  hull_bonus: number;
  shield_bonus: number;
  damage_bonus: number;
  speed_bonus: number;
  cargo_bonus: number;
  translations: { locale: string; name: string; description: string }[];
};
type Slot = {
  slot_key: string;
  kind: "module" | "crew";
  module_kind: ModuleKind | null;
  crew_role: string | null;
  size: number;
  min_aptitude: number;
  required: boolean;
  name_hu: string;
  name_en: string;
  item_id: string | null;
  crew_id: string | null;
};
type Stats = {
  hull: number;
  shield: number;
  damage: number;
  speed: number;
  cargo: number;
  power_draw: number;
  power_output: number;
  missing_required: number;
  ready: boolean;
};
export type ShipLoadoutSnapshot = {
  ship_id: string;
  stats: Stats;
  slots: Slot[];
  modules: Module[];
  crew: CrewIdentity[];
};
type Drag =
  | { kind: "cargo"; item: string }
  | { kind: "fitted"; item: string; slot: string }
  | { kind: "crew"; crew: string };
type Selection = { kind: "slot" | "module" | "crew"; id: string };
const DRAG = "application/x-hatarvilag-ship";
export default function ShipLoadout({
  characterId,
  shipSlug,
  shipName,
  shipImage,
  locale,
  onChanged,
  initialData,
}: {
  characterId: string;
  shipSlug: string;
  shipName: string;
  shipImage?: string | null;
  locale: string;
  onChanged: () => Promise<void>;
  initialData?: ShipLoadoutSnapshot;
}) {
  const en = locale === "en",
    tr = (hu: string, eng: string) => (en ? eng : hu);
  const [data, setData] = useState<ShipLoadoutSnapshot | null>(
      initialData || null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null),
    [modulePage, setModulePage] = useState(0),
    [reservePage, setReservePage] = useState(0),
    [slotPage, setSlotPage] = useState(0),
    [drag, setDrag] = useState<Drag | null>(null),
    [dismiss, setDismiss] = useState<CrewIdentity | null>(null);
  const generation = useRef(0),
    mutation = useRef(false),
    activeDrag = useRef<Drag | null>(null);
  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    const r = await supabase.rpc("get_ship_loadout");
    if (ticket !== generation.current) return;
    if (r.error) {
      setError(r.error.message);
      return;
    }
    setError("");
    setData(r.data as ShipLoadoutSnapshot);
  }, [characterId]);
  useEffect(() => {
    if (initialData) return;
    setData(null);
    setSelected(null);
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh, initialData]);
  const name = (m: Module) =>
    m.translations.find((t) => t.locale === locale)?.name ||
    m.translations.find((t) => t.locale === "hu")?.name ||
    m.slug;
  const slotName = (s: Slot) => (en ? s.name_en : s.name_hu);
  const fits = (m: Module, s: Slot) =>
    s.kind === "module" && m.module_kind === s.module_kind && m.size <= s.size;
  const qualifies = (c: CrewIdentity, s: Slot) =>
    s.kind === "crew" &&
    c.specialty === s.crew_role &&
    c.aptitude >= s.min_aptitude;
  const messages: Record<string, string> = {
    "Module incompatible with ship slot": tr(
      "A modul típusa vagy mérete nem megfelelő.",
      "Module type or size is incompatible.",
    ),
    "Module is not in cargo": tr(
      "Ez a modul nincs a raktérben.",
      "Module is not in cargo.",
    ),
    "Crew member is not qualified for this station": tr(
      "A tag képzettsége nem megfelelő ehhez az álláshoz.",
      "Crew member is not qualified for this station.",
    ),
    "Inventory capacity exceeded after equipment change": tr(
      "Nincs elég hely a levett modulnak.",
      "Cargo has no space for the removed module.",
    ),
    "Return crew to reserve before dismissal": tr(
      "Előbb helyezd tartalékba a tagot.",
      "Return the crew member to reserve first.",
    ),
    "Ship cargo capacity exceeded": tr(
      "A hajóraktér megtelne. Előbb szabadíts fel helyet.",
      "Ship cargo would overflow. Free some space first.",
    ),
  };
  async function mutate(
    rpc:
      | "set_ship_module"
      | "assign_ship_crew"
      | "move_ship_module"
      | "dismiss_reserve_crew",
    args: Record<string, string | null>,
  ) {
    if (mutation.current || initialData) return;
    mutation.current = true;
    setBusy(true);
    try {
      const r = await supabase.rpc(rpc, args);
      if (r.error)
        throw new Error(messages[r.error.message] || r.error.message);
      await Promise.all([refresh(), onChanged()]);
      setSelected(null);
      setDismiss(null);
      notify(
        rpc === "dismiss_reserve_crew"
          ? tr("Legénységi tag elbocsátva.", "Crew member dismissed.")
          : tr("Hajó konfigurációja mentve.", "Ship configuration saved."),
        "success",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      mutation.current = false;
      setBusy(false);
      clearDrag();
    }
  }
  function activate(e: KeyboardEvent, action: () => void) {
    if (busy || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    action();
  }
  function clearDrag() {
    activeDrag.current = null;
    setDrag(null);
  }
  function start(e: DragEvent, payload: Drag) {
    if (busy || mutation.current) {
      e.preventDefault();
      return;
    }
    activeDrag.current = payload;
    e.dataTransfer.setData(DRAG, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
    setDrag(payload);
  }
  function readDrag(e: DragEvent): Drag | null {
    // Dragover protects getData in some browsers; keep a synchronous local copy.
    const encoded = e.dataTransfer.getData(DRAG);
    if (!encoded) return activeDrag.current;
    try {
      const value = JSON.parse(encoded);
      if (value?.kind === "crew" && typeof value.crew === "string")
        return { kind: "crew", crew: value.crew };
      if (value?.kind === "cargo" && typeof value.item === "string")
        return { kind: "cargo", item: value.item };
      if (value?.kind === "fitted" && typeof value.item === "string" && typeof value.slot === "string")
        return { kind: "fitted", item: value.item, slot: value.slot };
    } catch {
      // Ignore foreign or malformed payloads.
    }
    return null;
  }
  function compatible(s: Slot, payload: Drag | null = drag) {
    if (!payload || !data) return false;
    return payload.kind === "crew"
      ? data.crew.some((c) => c.id === payload.crew && qualifies(c, s))
      : data.modules.some((m) => m.item_id === payload.item && fits(m, s));
  }
  function canReturn(kind: "module" | "crew", payload: Drag | null = drag) {
    if (!payload || !data || busy) return false;
    return kind === "module"
      ? payload.kind === "fitted" && data.slots.some(
          (s) => s.slot_key === payload.slot && s.item_id === payload.item,
        )
      : payload.kind === "crew" && data.slots.some((s) => s.crew_id === payload.crew);
  }
  function allowDrop(e: DragEvent, accepted: boolean) {
    if (!accepted || busy || mutation.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function drop(e: DragEvent, s: Slot) {
    const payload = readDrag(e);
    e.preventDefault();
    e.stopPropagation();
    clearDrag();
    if (!payload || !compatible(s, payload) || busy) return;
    if (payload.kind === "crew") {
      if (s.crew_id === payload.crew) return;
      void mutate("assign_ship_crew", {
        p_slot: s.slot_key,
        p_crew: payload.crew,
      });
    } else if (payload.kind === "fitted") {
      if (s.slot_key === payload.slot) return;
      void mutate("move_ship_module", {
        p_from_slot: payload.slot,
        p_to_slot: s.slot_key,
      });
    } else {
      void mutate("set_ship_module", { p_slot: s.slot_key, p_item: payload.item });
    }
  }
  function returnToStock(e: DragEvent, kind: "module" | "crew") {
    const payload = readDrag(e);
    e.preventDefault();
    e.stopPropagation();
    clearDrag();
    if (!data || !payload || !canReturn(kind, payload)) return;
    if (kind === "module" && payload.kind === "fitted")
      void mutate("set_ship_module", { p_slot: payload.slot, p_item: null });
    if (kind === "crew" && payload.kind === "crew") {
      const s = data.slots.find((s) => s.crew_id === payload.crew);
      if (s)
        void mutate("assign_ship_crew", { p_slot: s.slot_key, p_crew: null });
    }
  }
  function picture(
    m: Module | undefined,
    c: CrewIdentity | undefined,
    s?: Slot,
  ) {
    const src = crewAssetUrl(c?.portrait_path || m?.image_path);
    return src ? (
      <img src={src} alt="" draggable={false} />
    ) : (
      <ShipSystemIcon kind={s?.module_kind || m?.module_kind || "crew"} />
    );
  }
  function chooseSlot(s: Slot) {
    if (selected?.kind === "module") {
      const m = data?.modules.find((m) => m.item_id === selected.id);
      if (m && fits(m, s)) {
        void mutate("set_ship_module", {
          p_slot: s.slot_key,
          p_item: m.item_id,
        });
        return;
      }
    }
    if (selected?.kind === "crew") {
      const c = data?.crew.find((c) => c.id === selected.id);
      if (c && qualifies(c, s)) {
        void mutate("assign_ship_crew", { p_slot: s.slot_key, p_crew: c.id });
        return;
      }
    }
    setSelected({ kind: "slot", id: s.slot_key });
  }
  function chooseStock(kind: "module" | "crew", id: string) {
    const s =
      selected?.kind === "slot"
        ? data?.slots.find((s) => s.slot_key === selected.id)
        : null;
    if (s) {
      if (kind === "module") {
        const m = data?.modules.find((m) => m.item_id === id);
        if (m && fits(m, s)) {
          void mutate("set_ship_module", { p_slot: s.slot_key, p_item: id });
          return;
        }
      } else {
        const c = data?.crew.find((c) => c.id === id);
        if (c && qualifies(c, s)) {
          void mutate("assign_ship_crew", { p_slot: s.slot_key, p_crew: id });
          return;
        }
      }
    }
    setSelected({ kind, id });
  }
  function pager(
    page: number,
    count: number,
    change: (p: number) => void,
    label: string,
  ) {
    return (
      <nav className="sh-pager" aria-label={label}>
        <button
          disabled={!page || busy}
          onClick={() => change(page - 1)}
          aria-label={tr("Előző", "Previous")}
        >
          ‹
        </button>
        <span>
          {page + 1} / {Math.max(1, count)}
        </span>
        <button
          disabled={page >= count - 1 || busy}
          onClick={() => change(page + 1)}
          aria-label={tr("Következő", "Next")}
        >
          ›
        </button>
      </nav>
    );
  }
  if (!data)
    return (
      <div className="sh-loading" role="status">
        {error || tr("Hajórendszerek betöltése…", "Loading ship systems…")}
        {error && (
          <button onClick={() => void refresh()}>
            {tr("Újrapróbálás", "Retry")}
          </button>
        )}
      </div>
    );
  const status = data.stats,
    moduleSlots = data.slots.filter((s) => s.kind === "module"),
    crewSlots = data.slots.filter((s) => s.kind === "crew");
  const sp = Math.min(
      slotPage,
      Math.max(0, Math.ceil(moduleSlots.length / 8) - 1),
    ),
    stock = data.modules.filter((m) => m.quantity > 0),
    mp = Math.min(modulePage, Math.max(0, Math.ceil(stock.length / 10) - 1));
  const reserve = data.crew.filter(
      (c) => !data.slots.some((s) => s.crew_id === c.id),
    ),
    rp = Math.min(reservePage, Math.max(0, Math.ceil(reserve.length / 10) - 1));
  const selSlot =
    selected?.kind === "slot"
      ? data.slots.find((s) => s.slot_key === selected.id)
      : undefined;
  const selModule = data.modules.find(
    (m) =>
      m.item_id ===
      (selected?.kind === "module" ? selected.id : selSlot?.item_id),
  );
  const selCrew = data.crew.find(
    (c) =>
      c.id === (selected?.kind === "crew" ? selected.id : selSlot?.crew_id),
  );
  const available = data.slots.filter((s) =>
    selModule ? fits(selModule, s) : selCrew ? qualifies(selCrew, s) : false,
  );
  const renderSlot = (s: Slot) => {
    const m = data.modules.find((m) => m.item_id === s.item_id),
      c = data.crew.find((c) => c.id === s.crew_id),
      valid = s.kind === "module" ? !!m : !!c && qualifies(c, s);
    return (
      <div className="sh-station" key={s.slot_key}>
        <span title={slotName(s)}>
          {slotName(s)}
          {s.required ? " *" : ""}
        </span>
        <div
          role="button"
          tabIndex={busy ? -1 : 0}
          className={
            "sh-cell " +
            (c?.rarity || m?.rarity || "") +
            (selSlot?.slot_key === s.slot_key ? " selected" : "") +
            (s.required && !valid ? " missing" : "") +
            (compatible(s) ? " compatible" : "")
          }
          aria-disabled={busy}
          title={`${slotName(s)} · ${m ? name(m) : c?.name || tr("Üres", "Empty")}`}
          aria-label={`${slotName(s)}: ${m ? name(m) : c?.name || tr("Üres", "Empty")}`}
          draggable={!!(m || c) && !busy}
          onDragStart={(e) =>
            m
              ? start(e, { kind: "fitted", item: m.item_id, slot: s.slot_key })
              : c && start(e, { kind: "crew", crew: c.id })
          }
          onDragEnd={clearDrag}
          onDragOver={(e) => allowDrop(e, compatible(s, activeDrag.current))}
          onDrop={(e) => drop(e, s)}
          onClick={() => !busy && chooseSlot(s)}
          onKeyDown={(e) => activate(e, () => chooseSlot(s))}
        >
          {picture(m, c, s)}
          <small>
            {s.kind === "module"
              ? ["S", "M", "L"][s.size - 1]
              : c
                ? "◆" + c.aptitude
                : "≥" + s.min_aptitude}
          </small>
        </div>
        {s.kind === "crew" && (
          <em title={c?.name}>{c?.name || tr("Üres állás", "Vacant")}</em>
        )}
      </div>
    );
  };
  return (
    <section
      className="sh-root"
      aria-label={tr("Hajó felszerelése", "Ship equipment")}
      aria-busy={busy}
    >
      <header className="sh-header">
        <strong>
          {tr("HAJÓ FELSZERELÉSE", "SHIP EQUIPMENT")} <span>{shipName}</span>
        </strong>
        <b className={status.ready ? "sh-ready" : "sh-warning"}>
          {status.ready
            ? tr("INDULÁSRA KÉSZ", "READY TO DEPART")
            : tr("NEM ÜZEMKÉPES", "NOT OPERATIONAL")}
        </b>
      </header>
      <div className="sh-summary">
        {[
          [tr("Burkolat", "Hull"), status.hull],
          [tr("Pajzs", "Shield"), status.shield],
          [tr("Tűzerő", "Firepower"), status.damage],
          [tr("Sebesség", "Speed"), status.speed],
          [tr("Raktér", "Cargo"), status.cargo],
          [
            tr("Energia", "Power"),
            `${status.power_draw} / ${status.power_output}`,
          ],
        ].map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      {error && (
        <p className="sh-error" role="alert">
          {messages[error] || error}
        </p>
      )}
      <div className="sh-workspace">
        <div className="sh-vessel">
          <div className="sh-paperdoll">
            <div className="sh-art">
              <ShipArt slug={shipSlug} path={shipImage} />
            </div>
            <div className="sh-side">
              {moduleSlots.slice(sp * 8, sp * 8 + 4).map(renderSlot)}
            </div>
            <div className="sh-side sh-side-right">
              {moduleSlots.slice(sp * 8 + 4, sp * 8 + 8).map(renderSlot)}
            </div>
          </div>
          {moduleSlots.length > 8 &&
            pager(
              sp,
              Math.ceil(moduleSlots.length / 8),
              setSlotPage,
              tr("Modulhelyek lapozása", "Module slot pages"),
            )}
          <section className="sh-crew-stations">
            <header>
              {tr("LEGÉNYSÉGI ÁLLÁSOK", "CREW STATIONS")}{" "}
              <span>
                {
                  data.slots.filter((s) => s.kind === "crew" && s.crew_id)
                    .length
                }{" "}
                / {crewSlots.length}
              </span>
            </header>
            <div className="sh-station-row">{crewSlots.map(renderSlot)}</div>
          </section>
          <p className={status.ready ? "sh-hint" : "sh-hint sh-warning"}>
            {status.missing_required
              ? tr("Hiányzó kötelező helyek", "Missing required slots") +
                ": " +
                status.missing_required
              : tr(
                  "Kötelező helyek feltöltve.",
                  "Required slots occupied.",
                )}{" "}
            · {tr("Reaktortartalék", "Reactor reserve")}:{" "}
            {status.power_output - status.power_draw}
          </p>
        </div>
        <aside className="sh-stock">
          <section
            className={"sh-stock-panel" + (canReturn("module") ? " compatible" : "")}
            onDragOverCapture={(e) => allowDrop(e, canReturn("module", activeDrag.current))}
            onDrop={(e) => returnToStock(e, "module")}
          >
            <header>
              {tr("HAJÓMODULOK A RAKTÉRBEN", "CARGO SHIP MODULES")}{" "}
              <span>{stock.length}</span>
            </header>
            <div className="sh-grid">
              {Array.from({ length: 10 }, (_, i) => {
                const m = stock[mp * 10 + i];
                return (
                  <div
                    role="button"
                    key={i}
                    aria-disabled={busy}
                    tabIndex={m && !busy ? 0 : -1}
                    className={
                      "sh-cell " +
                      (m?.rarity || "") +
                      (selected?.kind === "module" && selected.id === m?.item_id
                        ? " selected"
                        : "")
                    }
                    title={m ? name(m) : tr("Üres", "Empty")}
                    aria-label={
                      m
                        ? name(m) + " ×" + m.quantity
                        : tr("Üres modulhely", "Empty module slot")
                    }
                    draggable={!!m && !busy}
                    onDragStart={(e) =>
                      m && start(e, { kind: "cargo", item: m.item_id })
                    }
                    onDragEnd={clearDrag}
                    onClick={() => !busy && m && chooseStock("module", m.item_id)}
                    onKeyDown={(e) => activate(e, () => m && chooseStock("module", m.item_id))}
                  >
                    {m && picture(m, undefined)}
                    {m && <small>×{m.quantity}</small>}
                  </div>
                );
              })}
            </div>
            {pager(
              mp,
              Math.ceil(stock.length / 10),
              setModulePage,
              tr("Raktérmodulok lapozása", "Cargo module pages"),
            )}
          </section>
          <section
            className={"sh-stock-panel" + (canReturn("crew") ? " compatible" : "")}
            onDragOverCapture={(e) => allowDrop(e, canReturn("crew", activeDrag.current))}
            onDrop={(e) => returnToStock(e, "crew")}
          >
            <header>
              {tr("TARTALÉK LEGÉNYSÉG", "RESERVE CREW")}{" "}
              <span>
                {reserve.length} · {tr("Összesen", "Total")}: {data.crew.length}{" "}
                / 24
              </span>
            </header>
            <div className="sh-grid">
              {Array.from({ length: 10 }, (_, i) => {
                const c = reserve[rp * 10 + i];
                return (
                  <div
                    role="button"
                    key={i}
                    aria-disabled={busy}
                    tabIndex={c && !busy ? 0 : -1}
                    className={
                      "sh-cell " +
                      (c?.rarity || "") +
                      (selected?.kind === "crew" && selected.id === c?.id
                        ? " selected"
                        : "")
                    }
                    title={
                      c
                        ? `${c.name} · ${crewPositionName(c.specialty, en)} · ${itemRarity(c.rarity, locale)}`
                        : tr("Üres", "Empty")
                    }
                    aria-label={
                      c ? c.name : tr("Üres legénységi hely", "Empty crew slot")
                    }
                    draggable={!!c && !busy}
                    onDragStart={(e) =>
                      c && start(e, { kind: "crew", crew: c.id })
                    }
                    onDragEnd={clearDrag}
                    onClick={() => !busy && c && chooseStock("crew", c.id)}
                    onKeyDown={(e) => activate(e, () => c && chooseStock("crew", c.id))}
                  >
                    {c && picture(undefined, c)}
                    {c && <small>◆{c.aptitude}</small>}
                  </div>
                );
              })}
            </div>
            {pager(
              rp,
              Math.ceil(reserve.length / 10),
              setReservePage,
              tr("Tartalék legénység lapozása", "Reserve crew pages"),
            )}
          </section>
          <section className="sh-detail">
            <header>
              {tr("KIJELÖLT FELSZERELÉS / LEGÉNYSÉG", "SELECTED MODULE / CREW")}
            </header>
            {selModule || selCrew ? (
              <>
                <div className="sh-selected">
                  <div className={"sh-cell " + (selCrew?.rarity || "")}>
                    {picture(selModule, selCrew)}
                  </div>
                  <div>
                    <strong>
                      {selCrew?.name || (selModule ? name(selModule) : "")}
                    </strong>
                    {selCrew ? (
                      <>
                        <p>
                          {selCrew.species_name?.find(
                            (x) => x.locale === locale,
                          )?.name || selCrew.species_slug}{" "}
                          ·{" "}
                          {selCrew.class_name?.find((x) => x.locale === locale)
                            ?.name || "—"}
                        </p>
                        <p>
                          {itemRarity(selCrew.rarity, locale)} ·{" "}
                          {crewPositionName(selCrew.specialty, en)} · ◆
                          {selCrew.aptitude}
                        </p>
                        <p>
                          {crewBonusKeys
                            .filter((k) => selCrew[k])
                            .map(
                              (k) => `${crewBonusName(k, en)} +${selCrew[k]}`,
                            )
                            .join(" · ")}
                        </p>
                      </>
                    ) : (
                      selModule && (
                        <p>
                          {["S", "M", "L"][selModule.size - 1]} ·{" "}
                          {tr("Energia", "Power")}: {selModule.power_draw} ·{" "}
                          {crewBonusKeys
                            .filter((k) => selModule[k])
                            .map(
                              (k) => `${crewBonusName(k, en)} +${selModule[k]}`,
                            )
                            .join(" · ")}
                          {selModule.cargo_bonus
                            ? " · " +
                              tr("Raktér", "Cargo") +
                              " +" +
                              selModule.cargo_bonus
                            : ""}
                        </p>
                      )
                    )}
                  </div>
                </div>
                <div className="sh-actions">
                  {selSlot ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          selSlot.kind === "module"
                            ? "set_ship_module"
                            : "assign_ship_crew",
                          selSlot.kind === "module"
                            ? { p_slot: selSlot.slot_key, p_item: null }
                            : { p_slot: selSlot.slot_key, p_crew: null },
                        )
                      }
                    >
                      {selCrew
                        ? tr("→ Tartalék", "→ Reserve")
                        : tr("→ Hajóraktér", "→ Cargo")}
                    </button>
                  ) : (
                    available.map((s) => (
                      <button
                        key={s.slot_key}
                        disabled={busy}
                        onClick={() =>
                          selCrew
                            ? void mutate("assign_ship_crew", {
                                p_slot: s.slot_key,
                                p_crew: selCrew.id,
                              })
                            : selModule &&
                              void mutate("set_ship_module", {
                                p_slot: s.slot_key,
                                p_item: selModule.item_id,
                              })
                        }
                      >
                        {slotName(s)} →
                      </button>
                    ))
                  )}
                  {selCrew &&
                    !data.slots.some((s) => s.crew_id === selCrew.id) && (
                      <button
                        className="sh-dismiss"
                        disabled={busy}
                        onClick={() => setDismiss(selCrew)}
                      >
                        {tr("Elbocsátás", "Dismiss")}
                      </button>
                    )}
                </div>
              </>
            ) : (
              <p className="sh-hint">
                {selSlot
                  ? slotName(selSlot) +
                    " · " +
                    tr(
                      "Válassz megfelelő modult vagy tagot.",
                      "Select a compatible module or crew member.",
                    )
                  : tr(
                      "Húzd a modult vagy a portrét a megfelelő helyre. Levételhez húzd vissza a raktérbe vagy a tartalékba.",
                      "Drag a module or portrait to a compatible slot. Drag it back to cargo or reserve to remove it.",
                    )}
              </p>
            )}
          </section>
        </aside>
      </div>
      {dismiss && (
        <div className="cmd-modal-bg">
          <div
            className="cmd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crew-dismiss-title"
          >
            <h3 id="crew-dismiss-title">
              {tr("Legénységi tag elbocsátása", "Dismiss crew member")}
            </h3>
            <p>
              {dismiss.name} —{" "}
              {tr(
                "végleg távozik a névsorból. A felszerelése visszakerül a hajóraktérbe; ha nem fér el, az elbocsátás meghiúsul.",
                "will permanently leave your roster. Their equipment returns to cargo; dismissal fails if it does not fit.",
              )}
            </p>
            <div>
              <button
                autoFocus
                disabled={busy}
                onClick={() => setDismiss(null)}
              >
                {tr("Mégse", "Cancel")}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void mutate("dismiss_reserve_crew", {
                    p_crew: dismiss.id,
                    p_confirmation: dismiss.name,
                  })
                }
              >
                {tr("Elbocsátás megerősítése", "Confirm dismissal")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
