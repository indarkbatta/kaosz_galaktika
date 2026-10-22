begin;
do $test$
declare actor jsonb;defender jsonb;power jsonb;state jsonb;result jsonb;event jsonb;check_result jsonb;begin
 actor:=jsonb_build_object('id','attacker','player',false,'level',1,'danger',0,'has_weapon',true,'health',100,'max_health',100,'attributes','{"body":3,"mind":3,"soul":3,"morale":3,"social":3}'::jsonb,'effects','[]'::jsonb,'injuries','{}'::jsonb,'cooldowns','{}'::jsonb,'uses','{}'::jsonb,'turn',1,'action_points',3);
 defender:=actor||jsonb_build_object('id','defender','player',true,'defenses','{"body":20,"mind":20,"soul":20,"morale":20,"social":20}'::jsonb,'skills','{"test_skill":3}'::jsonb,'active_defense',null);
 check_result:=private.combat_defense(defender,'body');
 if check_result<>'{"kind":"passive","target_number":20}'::jsonb then raise exception 'Passive defense is not a fixed TN: %',check_result;end if;
 select to_jsonb(p) into power from public.game_powers p where slug='basic_body';
 if power is null then raise exception 'Missing basic attack';end if;
 actor:=actor||jsonb_build_object('powers',jsonb_build_array(power));
 state:=jsonb_build_object('actors',jsonb_build_array(actor,defender),'current',0,'round',1,'status','active','events','[]'::jsonb,'event_sequence',0,'operation_uses','{}'::jsonb);
 result:=private.combat_resolve_action(state,(power->>'id')::uuid,1);
 select value into event from jsonb_array_elements(result->'events') where value->>'type'='defense';
 if event->>'defense_kind'<>'passive' or (event->>'target_number')::int<>20 or event->'roll'<>'null'::jsonb or (event->>'hit')::boolean then raise exception 'Resolver rolled passive defense: %',event;end if;
 defender:=defender||jsonb_build_object('active_defense','{"id":"test_skill","attribute":"body"}'::jsonb);
 check_result:=private.combat_defense(defender,'body');
 if check_result->>'kind'<>'active' or check_result->'roll'->>'mode'<>'skill' or not(check_result->'roll' ? 'dice') then raise exception 'Active defense no longer rolls';end if;
 check_result:=private.combat_defense(defender,'mind');
 if check_result<>'{"kind":"passive","target_number":20}'::jsonb then raise exception 'Active defense affected a different attribute';end if;
end $test$;
rollback;
