
-- Határvilág M2/M3: server-authoritative progression, energy and actions.
create table public.gameplay_rules (
 id integer primary key default 1 check(id=1),
 energy_max integer not null default 100 check (energy_max between 20 and 1000),
 energy_regen_seconds integer not null default 300 check (energy_regen_seconds between 30 and 86400),
 xp_level_base integer not null default 100 check(xp_level_base between 20 and 100000),
 skill_points_per_level integer not null default 1 check(skill_points_per_level between 1 and 10),
 updated_at timestamptz not null default now()
);
insert into public.gameplay_rules(id) values(1);
alter table public.gameplay_rules enable row level security;
create policy game_rules_read on public.gameplay_rules for select to authenticated using(true);
create policy game_rules_editor_write on public.gameplay_rules for update to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
revoke all on public.gameplay_rules from anon,authenticated;
grant select on public.gameplay_rules to authenticated;
grant update(energy_max,energy_regen_seconds,xp_level_base,skill_points_per_level) on public.gameplay_rules to authenticated;

create table public.game_actions(
 id uuid primary key default gen_random_uuid(),
 slug text unique not null check(slug ~ '^[a-z][a-z0-9_]*$'),
 skill_id uuid not null references public.game_skills(id),
 energy_cost integer not null check(energy_cost between 1 and 500),
 target_number integer not null check(target_number between 2 and 100),
 xp_success integer not null check(xp_success between 0 and 10000),
 xp_failure integer not null check(xp_failure between 0 and 10000),
 is_published boolean not null default true,
 sort_order integer not null default 0
);
create table public.game_actions_i18n(
 action_id uuid not null references public.game_actions(id) on delete cascade,
 locale text not null references public.game_locales(code),
 name text not null,description text not null default '',
 success_message text not null default '', failure_message text not null default '',
 primary key(action_id,locale)
);
alter table public.game_actions enable row level security;
alter table public.game_actions_i18n enable row level security;
create policy action_read on public.game_actions for select to authenticated using(is_published or (select private.can_edit_content()));
create policy action_i18n_read on public.game_actions_i18n for select to authenticated using
  (exists(select 1 from public.game_actions a where a.id=action_id));
create policy action_editor_manage on public.game_actions for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy action_i18n_editor_manage on public.game_actions_i18n for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
revoke all on public.game_actions,public.game_actions_i18n from anon,authenticated;
grant select,insert,update,delete on public.game_actions,public.game_actions_i18n to authenticated;

insert into public.game_actions(slug,skill_id,energy_cost,target_number,xp_success,xp_failure,sort_order)
select v.slug,s.id,v.cost,v.target,v.win,v.lose,v.pos from (values
 ('recon', 'stealth',12,11,24,6,1),
 ('repair','engineering',15,13,32,8,2),
 ('trade','trade',10,10,20,5,3),
 ('navigate','navigation',18,14,38,10,4)
) v(slug,skill,cost,target,win,lose,pos) join public.game_skills s on s.slug=v.skill;
insert into public.game_actions_i18n(action_id,locale,name,description,success_message,failure_message)
select a.id,v.locale,v.name,v.descr,v.win,v.lose from
(values
 ('recon','hu','Felderítés','Vizsgáld át a roncsmező rejtett járatait.','Új nyomot találtál a roncsok között.','A vizsgálat nem vezetett eredményre.'),
 ('recon','en','Reconnaissance','Search hidden passages in the debris field.','You uncovered a new clue among the wrecks.','The search yielded no actionable intelligence.'),
 ('repair','hu','Műszaki munka','Állítsd helyre a fedélzeti javítórendszert.','A sérült rendszert sikerült stabilizálni.','A hibát még nem sikerült megszüntetni.'),
 ('repair','en','Engineering','Restore the shipboard maintenance subsystem.','The damaged subsystem is stabilized.','The underlying fault remains unresolved.'),
 ('trade','hu','Kereskedelem','Alkudj egy határvidéki kereskedővel.','Jó üzletet kötöttél a kereskedővel.','A kereskedő ezúttal nem engedett az árból.'),
 ('trade','en','Trade','Negotiate with a frontier merchant.','You struck a favorable deal with the merchant.','The merchant stood firm on the price.'),
 ('navigate','hu','Navigáció','Elemezd a legközelebbi szektor torzult térképét.','Biztonságos útvonalat azonosítottál.','A térkép anomáliái továbbra is zavarják a mérést.'),
 ('navigate','en','Navigation','Analyze the distorted map of the neighboring sector.','You identified a safe route.','Anomalies still interfere with the navigation data.')
) v(slug,locale,name,descr,win,lose) join public.game_actions a on a.slug=v.slug;

create table public.character_progress(
 character_id uuid primary key references public.characters(id) on delete cascade,
 level integer not null default 1 check(level between 1 and 100),
 xp_total bigint not null default 0 check(xp_total>=0),
 energy integer not null default 100 check(energy>=0),
 energy_at timestamptz not null default now(),
 upgrade_points integer not null default 0 check(upgrade_points>=0),
 updated_at timestamptz not null default now()
);
create table public.character_skill_upgrades(
 character_id uuid not null references public.characters(id) on delete cascade,
 skill_id uuid not null references public.game_skills(id),
 bonus_pips integer not null default 0 check (bonus_pips between 1 and 12),
 primary key(character_id,skill_id)
);
create table public.character_action_log(
 id bigint generated always as identity primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 action_id uuid not null references public.game_actions(id),
 performed_at timestamptz not null default now(),
 dice jsonb not null,
 roll_total integer not null,
 target_number integer not null,
 succeeded boolean not null,
 xp_awarded integer not null,
 energy_spent integer not null,
 level_after integer not null
);
create index character_action_log_owner_time on public.character_action_log(character_id,performed_at desc);
alter table public.character_progress enable row level security;
alter table public.character_skill_upgrades enable row level security;
alter table public.character_action_log enable row level security;
create policy progress_own on public.character_progress for select to authenticated using
 (exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
create policy upgrades_own on public.character_skill_upgrades for select to authenticated using
 (exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
create policy log_own on public.character_action_log for select to authenticated using
 (exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
revoke all on public.character_progress,public.character_skill_upgrades,public.character_action_log from anon,authenticated;
grant select on public.character_progress,public.character_skill_upgrades,public.character_action_log to authenticated;

-- Initialise progression at creation, without client-side INSERT rights.
create function private.initialize_character_progress() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 insert into public.character_progress(character_id,energy)
 values(new.id,(select energy_max from public.gameplay_rules where id=1));
 return new;
end $$;
create trigger initialize_character_progress after insert on public.characters
 for each row execute function private.initialize_character_progress();

-- Read and regenerate energy at action time under row lock: offline regen, no cron required.
create function private.perform_game_action_impl(p_slug text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid();
 v_c public.characters%rowtype;
 v_p public.character_progress%rowtype;
 v_a record;
 v_r public.gameplay_rules%rowtype;
 v_skill uuid;
 v_attr text;
 v_pool integer;
 v_die integer;
 v_roll integer:=0;
 v_dice jsonb:='[]'::jsonb;
 v_success boolean;
 v_xp integer;
 v_elapsed bigint;
 v_energy integer;
 v_at timestamptz;
 v_new_level integer;
 v_new_points integer;
 v_log bigint;
 v_threshold bigint;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into v_c from public.characters where user_id=v_uid;
 if not found then raise exception 'Create a captain first' using errcode='P0001'; end if;
 select * into v_p from public.character_progress where character_id=v_c.id for update;
 if not found then raise exception 'Missing character progress' using errcode='P0001'; end if;
 select * into strict v_r from public.gameplay_rules where id=1;
 select a.id,a.energy_cost,a.target_number,a.xp_success,a.xp_failure,s.id as skill_id,s.attribute::text as attr
 into v_a from public.game_actions a join public.game_skills s on s.id=a.skill_id
 where a.slug=p_slug and a.is_published;
 if not found then raise exception 'Unknown action' using errcode='P0001'; end if;
 -- Preserve partial regeneration time; no client-provided time, points or dice.
 v_elapsed := greatest(0,floor(extract(epoch from (clock_timestamp()-v_p.energy_at)))::bigint);
 v_energy := least(v_r.energy_max,v_p.energy + floor(v_elapsed::numeric/v_r.energy_regen_seconds)::integer);
 v_at := case when v_energy>=v_r.energy_max then clock_timestamp()
              else v_p.energy_at + (floor(v_elapsed::numeric/v_r.energy_regen_seconds)::bigint*v_r.energy_regen_seconds)*interval '1 second' end;
 if v_energy<v_a.energy_cost then raise exception 'Insufficient energy' using errcode='P0001'; end if;
 -- Base skill pool is its attribute pips + original bonuses + earned upgrades.
 select coalesce(u.bonus_pips,0) into v_pool from public.character_skill_upgrades u
 where u.character_id=v_c.id and u.skill_id=v_a.skill_id;
 if not found then v_pool:=0; end if;
 v_pool := coalesce((v_c.attribute_pips->>v_a.attr)::integer,3)
           +coalesce((v_c.skill_bonus_pips->>(v_a.skill_id::text))::integer,0)+v_pool;
 if v_pool<1 or v_pool>90 then raise exception 'Invalid dice pool'; end if;
 -- Space D6 convention in this game: every 3 pips = 1d6; remaining pips are flat bonuses.
 for v_die in 1..floor(v_pool/3)::integer loop
   v_roll:=floor(random()*6)::integer+1;
   v_dice:=v_dice||to_jsonb(v_roll);
 end loop;
 v_roll := (select coalesce(sum(value::integer),0) from jsonb_array_elements_text(v_dice) d(value))
         +mod(v_pool,3);
 v_success:=v_roll>=v_a.target_number;
 v_xp:=case when v_success then v_a.xp_success else v_a.xp_failure end;
 v_new_level:=v_p.level;v_new_points:=v_p.upgrade_points;
 -- XP thresholds: 100 for L2, 300 total for L3, 600 total for L4 (base=100).
 while v_new_level<100 loop
   v_threshold:=v_r.xp_level_base::bigint*v_new_level*(v_new_level+1)/2;
   exit when v_p.xp_total+v_xp<v_threshold;
   v_new_level:=v_new_level+1;
   v_new_points:=v_new_points+v_r.skill_points_per_level;
 end loop;
 update public.character_progress set
  energy=v_energy-v_a.energy_cost,energy_at=v_at,
  xp_total=xp_total+v_xp,level=v_new_level,upgrade_points=v_new_points,
  updated_at=clock_timestamp()
 where character_id=v_c.id;
 insert into public.character_action_log(character_id,action_id,dice,roll_total,target_number,succeeded,xp_awarded,energy_spent,level_after)
 values(v_c.id,v_a.id,v_dice,v_roll,v_a.target_number,v_success,v_xp,v_a.energy_cost,v_new_level)
 returning id into v_log;
 return jsonb_build_object('log_id',v_log,'action_id',v_a.id,'dice',v_dice,'pip_bonus',mod(v_pool,3),
  'roll_total',v_roll,'target_number',v_a.target_number,'succeeded',v_success,'xp_awarded',v_xp,
  'xp_total',v_p.xp_total+v_xp,'level',v_new_level,'level_up',v_new_level>v_p.level,
  'upgrade_points',v_new_points,'energy',v_energy-v_a.energy_cost,
  'energy_at',v_at,'server_time',clock_timestamp());
end $$;
revoke all on function private.perform_game_action_impl(text) from public,anon;
grant execute on function private.perform_game_action_impl(text) to authenticated;
create function public.perform_game_action(p_slug text)
 returns jsonb language sql security invoker set search_path=''
 as $$select private.perform_game_action_impl(p_slug)$$;
revoke all on function public.perform_game_action(text) from public,anon;
grant execute on function public.perform_game_action(text) to authenticated;

-- Spending an earned upgrade is a separate locked server-side transaction.
create function private.upgrade_captain_skill_impl(p_skill uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_c uuid;v_p public.character_progress%rowtype;v_bonus integer;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id into v_c from public.characters where user_id=v_uid;
 if v_c is null then raise exception 'Captain not found';end if;
 select * into v_p from public.character_progress where character_id=v_c for update;
 if v_p.upgrade_points<1 then raise exception 'No upgrade points';end if;
 if not exists(select 1 from public.game_skills where id=p_skill) then raise exception 'Invalid skill';end if;
 insert into public.character_skill_upgrades(character_id,skill_id,bonus_pips)
 values(v_c,p_skill,1)
 on conflict(character_id,skill_id) do update set bonus_pips=public.character_skill_upgrades.bonus_pips+1
 where public.character_skill_upgrades.bonus_pips<12
 returning bonus_pips into v_bonus;
 if not found then raise exception 'Skill upgrade limit reached';end if;
 update public.character_progress set upgrade_points=upgrade_points-1,updated_at=clock_timestamp() where character_id=v_c;
 return jsonb_build_object('skill_id',p_skill,'bonus_pips',v_bonus,'upgrade_points',v_p.upgrade_points-1);
end $$;
revoke all on function private.upgrade_captain_skill_impl(uuid) from public,anon;
grant execute on function private.upgrade_captain_skill_impl(uuid) to authenticated;
create function public.upgrade_captain_skill(p_skill uuid) returns jsonb
 language sql security invoker set search_path='' as $$select private.upgrade_captain_skill_impl(p_skill)$$;
revoke all on function public.upgrade_captain_skill(uuid) from public,anon;
grant execute on function public.upgrade_captain_skill(uuid) to authenticated;

-- QA reset: only editor/admin can delete their own captain; not general players.
create function private.reset_test_captain_impl(p_confirmation text) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (select private.can_edit_content()) then raise exception 'Editor permission required' using errcode='42501';end if;
 if p_confirmation<>'RESET' then raise exception 'Explicit RESET confirmation required';end if;
 delete from public.characters where user_id=auth.uid();
end $$;
revoke all on function private.reset_test_captain_impl(text) from public,anon;
grant execute on function private.reset_test_captain_impl(text) to authenticated;
create function public.reset_test_captain(p_confirmation text) returns void
 language sql security invoker set search_path='' as $$select private.reset_test_captain_impl(p_confirmation)$$;
revoke all on function public.reset_test_captain(text) from public,anon;
grant execute on function public.reset_test_captain(text) to authenticated;
