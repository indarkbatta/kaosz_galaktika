-- M78: shared encounters, editor difficulty, authoritative Space D6 Wild Die.
-- Rule: D6 Space v2 p55 / introductory adventure p6: initial 1 removes
-- the Wild Die and the highest normal die. Exploding sixes continue until 1..5.
-- Historical rolls remain untouched; NULL wild_rule denotes the legacy system.
alter table public.game_actions add column if not exists image_path text;
alter table public.game_skill_challenges add column if not exists image_path text;
alter table public.game_skill_challenges add column if not exists difficulty text not null default 'normal';
alter table public.character_skill_challenge_runs add column if not exists result_seen_through integer not null default -1;
alter table public.character_action_log add column if not exists request_id uuid;
alter table public.character_action_log add column if not exists pip_bonus integer;
create unique index if not exists action_request_once on public.character_action_log(character_id,request_id) where request_id is not null;
alter table public.game_actions drop constraint if exists game_actions_encounter_image;
alter table public.game_actions add constraint game_actions_encounter_image check(image_path is null or
 (length(image_path)<=300 and image_path ~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$'));
alter table public.game_skill_challenges drop constraint if exists game_skill_challenges_encounter_image;
alter table public.game_skill_challenges add constraint game_skill_challenges_encounter_image check(image_path is null or
 (length(image_path)<=300 and image_path ~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$'));
alter table public.game_skill_challenges drop constraint if exists challenge_difficulty;
alter table public.game_skill_challenges add constraint challenge_difficulty check(difficulty in ('easy','normal','hard','extreme'));
alter table public.character_action_log add column if not exists wild_dice jsonb;
alter table public.character_action_log add column if not exists wild_cancelled_index integer;
alter table public.character_action_log add column if not exists wild_penalty integer;
alter table public.character_action_log add column if not exists wild_rule text;
alter table public.character_skill_challenge_rolls add column if not exists wild_dice jsonb;
alter table public.character_skill_challenge_rolls add column if not exists wild_cancelled_index integer;
alter table public.character_skill_challenge_rolls add column if not exists wild_penalty integer;
alter table public.character_skill_challenge_rolls add column if not exists wild_rule text;

-- Pure evaluator permits deterministic tests without changing the secure RNG.
create or replace function private.resolve_space_d6(p_dice integer[],p_wild integer[],p_pips integer)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_sum integer;v_penalty integer:=0;v_index integer;v_high integer;
begin
 if p_pips not between 0 and 2 or cardinality(p_wild)<>1 and p_wild[1]<>6
 or cardinality(p_wild)<1 or exists(select 1 from unnest(p_dice||p_wild) n where n not between 1 and 6)
 then raise exception 'Invalid dice';end if;
 select coalesce(sum(n),0) into v_sum from unnest(p_dice||p_wild) n;
 if p_wild[1]=1 then
  select n,ord-1 into v_high,v_index from unnest(p_dice) with ordinality d(n,ord) order by n desc,ord limit 1;
  v_penalty:=1+coalesce(v_high,0);
 end if;
 return jsonb_build_object('dice',to_jsonb(p_dice),'wild_dice',to_jsonb(p_wild),
  'wild_cancelled_index',v_index,'wild_penalty',v_penalty,'wild_rule','space_d6_remove_highest_v1',
  'pip_bonus',p_pips,'roll_total',v_sum+p_pips-v_penalty);
end $$;
revoke all on function private.resolve_space_d6(integer[],integer[],integer) from public,anon,authenticated;
create or replace function private.roll_space_d6(p_pool integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_normal integer[]:='{}';v_wild integer[]:='{}';v_die integer;v_i integer;
begin
 if p_pool not between 1 and 90 then raise exception 'Invalid dice pool';end if;
 -- Sub-1D pools retain their legacy pip-only behavior, rather than inventing a die.
 if p_pool<3 then return jsonb_build_object('dice','[]'::jsonb,'wild_dice','[]'::jsonb,
 'wild_penalty',0,'wild_cancelled_index',null,'wild_rule','space_d6_remove_highest_v1',
 'pip_bonus',p_pool,'roll_total',p_pool);end if;
 for v_i in 1..(p_pool/3)-1 loop v_normal:=array_append(v_normal,private.secure_d6());end loop;
 loop
  v_die:=private.secure_d6();v_wild:=array_append(v_wild,v_die);
  exit when v_die<>6;
 end loop;
 return private.resolve_space_d6(v_normal,v_wild,mod(p_pool,3));
end $$;
revoke all on function private.roll_space_d6(integer) from public,anon,authenticated;
create or replace function private.start_skill_challenge_impl(p_slug text,p_difficulty text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_c uuid;v_p public.character_progress%rowtype;
 v_ch public.game_skill_challenges%rowtype;v_prev record;v_active uuid;v_here uuid;v_id uuid;
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
  'location_id',v_ch.location_id),v_ch.difficulty,v_p.level)
 returning id into v_id;
 return jsonb_build_object('run_id',v_id,'level',v_p.level,'difficulty',v_ch.difficulty);
end $$;

create or replace function public.start_skill_challenge(p_slug text)
returns jsonb language sql security invoker set search_path=''
as $$select private.start_skill_challenge_impl(p_slug,null)$$;
revoke all on function public.start_skill_challenge(text) from public,anon;
grant execute on function public.start_skill_challenge(text) to authenticated;
create or replace function private.roll_skill_challenge_impl(p_run uuid,p_step_index integer,p_skill uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_c public.characters%rowtype;v_p public.character_progress%rowtype;
 v_run public.character_skill_challenge_runs%rowtype;v_rules public.gameplay_rules%rowtype;
 v_details jsonb;v_step jsonb;v_skill_attr text;v_pool integer;v_dice jsonb:='[]'::jsonb;
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
 update public.character_skill_challenge_runs
 set step_index=v_new_step,successes=v_new_success,status=v_status,xp_awarded=xp_awarded+v_xp,
 reward_item_id=v_reward,reward_qty=v_reward_qty,
 finished_at=case when v_status='active' then null else clock_timestamp() end
 where id=v_run.id;
 return v_details||jsonb_build_object('run_id',v_run.id,'step_index',v_run.step_index,'next_step',v_new_step,
 'dice',v_dice,'pip_bonus',mod(v_pool,3),'roll_total',v_total,'target_number',v_tn,
 'succeeded',v_total>=v_tn,'successes',v_new_success,'status',v_status,
 'xp_awarded',v_xp,'level',v_new_level,'level_up',v_new_level>v_p.level,
 'energy',v_energy-v_cost,'reward_item_id',v_reward,'reward_qty',v_reward_qty);
end $$;
CREATE OR REPLACE FUNCTION private.perform_game_action_once_impl(p_slug text,p_request_id uuid)
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


revoke all on function private.perform_game_action_once_impl(text,uuid) from public,anon;
grant execute on function private.perform_game_action_once_impl(text,uuid) to authenticated;
create or replace function private.perform_game_action_impl(p_slug text) returns jsonb
language sql security invoker set search_path=''
as $$select private.perform_game_action_once_impl(p_slug,null)$$;
create or replace function public.perform_game_action(p_slug text,p_request_id uuid) returns jsonb
language sql security invoker set search_path=''
as $$select private.perform_game_action_once_impl(p_slug,p_request_id)$$;
revoke all on function public.perform_game_action(text,uuid) from public,anon;
grant execute on function public.perform_game_action(text,uuid) to authenticated;

create or replace function private.acknowledge_challenge_result_impl(p_run uuid,p_step_index integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
 update public.character_skill_challenge_runs r
 set result_seen_through=greatest(r.result_seen_through,p_step_index)
 where r.id=p_run and p_step_index>=0 and p_step_index<r.step_index
 and exists(select 1 from public.characters c where c.id=r.character_id and c.user_id=auth.uid());
 if not found then raise exception 'Invalid result acknowledgement';end if;
end $$;
revoke all on function private.acknowledge_challenge_result_impl(uuid,integer) from public,anon;
grant execute on function private.acknowledge_challenge_result_impl(uuid,integer) to authenticated;
create or replace function public.acknowledge_challenge_result(p_run uuid,p_step_index integer)
returns void language sql security invoker set search_path=''
as $$select private.acknowledge_challenge_result_impl(p_run,p_step_index)$$;
revoke all on function public.acknowledge_challenge_result(uuid,integer) from public,anon;
grant execute on function public.acknowledge_challenge_result(uuid,integer) to authenticated;
notify pgrst,'reload schema';
