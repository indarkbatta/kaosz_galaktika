-- Határvilág M1 editor: structured species resistances and localized flavour
alter table public.game_species
 add column if not exists resistances jsonb not null default '[]'::jsonb
 constraint species_resistances_array check(jsonb_typeof(resistances)='array' and jsonb_array_length(resistances)<=12);
alter table public.game_species_i18n add column if not exists passives text not null default '';
alter table public.game_classes_i18n add column if not exists starting_equipment text not null default '';
alter table public.game_classes_i18n add column if not exists traits text not null default '';
alter table public.game_classes_i18n add column if not exists gameplay_role text not null default '';

update public.game_species set resistances=case slug
 when 'ember' then '[]'::jsonb
 when 'ferron' then '[{"code":"kinetic","value":10},{"code":"thermal","value":10}]'::jsonb
 when 'noxari' then '[{"code":"psionic","value":25},{"code":"occult","value":10}]'::jsonb
 when 'voxari' then '[{"code":"sonic","value":25}]'::jsonb
 when 'vektorita' then '[{"code":"chemical","value":25}]'::jsonb
 when 'karszid' then '[{"code":"fear","value":20}]'::jsonb
 when 'mycelion' then '[{"code":"terror","value":10},{"code":"chemical","value":15}]'::jsonb
 else '[]'::jsonb end;
update public.game_species_i18n t set passives=case t.locale
 when 'hu' then case s.slug
 when 'ember' then 'Rugalmas alkalmazkodás'||chr(10)||'Gyors tanulás'
 when 'ferron' then 'Természetes páncél'||chr(10)||'Kitartó szervezet'
 when 'noxari' then 'Fokozott mentális érzékelés'||chr(10)||'Természetes empátia'
 when 'voxari' then 'Rezonancia érzékelés'||chr(10)||'Hangrezisztencia'
 when 'vektorita' then 'Gépi számítás'||chr(10)||'Rendszerdiagnosztika'
 when 'karszid' then 'Félelmetes megjelenés'||chr(10)||'Klánfegyelem'
 when 'mycelion' then 'Biológiai hálózat'||chr(10)||'Spóraérzékelés' else '' end
 else case s.slug
 when 'ember' then 'Flexible adaptation'||chr(10)||'Rapid learning'
 when 'ferron' then 'Natural armour'||chr(10)||'Enduring physiology'
 when 'noxari' then 'Heightened mental perception'||chr(10)||'Natural empathy'
 when 'voxari' then 'Resonance sensing'||chr(10)||'Sonic resistance'
 when 'vektorita' then 'Machine computation'||chr(10)||'System diagnostics'
 when 'karszid' then 'Intimidating presence'||chr(10)||'Clan discipline'
 when 'mycelion' then 'Biological network'||chr(10)||'Spore sensing' else '' end end
from public.game_species s where s.id=t.species_id;

update public.game_classes_i18n t set
 starting_equipment=case t.locale when 'hu' then case c.slug
 when 'felderito' then 'Könnyű felderítőruha'||chr(10)||'Szenzor'||chr(10)||'Kézi fegyver'
 when 'navigator' then 'Navigációs modul'||chr(10)||'Csillagtérkép'||chr(10)||'Kommunikátor'
 when 'pszion' then 'Pszionikus fókusz'||chr(10)||'Mentális árnyékoló'
 when 'hadur' then 'Nehéz mellvért'||chr(10)||'Oldalfegyver'||chr(10)||'Taktikai jeladó'
 when 'muszeresz' then 'Szerszámkészlet'||chr(10)||'Diagnosztikai szkenner'
 when 'arnyugynok' then 'Álcagenerátor'||chr(10)||'Kódfejtő'||chr(10)||'Könnyű fegyver'
 when 'hangkovacs' then 'Hangmodulátor'||chr(10)||'Rezonátor'||chr(10)||'Univerzális kommunikátor'
 else '' end else case c.slug
 when 'felderito' then 'Light recon suit'||chr(10)||'Scanner'||chr(10)||'Sidearm'
 when 'navigator' then 'Navigation module'||chr(10)||'Star chart'||chr(10)||'Communicator'
 when 'pszion' then 'Psionic focus'||chr(10)||'Mental shielding'
 when 'hadur' then 'Heavy breastplate'||chr(10)||'Sidearm'||chr(10)||'Tactical beacon'
 when 'muszeresz' then 'Tool kit'||chr(10)||'Diagnostic scanner'
 when 'arnyugynok' then 'Camouflage generator'||chr(10)||'Codebreaker'||chr(10)||'Light weapon'
 when 'hangkovacs' then 'Sound modulator'||chr(10)||'Resonator'||chr(10)||'Universal communicator'
 else '' end end,
 traits=case t.locale when 'hu' then 'Szakterületi jártasság'||chr(10)||'Induló képességcsomag' else 'Domain expertise'||chr(10)||'Starter skill package' end,
 gameplay_role=case t.locale when 'hu' then case c.slug
 when 'felderito' then 'Mozgékony felderítő és nyomkereső.'
 when 'navigator' then 'Útvonal-tervező és anomáliafelderítő.'
 when 'pszion' then 'Pszionikus támadó és mentális specialista.'
 when 'hadur' then 'Harctéri irányító és csapaterősítő.'
 when 'muszeresz' then 'Technikai támogató, javító és eszközfejlesztő.'
 when 'arnyugynok' then 'Beszivárgó és hírszerzési specialista.'
 when 'hangkovacs' then 'Hangalapú irányító és kommunikációs támogató.' else '' end
 else case c.slug
 when 'felderito' then 'Mobile scout and tracker.'
 when 'navigator' then 'Route planner and anomaly finder.'
 when 'pszion' then 'Psionic attacker and mental specialist.'
 when 'hadur' then 'Battlefield commander and morale amplifier.'
 when 'muszeresz' then 'Technical support, repair and equipment development.'
 when 'arnyugynok' then 'Infiltration and intelligence specialist.'
 when 'hangkovacs' then 'Sonic controller and communications support.' else '' end end
from public.game_classes c where c.id=t.class_id;
