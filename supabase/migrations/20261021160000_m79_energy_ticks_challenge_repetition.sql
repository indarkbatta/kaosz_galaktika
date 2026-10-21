-- M79: shared editable energy ticks and server-enforced challenge repetition.
alter table public.gameplay_rules drop constraint if exists gameplay_rules_energy_max_check;
alter table public.gameplay_rules add constraint gameplay_rules_energy_max_check check(energy_max between 1 and 1000);
alter table public.gameplay_rules alter column energy_max set default 16;
alter table public.gameplay_rules alter column energy_regen_seconds set default 3600;
alter table public.gameplay_rules add column if not exists energy_per_tick integer not null default 1 check(energy_per_tick between 1 and 1000);
grant update(energy_per_tick) on public.gameplay_rules to authenticated;
alter table public.character_progress alter column energy set default 16;
-- Settle the old regeneration rate before changing tick duration or capacity. No retroactive refill.
create or replace function private.settle_energy_rule_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_at timestamptz:=clock_timestamp();
begin
 if (old.energy_max,old.energy_regen_seconds,old.energy_per_tick) is distinct from
 (new.energy_max,new.energy_regen_seconds,new.energy_per_tick) then
  update public.character_progress set energy=least(new.energy_max,old.energy_max,
   energy+floor(greatest(0,extract(epoch from(v_at-energy_at)))/old.energy_regen_seconds)::integer*old.energy_per_tick),
   energy_at=v_at,updated_at=v_at;
 end if;
 new.updated_at:=v_at;return new;
end $$;
revoke all on function private.settle_energy_rule_change() from public,anon,authenticated;
drop trigger if exists settle_energy_rule_change on public.gameplay_rules;
create trigger settle_energy_rule_change before update on public.gameplay_rules
for each row execute function private.settle_energy_rule_change();
update public.gameplay_rules set energy_max=16,energy_regen_seconds=3600,energy_per_tick=1 where id=1;

alter table public.game_skill_challenges add column if not exists repeat_policy text;
alter table public.game_skill_challenges add column if not exists cooldown_ticks integer;
update public.game_skill_challenges set repeat_policy=case when repeatable then 'unlimited' else 'once' end where repeat_policy is null;
update public.game_skill_challenges set cooldown_ticks=ceil(cooldown_hours*3600.0/(select energy_regen_seconds from public.gameplay_rules where id=1))::integer where cooldown_ticks is null;
alter table public.game_skill_challenges alter column repeat_policy set default 'until_success';
alter table public.game_skill_challenges alter column repeat_policy set not null;
alter table public.game_skill_challenges alter column cooldown_ticks set default 1;
alter table public.game_skill_challenges alter column cooldown_ticks set not null;
alter table public.game_skill_challenges drop constraint if exists skill_challenge_repeat_policy;
alter table public.game_skill_challenges add constraint skill_challenge_repeat_policy check(repeat_policy in ('once','until_completed','until_success','unlimited'));
alter table public.game_skill_challenges drop constraint if exists skill_challenge_cooldown_ticks;
alter table public.game_skill_challenges add constraint skill_challenge_cooldown_ticks check(cooldown_ticks between 0 and 8760);
alter table public.character_skill_challenge_runs add column if not exists retry_available_at timestamptz;
-- Existing completed runs keep their original hours-based cooldown; do not alter outcomes or rewards.
update public.character_skill_challenge_runs r set retry_available_at=r.finished_at+make_interval(hours=>c.cooldown_hours)
from public.game_skill_challenges c where r.challenge_id=c.id and r.finished_at is not null and r.retry_available_at is null;

create or replace function private.challenge_repeat_blocked(p_policy text,p_any boolean,p_completed boolean,p_success boolean)
returns boolean language sql immutable set search_path='' as $$
select case p_policy when 'once' then p_any when 'until_completed' then p_completed
 when 'until_success' then p_success when 'unlimited' then false else true end
$$;
revoke all on function private.challenge_repeat_blocked(text,boolean,boolean,boolean) from public,anon,authenticated;

create or replace function private.skill_challenge_availability(p_character uuid,p_challenge uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.game_skill_challenges%rowtype;v_any boolean;v_completed boolean;v_success boolean;
 v_until timestamptz;v_reason text;v_here uuid;
begin
 select * into c from public.game_skill_challenges where id=p_challenge and is_published;
 if not found then return jsonb_build_object('challenge_id',p_challenge,'can_start',false,'reason','unavailable');end if;
 select coalesce(bool_or(status<>'active'),false),coalesce(bool_or(status in ('partial','success')),false),
 coalesce(bool_or(status='success'),false),max(retry_available_at) into v_any,v_completed,v_success,v_until
 from public.character_skill_challenge_runs where character_id=p_character and challenge_id=p_challenge;
 select location_id into v_here from public.character_positions where character_id=p_character;
 v_reason:=case
 when exists(select 1 from public.character_skill_challenge_runs where character_id=p_character and status='active') then 'active'
 when v_here is distinct from c.location_id then 'location'
 when private.challenge_repeat_blocked(c.repeat_policy,v_any,v_completed,v_success) then 'completed'
 when v_until>clock_timestamp() then 'cooldown' else null end;
 return jsonb_build_object('challenge_id',p_challenge,'can_start',v_reason is null,'reason',v_reason,
 'cooldown_until',v_until,'cooldown_ticks',c.cooldown_ticks,'repeat_policy',c.repeat_policy,
 'tick_seconds',(select energy_regen_seconds from public.gameplay_rules where id=1));
end $$;
revoke all on function private.skill_challenge_availability(uuid,uuid) from public,anon,authenticated;
create or replace function private.get_skill_challenge_availability_impl() returns jsonb
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
 select id into cid from public.characters where user_id=auth.uid();
 if cid is null then raise exception 'Captain required';end if;
 return coalesce((select jsonb_agg(private.skill_challenge_availability(cid,id)) from public.game_skill_challenges where is_published),'[]'::jsonb);
end $$;
revoke all on function private.get_skill_challenge_availability_impl() from public,anon;
grant execute on function private.get_skill_challenge_availability_impl() to authenticated;
create or replace function public.get_skill_challenge_availability() returns jsonb
language sql security invoker set search_path='' as $$select private.get_skill_challenge_availability_impl()$$;
revoke all on function public.get_skill_challenge_availability() from public,anon;
grant execute on function public.get_skill_challenge_availability() to authenticated;

CREATE OR REPLACE FUNCTION private.travel_to_location_impl(p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid();
 v_id uuid;v_position public.character_positions%rowtype;
 v_progress public.character_progress%rowtype;
 v_rules public.gameplay_rules%rowtype;
 v_cost integer;v_elapsed bigint;v_energy integer;v_at timestamptz;
 v_discovered boolean;v_log bigint;v_now timestamptz:=clock_timestamp();
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id into v_id from public.characters where user_id=v_uid;
 if v_id is null then raise exception 'Captain required' using errcode='P0001';end if;
 select * into v_progress from public.character_progress where character_id=v_id for update;
 if not found then raise exception 'Missing progress' using errcode='P0001';end if;
 if not coalesce((private.ship_status(v_id)->>'ready')::boolean,false) then raise exception 'Ship is not ready: check required systems, crew and reactor power';end if;
 select * into v_position from public.character_positions where character_id=v_id for update;
 if not found then raise exception 'Missing position' using errcode='P0001';end if;
 if v_position.location_id=p_target then raise exception 'Already at destination' using errcode='P0001';end if;
 select * into strict v_rules from public.gameplay_rules where id=1;
 select r.energy_cost into v_cost
 from public.game_routes r
 join public.game_locations origin on origin.id=r.origin_id
 join public.game_locations dest on dest.id=r.destination_id
 where r.is_published and origin.is_published and dest.is_published
 and ((r.origin_id=v_position.location_id and r.destination_id=p_target)
   or (r.destination_id=v_position.location_id and r.origin_id=p_target))
 order by r.energy_cost asc limit 1;
 if v_cost is null then raise exception 'No direct route to destination' using errcode='P0001';end if;
 v_cost:=greatest(1,ceil(v_cost::numeric * (private.ship_status(v_id)->>'base_speed')::numeric / (private.ship_status(v_id)->>'speed')::numeric)::integer);
 v_elapsed:=greatest(0,floor(extract(epoch from (v_now-v_progress.energy_at)))::bigint);
 v_energy:=least(v_rules.energy_max,v_progress.energy+floor(v_elapsed::numeric/v_rules.energy_regen_seconds)::integer*v_rules.energy_per_tick);
 v_at:=case when v_energy>=v_rules.energy_max then v_now
            else v_progress.energy_at+(floor(v_elapsed::numeric/v_rules.energy_regen_seconds)::bigint
                        *v_rules.energy_regen_seconds)*interval '1 second' end;
 if v_energy<v_cost then raise exception 'Insufficient energy' using errcode='P0001';end if;
 update public.character_progress set energy=v_energy-v_cost,energy_at=v_at,updated_at=v_now where character_id=v_id;
 update public.character_positions set location_id=p_target,arrived_at=v_now where character_id=v_id;
 insert into public.character_location_discoveries(character_id,location_id)
 values(v_id,p_target) on conflict do nothing;
 v_discovered:=found;
 insert into public.character_travel_log(character_id,origin_id,destination_id,energy_spent,traveled_at)
 values(v_id,v_position.location_id,p_target,v_cost,v_now) returning id into v_log;
 return jsonb_build_object('log_id',v_log,'from',v_position.location_id,'to',p_target,
 'discovered',v_discovered,'energy',v_energy-v_cost,'energy_at',v_at,
 'energy_spent',v_cost,'server_time',v_now);
end $function$;

CREATE OR REPLACE FUNCTION private.hire_cantina_impl(p_candidate uuid, p_position text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid;c public.character_cantina_candidates%rowtype;previous text;
e integer;elapsed bigint;regen_at timestamptz;now_at timestamptz:=clock_timestamp();
cfg public.gameplay_rules%rowtype;p public.character_progress%rowtype;cost integer;
begin
if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
if p_position is null or p_position not in ('pilot','navigator','engineer','security','medic')
then raise exception 'Invalid crew position';end if;
select id into cid from public.characters where user_id=auth.uid();
if cid is null then raise exception 'Captain required';end if;
select * into p from public.character_progress where character_id=cid for update;
if not found then raise exception 'Missing progress';end if;
if not exists(select 1 from public.character_positions loc join public.game_locations l on l.id=loc.location_id
where loc.character_id=cid and l.slug='frontier_station') then raise exception 'Cantina is only accessible at Frontier Station';end if;
perform private.ensure_cantina_roster(cid);
select * into c from public.character_cantina_candidates where id=p_candidate and character_id=cid for update;
if not found then raise exception 'Candidate not available';end if;
if (select count(*) from public.character_crew where character_id=cid)>=24 then raise exception 'Crew roster full';end if;
if c.template_id is not null and exists(select 1 from public.game_crew_templates t where t.id=c.template_id and t.max_per_character>0 and t.max_per_character<=(select count(*) from public.character_crew where character_id=cid and template_id=t.id)) then raise exception 'Unique crew limit reached';end if;
cost:=20;
select * into strict cfg from public.gameplay_rules where id=1;
elapsed:=greatest(0,floor(extract(epoch from(now_at-p.energy_at)))::bigint);
e:=least(cfg.energy_max,p.energy+floor(elapsed::numeric/cfg.energy_regen_seconds)::integer*cfg.energy_per_tick);
regen_at:=case when e>=cfg.energy_max then now_at else
p.energy_at+(floor(elapsed::numeric/cfg.energy_regen_seconds)::bigint*cfg.energy_regen_seconds)*interval '1 second' end;
if e<cost then raise exception 'Insufficient energy';end if;
update public.character_progress set energy=e-cost,energy_at=regen_at,updated_at=now_at where character_id=cid;
insert into public.character_crew(character_id,position,name,specialty,aptitude,species_slug,class_id,template_id,portrait_path,rarity,biography,hull_bonus,shield_bonus,damage_bonus,speed_bonus)
values(cid,c.specialty,c.name,c.specialty,c.aptitude,c.species_slug,c.class_id,c.template_id,c.portrait_path,c.rarity,c.biography,c.hull_bonus,c.shield_bonus,c.damage_bonus,c.speed_bonus);
insert into public.character_recruit_log(character_id,candidate_name,assigned_position,replaced_name,energy_cost)
values(cid,c.name,c.specialty,previous,cost);
delete from public.character_cantina_candidates where id=c.id and character_id=cid;
return jsonb_build_object('name',c.name,'position',c.specialty,'replaced',previous,'energy_spent',cost,'energy',e-cost);
end $function$;

CREATE OR REPLACE FUNCTION private.perform_game_action_once_impl(p_slug text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 v_details jsonb;v_existing public.character_action_log%rowtype;
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
 if p_request_id is not null then
 select * into v_existing from public.character_action_log where character_id=v_c.id and request_id=p_request_id;
 if found then
  if v_existing.action_id is distinct from (select id from public.game_actions where slug=p_slug) then raise exception 'Request belongs to another action';end if;
  return to_jsonb(v_existing)||jsonb_build_object('log_id',v_existing.id,'level_up',false);
 end if;
 end if;
 select * into strict v_r from public.gameplay_rules where id=1;
 select a.id,a.energy_cost,a.target_number,a.xp_success,a.xp_failure,s.id as skill_id,s.attribute::text as attr
 into v_a from public.game_actions a join public.game_skills s on s.id=a.skill_id
 where a.slug=p_slug and a.is_published;
 if not found then raise exception 'Unknown action' using errcode='P0001'; end if;
 -- Preserve partial regeneration time; no client-provided time, points or dice.
 v_elapsed := greatest(0,floor(extract(epoch from (clock_timestamp()-v_p.energy_at)))::bigint);
 v_energy := least(v_r.energy_max,v_p.energy + floor(v_elapsed::numeric/v_r.energy_regen_seconds)::integer*v_r.energy_per_tick);
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
 v_details:=private.roll_space_d6(v_pool);v_dice:=v_details->'dice';
 v_roll:=(v_details->>'roll_total')::integer;
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
 insert into public.character_action_log(character_id,action_id,dice,roll_total,target_number,succeeded,xp_awarded,energy_spent,level_after,pip_bonus,request_id,wild_dice,wild_cancelled_index,wild_penalty,wild_rule)
 values(v_c.id,v_a.id,v_dice,v_roll,v_a.target_number,v_success,v_xp,v_a.energy_cost,v_new_level,mod(v_pool,3),p_request_id,v_details->'wild_dice',(v_details->>'wild_cancelled_index')::integer,(v_details->>'wild_penalty')::integer,v_details->>'wild_rule')
 returning id into v_log;
 return v_details||jsonb_build_object('log_id',v_log,'action_id',v_a.id,'dice',v_dice,'pip_bonus',mod(v_pool,3),
  'roll_total',v_roll,'target_number',v_a.target_number,'succeeded',v_success,'xp_awarded',v_xp,
  'xp_total',v_p.xp_total+v_xp,'level',v_new_level,'level_up',v_new_level>v_p.level,
  'upgrade_points',v_new_points,'energy',v_energy-v_a.energy_cost,
  'energy_at',v_at,'server_time',clock_timestamp());
end $function$;

CREATE OR REPLACE FUNCTION private.roll_skill_challenge_impl(p_run uuid, p_step_index integer, p_skill uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_c public.characters%rowtype;v_p public.character_progress%rowtype;
 v_run public.character_skill_challenge_runs%rowtype;v_rules public.gameplay_rules%rowtype;
 v_details jsonb;v_step jsonb;v_skill_attr text;v_pool integer;v_dice jsonb:='[]'::jsonb;
 v_i integer;v_die integer;v_roll integer;v_total integer;v_tn integer;v_cost integer;
 v_modifier integer;v_multiplier integer;v_elapsed bigint;v_energy integer;v_at timestamptz;
 v_new_step integer;v_new_success integer;v_status text:='active';v_xp integer:=0;
 v_new_level integer;v_new_points integer;v_threshold bigint;v_step_count integer;
 v_finished_at timestamptz;v_retry_at timestamptz;v_reward uuid;v_reward_qty integer:=0;
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
 v_energy:=least(v_rules.energy_max,v_p.energy+floor(v_elapsed::numeric/v_rules.energy_regen_seconds)::integer*v_rules.energy_per_tick);
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
 v_details:=private.roll_space_d6(v_pool);v_dice:=v_details->'dice';
 v_total:=(v_details->>'roll_total')::integer;
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
  roll_total,target_number,succeeded,energy_spent,wild_dice,wild_cancelled_index,wild_penalty,wild_rule)
 values(v_run.id,v_c.id,v_run.step_index,p_skill,v_dice,mod(v_pool,3),v_total,v_tn,v_total>=v_tn,v_cost,v_details->'wild_dice',(v_details->>'wild_cancelled_index')::integer,(v_details->>'wild_penalty')::integer,v_details->>'wild_rule');
 if v_status<>'active' then
  v_finished_at:=clock_timestamp();
  v_retry_at:=v_finished_at+make_interval(secs=>coalesce((v_run.definition->>'cooldown_ticks')::integer,
   (select cooldown_ticks from public.game_skill_challenges where id=v_run.challenge_id),0)*v_rules.energy_regen_seconds);
 end if;
 update public.character_skill_challenge_runs
 set step_index=v_new_step,successes=v_new_success,status=v_status,xp_awarded=xp_awarded+v_xp,
 reward_item_id=v_reward,reward_qty=v_reward_qty,
 finished_at=v_finished_at,retry_available_at=v_retry_at
 where id=v_run.id;
 return v_details||jsonb_build_object('run_id',v_run.id,'step_index',v_run.step_index,'next_step',v_new_step,
 'dice',v_dice,'pip_bonus',mod(v_pool,3),'roll_total',v_total,'target_number',v_tn,
 'succeeded',v_total>=v_tn,'successes',v_new_success,'status',v_status,
 'retry_available_at',v_retry_at,'xp_awarded',v_xp,'level',v_new_level,'level_up',v_new_level>v_p.level,
 'energy',v_energy-v_cost,'reward_item_id',v_reward,'reward_qty',v_reward_qty);
end $function$;

CREATE OR REPLACE FUNCTION private.start_skill_challenge_impl(p_slug text, p_difficulty text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_c uuid;v_p public.character_progress%rowtype;
 v_ch public.game_skill_challenges%rowtype;v_availability jsonb;v_prev record;v_active uuid;v_here uuid;v_id uuid;
begin
 if v_uid is null then raise exception 'Login required' using errcode='42501';end if;
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
 v_availability:=private.skill_challenge_availability(v_c,v_ch.id);
 if not (v_availability->>'can_start')::boolean then
  raise exception 'Challenge unavailable: %',v_availability->>'reason' using errcode='P0001';
 end if;
 insert into public.character_skill_challenge_runs(character_id,challenge_id,definition,difficulty,level_at_start)
 values(v_c,v_ch.id,jsonb_build_object('steps',v_ch.steps,'xp_full',v_ch.xp_full,
  'xp_partial',v_ch.xp_partial,'xp_failure',v_ch.xp_failure,
  'reward_item_id',v_ch.reward_item_id,'reward_qty',v_ch.reward_qty,
  'location_id',v_ch.location_id,'cooldown_ticks',v_ch.cooldown_ticks,'repeat_policy',v_ch.repeat_policy),v_ch.difficulty,v_p.level)
 returning id into v_id;
 return jsonb_build_object('run_id',v_id,'level',v_p.level,'difficulty',v_ch.difficulty);
end $function$;
notify pgrst,'reload schema';
