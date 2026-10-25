-- Authoring CRUD only. Referenced content and all player records are preserved.
create function private.equipment_editor_record_action(p_item uuid,p_action text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare source public.game_items; definition public.game_equipment_definitions; new_id uuid:=gen_random_uuid(); table_name text; key_name text; row_data jsonb; dependency record; used boolean; result jsonb;
begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required';end if;
 if p_action not in ('copy','delete') or p_action is null then raise exception 'Invalid record action';end if;
 perform pg_advisory_xact_lock(708154930);
 select * into source from public.game_items where id=p_item for update;
 select * into definition from public.game_equipment_definitions where item_id=p_item for update;
 if source.id is null or definition.item_id is null or definition.kind not in ('component','blueprint') then raise exception 'Equipment editor record not found';end if;
 if definition.revision is distinct from p_revision then raise exception 'Content changed; reload';end if;
 if p_action='copy' then
  row_data:=to_jsonb(source)||jsonb_build_object('id',new_id,'slug',left(source.slug,60)||'_copy_'||substr(new_id::text,1,8),'is_published',false,'created_at',now(),'updated_at',now());
  insert into public.game_items select * from jsonb_populate_record(null::public.game_items,row_data);
  foreach table_name in array array['game_items_i18n','game_item_combat','game_item_recipes','game_item_combat_visuals','game_item_combat_anchors','game_equipment_definitions'] loop
   key_name:=case when table_name='game_item_recipes' then 'output_item_id' else 'item_id' end;
   for row_data in execute format('select to_jsonb(t) from public.%I t where %I=$1',table_name,key_name) using p_item loop
    row_data:=row_data||jsonb_build_object(key_name,new_id,'revision',1,'created_at',now(),'updated_at',now());
    if row_data ? 'id' then row_data:=row_data||jsonb_build_object('id',gen_random_uuid());end if;
    if table_name='game_items_i18n' then row_data:=row_data||jsonb_build_object('name',left(row_data->>'name',60)||case when row_data->>'locale'='en' then ' (copy)' else ' (másolat)' end);end if;
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I,$1)',table_name,table_name) using row_data;
   end loop;
  end loop;
  return jsonb_build_object('id',new_id,'action','copy');
 end if;
 if source.is_published then raise exception 'Unpublish this record before deleting';end if;
 if exists(select 1 from public.game_equipment_definitions d cross join lateral jsonb_array_elements(d.slots) slot where d.item_id<>p_item and (slot->'compatible_item_ids' ? p_item::text or slot->>'selected_item_id'=p_item::text)) then raise exception 'Component is used by a blueprint';end if;
 -- Block every external FK reference, including those whose FK would cascade or SET NULL.
 for dependency in select ns.nspname,rel.relname,att.attname from pg_constraint fk join pg_class rel on rel.oid=fk.conrelid join pg_namespace ns on ns.oid=rel.relnamespace join pg_attribute att on att.attrelid=fk.conrelid and att.attnum=fk.conkey[1] where fk.contype='f' and fk.confrelid='public.game_items'::regclass loop
  if dependency.nspname='public' and (dependency.relname in ('game_items_i18n','game_item_combat','game_item_combat_visuals','game_equipment_definitions') or dependency.relname='game_item_recipes' and dependency.attname='output_item_id') then continue;end if;
  execute format('select exists(select 1 from %I.%I where %I=$1)',dependency.nspname,dependency.relname,dependency.attname) into used using p_item;
  if used then raise exception 'Item is referenced; remove its dependencies before deleting';end if;
 end loop;
 delete from public.game_item_combat_anchors where item_id=p_item;
 delete from public.game_item_combat_visuals where item_id=p_item;
 delete from public.game_equipment_definitions where item_id=p_item;
 delete from public.game_item_combat where item_id=p_item;
 delete from public.game_item_recipes where output_item_id=p_item;
 delete from public.game_items_i18n where item_id=p_item;
 delete from public.game_items where id=p_item;
 return jsonb_build_object('id',p_item,'action','delete');
end $$;
create function public.equipment_editor_record_action(p_item uuid,p_action text,p_revision integer) returns jsonb language sql security invoker set search_path='' as $$select private.equipment_editor_record_action(p_item,p_action,p_revision)$$;
revoke all on function private.equipment_editor_record_action(uuid,text,integer),public.equipment_editor_record_action(uuid,text,integer) from public,anon;
grant execute on function private.equipment_editor_record_action(uuid,text,integer),public.equipment_editor_record_action(uuid,text,integer) to authenticated;
