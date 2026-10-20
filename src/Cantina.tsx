import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import { notify } from "./lib/toast";
import "./cantina.css";
import { crewAssetUrl } from "./lib/crewPresentation";
import { itemRarity } from "./lib/itemPresentation";
export type CrewMember = {
  id: string;
  position: string;
  name: string;
  specialty?: string | null;
  aptitude?: number;
  species_slug?: string | null;
  portrait_path?: string | null;
  rarity?: string | null;
  class_id?: string | null;
};
type Applicant = {
  id: string;
  name: string;
  specialty: string;
  aptitude: number;
  species_slug: string;
  portrait_path: string | null;
  rarity: string;
  biography?: Record<string, { name: string; description: string }>;
};
type Roster = {
  candidates: Applicant[];
  expires_at: string;
  hire_energy_cost: number;
  replace_energy_cost: number;
};
export const CREW_POSITIONS = [
  "pilot",
  "navigator",
  "engineer",
  "security",
  "medic",
] as const;
export function crewPositionName(position: string, en: boolean) {
  const titles: Record<string, [string, string]> = {
    pilot: ["Pilóta", "Pilot"],
    navigator: ["Navigátor", "Navigator"],
    engineer: ["Gépész", "Engineer"],
    security: ["Biztonsági tiszt", "Security"],
    medic: ["Orvos", "Medic"],
  };
  return (titles[position] || [position, position])[en ? 1 : 0];
}
export default function Cantina({
  locale,
  atStation,
  crew,
  energy,
  onChanged,
}: {
  locale: string;
  atStation: boolean;
  crew: CrewMember[];
  energy: number;
  onChanged: () => Promise<void>;
}) {
  const en = locale === "en",
    tr = (hu: string, eng: string) => (en ? eng : hu);
  const [roster, setRoster] = useState<Roster | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const loading = useRef(0),
    mutation = useRef(false);
  const load = useCallback(async () => {
    const ticket = ++loading.current;
    if (!atStation) {
      setRoster(null);
      return;
    }
    const r = await supabase.rpc("get_cantina_roster");
    if (ticket !== loading.current) return;
    if (r.error) setError(r.error.message);
    else {
      setError("");
      setRoster(r.data as Roster);
    }
  }, [atStation]);
  useEffect(() => {
    void load();
    return () => {
      loading.current++;
    };
  }, [load]);
  const cost = roster?.hire_energy_cost || 20;
  const errors: Record<string, string> = {
    "Crew roster full": tr(
      "A legénységi névsor megtelt (24 tag).",
      "Crew roster is full (24 members).",
    ),
    "Unique crew limit reached": tr(
      "Ebből az egyedi karakterből már eléred a megengedett példányszámot.",
      "You already own the maximum number of this unique crew member.",
    ),
    "Insufficient energy": tr("Nincs elég energia.", "Insufficient energy."),
    "Candidate not available": tr(
      "A jelentkező már nem érhető el. Frissítsd a kínálatot.",
      "This applicant is no longer available. Refresh the roster.",
    ),
    "No recruitable crew templates available": tr(
      "Jelenleg nincs elérhető toborzási sablon.",
      "No recruitable crew templates are currently available.",
    ),
  };
  async function hire(a: Applicant) {
    if (!atStation || mutation.current || energy < cost) return;
    mutation.current = true;
    setBusy(true);
    try {
      const r = await supabase.rpc("hire_cantina_candidate", {
        p_candidate: a.id,
        p_position: a.specialty,
      });
      if (r.error) throw new Error(errors[r.error.message] || r.error.message);
      notify(
        r.data.name +
          tr(
            " csatlakozott a tartalék legénységhez.",
            " joined the reserve crew.",
          ),
        "success",
      );
      await Promise.all([onChanged(), load()]);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
      mutation.current = false;
    }
  }
  return (
    <section className="cantina-root">
      {!atStation ? (
        <div className="cantina-away">
          <strong>
            {tr(
              "A kantin a Határvidéki állomáson érhető el.",
              "The cantina is available at Frontier Station.",
            )}
          </strong>
        </div>
      ) : (
        <>
          <header className="cantina-summary">
            <span>
              {tr("JELENTKEZŐK", "APPLICANTS")}:{" "}
              {roster?.candidates.length || 0} · {tr("LEGÉNYSÉG", "CREW")}:{" "}
              {crew.length} / 24
            </span>
            <span>
              {roster?.expires_at
                ? tr("Frissül", "Refreshes") +
                  ": " +
                  new Date(roster.expires_at).toLocaleString(
                    en ? "en-GB" : "hu-HU",
                  )
                : tr("Betöltés…", "Loading…")}
            </span>
            <button disabled={busy} onClick={() => void load()}>
              {tr("Frissítés", "Refresh")}
            </button>
          </header>
          {error && (
            <p className="cantina-error" role="alert">
              {errors[error] || error}
            </p>
          )}
          <div className="cantina-candidates">
            {roster?.candidates.map((a) => (
              <article className={"cantina-candidate " + a.rarity} key={a.id}>
                <div className="cantina-picture">
                  {crewAssetUrl(a.portrait_path) && (
                    <img alt="" src={crewAssetUrl(a.portrait_path)} />
                  )}
                </div>
                <div className="cantina-identity">
                  <strong>{a.name}</strong>
                  <small>
                    {a.species_slug} · {crewPositionName(a.specialty, en)}
                  </small>
                  <small>{itemRarity(a.rarity || "common", locale)}</small>
                </div>
                <div className="cantina-ability">
                  <span>{tr("Jártasság", "Aptitude")}</span>
                  <strong>
                    {"◆".repeat(a.aptitude)}
                    {"◇".repeat(5 - a.aptitude)}
                  </strong>
                </div>
                <p className="cantina-biography">
                  {a.biography?.[locale]?.description ||
                    a.biography?.hu?.description}
                </p>
                <button
                  type="button"
                  disabled={busy || energy < cost || crew.length >= 24}
                  onClick={() => void hire(a)}
                >
                  {tr("FELVÉTEL", "HIRE")} · ⚡ {cost}
                </button>
              </article>
            ))}
          </div>
          <div className="cantina-crew">
            <strong>
              {tr(
                "A felvett tagokat a Hajó képernyőn húzhatod állásba.",
                "Drag recruited crew into a station on the Ship screen.",
              )}
            </strong>
            <p>
              {tr(
                "A névsorban több azonos szakterületű tag is tartható.",
                "The roster can hold several crew members with the same specialty.",
              )}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
