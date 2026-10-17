create or replace function private.secure_d6() returns integer
 language plpgsql volatile security definer set search_path='' as $$
declare b integer;
begin
 loop b:=get_byte(extensions.gen_random_bytes(1),0); exit when b<252;end loop;
 return (b%6)+1;
end $$;
revoke all on function private.secure_d6() from public,anon;

CREATE OR REPLACE FUNCTION private.perform_game_action_impl(p_slug text)
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
   v_roll:=private.secure_d6();
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
end $function$;

CREATE OR REPLACE FUNCTION private.award_action_loot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_drop record;v_qty integer;
begin
 if not new.succeeded then return new; end if;
 for v_drop in
  select d.item_id,d.chance_percent,d.min_qty,d.max_qty
  from public.game_action_loot d
  join public.game_items i on i.id=d.item_id and i.is_published
  where d.action_id=new.action_id
 loop
  if private.cantina_roll(100)>=v_drop.chance_percent then continue;end if;
  v_qty:=v_drop.min_qty+private.cantina_roll(v_drop.max_qty-v_drop.min_qty+1);
  insert into public.character_inventory(character_id,item_id,quantity,updated_at)
   values(new.character_id,v_drop.item_id,v_qty,clock_timestamp())
   on conflict(character_id,item_id) do update
   set quantity=public.character_inventory.quantity+excluded.quantity,updated_at=clock_timestamp();
  insert into public.character_loot_events(character_id,action_log_id,item_id,quantity)
   values(new.character_id,new.id,v_drop.item_id,v_qty);
 end loop;
 return new;
end $function$;