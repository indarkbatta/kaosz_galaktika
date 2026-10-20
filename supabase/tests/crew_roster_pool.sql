-- Exhausted/unique-only catalog regression; all fixtures and catalog edits roll back.
begin;
do $test$
declare uid uuid:=gen_random_uuid();cid uuid;sid uuid;cl uuid;ship uuid;skill uuid;tid uuid;packet jsonb;candidate uuid;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'crew-pool-'||uid||'@example.invalid','{}');
 select id into sid from public.game_species where is_published limit 1;select id into cl from public.game_classes where is_published limit 1;select id into ship from public.game_starter_ships where slug='sparrow';select id into skill from public.game_skills limit 1;
 perform set_config('request.jwt.claim.sub',uid::text,true);execute 'set local role authenticated';
 cid:=public.create_captain('Pool regression',sid,cl,ship,'{"body":6}',jsonb_build_object(skill::text,6));
 execute 'set local role postgres';update public.game_crew_templates set is_published=false;
 insert into public.game_crew_templates(slug,kind,translations,species_id,class_id,specialty,aptitude,rarity,weight,max_per_character,is_published)
 values('pool_test_'||replace(uid::text,'-',''),'named','{"hu":{"name":"Pool fixture"},"en":{"name":"Pool fixture"}}',sid,cl,'pilot',2,'rare',1,1,true) returning id into tid;
 update public.character_progress set energy=100,energy_at=clock_timestamp() where character_id=cid;
 execute 'set local role authenticated';packet:=public.get_cantina_roster();
 if jsonb_array_length(packet->'candidates')<>1 then raise exception 'Unique-only pool should contain one applicant';end if;
 candidate:=(packet->'candidates'->0->>'id')::uuid;
 if(public.get_cantina_roster()->'candidates'->0->>'id')::uuid<>candidate then raise exception 'Reload rerolled applicant';end if;
 perform public.hire_cantina_candidate(candidate,'pilot');
 if jsonb_array_length(public.get_cantina_roster()->'candidates')<>0 then raise exception 'Owned unique returned to recruitment';end if;
 if(select count(*) from public.character_crew where character_id=cid and template_id=tid)<>1 then raise exception 'Unique crew lost or duplicated';end if;
 execute 'set local role postgres';set constraints all immediate;
end $test$;
rollback;
