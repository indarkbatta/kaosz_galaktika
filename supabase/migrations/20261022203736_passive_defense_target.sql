-- Passive defense is a fixed target number. Only an activated defensive skill rolls.
create function private.combat_defense(p_actor jsonb,p_attribute text) returns jsonb language plpgsql volatile set search_path='' as $$
declare target integer:=least(900,private.active_defense_pool(p_actor,p_attribute));begin
 if p_actor->'active_defense'->>'attribute'=p_attribute then
  return jsonb_build_object('kind','active','roll',private.combat_roll(target,'skill'));
 end if;
 return jsonb_build_object('kind','passive','target_number',target);
end $$;
revoke all on function private.combat_defense(jsonb,text) from public,anon,authenticated;
do $$declare d text;needle text;begin
 d:=pg_get_functiondef('private.combat_resolve_action(jsonb,uuid,integer)'::regprocedure);
 needle:=$n$defense:=private.combat_roll(least(900,private.active_defense_pool(target,power->>'defense')),case when target->'active_defense'->>'attribute'=power->>'defense' then 'skill' else 'plain' end);$n$;
 if position(needle in d)=0 then raise exception 'Unexpected defense resolver';end if;
 d:=replace(d,needle,$r$defense:=private.combat_defense(target,power->>'defense');$r$);
 d:=replace(d,$n$hit:=(attack->>'roll_total')::int>(defense->>'roll_total')::int;$n$,$r$hit:=(attack->>'roll_total')::int>coalesce((defense->>'target_number')::int,(defense->'roll'->>'roll_total')::int);$r$);
 d:=replace(d,$n$'roll',defense,'hit',hit$n$,$r$'roll',defense->'roll','target_number',defense->'target_number','defense_kind',defense->>'kind','defense_attribute',power->>'defense','hit',hit$r$);
 execute d;
end $$;
