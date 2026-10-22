begin;
do $$declare d jsonb;s uuid;c uuid;begin
 select id into s from public.game_species where slug='ember';select id into c from public.game_classes where slug='hadur';
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 execute 'set local role authenticated';d:=public.get_player_talent_trees(s,c);
 if jsonb_array_length(d->'powers')<>9 or jsonb_array_length(d->'skills')<>25 then raise exception 'Missing display metadata';end if;
 if exists(select 1 from jsonb_array_elements(d->'powers') p where not (p->>'is_published')::boolean or not exists(select 1 from jsonb_array_elements(d->'trees') t cross join lateral jsonb_array_elements(t->'nodes') n where n->>'power_id'=p->>'id')) then raise exception 'Unrelated or draft power exposed';end if;
 if exists(select 1 from jsonb_array_elements(d->'skills') k where k->>'name_hu' is null or k->>'name_en' is null) then raise exception 'Missing localized skill names';end if;
 d:=public.get_player_talent_trees(null,null);if jsonb_array_length(d->'powers')<>0 then raise exception 'Unscoped powers exposed';end if;
 execute 'set local role anon';
 begin perform public.get_player_talent_trees(s,c);raise exception 'TEST anonymous access accepted';exception when insufficient_privilege then null;end;
end $$;
rollback;
