import {readFile} from 'node:fs/promises';
export async function setupBridgeDatabase(db){
await db.exec(`
create role anon;create role authenticated;create role service_role;
create schema private;create schema auth;
grant usage on schema public,private,auth to authenticated;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function private.can_edit_content() returns boolean language sql stable as $$select current_setting('qa.editor',true)='yes'$$;
create table public.characters(id uuid primary key default gen_random_uuid(),user_id uuid,attribute_pips jsonb,skill_bonus_pips jsonb);
create table public.character_progress(character_id uuid primary key,energy integer,energy_at timestamptz,xp_total bigint,level integer,upgrade_points integer,updated_at timestamptz);
create table public.gameplay_rules(id integer primary key,energy_max integer,energy_regen_seconds integer,xp_level_base integer,skill_points_per_level integer,updated_at timestamptz default now());
create table public.game_locations(id uuid primary key default gen_random_uuid(),slug text);
create table public.character_positions(character_id uuid primary key,location_id uuid);
create table public.game_skills(id uuid primary key default gen_random_uuid(),slug text,attribute text);
create table public.game_items(id uuid primary key default gen_random_uuid(),is_published boolean);
create table public.character_inventory(character_id uuid,item_id uuid,quantity integer,updated_at timestamptz,unique(character_id,item_id));
create table public.character_skill_upgrades(character_id uuid,skill_id uuid,bonus_pips integer);
create table public.game_actions(id uuid primary key default gen_random_uuid(),slug text,skill_id uuid,energy_cost integer,target_number integer,xp_success integer,xp_failure integer,is_published boolean);
create table public.character_action_log(id bigint generated always as identity primary key,character_id uuid,action_id uuid,dice jsonb,roll_total integer,target_number integer,succeeded boolean,xp_awarded integer,energy_spent integer,level_after integer,performed_at timestamptz default now());
create table private.qa_dice(id bigint generated always as identity,n integer);
create function private.secure_d6() returns integer language plpgsql as $$declare x integer;begin
 delete from private.qa_dice where id=(select min(id) from private.qa_dice) returning n into x;
 if x is null then raise exception 'Fixture dice exhausted';end if;return x;end $$;
`);
await db.exec(await readFile('supabase/migrations/20261021140000_m77_skill_challenges.sql','utf8'));
const migration=await readFile('supabase/migrations/20261021150000_m78_bridge_encounters_dice.sql','utf8');
await db.exec(migration);await db.exec(migration);

}
