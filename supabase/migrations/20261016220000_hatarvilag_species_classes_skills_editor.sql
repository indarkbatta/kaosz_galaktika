-- Replay on a fresh Határvilág database after the baseline M0 auth migration.
-- This migration was applied to project lsodhqokudnfriosqqfe as hatarvilag_species_classes_skills_editor.
create type public.attribute_code as enum('body','mind','soul','morale','social');
create or replace function private.can_edit_content() returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.user_roles where user_id=(select auth.uid()) and role in('editor'::public.app_role,'admin'::public.app_role))$$;
revoke all on function private.can_edit_content() from public,anon;
grant execute on function private.can_edit_content() to authenticated;
create or replace function private.game_touch_timestamp() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now();return new;end $$;
create table public.game_species(
 id uuid primary key default gen_random_uuid(),
 slug text unique not null check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
 primary_attribute public.attribute_code not null,
 secondary_attribute public.attribute_code not null,
 image_path text check(image_path is null or image_path like 'hatarvilag/%'),
 is_published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint species_different_bonuses check(primary_attribute<>secondary_attribute)
);
create table public.game_species_i18n(species_id uuid not null references public.game_species(id) on delete cascade,locale text not null check(locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),name text not null check(char_length(btrim(name)) between 2 and 80),description text not null default '',primary key(species_id,locale));
create trigger species_updated before update on public.game_species for each row execute function private.game_touch_timestamp();
create table public.game_classes(
 id uuid primary key default gen_random_uuid(),
 slug text unique not null check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
 primary_attribute public.attribute_code not null,
 secondary_attribute public.attribute_code not null,
 image_path text check(image_path is null or image_path like 'hatarvilag/%'),
 is_published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint classes_different_bonuses check(primary_attribute<>secondary_attribute)
);
create table public.game_classes_i18n(class_id uuid not null references public.game_classes(id) on delete cascade,locale text not null check(locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),name text not null check(char_length(btrim(name)) between 2 and 80),description text not null default '',primary key(class_id,locale));
create trigger classes_updated before update on public.game_classes for each row execute function private.game_touch_timestamp();
create table public.game_skills(
 id uuid primary key default gen_random_uuid(),
 slug text unique not null check(slug ~ '^[a-z0-9_]+$'),
 attribute public.attribute_code not null,
 is_combat boolean not null default false,
 position smallint not null check(position between 1 and 5),
 unique(attribute,position));
create table public.game_skills_i18n(
 skill_id uuid not null references public.game_skills(id) on delete cascade,
 locale text not null,name text not null,primary key(skill_id,locale));
alter table public.game_species enable row level security;
alter table public.game_classes enable row level security;
alter table public.game_species_i18n enable row level security;
alter table public.game_classes_i18n enable row level security;
alter table public.game_skills enable row level security;
alter table public.game_skills_i18n enable row level security;
create policy "species_read" on public.game_species for select to authenticated using(is_published or (select private.can_edit_content()));
create policy "species_i18n_read" on public.game_species_i18n for select to authenticated using(exists(select 1 from public.game_species p where p.id=species_id));
create policy "species_write" on public.game_species for all to authenticated using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy "species_i18n_write" on public.game_species_i18n for all to authenticated using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy "classes_read" on public.game_classes for select to authenticated using(is_published or (select private.can_edit_content()));
create policy "classes_i18n_read" on public.game_classes_i18n for select to authenticated using(exists(select 1 from public.game_classes p where p.id=class_id));
create policy "classes_write" on public.game_classes for all to authenticated using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy "classes_i18n_write" on public.game_classes_i18n for all to authenticated using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy "skills_read" on public.game_skills for select to authenticated using(true);
create policy "skills_write" on public.game_skills for all to authenticated using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy "skills_i18n_read" on public.game_skills_i18n for select to authenticated using(true);
create policy "skills_i18n_write" on public.game_skills_i18n for all to authenticated using((select private.can_edit_content())) with check((select private.can_edit_content()));
revoke all on public.game_species,public.game_classes,public.game_species_i18n,public.game_classes_i18n,public.game_skills,public.game_skills_i18n from anon,authenticated;
grant select,insert,update,delete on public.game_species,public.game_classes,public.game_species_i18n,public.game_classes_i18n,public.game_skills,public.game_skills_i18n to authenticated;
insert into public.game_species(slug,primary_attribute,secondary_attribute,image_path,is_published) values('ember','body','social','hatarvilag/species/ember.jpg',true);
insert into public.game_species_i18n(species_id,locale,name,description) select id,'hu','Ember','Alkalmazkodó határvidéki nép. Szívós, kíváncsi és változatos kultúrájú.' from public.game_species where slug='ember';
insert into public.game_species_i18n(species_id,locale,name,description) select id,'en','Human','Adaptive frontier people, resilient, curious and culturally diverse.' from public.game_species where slug='ember';
insert into public.game_species(slug,primary_attribute,secondary_attribute,image_path,is_published) values('ferron','body','morale','hatarvilag/species/ferron.jpg',true);
insert into public.game_species_i18n(species_id,locale,name,description) select id,'hu','Ferron','Kohóvilágokon született, fémmel megerősített túlélők. Rendíthetetlenek és kitartók.' from public.game_species where slug='ferron';
insert into public.game_species_i18n(species_id,locale,name,description) select id,'en','Ferron','Forge-world survivors reinforced with metal. Unyielding and enduring.' from public.game_species where slug='ferron';
insert into public.game_species(slug,primary_attribute,secondary_attribute,image_path,is_published) values('noxari','soul','mind','hatarvilag/species/noxari.jpg',true);
insert into public.game_species_i18n(species_id,locale,name,description) select id,'hu','Noxari','A tudat mélyrétegeire hangolódott, különös érzékelésű vándorok.' from public.game_species where slug='noxari';
insert into public.game_species_i18n(species_id,locale,name,description) select id,'en','Noxari','Wanderers attuned to deeper layers of consciousness, with uncanny perception.' from public.game_species where slug='noxari';
insert into public.game_species(slug,primary_attribute,secondary_attribute,image_path,is_published) values('voxari','social','morale','hatarvilag/species/voxari.jpg',true);
insert into public.game_species_i18n(species_id,locale,name,description) select id,'hu','Voxari','Rezonanciával kommunikáló nép, akik a hangot diplomáciára és befolyásolásra is használják.' from public.game_species where slug='voxari';
insert into public.game_species_i18n(species_id,locale,name,description) select id,'en','Voxari','A resonance-speaking people who wield sound for diplomacy and influence.' from public.game_species where slug='voxari';
insert into public.game_species(slug,primary_attribute,secondary_attribute,image_path,is_published) values('vektorita','mind','body','hatarvilag/species/vektorita.jpg',true);
insert into public.game_species_i18n(species_id,locale,name,description) select id,'hu','Vektorita','Precíz géptestekben élő technológiai tudatok, a számítás és a mérnöki munka mesterei.' from public.game_species where slug='vektorita';
insert into public.game_species_i18n(species_id,locale,name,description) select id,'en','Vectorite','Technological minds inhabiting precise mechanical bodies, masters of computation and engineering.' from public.game_species where slug='vektorita';
insert into public.game_species(slug,primary_attribute,secondary_attribute,image_path,is_published) values('karszid','morale','body','hatarvilag/species/karszid.jpg',true);
insert into public.game_species_i18n(species_id,locale,name,description) select id,'hu','Karszid','Kietlen peremvidékek harcedzett klánjai, akik fegyelemmel törik meg ellenfeleiket.' from public.game_species where slug='karszid';
insert into public.game_species_i18n(species_id,locale,name,description) select id,'en','Karsid','Battle-hardened clans from harsh rim worlds who break their foes through discipline.' from public.game_species where slug='karszid';
insert into public.game_species(slug,primary_attribute,secondary_attribute,image_path,is_published) values('mycelion','soul','social','hatarvilag/species/mycelion.jpg',true);
insert into public.game_species_i18n(species_id,locale,name,description) select id,'hu','Mycelion','Biológiai hálózatokból született érzékeny lények, a közösségi emlékezet őrzői.' from public.game_species where slug='mycelion';
insert into public.game_species_i18n(species_id,locale,name,description) select id,'en','Mycelion','Sensitive beings born from living networks, keepers of collective memory.' from public.game_species where slug='mycelion';
insert into public.game_classes(slug,primary_attribute,secondary_attribute,image_path,is_published) values('felderito','body','mind','hatarvilag/classes/felderito.jpg',true);
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'hu','Felderítő','A veszélyes térségek gyors felderítője és nyomolvasója.' from public.game_classes where slug='felderito';
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'en','Scout','A swift explorer and tracker of hazardous sectors.' from public.game_classes where slug='felderito';
insert into public.game_classes(slug,primary_attribute,secondary_attribute,image_path,is_published) values('navigator','mind','soul','hatarvilag/classes/navigator.jpg',true);
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'hu','Navigátor','Kiszámítja az útvonalakat, érzékeli az anomáliákat és biztosítja az áthaladást.' from public.game_classes where slug='navigator';
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'en','Navigator','Charts routes, senses anomalies and ensures safe passage.' from public.game_classes where slug='navigator';
insert into public.game_classes(slug,primary_attribute,secondary_attribute,image_path,is_published) values('pszion','soul','mind','hatarvilag/classes/pszion.jpg',true);
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'hu','Pszion','Pszionikus eszközökre és mentális kapcsolatra specializálódott.' from public.game_classes where slug='pszion';
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'en','Psion','Specialist in psionic devices and mental attunement.' from public.game_classes where slug='pszion';
insert into public.game_classes(slug,primary_attribute,secondary_attribute,image_path,is_published) values('hadur','morale','body','hatarvilag/classes/hadur.jpg',true);
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'hu','Hadúr','Parancsnok, aki tartja a frontot és félelmet kelt az ellenségben.' from public.game_classes where slug='hadur';
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'en','Warlord','Commander who holds the line and strikes fear into enemies.' from public.game_classes where slug='hadur';
insert into public.game_classes(slug,primary_attribute,secondary_attribute,image_path,is_published) values('muszeresz','mind','body','hatarvilag/classes/muszeresz.jpg',true);
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'hu','Műszerész','Meghibásodott rendszereket állít helyre és különleges eszközöket épít.' from public.game_classes where slug='muszeresz';
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'en','Engineer','Repairs failing systems and builds specialised devices.' from public.game_classes where slug='muszeresz';
insert into public.game_classes(slug,primary_attribute,secondary_attribute,image_path,is_published) values('arnyugynok','social','soul','hatarvilag/classes/arnyugynok.jpg',true);
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'hu','Árnyügynök','Kapcsolatrendszereket és álidentitásokat használ, amikor az erő kevés.' from public.game_classes where slug='arnyugynok';
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'en','Shadow Agent','Uses networks and false identities when force is not enough.' from public.game_classes where slug='arnyugynok';
insert into public.game_classes(slug,primary_attribute,secondary_attribute,image_path,is_published) values('hangkovacs','social','morale','hatarvilag/classes/hangkovacs.jpg',true);
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'hu','Hangkovács','A rezgés és kommunikáció mestere, hangalapú fegyverek használója.' from public.game_classes where slug='hangkovacs';
insert into public.game_classes_i18n(class_id,locale,name,description) select id,'en','Soundforger','Master of vibration and communication who wields sonic weapons.' from public.game_classes where slug='hangkovacs';
insert into public.game_skills(slug,attribute,is_combat,position) values('athletics','body',false,1);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Atlétika' from public.game_skills where slug='athletics';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Athletics' from public.game_skills where slug='athletics';
insert into public.game_skills(slug,attribute,is_combat,position) values('endurance','body',false,2);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Állóképesség' from public.game_skills where slug='endurance';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Endurance' from public.game_skills where slug='endurance';
insert into public.game_skills(slug,attribute,is_combat,position) values('reflexes','body',false,3);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Reakció' from public.game_skills where slug='reflexes';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Reflexes' from public.game_skills where slug='reflexes';
insert into public.game_skills(slug,attribute,is_combat,position) values('stealth','body',false,4);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Lopakodás' from public.game_skills where slug='stealth';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Stealth' from public.game_skills where slug='stealth';
insert into public.game_skills(slug,attribute,is_combat,position) values('physical_arms','body',true,5);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Fegyverkezelés' from public.game_skills where slug='physical_arms';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Physical Weapons' from public.game_skills where slug='physical_arms';
insert into public.game_skills(slug,attribute,is_combat,position) values('analysis','mind',false,1);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Elemzés' from public.game_skills where slug='analysis';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Analysis' from public.game_skills where slug='analysis';
insert into public.game_skills(slug,attribute,is_combat,position) values('engineering','mind',false,2);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Műszaki ismeretek' from public.game_skills where slug='engineering';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Engineering' from public.game_skills where slug='engineering';
insert into public.game_skills(slug,attribute,is_combat,position) values('navigation','mind',false,3);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Navigáció' from public.game_skills where slug='navigation';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Navigation' from public.game_skills where slug='navigation';
insert into public.game_skills(slug,attribute,is_combat,position) values('research','mind',false,4);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Kutatás' from public.game_skills where slug='research';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Research' from public.game_skills where slug='research';
insert into public.game_skills(slug,attribute,is_combat,position) values('psionic_arms','mind',true,5);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Pszionikus fegyverek' from public.game_skills where slug='psionic_arms';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Psionic Weapons' from public.game_skills where slug='psionic_arms';
insert into public.game_skills(slug,attribute,is_combat,position) values('intuition','soul',false,1);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Intuíció' from public.game_skills where slug='intuition';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Intuition' from public.game_skills where slug='intuition';
insert into public.game_skills(slug,attribute,is_combat,position) values('willpower','soul',false,2);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Akaraterő' from public.game_skills where slug='willpower';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Willpower' from public.game_skills where slug='willpower';
insert into public.game_skills(slug,attribute,is_combat,position) values('attunement','soul',false,3);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Ráhangolódás' from public.game_skills where slug='attunement';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Attunement' from public.game_skills where slug='attunement';
insert into public.game_skills(slug,attribute,is_combat,position) values('meditation','soul',false,4);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Meditáció' from public.game_skills where slug='meditation';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Meditation' from public.game_skills where slug='meditation';
insert into public.game_skills(slug,attribute,is_combat,position) values('terror_arms','soul',true,5);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Terrorfegyverek' from public.game_skills where slug='terror_arms';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Terror Weapons' from public.game_skills where slug='terror_arms';
insert into public.game_skills(slug,attribute,is_combat,position) values('command','morale',false,1);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Vezetés' from public.game_skills where slug='command';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Command' from public.game_skills where slug='command';
insert into public.game_skills(slug,attribute,is_combat,position) values('discipline','morale',false,2);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Fegyelem' from public.game_skills where slug='discipline';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Discipline' from public.game_skills where slug='discipline';
insert into public.game_skills(slug,attribute,is_combat,position) values('rally','morale',false,3);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Bátorítás' from public.game_skills where slug='rally';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Rallying' from public.game_skills where slug='rally';
insert into public.game_skills(slug,attribute,is_combat,position) values('tactics','morale',false,4);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Taktika' from public.game_skills where slug='tactics';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Tactics' from public.game_skills where slug='tactics';
insert into public.game_skills(slug,attribute,is_combat,position) values('fear_arms','morale',true,5);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Félelemfegyverek' from public.game_skills where slug='fear_arms';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Fear Weapons' from public.game_skills where slug='fear_arms';
insert into public.game_skills(slug,attribute,is_combat,position) values('diplomacy','social',false,1);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Diplomácia' from public.game_skills where slug='diplomacy';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Diplomacy' from public.game_skills where slug='diplomacy';
insert into public.game_skills(slug,attribute,is_combat,position) values('deception','social',false,2);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Megtévesztés' from public.game_skills where slug='deception';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Deception' from public.game_skills where slug='deception';
insert into public.game_skills(slug,attribute,is_combat,position) values('trade','social',false,3);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Kereskedelem' from public.game_skills where slug='trade';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Trade' from public.game_skills where slug='trade';
insert into public.game_skills(slug,attribute,is_combat,position) values('networking','social',false,4);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Kapcsolatépítés' from public.game_skills where slug='networking';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Networking' from public.game_skills where slug='networking';
insert into public.game_skills(slug,attribute,is_combat,position) values('sonic_arms','social',true,5);
insert into public.game_skills_i18n(skill_id,locale,name) select id,'hu','Hangfegyverek' from public.game_skills where slug='sonic_arms';
insert into public.game_skills_i18n(skill_id,locale,name) select id,'en','Sonic Weapons' from public.game_skills where slug='sonic_arms';
