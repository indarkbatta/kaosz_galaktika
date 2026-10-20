-- Atomic editor writes; game clients retain read-only catalog grants.
alter table public.game_starter_ships add column revision integer not null default 0;
drop policy ship_slots_read on public.game_ship_slots;
create policy ship_slots_read on public.game_ship_slots for select to authenticated using(
 exists(select 1 from public.game_starter_ships s where s.id=ship_id and
 (s.is_published or (select private.can_edit_content()) or exists(select 1 from public.characters c where c.starter_ship_id=s.id and c.user_id=(select auth.uid())))));
drop policy ships_select on public.game_starter_ships;
create policy ships_select on public.game_starter_ships for select to authenticated using(
 is_published or (select private.can_edit_content()) or exists(select 1 from public.characters c where c.starter_ship_id=game_starter_ships.id and c.user_id=(select auth.uid())));

create function private.get_ship_editor_catalog_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
begin
 if auth.uid() is null or not (select private.can_edit_content()) then raise exception 'Editor permission required' using errcode='42501';end if;
 return jsonb_build_object('ships',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object(
 'translations',(select coalesce(jsonb_agg(to_jsonb(t) order by t.locale),'[]'::jsonb) from public.game_starter_ships_i18n t where t.ship_id=s.id),
 'slots',(select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order),'[]'::jsonb) from public.game_ship_slots x where x.ship_id=s.id)) order by s.slug),'[]'::jsonb) from public.game_starter_ships s),
 'starters',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.game_ship_modules m join public.game_items i on i.id=m.item_id where m.is_starter and i.is_published));
end $fn$;
revoke all on function private.get_ship_editor_catalog_impl() from public,anon;
grant execute on function private.get_ship_editor_catalog_impl() to authenticated;
create function public.get_ship_editor_catalog() returns jsonb language sql security invoker set search_path='' as $fn$select private.get_ship_editor_catalog_impl()$fn$;
revoke all on function public.get_ship_editor_catalog() from public,anon;
grant execute on function public.get_ship_editor_catalog() to authenticated;

create function private.save_game_ship_impl(p_id uuid,p_ship jsonb,p_translations jsonb,p_slots jsonb,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare sid uuid:=coalesce(p_id,gen_random_uuid());r record;new_revision integer;current_revision integer;
 slug_value text;image_value text;hull_value integer;cargo_value integer;speed_value integer;published_value boolean;
begin
 if auth.uid() is null or not (select private.can_edit_content()) then raise exception 'Editor permission required' using errcode='42501';end if;
 if jsonb_typeof(p_ship) is distinct from 'object' or jsonb_typeof(p_translations) is distinct from 'array' or jsonb_typeof(p_slots) is distinct from 'array' then raise exception 'Invalid ship payload';end if;
 if jsonb_array_length(p_slots)>37 or jsonb_array_length(p_translations)>100 then raise exception 'Ship profile too large';end if;
 slug_value:=btrim(p_ship->>'slug');image_value:=nullif(btrim(p_ship->>'image_path'),'');
 hull_value:=(p_ship->>'hull')::integer;cargo_value:=(p_ship->>'cargo')::integer;speed_value:=(p_ship->>'speed')::integer;
 published_value:=coalesce((p_ship->>'is_published')::boolean,false);
 if slug_value is null or slug_value !~ '^[a-z][a-z0-9_]{1,79}$' or hull_value is null or hull_value not between 1 and 100000
 or cargo_value is null or cargo_value not between 0 and 100000 or speed_value is null or speed_value not between 1 and 1000 then raise exception 'Invalid ship values';end if;
 if image_value is not null and (length(image_value)>300 or image_value !~ '^hatarvilag/[A-Za-z0-9_/-]+\.(webp|avif|png|jpg|jpeg)$' or image_value like '%..%') then raise exception 'Invalid ship image path';end if;
 if exists(select 1 from jsonb_array_elements(p_translations) t where jsonb_typeof(t)<>'object') or exists(
 select 1 from jsonb_to_recordset(p_translations) t(locale text,name text,description text) where
 locale is null or not exists(select 1 from public.game_locales l where l.code=t.locale and l.is_enabled)
 or length(btrim(coalesce(name,''))) not between 1 and 100 or length(coalesce(description,''))>4000)
 or (select count(distinct t->>'locale') from jsonb_array_elements(p_translations)t)<>jsonb_array_length(p_translations)
 or not exists(select 1 from jsonb_array_elements(p_translations)t where t->>'locale'='hu' and length(btrim(t->>'name'))>0)
 or not exists(select 1 from jsonb_array_elements(p_translations)t where t->>'locale'='en' and length(btrim(t->>'name'))>0) then raise exception 'Hungarian and English ship names are required; translations must be unique and valid';end if;
 if exists(select 1 from jsonb_array_elements(p_slots) x where jsonb_typeof(x)<>'object') then raise exception 'Invalid ship slot';end if;
 for r in select * from jsonb_to_recordset(p_slots) x(slot_key text,kind text,module_kind text,crew_role text,size integer,min_aptitude integer,required boolean,sort_order integer,name_hu text,name_en text) loop
  if r.slot_key is null or r.slot_key !~ '^[a-z][a-z0-9_]{0,59}$' or r.kind is null or r.kind not in('module','crew')
  or coalesce(r.size,0) not between 1 and 3 or coalesce(r.min_aptitude,0) not between 1 and 5 or r.required is null
  or coalesce(r.sort_order,-1) not between 0 and 1000 or length(btrim(coalesce(r.name_hu,''))) not between 1 and 60 or length(btrim(coalesce(r.name_en,''))) not between 1 and 60 then raise exception 'Invalid ship slot';end if;
  if (r.kind='module' and (coalesce(r.module_kind,'') not in('engine','reactor','shield','weapon','hull','sensor','utility') or r.crew_role is not null))
  or (r.kind='crew' and (coalesce(r.crew_role,'') not in('pilot','navigator','engineer','security','medic') or r.module_kind is not null)) then raise exception 'Invalid ship slot type';end if;
 end loop;
 if (select count(distinct x->>'slot_key') from jsonb_array_elements(p_slots)x)<>jsonb_array_length(p_slots)
 or exists(select 1 from jsonb_array_elements(p_slots)x where x->>'kind'='crew' group by x->>'crew_role' having count(*)>1)
 or (select count(*) from jsonb_array_elements(p_slots)x where x->>'kind'='module')>32 then raise exception 'Duplicate slots or crew roles';end if;
 if published_value then
  if exists(select 1 from unnest(array['engine','reactor','hull']) k where not exists(select 1 from jsonb_array_elements(p_slots)x where x->>'kind'='module' and x->>'module_kind'=k and (x->>'required')::boolean))
  or not exists(select 1 from jsonb_array_elements(p_slots)x where x->>'kind'='crew' and x->>'crew_role'='pilot' and (x->>'required')::boolean)
  or exists(select 1 from jsonb_array_elements(p_slots)x where x->>'kind'='module' and (x->>'required')::boolean and not exists(
   select 1 from public.game_ship_modules m join public.game_items i on i.id=m.item_id where m.is_starter and i.is_published and m.module_kind=x->>'module_kind' and m.size<=(x->>'size')::integer))
  then raise exception 'Published ships require starter-compatible engine, reactor, hull and pilot stations';end if;
  if (select coalesce(sum(m.power_draw),0)>coalesce(sum(m.power_output),0) from jsonb_array_elements(p_slots)x
   join public.game_ship_modules m on m.module_kind=x->>'module_kind' and m.is_starter and m.size<=(x->>'size')::integer where x->>'kind'='module') then raise exception 'Starter configuration exceeds reactor power';end if;
 end if;
 if p_id is not null then
  select revision into current_revision from public.game_starter_ships where id=sid for update;
  if not found then raise exception 'Ship not found';end if;
  if p_expected_revision is distinct from current_revision then raise exception 'Ship changed since loading; reload before saving' using errcode='40001';end if;
  -- Serialize with all spending/loadout actions, in deterministic character order.
  perform 1 from public.character_progress p join public.characters c on c.id=p.character_id where c.starter_ship_id=sid order by p.character_id for update of p;
  if exists(select 1 from public.character_ship_equipment e join public.game_ship_modules m on m.item_id=e.item_id
   where e.ship_id=sid and not exists(select 1 from jsonb_to_recordset(p_slots)x(slot_key text,kind text,module_kind text,size integer)
    where x.slot_key=e.slot_key and x.kind='module' and x.module_kind=m.module_kind and x.size>=m.size))
  or exists(select 1 from public.character_ship_crew a join public.character_crew c on c.id=a.crew_id and c.character_id=a.character_id
   where a.ship_id=sid and not exists(select 1 from jsonb_to_recordset(p_slots)x(slot_key text,kind text,crew_role text,min_aptitude integer)
    where x.slot_key=a.slot_key and x.kind='crew' and x.crew_role=c.specialty and x.min_aptitude<=c.aptitude)) then raise exception 'Occupied slots cannot be removed or made incompatible';end if;
  update public.game_starter_ships set slug=slug_value,image_path=image_value,hull=hull_value,cargo=cargo_value,speed=speed_value,is_published=published_value,revision=revision+1 where id=sid returning revision into new_revision;
 else
  insert into public.game_starter_ships(id,slug,image_path,hull,cargo,speed,is_published,revision) values(sid,slug_value,image_value,hull_value,cargo_value,speed_value,published_value,1) returning revision into new_revision;
 end if;
 delete from public.game_starter_ships_i18n where ship_id=sid;
 insert into public.game_starter_ships_i18n(ship_id,locale,name,description) select sid,locale,btrim(name),coalesce(description,'') from jsonb_to_recordset(p_translations)t(locale text,name text,description text);
 delete from public.game_ship_slots s where s.ship_id=sid and not exists(select 1 from jsonb_array_elements(p_slots)x where x->>'slot_key'=s.slot_key);
 insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,crew_role,size,min_aptitude,required,sort_order,name_hu,name_en)
 select sid,slot_key,kind,module_kind,crew_role,size,min_aptitude,required,sort_order,btrim(name_hu),btrim(name_en)
 from jsonb_to_recordset(p_slots)x(slot_key text,kind text,module_kind text,crew_role text,size integer,min_aptitude integer,required boolean,sort_order integer,name_hu text,name_en text)
 on conflict(ship_id,slot_key) do update set kind=excluded.kind,module_kind=excluded.module_kind,crew_role=excluded.crew_role,size=excluded.size,min_aptitude=excluded.min_aptitude,required=excluded.required,sort_order=excluded.sort_order,name_hu=excluded.name_hu,name_en=excluded.name_en;
 return jsonb_build_object('id',sid,'revision',new_revision);
end $fn$;
revoke all on function private.save_game_ship_impl(uuid,jsonb,jsonb,jsonb,integer) from public,anon;
grant execute on function private.save_game_ship_impl(uuid,jsonb,jsonb,jsonb,integer) to authenticated;
create function public.save_game_ship(p_id uuid,p_ship jsonb,p_translations jsonb,p_slots jsonb,p_expected_revision integer) returns jsonb language sql security invoker set search_path='' as $fn$select private.save_game_ship_impl(p_id,p_ship,p_translations,p_slots,p_expected_revision)$fn$;
revoke all on function public.save_game_ship(uuid,jsonb,jsonb,jsonb,integer) from public,anon;
grant execute on function public.save_game_ship(uuid,jsonb,jsonb,jsonb,integer) to authenticated;

-- Creation holds a shared ship lock while editor saves hold an exclusive lock.
-- Required pilot/navigation aptitude follows the edited profile for new captains.
do $patch$
declare d text;old_check text:=E' if not exists(select 1 from public.game_starter_ships where id=p_ship and is_published) then';
begin
 d:=pg_get_functiondef('private.create_captain_impl(text,uuid,uuid,uuid,jsonb,jsonb)'::regprocedure);
 if strpos(d,old_check)=0 or strpos(d,' return v_id;')=0 then raise exception 'Unexpected captain creation implementation';end if;
 d:=replace(d,old_check,E' perform 1 from public.game_starter_ships where id=p_ship and is_published for share;\n if not found then');
 d:=replace(d,' return v_id;',E' update public.character_crew c set aptitude=greatest(c.aptitude,s.min_aptitude) from public.game_ship_slots s where c.character_id=v_id and s.ship_id=p_ship and s.kind=''crew'' and s.required and c.specialty=s.crew_role;\n return v_id;');
 execute d;
end $patch$;
notify pgrst,'reload schema';
