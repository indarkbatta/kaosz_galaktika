-- Run after migration. Synthetic character only; transaction leaves no users or state behind.
begin;
do $test$
declare u uuid:=gen_random_uuid();cid uuid;sid uuid;cl uuid;ship uuid;sk uuid;sn uuid;cn uuid;member uuid;party uuid[];sheet jsonb;cfg public.game_rules%rowtype;event uuid:=gen_random_uuid();begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'crew-regression-'||u||'@example.invalid','{}');
 select id into sid from public.game_species where slug='ember';select id into cl from public.game_classes where slug='hadur';
 select id into ship from public.game_starter_ships where is_published limit 1;select id into sk from public.game_skills where slug='engineering';select * into cfg from public.game_rules where id=1;
 select n.id into sn from public.game_talent_tree_nodes n join public.game_talent_trees t on t.id=n.tree_id where t.species_id=sid and n.min_level=1 limit 1;
 select n.id into cn from public.game_talent_tree_nodes n join public.game_talent_trees t on t.id=n.tree_id where t.class_id=cl and n.min_level=1 limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);execute 'set local role authenticated';
 cid:=public.create_captain_with_talents('Crew regression',sid,cl,ship,jsonb_build_object('body',cfg.free_attribute_pips),jsonb_build_object(sk::text,cfg.free_skill_pips),sn,cn);
 select array_agg(id) into party from (select id from public.character_crew where character_id=cid order by id limit 2)x;
 if cardinality(party)<>2 then raise exception 'No starting crew';end if;member:=party[1];
 sheet:=public.set_salvage_party(party);if jsonb_array_length(sheet->'party')<>2 then raise exception 'Party save failed';end if;
 begin perform public.set_salvage_party(array[member,member]);raise exception 'TEST duplicate accepted';exception when raise_exception then if sqlerrm<>'Choose at most two distinct crew members' then raise;end if;end;
 begin perform public.set_salvage_party(array[gen_random_uuid()]);raise exception 'TEST foreign accepted';exception when raise_exception then if sqlerrm<>'Not your crew member' then raise;end if;end;
 execute 'set local role postgres';
 perform private.award_crew_xp(cid,party,300,event);perform private.award_crew_xp(cid,party,300,event);
 sheet:=private.crew_sheet(member);if (sheet->>'level')::int<>3 or (sheet->>'xp')::int<>300 then raise exception 'XP dedupe failed';end if;
 if has_function_privilege('authenticated','private.award_crew_xp(uuid,uuid[],integer,uuid)','execute') or has_function_privilege('anon','public.get_simple_crew()','execute') then raise exception 'Unsafe crew grants';end if;
 if exists(select 1 from public.character_crew where character_id=cid and crew_class_id is null) then raise exception 'New recruit class missing';end if;
end $test$;
rollback;
