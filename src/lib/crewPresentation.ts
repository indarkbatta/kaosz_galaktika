export const CREW_ROLES = [
  "pilot",
  "navigator",
  "engineer",
  "security",
  "medic",
] as const;
export const CREW_RARITIES = ["common", "uncommon", "rare", "epic"] as const;
export type CrewRarity = (typeof CREW_RARITIES)[number];
export type CrewIdentity = {
  id: string;
  name: string;
  specialty: string;
  aptitude: number;
  portrait_path: string | null;
  rarity: CrewRarity;
  species_slug?: string | null;
  class_id?: string | null;
  biography?: Record<string, { name: string; description: string }>;
  hull_bonus?: number;
  shield_bonus?: number;
  damage_bonus?: number;
  speed_bonus?: number;
  species_name?: { locale: string; name: string }[];
  class_name?: { locale: string; name: string }[];
};
export const crewAssetUrl = (path: string | null | undefined) =>
  path && /^hatarvilag\/[a-zA-Z0-9_/-]+\.(webp|avif|png|jpg|jpeg)$/.test(path)
    ? "https://assets.voidnoir.net/" + path
    : undefined;
export const crewBonusKeys = [
  "hull_bonus",
  "shield_bonus",
  "damage_bonus",
  "speed_bonus",
] as const;
export const crewBonusName = (key: string, en: boolean) =>
  (({
    hull_bonus: ["Burkolat", "Hull"],
    shield_bonus: ["Pajzs", "Shield"],
    damage_bonus: ["Tűzerő", "Firepower"],
    speed_bonus: ["Sebesség", "Speed"],
  })[key] || [key, key])[en ? 1 : 0];
