-- Linked Postgres integration; all temporary user/content writes are rolled back.
begin;
do $test$
declare uid uuid:=gen_random_uuid();other_uid uuid:=gen_random_uuid();species uuid;power uuid;a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();doc jsonb;saved jsonb;prior jsonb;after_doc jsonb;progress_hash text;
begin
 select id into species from public.game_species s where not exists(select 1 from public.game_talent_trees t where t.species_id=s.id) limit 1;
 select id into power from public.game_powers where is_published limit 1;
 if species is null or power is null then raise exception 'Test requires a free species tree and published power';end if;
 select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.character_id)::text,'')) into progress_hash from public.character_progress p;
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'tree-'||uid||'@example.invalid','{}'),(other_uid,'tree-'||other_uid||'@example.invalid','{}');
 update public.user_roles set role='editor' where user_id=uid;
 doc:=jsonb_build_object('species_id',species,'class_id',null,'width',32,'height',24,'is_published',true,'nodes',jsonb_build_array(
 jsonb_build_object('id',a,'x',1,'y',1,'name_hu','QA passzív','name_en','QA passive','description_hu','SFE bónusz','description_en','Resistance bonus','kind','passive','image_path','hatarvilag/items/qa.webp','effects','[{"type":"modifier","stat":"resistance","key":"kinetic","amount":2,"group":"qa"}]'::jsonb),
 jsonb_build_object('id',b,'x',8,'y',8,'name_hu','QA power','name_en','QA power','kind','power','power_id',power,'effects','[]'::jsonb)),
 'connections',jsonb_build_array(jsonb_build_object('from_node_id',a,'to_node_id',b)));
 perform set_config('request.jwt.claim.sub',uid::text,true);execute 'set local role authenticated';
 saved:=public.save_talent_tree(null,null,doc);
 select value into prior from jsonb_array_elements(public.get_talent_tree_editor_catalog()->'trees') where value->>'id'=saved->>'id';
 if jsonb_array_length(prior->'nodes')<>2 or jsonb_array_length(prior->'connections')<>1 then raise exception 'Tree did not persist';end if;
 begin perform public.save_talent_tree((saved->>'id')::uuid,1,jsonb_set(doc,'{connections}',(doc->'connections')||jsonb_build_array(jsonb_build_object('from_node_id',b,'to_node_id',a))));raise exception 'TEST cycle accepted';exception when raise_exception then if sqlerrm<>'Circular tree connection' then raise;end if;end;
 select value into after_doc from jsonb_array_elements(public.get_talent_tree_editor_catalog()->'trees') where value->>'id'=saved->>'id';if prior is distinct from after_doc then raise exception 'Invalid update changed stored graph';end if;
 saved:=public.save_talent_tree((saved->>'id')::uuid,1,doc);
 begin perform public.save_talent_tree((saved->>'id')::uuid,1,doc);raise exception 'TEST stale update accepted';exception when serialization_failure then null;end;
 begin update public.game_talent_tree_nodes set x=x where tree_id=(saved->>'id')::uuid;raise exception 'TEST direct update accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',other_uid::text,true);
 if exists(select 1 from public.game_talent_trees) then raise exception 'Player read authoring trees';end if;
 begin perform public.get_talent_tree_editor_catalog();raise exception 'TEST player catalog accepted';exception when insufficient_privilege then null;end;
 begin perform public.save_talent_tree(null,null,doc);raise exception 'TEST player save accepted';exception when insufficient_privilege then null;end;
 execute 'set local role postgres';
 if progress_hash is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.character_id)::text,'')) from public.character_progress p) then raise exception 'Authoring changed player progress';end if;
 if has_function_privilege('anon','public.save_talent_tree(uuid,integer,jsonb)','execute') or has_table_privilege('authenticated','public.game_talent_tree_nodes','insert') then raise exception 'Unsafe grants';end if;
end $test$;
rollback;
