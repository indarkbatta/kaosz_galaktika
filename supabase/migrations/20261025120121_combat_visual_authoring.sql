-- Editor-only combat artwork; no live combat renderer changes.
create table public.game_combat_appearances(species_id uuid references public.game_species(id),class_id uuid references public.game_classes(id),frames jsonb not null default '[]',fps integer not null default 8 check(fps between 1 and 30),revision integer not null default 1,primary key(species_id,class_id),check(jsonb_typeof(frames)='array' and jsonb_array_length(frames)<=64));
create table public.game_item_combat_visuals(item_id uuid primary key references public.game_items(id),image_path text,revision integer not null default 1);
create table public.game_item_combat_anchors(item_id uuid references public.game_item_combat_visuals(item_id) on delete cascade,class_id uuid references public.game_classes(id),x numeric not null check(x between 0 and 100),y numeric not null check(y between 0 and 100),origin_x numeric not null check(origin_x between 0 and 100),origin_y numeric not null check(origin_y between 0 and 100),scale numeric not null check(scale between 0.01 and 4),rotation numeric not null check(rotation between -180 and 180),primary key(item_id,class_id));
alter table public.game_combat_appearances enable row level security;
alter table public.game_item_combat_visuals enable row level security;
alter table public.game_item_combat_anchors enable row level security;
revoke all on public.game_combat_appearances,public.game_item_combat_visuals,public.game_item_combat_anchors from anon,authenticated;
create function private.combat_visual_catalog() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required';end if;
 return jsonb_build_object('species',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'slug',s.slug,'texts',(select jsonb_agg(t) from public.game_species_i18n t where t.species_id=s.id))),'[]') from public.game_species s),'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'slug',s.slug,'texts',(select jsonb_agg(t) from public.game_classes_i18n t where t.class_id=s.id))),'[]') from public.game_classes s),'appearances',(select coalesce(jsonb_agg(a),'[]') from public.game_combat_appearances a),'items',(select coalesce(jsonb_agg(v),'[]') from public.game_item_combat_visuals v),'anchors',(select coalesce(jsonb_agg(a),'[]') from public.game_item_combat_anchors a));
end $$;
create function private.save_combat_visual(p_kind text,p_document jsonb,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$declare oldrev integer; v jsonb; a jsonb; sid uuid; cid uuid; iid uuid;begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required';end if;
 if jsonb_typeof(p_document) is distinct from 'object' then raise exception 'Invalid visual document';end if;
 -- Serialize authoring writes, including first insert, before checking revision.
 perform pg_advisory_xact_lock(708154929);
 if p_kind='actor' then
 sid:=(p_document->>'species_id')::uuid;cid:=(p_document->>'class_id')::uuid;
 select revision into oldrev from public.game_combat_appearances where species_id=sid and class_id=cid for update;
 if oldrev is distinct from p_revision then raise exception 'Content changed; reload';end if;
 if jsonb_typeof(p_document->'frames') is distinct from 'array' or jsonb_array_length(p_document->'frames')>64 then raise exception 'Invalid frames';end if;
 for a in select * from jsonb_array_elements(p_document->'frames') loop if jsonb_typeof(a)<>'string' or length(btrim(a#>>'{}')) not between 1 and 2048 then raise exception 'Invalid frame image';end if;end loop;
 insert into public.game_combat_appearances values(sid,cid,p_document->'frames',(p_document->>'fps')::int,coalesce(oldrev,0)+1) on conflict(species_id,class_id) do update set frames=excluded.frames,fps=excluded.fps,revision=excluded.revision returning to_jsonb(game_combat_appearances) into v;
 elsif p_kind='item' then
 iid:=(p_document->>'item_id')::uuid;
 select revision into oldrev from public.game_item_combat_visuals where item_id=iid for update;
 if oldrev is distinct from p_revision then raise exception 'Content changed; reload';end if;
 if jsonb_typeof(p_document->'anchors') is distinct from 'array' or jsonb_array_length(p_document->'anchors')>100 then raise exception 'Invalid anchors';end if;
 if (p_document->'image_path' is not null and jsonb_typeof(p_document->'image_path') not in ('null','string')) or length(p_document->>'image_path')>2048 then raise exception 'Invalid item image';end if;
 insert into public.game_item_combat_visuals values(iid,nullif(btrim(p_document->>'image_path'),''),coalesce(oldrev,0)+1) on conflict(item_id) do update set image_path=excluded.image_path,revision=excluded.revision returning to_jsonb(game_item_combat_visuals) into v;
 delete from public.game_item_combat_anchors where item_id=iid;
 for a in select * from jsonb_array_elements(p_document->'anchors') loop
 insert into public.game_item_combat_anchors values(iid,(a->>'class_id')::uuid,(a->>'x')::numeric,(a->>'y')::numeric,(a->>'origin_x')::numeric,(a->>'origin_y')::numeric,(a->>'scale')::numeric,(a->>'rotation')::numeric);
 end loop;
 else raise exception 'Invalid visual kind';end if;
 return v;
end $$;
create function public.get_combat_visual_editor_catalog() returns jsonb language sql security invoker set search_path='' as $$select private.combat_visual_catalog()$$;
create function public.save_combat_visual(p_kind text,p_document jsonb,p_revision integer default null) returns jsonb language sql security invoker set search_path='' as $$select private.save_combat_visual(p_kind,p_document,p_revision)$$;
revoke all on function private.combat_visual_catalog(),private.save_combat_visual(text,jsonb,integer),public.get_combat_visual_editor_catalog(),public.save_combat_visual(text,jsonb,integer) from public,anon;
grant execute on function private.combat_visual_catalog(),private.save_combat_visual(text,jsonb,integer),public.get_combat_visual_editor_catalog(),public.save_combat_visual(text,jsonb,integer) to authenticated;
