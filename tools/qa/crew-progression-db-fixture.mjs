import {readFile} from 'node:fs/promises';
import {setupCombatDatabase} from './combat-db-fixture.mjs';
export async function setupCrewDatabase(db){
 await setupCombatDatabase(db);
 await db.exec(`create table game_species_skill_bonuses(species_id uuid,skill_id uuid,bonus_pips int);
 create table game_crew_templates(id uuid primary key default gen_random_uuid(),specialty text,is_published boolean default true);
 create table character_crew(id uuid primary key default gen_random_uuid(),character_id uuid references characters(id),name text,portrait_path text,species_slug text,specialty text,position text,template_id uuid references game_crew_templates(id));
 create table combat_runs(character_id uuid,status text,simulation boolean);
 create function private.combat_owned_character() returns uuid language plpgsql stable security definer set search_path='' as $$declare cid uuid;begin select id into cid from public.characters where user_id=auth.uid();if cid is null then raise exception 'Character not found';end if;return cid;end $$;
 create function private.save_crew_catalog_impl(text,uuid,jsonb,integer) returns jsonb language sql as $$select jsonb_build_object('id',$2,'revision',1)$$;
 create function private.get_crew_editor_catalog_impl() returns jsonb language sql as $$select '{"sets":[],"templates":[],"species":[],"classes":[]}'::jsonb$$;
 insert into game_skills(slug,attribute,is_combat) values('reflexes','body',false),('stealth','body',false),('engineering','mind',false),('analysis','mind',false),('endurance','body',false);
 insert into game_skills_i18n select id,'hu',slug from game_skills where not is_combat;
 insert into game_species_skill_bonuses select sp.id,sk.id,1 from game_species sp cross join game_skills sk where sk.slug='engineering';
 insert into character_crew(character_id,name,species_slug,specialty,position) select c.id,'Legacy engineer','ember','engineer','engineer' from characters c;
 `);
 await db.exec(await readFile('supabase/migrations/20261023124155_simplified_crew_progression.sql','utf8'));
}
