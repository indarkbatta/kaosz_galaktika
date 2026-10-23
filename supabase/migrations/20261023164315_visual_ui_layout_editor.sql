create table private.ui_layouts(
 screen text primary key check(screen='loadout_equipment'),
 revision integer not null default 0,
 draft jsonb not null default '{"version":1,"desktop":{"nodes":{},"extras":[]},"laptop":{"nodes":{},"extras":[]}}',
 published jsonb,previous jsonb,updated_by uuid references auth.users(id),updated_at timestamptz not null default clock_timestamp()
);
alter table private.ui_layouts enable row level security;
revoke all on private.ui_layouts from public,anon,authenticated;
insert into private.ui_layouts(screen) values('loadout_equipment');
create table private.ui_layout_history(id bigint generated always as identity primary key,screen text not null,action text not null,revision integer not null,document jsonb,actor uuid references auth.users(id),created_at timestamptz not null default clock_timestamp());
alter table private.ui_layout_history enable row level security;
revoke all on private.ui_layout_history from public,anon,authenticated;
create function private.validate_ui_layout(doc jsonb) returns void language plpgsql set search_path='' as $$
declare profile jsonb;n jsonb;k text;r jsonb;v text;id text;
begin
 if doc is null or jsonb_typeof(doc)<>'object' or octet_length(doc::text)>100000 or doc->>'version' is distinct from '1' or (select count(*) from jsonb_object_keys(doc))<>3 then raise exception 'Invalid layout document';end if;
 foreach k in array array['desktop','laptop'] loop
 profile:=doc->k;
 if profile is null or jsonb_typeof(profile)<>'object' or jsonb_typeof(profile->'nodes') is distinct from 'object' or jsonb_typeof(profile->'extras') is distinct from 'array' or jsonb_array_length(profile->'extras')>24 or (select count(*) from jsonb_object_keys(profile))<>2 then raise exception 'Invalid layout profile';end if;
 if exists(select 1 from jsonb_object_keys(profile->'nodes') key where key not in ('frame','titlebar','title','tabs','equipment','selector','paperdoll','equipment_title','figure','personal','personal_title','base_title','bag_title','cargo','cargo_title','detail','detail_title','slot_relic','slot_body_armor','slot_main_weapon','slot_sidearm','slot_utility1','slot_utility2','slot_belt','slot_backpack','slot_weapon','slot_armor','slot_utility')) then raise exception 'Unknown layout element';end if;
 if exists(select 1 from jsonb_array_elements(profile->'extras')x where jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'type') is distinct from 'string' or not(x ? 'rect')) then raise exception 'Invalid extra';end if;
 if (select count(*) from jsonb_array_elements(profile->'extras'))<>(select count(distinct x->>'id') from jsonb_array_elements(profile->'extras')x) then raise exception 'Duplicate extra';end if;
 for n in select value from jsonb_each(profile->'nodes') union all select value from jsonb_array_elements(profile->'extras') loop
 if jsonb_typeof(n)<>'object' or exists(select 1 from jsonb_object_keys(n) key where key not in ('rect','background','opacity','fit','label','fontSize','color','locked','hidden','group','columns','cellSize','z','id','type')) then raise exception 'Invalid element properties';end if;
 if n ? 'id' and (n->>'id' !~ '^extra_[a-z0-9-]{1,50}$' or n->>'type' not in ('text','image')) then raise exception 'Invalid extra';end if;
 if n ? 'rect' then r:=n->'rect';if jsonb_typeof(r)<>'object' or (select count(*) from jsonb_object_keys(r))<>4 or exists(select 1 from unnest(array['x','y','w','h'])key where jsonb_typeof(r->key) is distinct from 'number') or (r->>'x')::numeric<0 or (r->>'y')::numeric<0 or (r->>'w')::numeric<2 or (r->>'h')::numeric<2 or (r->>'x')::numeric+(r->>'w')::numeric>100.001 or (r->>'y')::numeric+(r->>'h')::numeric>100.001 then raise exception 'Element outside layout';end if;end if;
 if n ? 'background' and coalesce(n->>'background','')<>'' and not(n->>'background' ~ '^(hatarvilag(/[a-z0-9_-]+)+|uploads/[a-f0-9-]{36})\.(webp|avif|png|jpg|jpeg)$') then raise exception 'Invalid background image';end if;
 if n ? 'fit' and n->>'fit' not in ('cover','contain','repeat') then raise exception 'Invalid image fit';end if;
 if n ? 'opacity' and (jsonb_typeof(n->'opacity')<>'number' or (n->>'opacity')::numeric not between 0 and 1) then raise exception 'Invalid opacity';end if;
 if n ? 'fontSize' and (n->>'fontSize')::numeric not between 8 and 48 then raise exception 'Invalid font size';end if;
 if n ? 'color' and n->>'color' !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid text color';end if;
 if n ? 'label' and (jsonb_typeof(n->'label')<>'object' or length(n->'label'->>'hu')>160 or length(n->'label'->>'en')>160 or exists(select 1 from jsonb_each(n->'label')x where x.key not in ('hu','en') or jsonb_typeof(x.value)<>'string')) then raise exception 'Invalid labels';end if;
 if n ? 'columns' and (n->>'columns')::numeric not between 1 and 8 or n ? 'cellSize' and (n->>'cellSize')::numeric not between 24 and 96 or n ? 'z' and (n->>'z')::numeric not between -1 and 50 then raise exception 'Invalid layout dimensions';end if;
 if n ? 'locked' and jsonb_typeof(n->'locked')<>'boolean' or n ? 'hidden' and jsonb_typeof(n->'hidden')<>'boolean' then raise exception 'Invalid visibility';end if;
 if length(n->>'group')>40 then raise exception 'Invalid group';end if;
 end loop;
 end loop;
end $$;
revoke all on function private.validate_ui_layout(jsonb) from public,anon,authenticated;
create function private.ui_layout_editor() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;sample jsonb;
begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required' using errcode='42501';end if;
 select to_jsonb(u) into result from private.ui_layouts u where screen='loadout_equipment';
 begin sample:=private.get_storage_inventory_impl();exception when others then sample:=jsonb_build_object('items','[]'::jsonb,'cargo','[]'::jsonb,'personal','[]'::jsonb,'equipped','[]'::jsonb,'cargo_capacity',80,'personal_capacity',18,'ship',jsonb_build_object('translations','[]'::jsonb));end;
 return result||jsonb_build_object('sample',sample,'art',coalesce((select jsonb_agg(path) from (select distinct image_path path from public.game_items where image_path is not null limit 100)x),'[]'));
end $$;
create function private.change_ui_layout(p_revision integer,p_action text,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.ui_layouts%rowtype;
begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required' using errcode='42501';end if;
 select * into r from private.ui_layouts where screen='loadout_equipment' for update;
 if r.revision is distinct from p_revision then raise exception 'Layout changed; reload before saving' using errcode='40001';end if;
 if p_action in ('save','publish') then perform private.validate_ui_layout(p_document);r.draft:=p_document;end if;
 if p_action='publish' then r.previous:=r.published;r.published:=r.draft;
 elsif p_action='rollback' then r.draft:=coalesce(r.previous,'{"version":1,"desktop":{"nodes":{},"extras":[]},"laptop":{"nodes":{},"extras":[]}}');r.previous:=r.published;r.published:=r.draft;
 elsif p_action<>'save' then raise exception 'Invalid layout action';end if;
 update private.ui_layouts set draft=r.draft,published=r.published,previous=r.previous,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where screen=r.screen;
 insert into private.ui_layout_history(screen,action,revision,document,actor) values(r.screen,p_action,r.revision+1,r.draft,auth.uid());
 return private.ui_layout_editor();
end $$;
create function private.published_ui_layout() returns jsonb language sql stable security definer set search_path='' as $$select published from private.ui_layouts where screen='loadout_equipment' and auth.uid() is not null$$;
revoke all on function private.published_ui_layout() from public,anon;
grant execute on function private.published_ui_layout() to authenticated;
create function public.get_published_ui_layout() returns jsonb language sql stable security invoker set search_path='' as $$select private.published_ui_layout()$$;
-- Only authenticated clients receive published configuration, never drafts or history.
revoke all on function public.get_published_ui_layout() from public,anon;
grant execute on function public.get_published_ui_layout() to authenticated;
create function public.get_ui_layout_editor() returns jsonb language sql security invoker set search_path='' as $$select private.ui_layout_editor()$$;
create function public.change_ui_layout(p_revision integer,p_action text,p_document jsonb default null) returns jsonb language sql security invoker set search_path='' as $$select private.change_ui_layout(p_revision,p_action,p_document)$$;
revoke all on function private.ui_layout_editor(),private.change_ui_layout(integer,text,jsonb),public.get_ui_layout_editor(),public.change_ui_layout(integer,text,jsonb) from public,anon;
grant execute on function private.ui_layout_editor(),private.change_ui_layout(integer,text,jsonb),public.get_ui_layout_editor(),public.change_ui_layout(integer,text,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ui-layout-art','ui-layout-art',true,1048576,array['image/png','image/jpeg','image/webp','image/avif']);
create policy ui_layout_art_editor_insert on storage.objects for insert to authenticated with check(bucket_id='ui-layout-art' and (select private.can_edit_content()) and name ~ '^uploads/[a-f0-9-]{36}\.(webp|avif|png|jpg|jpeg)$');
create policy ui_layout_art_editor_read on storage.objects for select to authenticated using(bucket_id='ui-layout-art' and (select private.can_edit_content()));
