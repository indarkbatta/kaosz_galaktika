-- M77 Multi-step skill challenges. Server-authoritative, persistently resumable Space D6.
-- All definitions are editor managed, all runs and rolls are owned by the authenticated player.
create table public.game_skill_challenges(
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check(slug~'^[a-z][a-z0-9_]*$'),
 location_id uuid not null references public.game_locations(id) on delete restrict,
 name_hu text not null, name_en text not null,
 description_hu text not null default '', description_en text not null default '',
 steps jsonb not null default '[]'::jsonb,
 xp_full integer not null default 75 check(xp_full between 0 and 10000),
 xp_partial integer not null default 30 check(xp_partial between 0 and 10000),
 xp_failure integer not null default 10 check(xp_failure between 0 and 10000),
 reward_item_id uuid references public.game_items(id) on delete set null,
 reward_qty integer not null default 1 check(reward_qty between 1 and 100),
 repeatable boolean not null default false,
 cooldown_hours integer not null default 24 check(cooldown_hours between 0 and 8760),
 is_published boolean not null default false,
 sort_order integer not null default 0
);
create index skill_challenges_location on public.game_skill_challenges(location_id,is_published,sort_order);

-- Skills/steps are validated on write, rather than trusted at run time.
create function private.validate_skill_challenge_steps() returns trigger
language plpgsql security definer set search_path='' as $$
declare st jsonb; v_id text; v_count integer; v_seen text[]; v_i integer;
begin
 if length(btrim(new.name_hu))=0 or length(btrim(new.name_en))=0 or
    length(new.name_hu)>120 or length(new.name_en)>120 or
    length(new.description_hu)>1200 or length(new.description_en)>1200
 then raise exception 'Invalid challenge translations' using errcode='22023';end if;
 if jsonb_typeof(new.steps) is distinct from 'array' or
    jsonb_array_length(new.steps) not between 2 and 8 then
    raise exception 'Challenge requires 2 to 8 steps' using errcode='22023';end if;
 v_i:=0;
 for st in select value from jsonb_array_elements(new.steps) loop
   v_i:=v_i+1;v_seen:='{}'::text[];
   if jsonb_typeof(st) is distinct from 'object'
    or jsonb_typeof(st->'skill_ids') is distinct from 'array'
    or jsonb_array_length(st->'skill_ids') not between 1 and 3
    or coalesce((st->>'base_tn')::integer,0) not between 4 and 80
    or coalesce((st->>'energy_cost')::integer,0) not between 1 and 100
    or length(btrim(coalesce(st->>'name_hu','')))=0
    or length(btrim(coalesce(st->>'name_en','')))=0
    or length(coalesce(st->>'name_hu',''))>120
    or length(coalesce(st->>'name_en',''))>120
    or length(coalesce(st->>'description_hu',''))>600
    or length(coalesce(st->>'description_en',''))>600
   then raise exception 'Invalid challenge step %',v_i using errcode='22023';end if;
   for v_id in select value from jsonb_array_elements_text(st->'skill_ids') loop
     if v_id=any(v_seen) or not exists(select 1 from public.game_skills where id::text=v_id)
     then raise exception 'Invalid or repeated step skill %',v_id using errcode='22023';end if;
     v_seen:=array_append(v_seen,v_id);
   end loop;
 end loop;
 return new;
end $$;
create trigger validate_skill_challenge before insert or update on public.game_skill_challenges
for each row execute function private.validate_skill_challenge_steps();

create table public.character_skill_challenge_runs(
 id uuid primary key default gen_random_uuid(),
 character_id uuid not null references public.characters(id) on delete cascade,
 challenge_id uuid not null references public.game_skill_challenges(id) on delete restrict,
 definition jsonb not null,
 difficulty text not null check(difficulty in ('easy','normal','hard','extreme')),
 level_at_start integer not null check(level_at_start between 1 and 100),
 step_index integer not null default 0 check(step_index between 0 and 8),
 successes integer not null default 0 check(successes between 0 and 8),
 status text not null default 'active' check(status in ('active','success','partial','failure')),
 xp_awarded integer not null default 0 check(xp_awarded>=0),
 reward_item_id uuid references public.game_items(id) on delete set null,
 reward_qty integer not null default 0 check(reward_qty between 0 and 100),
 started_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz
);
create unique index one_active_skill_challenge_per_character
on public.character_skill_challenge_runs(character_id) where status='active';
create index challenge_run_history on public.character_skill_challenge_runs(character_id,started_at desc);
create table public.character_skill_challenge_rolls(
 id bigint generated always as identity primary key,
 run_id uuid not null references public.character_skill_challenge_runs(id) on delete cascade,
 character_id uuid not null references public.characters(id) on delete cascade,
 step_index integer not null check(step_index between 0 and 7),
 skill_id uuid not null references public.game_skills(id),
 dice jsonb not null,
 pip_bonus integer not null,
 roll_total integer not null,
 target_number integer not null,
 succeeded boolean not null,
 energy_spent integer not null,
 rolled_at timestamptz not null default clock_timestamp(),
 unique(run_id,step_index)
);
create index challenge_rolls_character on public.character_skill_challenge_rolls(character_id,rolled_at desc);

alter table public.game_skill_challenges enable row level security;
alter table public.character_skill_challenge_runs enable row level security;
alter table public.character_skill_challenge_rolls enable row level security;
create policy challenge_select on public.game_skill_challenges for select to authenticated
 using(is_published or (select private.can_edit_content()));
create policy challenge_editor_insert on public.game_skill_challenges for insert to authenticated
 with check((select private.can_edit_content()));
create policy challenge_editor_update on public.game_skill_challenges for update to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy challenge_runs_own on public.character_skill_challenge_runs for select to authenticated
 using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
create policy challenge_rolls_own on public.character_skill_challenge_rolls for select to authenticated
 using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
revoke all on public.game_skill_challenges,public.character_skill_challenge_runs,public.character_skill_challenge_rolls from public,anon,authenticated;
grant select,insert,update on public.game_skill_challenges to authenticated;
grant select on public.character_skill_challenge_runs,public.character_skill_challenge_rolls to authenticated;
grant usage,select on sequence public.character_skill_challenge_rolls_id_seq to service_role;

create function private.start_skill_challenge_impl(p_slug text,p_difficulty text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_c uuid;v_p public.character_progress%rowtype;
 v_ch public.game_skill_challenges%rowtype;v_prev record;v_active uuid;v_here uuid;v_id uuid;
begin
 if v_uid is null then raise exception 'Login required' using errcode='42501';end if;
 if p_difficulty not in ('easy','normal','hard','extreme') or p_difficulty is null
 then raise exception 'Invalid difficulty' using errcode='22023';end if;
 select id into v_c from public.characters where user_id=v_uid;
 if v_c is null then raise exception 'Create a captain first' using errcode='P0001';end if;
 -- Every start/step request obtains this progress lock first to prevent races.
 select * into v_p from public.character_progress where character_id=v_c for update;
 select id into v_active from public.character_skill_challenge_runs
 where character_id=v_c and status='active' limit 1;
 if v_active is not null then raise exception 'Finish your current challenge first' using errcode='P0001';end if;
 select * into v_ch from public.game_skill_challenges where slug=p_slug and is_published;
 if not found then raise exception 'Challenge is unavailable' using errcode='P0001';end if;
 select location_id into v_here from public.character_positions where character_id=v_c;
 if v_here is distinct from v_ch.location_id then
  raise exception 'You must be at the challenge location' using errcode='P0001';end if;
 select status,finished_at into v_prev from public.character_skill_challenge_runs
 where character_id=v_c and challenge_id=v_ch.id and status<>'active'
 order by finished_at desc limit 1;
 if found then
  if not v_ch.repeatable then raise exception 'Challenge already completed' using errcode='P0001';end if;
  if v_prev.finished_at + make_interval(hours=>v_ch.cooldown_hours)>clock_timestamp() then
   raise exception 'Challenge cooldown has not finished' using errcode='P0001';end if;
 end if;
 insert into public.character_skill_challenge_runs(character_id,challenge_id,definition,difficulty,level_at_start)
 values(v_c,v_ch.id,jsonb_build_object('steps',v_ch.steps,'xp_full',v_ch.xp_full,
  'xp_partial',v_ch.xp_partial,'xp_failure',v_ch.xp_failure,
  'reward_item_id',v_ch.reward_item_id,'reward_qty',v_ch.reward_qty,
  'location_id',v_ch.location_id),p_difficulty,v_p.level)
 returning id into v_id;
 return jsonb_build_object('run_id',v_id,'level',v_p.level,'difficulty',p_difficulty);
end $$;
revoke all on function private.start_skill_challenge_impl(text,text) from public,anon;
grant execute on function private.start_skill_challenge_impl(text,text) to authenticated;
create function public.start_skill_challenge(p_slug text,p_difficulty text)
returns jsonb language sql security invoker set search_path=''
as $$select private.start_skill_challenge_impl(p_slug,p_difficulty)$$;
revoke all on function public.start_skill_challenge(text,text) from public,anon;
grant execute on function public.start_skill_challenge(text,text) to authenticated;

create function private.roll_skill_challenge_impl(p_run uuid,p_step_index integer,p_skill uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_c public.characters%rowtype;v_p public.character_progress%rowtype;
 v_run public.character_skill_challenge_runs%rowtype;v_rules public.gameplay_rules%rowtype;
 v_step jsonb;v_skill_attr text;v_pool integer;v_dice jsonb:='[]'::jsonb;
 v_i integer;v_die integer;v_roll integer;v_total integer;v_tn integer;v_cost integer;
 v_modifier integer;v_multiplier integer;v_elapsed bigint;v_energy integer;v_at timestamptz;
 v_new_step integer;v_new_success integer;v_status text:='active';v_xp integer:=0;
 v_new_level integer;v_new_points integer;v_threshold bigint;v_step_count integer;
 v_reward uuid;v_reward_qty integer:=0;
begin
 if v_uid is null then raise exception 'Login required' using errcode='42501';end if;
 select * into v_c from public.characters where user_id=v_uid;
 if not found then raise exception 'Captain not found' using errcode='P0001';end if;
 select * into v_p from public.character_progress where character_id=v_c.id for update;
 if not found then raise exception 'Progress not found' using errcode='P0001';end if;
 select * into v_run from public.character_skill_challenge_runs
 where id=p_run and character_id=v_c.id for update;
 if not found or v_run.status<>'active' or v_run.step_index<>p_step_index
 then raise exception 'Challenge step is stale or already resolved' using errcode='P0001';end if;
 if (select location_id from public.character_positions where character_id=v_c.id)
    is distinct from (v_run.definition->>'location_id')::uuid then
  raise exception 'Return to the challenge location to continue' using errcode='P0001';end if;
 v_step_count:=jsonb_array_length(v_run.definition->'steps');
 v_step:=v_run.definition->'steps'->v_run.step_index;
 if v_step is null or not exists(select 1 from jsonb_array_elements_text(v_step->'skill_ids') s(value)
 where s.value=p_skill::text) then
  raise exception 'Invalid skill for this step' using errcode='22023';end if;
 select attribute::text into v_skill_attr from public.game_skills where id=p_skill;
 if not found then raise exception 'Unknown skill' using errcode='22023';end if;
 v_cost:=(v_step->>'energy_cost')::integer;
 select * into strict v_rules from public.gameplay_rules where id=1;
 v_elapsed:=greatest(0,floor(extract(epoch from (clock_timestamp()-v_p.energy_at)))::bigint);
 v_energy:=least(v_rules.energy_max,v_p.energy+floor(v_elapsed::numeric/v_rules.energy_regen_seconds)::integer);
 v_at:=case when v_energy>=v_rules.energy_max then clock_timestamp()
 else v_p.energy_at+(floor(v_elapsed::numeric/v_rules.energy_regen_seconds)::bigint*v_rules.energy_regen_seconds)*interval '1 second' end;
 if v_energy<v_cost then raise exception 'Insufficient energy' using errcode='P0001';end if;
 select coalesce(bonus_pips,0) into v_pool from public.character_skill_upgrades
 where character_id=v_c.id and skill_id=p_skill;
 if not found then v_pool:=0;end if;
 v_pool:=coalesce((v_c.attribute_pips->>v_skill_attr)::integer,3)
   +coalesce((v_c.skill_bonus_pips->>(p_skill::text))::integer,0)+v_pool;
 if v_pool not between 1 and 90 then raise exception 'Invalid dice pool' using errcode='22023';end if;
 -- Never use client-provided die rolls or stats.
 for v_i in 1..floor(v_pool/3)::integer loop
   v_die:=private.secure_d6();
   v_dice:=v_dice||to_jsonb(v_die);
 end loop;
 v_total:=(select coalesce(sum(value::integer),0) from jsonb_array_elements_text(v_dice) d(value))
  +mod(v_pool,3);
 v_modifier:=case v_run.difficulty when 'easy' then -2 when 'hard' then 3 when 'extreme' then 6 else 0 end;
 v_multiplier:=case v_run.difficulty when 'easy' then 75 when 'hard' then 150 when 'extreme' then 200 else 100 end;
 v_tn:=greatest(4,(v_step->>'base_tn')::integer+floor((v_run.level_at_start-1)/5.0)::integer+v_modifier);
 v_new_step:=v_run.step_index+1;
 v_new_success:=v_run.successes+case when v_total>=v_tn then 1 else 0 end;
 v_new_level:=v_p.level;v_new_points:=v_p.upgrade_points;
 if v_new_step=v_step_count then
   v_status:=case
      when v_new_success>=ceil(v_step_count*0.75)::integer then 'success'
      when v_new_success>=ceil(v_step_count*0.50)::integer then 'partial'
      else 'failure' end;
   v_xp:=case v_status when 'success' then (v_run.definition->>'xp_full')::integer
     when 'partial' then (v_run.definition->>'xp_partial')::integer
     else (v_run.definition->>'xp_failure')::integer end;
   v_xp:=floor(v_xp*v_multiplier/100.0)::integer;
   while v_new_level<100 loop
     v_threshold:=v_rules.xp_level_base::bigint*v_new_level*(v_new_level+1)/2;
     exit when v_p.xp_total+v_xp<v_threshold;
     v_new_level:=v_new_level+1;
     v_new_points:=v_new_points+v_rules.skill_points_per_level;
   end loop;
   if v_status='success' then
     v_reward:=(v_run.definition->>'reward_item_id')::uuid;
     if v_reward is not null and exists(select 1 from public.game_items where id=v_reward and is_published) then
       v_reward_qty:=coalesce((v_run.definition->>'reward_qty')::integer,0);
       if v_reward_qty>0 then
        insert into public.character_inventory(character_id,item_id,quantity,updated_at)
        values(v_c.id,v_reward,v_reward_qty,clock_timestamp())
        on conflict(character_id,item_id) do update
        set quantity=public.character_inventory.quantity+excluded.quantity,updated_at=clock_timestamp();
       end if;
     else v_reward:=null;end if;
   end if;
 end if;
 update public.character_progress set energy=v_energy-v_cost,energy_at=v_at,
 xp_total=xp_total+v_xp,level=v_new_level,upgrade_points=v_new_points,updated_at=clock_timestamp()
 where character_id=v_c.id;
 insert into public.character_skill_challenge_rolls(run_id,character_id,step_index,skill_id,dice,pip_bonus,
  roll_total,target_number,succeeded,energy_spent)
 values(v_run.id,v_c.id,v_run.step_index,p_skill,v_dice,mod(v_pool,3),v_total,v_tn,v_total>=v_tn,v_cost);
 update public.character_skill_challenge_runs
 set step_index=v_new_step,successes=v_new_success,status=v_status,xp_awarded=xp_awarded+v_xp,
 reward_item_id=v_reward,reward_qty=v_reward_qty,
 finished_at=case when v_status='active' then null else clock_timestamp() end
 where id=v_run.id;
 return jsonb_build_object('run_id',v_run.id,'step_index',v_run.step_index,'next_step',v_new_step,
 'dice',v_dice,'pip_bonus',mod(v_pool,3),'roll_total',v_total,'target_number',v_tn,
 'succeeded',v_total>=v_tn,'successes',v_new_success,'status',v_status,
 'xp_awarded',v_xp,'level',v_new_level,'level_up',v_new_level>v_p.level,
 'energy',v_energy-v_cost,'reward_item_id',v_reward,'reward_qty',v_reward_qty);
end $$;
revoke all on function private.roll_skill_challenge_impl(uuid,integer,uuid) from public,anon;
grant execute on function private.roll_skill_challenge_impl(uuid,integer,uuid) to authenticated;
create function public.roll_skill_challenge(p_run uuid,p_step_index integer,p_skill uuid)
returns jsonb language sql security invoker set search_path=''
as $$select private.roll_skill_challenge_impl(p_run,p_step_index,p_skill)$$;
revoke all on function public.roll_skill_challenge(uuid,integer,uuid) from public,anon;
grant execute on function public.roll_skill_challenge(uuid,integer,uuid) to authenticated;

-- Two introductory missions, one at the starting station and one at the wreck field.
insert into public.game_skill_challenges(
 slug,location_id,name_hu,name_en,description_hu,description_en,
 steps,xp_full,xp_partial,xp_failure,is_published,sort_order
)
select 'silent_relay',l.id,'A néma adóállomás','The Silent Relay',
 'Egy elnémult átjátszó még mindig ismeretlen jeleket sugároz. Négy szakterületre lesz szükséged.',
 'A silent relay still emits unknown signals. Four skills will be tested.',
 jsonb_build_array(
 jsonb_build_object('name_hu','Ismeretlen jel','name_en','Unknown Signal','description_hu','Fejtsd meg a zavaros adást.','description_en','Decode the noisy transmission.',
  'skill_ids',(select jsonb_agg(id::text) from public.game_skills where slug in ('analysis','research')),'base_tn',9,'energy_cost',6),
 jsonb_build_object('name_hu','Törmelékfolyosó','name_en','Debris Corridor','description_hu','Találj utat a roncsok között.','description_en','Plot a path through the debris.',
  'skill_ids',(select jsonb_agg(id::text) from public.game_skills where slug in ('navigation','reflexes')),'base_tn',10,'energy_cost',7),
 jsonb_build_object('name_hu','Újraindítás','name_en','Reactivation','description_hu','Indítsd újra a sérült rendszert.','description_en','Restore the damaged system.',
  'skill_ids',(select jsonb_agg(id::text) from public.game_skills where slug in ('engineering','attunement')),'base_tn',11,'energy_cost',8),
 jsonb_build_object('name_hu','Első kapcsolat','name_en','First Contact','description_hu','Értelmezd a választ és reagálj rá.','description_en','Interpret and answer the response.',
  'skill_ids',(select jsonb_agg(id::text) from public.game_skills where slug in ('diplomacy','command')),'base_tn',9,'energy_cost',7)),
 75,30,10,true,10
from public.game_locations l where l.slug='frontier_station'
on conflict(slug) do nothing;

insert into public.game_skill_challenges(
 slug,location_id,name_hu,name_en,description_hu,description_en,
 steps,xp_full,xp_partial,xp_failure,is_published,sort_order
)
select 'derelict_record',l.id,'A roncs utolsó naplója','The Derelict Log',
 'A roncs fedélzeti naplója sérült, a vészjelzés mögött több rejtély lappang.',
 'The wreck log is corrupted and its distress signal hides several mysteries.',
 jsonb_build_array(
 jsonb_build_object('name_hu','Csendes behatolás','name_en','Silent Entry','description_hu','Juss be a sérült hajóba.','description_en','Enter the damaged ship.',
  'skill_ids',(select jsonb_agg(id::text) from public.game_skills where slug in ('stealth','athletics')),'base_tn',10,'energy_cost',7),
 jsonb_build_object('name_hu','Adatmentés','name_en','Data Recovery','description_hu','Helyreállítás vagy elemzés?','description_en','Repair or analyze the data?',
  'skill_ids',(select jsonb_agg(id::text) from public.game_skills where slug in ('engineering','analysis')),'base_tn',11,'energy_cost',8),
 jsonb_build_object('name_hu','A hajónapló megfejtése','name_en','Decipher the Log','description_hu','Tudd meg, mi történt a legénységgel.','description_en','Uncover the crew’s fate.',
  'skill_ids',(select jsonb_agg(id::text) from public.game_skills where slug in ('research','intuition')),'base_tn',10,'energy_cost',7)),
 60,24,8,true,20
from public.game_locations l where l.slug='wreck_field'
on conflict(slug) do nothing;
