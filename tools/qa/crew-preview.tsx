// Public game catalog + invented crew identities; no authentication or player writes.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import ShipLoadout, { type ShipLoadoutSnapshot } from "../../src/ShipLoadout";
import CrewEditor, { type CrewCatalog } from "../../src/CrewEditor";
import { type CrewIdentity } from "../../src/lib/crewPresentation";
import catalog from "./crew-catalog.json";
import "../../src/styles.css";
import "../../src/editor.css";
import "../../src/captain-dashboard.css";
const roleNames = ["pilot", "navigator", "engineer", "security", "medic"];
const names = ["Mara Voss", "Eren Vale", "Korr", "Kael Ross", "Sera Nahl"];
const members: CrewIdentity[] = roleNames.map((role, i) => ({
  id: "fixture-" + role,
  name: names[i],
  specialty: role,
  aptitude: 4,
  rarity: (["uncommon", "rare", "common", "rare", "epic"] as const)[i],
  portrait_path: catalog.species.find(
    (s) => s.slug === (i === 2 ? "ferron" : "ember"),
  )!.image_path,
  species_slug: i === 2 ? "ferron" : "ember",
  class_id: catalog.classes[i].id,
  damage_bonus: i === 3 ? 2 : 0,
  speed_bonus: i === 0 ? 1 : 0,
}));
members[0].portrait_path = "hatarvilag/crew/portraits-v1/mara.webp";
members[1].portrait_path = "hatarvilag/crew/portraits-v1/aren.webp";
members[3].portrait_path = "hatarvilag/crew/portraits-v1/kael.webp";
for (const c of members) {
  c.species_name = catalog.species.find(
    (s) => s.slug === c.species_slug,
  )?.translations;
  c.class_name = catalog.classes.find((s) => s.id === c.class_id)?.translations;
}
members.push(
  {
    ...members[0],
    id: "fixture-pilot-reserve",
    name: "Aren Rhett",
    portrait_path: "hatarvilag/crew/portraits-v1/aren.webp",
  },
  {
    ...members[3],
    id: "fixture-security-reserve",
    name: "Nessa Kade",
    portrait_path: "hatarvilag/crew/portraits-v1/mara.webp",
  },
  {
    ...members[4],
    id: "fixture-medic-reserve",
    name: "Lyra Voss",
    portrait_path: "hatarvilag/crew/portraits-v1/aren.webp",
  },
);
const snapshot: ShipLoadoutSnapshot = {
  ship_id: catalog.ship.id,
  stats: {
    hull: 120,
    shield: 60,
    damage: 24,
    speed: 8,
    cargo: 80,
    power_draw: 12,
    power_output: 18,
    missing_required: 0,
    ready: true,
  },
  modules: catalog.modules.map((m) => ({ ...m, quantity: 2 })),
  crew: members,
  slots: catalog.slots.map((s) => ({
    ...s,
    item_id:
      s.kind === "module"
        ? catalog.modules.find(
            (m) => m.module_kind === s.module_kind && m.is_starter,
          )?.item_id || null
        : null,
    crew_id:
      s.kind === "crew"
        ? members.find((c) => c.specialty === s.crew_role)?.id || null
        : null,
  })),
} as ShipLoadoutSnapshot;
function Preview() {
  const [view, setView] = useState("ship"),
    [locale, setLocale] = useState("hu"),
    [width, setWidth] = useState(1380);
  return (
    <>
      <div className="qa-toolbar">
        <span>CSAK OLVASHATÓ VIZUÁLIS TESZT</span>
        <button onClick={() => setView("ship")}>Hajó</button>
        <button onClick={() => setView("editor")}>Legénységszerkesztő</button>
        <button onClick={() => setLocale(locale === "hu" ? "en" : "hu")}>
          {locale === "hu" ? "EN" : "HU"}
        </button>
        <button onClick={() => setWidth(width === 1380 ? 900 : 1380)}>
          {width === 1380 ? "900 px" : "1380 px"}
        </button>
      </div>
      <div
        className={"qa-window " + (view === "editor" ? "qa-editor" : "")}
        style={{ width: `min(${width}px,calc(100vw - 30px))` }}
      >
        {view === "ship" ? (
          <div className="cmd-shell">
            <header className="cmd-head">
              <div>
                <small>HATÁRVILÁG</small>
                <strong>PARANCSNOKSÁG</strong>
              </div>
              <nav>
                {[
                  "HÍD",
                  "TÉRKÉP",
                  "KARAKTER",
                  "HAJÓ",
                  "KANTIN",
                  "RAKTÉR",
                  "NAPLÓ",
                ].map((x) => (
                  <button key={x} className={x === "HAJÓ" ? "active" : ""}>
                    {x}
                  </button>
                ))}
              </nav>
            </header>
            <div className="cmd-summary">
              <div>
                <strong>INDARK</strong>
                <p>KAPITÁNY · 1. SZINT</p>
              </div>
              <div>
                ENERGIA<p>16 / 16</p>
              </div>
              <div>
                HAJÓ<p>Vándor</p>
              </div>
              <div>
                HELYSZÍN<p>Határvidéki állomás</p>
              </div>
            </div>
            <main className="cmd-body">
              <ShipLoadout
                characterId="fixture"
                shipSlug="vagabond"
                shipName="Vándor"
                shipImage={catalog.ship.image_path}
                locale={locale}
                onChanged={async () => {}}
                initialData={snapshot}
              />
            </main>
            <footer className="cmd-footer">
              HATÁRVILÁG · TESZTADATOK · A MŰVELETEK NEM ÍRNAK ADATBÁZISBA
            </footer>
          </div>
        ) : (
          <CrewEditor
            locale={locale}
            onBack={() => setView("ship")}
            initialData={catalog as unknown as CrewCatalog}
          />
        )}
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
