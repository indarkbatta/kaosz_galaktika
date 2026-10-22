-- Authoring only. No character points, learned talents, grants or rank rules change.
create table public.game_talent_trees(
 id uuid primary key default gen_random_uuid(),species_id uuid references public.game_species(id) on delete restrict,class_id uuid references public.game_classes(id) on delete restrict,
 width integer not null default 32 check(width between 12 and 64),height integer not null default 24 check(height between 12 and 64),
 is_published boolean not null default false,revision integer not null default 1,updated_at timestamptz not null default now(),check((species_id is null)<>(class_id is null)),unique(species_id),unique(class_id)
);
create table public.game_talent_tree_nodes(
 id uuid primary key,tree_id uuid not null references public.game_talent_trees(id) on delete cascade,
 x integer not null check(x>=0),y integer not null check(y>=0),
 name_hu text not null check(length(btrim(name_hu)) between 1 and 100),name_en text not null check(length(btrim(name_en)) between 1 and 100),
 description_hu text not null default '' check(length(description_hu)<=2000),description_en text not null default '' check(length(description_en)<=2000),
 image_path text check(image_path is null or (length(image_path)<=300 and image_path ~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$')),
 kind text not null check(kind in ('passive','power')),power_id uuid references public.game_powers(id) on delete restrict,effects jsonb not null default '[]',
 unique(tree_id,id),check((kind='passive' and power_id is null) or (kind='power' and power_id is not null and effects='[]'::jsonb))
);
create index talent_node_power on public.game_talent_tree_nodes(power_id);
create table public.game_talent_tree_edges(
 tree_id uuid not null references public.game_talent_trees(id) on delete cascade,from_node_id uuid not null,to_node_id uuid not null,
 primary key(tree_id,from_node_id,to_node_id),check(from_node_id<>to_node_id),
 foreign key(tree_id,from_node_id) references public.game_talent_tree_nodes(tree_id,id) on delete cascade,
 foreign key(tree_id,to_node_id) references public.game_talent_tree_nodes(tree_id,id) on delete cascade
);
create index talent_edge_target on public.game_talent_tree_edges(tree_id,to_node_id);
do $$declare t text;begin foreach t in array array['game_talent_trees','game_talent_tree_nodes','game_talent_tree_edges'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
 execute format('create policy talent_tree_editor_read on public.%I for select to authenticated using((select private.can_edit_content()))',t);
end loop;end $$;
create function private.talent_tree_check_effects(p jsonb) returns void language plpgsql set search_path='' as $$declare e jsonb;k text;begin
 if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p)>16 then raise exception 'Invalid talent effects';end if;
 for e in select value from jsonb_array_elements(p) loop
  if e->>'stat'='damage' then
   if e->>'type' is distinct from 'modifier' or e->>'key' is distinct from 'all' or coalesce(e->>'amount','') !~ '^-?[0-9]+$' or abs((e->>'amount')::int)>90 or coalesce(e->>'target','self')<>'self' or coalesce((e->>'duration')::int,0)<>0 or length(coalesce(e->>'group',''))>60 then raise exception 'Invalid talent damage modifier';end if;
   for k in select jsonb_object_keys(e) loop if k not in ('type','stat','key','amount','target','duration','group') then raise exception 'Invalid talent effect field';end if;end loop;
  else perform private.combat_check_effects(jsonb_build_array(e),true);end if;
 end loop;
end $$;
revoke all on function private.talent_tree_check_effects(jsonb) from public,anon,authenticated;
create function private.talent_tree_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required' using errcode='42501';end if;
 return jsonb_build_object(
 'trees',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('nodes',coalesce((select jsonb_agg(n order by n.y,n.x,n.id) from public.game_talent_tree_nodes n where n.tree_id=t.id),'[]'::jsonb),'connections',coalesce((select jsonb_agg(e order by e.from_node_id,e.to_node_id) from public.game_talent_tree_edges e where e.tree_id=t.id),'[]'::jsonb))) from public.game_talent_trees t),'[]'::jsonb),
 'species',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_species_i18n i where i.species_id=s.id),'[]'::jsonb)) order by s.slug) from public.game_species s),'[]'::jsonb),
 'classes',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_classes_i18n i where i.class_id=s.id),'[]'::jsonb)) order by s.slug) from public.game_classes s),'[]'::jsonb),
 'powers',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_powers_i18n i where i.power_id=s.id),'[]'::jsonb)) order by s.slug) from public.game_powers s),'[]'::jsonb),
 'skills',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_skills_i18n i where i.skill_id=s.id),'[]'::jsonb)) order by s.slug) from public.game_skills s),'[]'::jsonb));
end $$;
create function public.get_talent_tree_editor_catalog() returns jsonb language sql stable security invoker set search_path='' as $$select private.talent_tree_catalog()$$;
create function private.save_talent_tree(p_id uuid,p_revision int,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tid uuid;old public.game_talent_trees%rowtype;n jsonb;e jsonb;k text;
begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required' using errcode='42501';end if;
 if jsonb_typeof(p_document) is distinct from 'object' or pg_column_size(p_document)>524288 or jsonb_typeof(p_document->'nodes') is distinct from 'array' or jsonb_typeof(p_document->'connections') is distinct from 'array' then raise exception 'Invalid tree document';end if;
 if jsonb_array_length(p_document->'nodes')>100 or jsonb_array_length(p_document->'connections')>300 then raise exception 'Tree content limit exceeded';end if;
 foreach k in array array['width','height'] loop if coalesce(p_document->>k,'') !~ '^[0-9]+$' then raise exception 'Invalid tree size';end if;end loop;
 if p_id is null then
  insert into public.game_talent_trees(species_id,class_id,width,height,is_published) values(nullif(p_document->>'species_id','')::uuid,nullif(p_document->>'class_id','')::uuid,(p_document->>'width')::int,(p_document->>'height')::int,(p_document->>'is_published')::boolean) returning id into tid;
 else
  select * into old from public.game_talent_trees where id=p_id for update;if not found then raise exception 'Tree not found';end if;
  if old.revision is distinct from p_revision then raise exception 'Tree changed; reload before saving' using errcode='40001';end if;
  if old.species_id is distinct from nullif(p_document->>'species_id','')::uuid or old.class_id is distinct from nullif(p_document->>'class_id','')::uuid then raise exception 'Tree owner cannot change';end if;
  tid:=p_id;update public.game_talent_trees set width=(p_document->>'width')::int,height=(p_document->>'height')::int,is_published=(p_document->>'is_published')::boolean,revision=revision+1,updated_at=now() where id=tid;
  delete from public.game_talent_tree_nodes where tree_id=tid;
 end if;
 for n in select value from jsonb_array_elements(p_document->'nodes') loop
  foreach k in array array['x','y'] loop if coalesce(n->>k,'') !~ '^[0-9]+$' then raise exception 'Invalid node position';end if;end loop;
  perform private.talent_tree_check_effects(n->'effects');
  insert into public.game_talent_tree_nodes(id,tree_id,x,y,name_hu,name_en,description_hu,description_en,image_path,kind,power_id,effects)
  values((n->>'id')::uuid,tid,(n->>'x')::int,(n->>'y')::int,n->>'name_hu',n->>'name_en',coalesce(n->>'description_hu',''),coalesce(n->>'description_en',''),nullif(n->>'image_path',''),n->>'kind',nullif(n->>'power_id','')::uuid,n->'effects');
 end loop;
 if exists(select 1 from public.game_talent_tree_nodes n join public.game_talent_trees t on t.id=n.tree_id where t.id=tid and (n.x+4>t.width or n.y+4>t.height)) then raise exception 'Nodes outside tree';end if;
 if exists(select 1 from public.game_talent_tree_nodes a join public.game_talent_tree_nodes b on a.tree_id=b.tree_id and a.id<b.id where a.tree_id=tid and a.x<b.x+4 and a.x+4>b.x and a.y<b.y+4 and a.y+4>b.y) then raise exception 'Nodes overlap';end if;
 for e in select value from jsonb_array_elements(p_document->'connections') loop insert into public.game_talent_tree_edges values(tid,(e->>'from_node_id')::uuid,(e->>'to_node_id')::uuid);end loop;
 if exists(with recursive reach(a,b) as(select from_node_id,to_node_id from public.game_talent_tree_edges where tree_id=tid union select r.a,e.to_node_id from reach r join public.game_talent_tree_edges e on e.tree_id=tid and e.from_node_id=r.b) select 1 from reach where a=b) then raise exception 'Circular tree connection';end if;
 if (p_document->>'is_published')::boolean and (jsonb_array_length(p_document->'nodes')=0 or exists(select 1 from public.game_talent_tree_nodes n left join public.game_powers p on p.id=n.power_id where n.tree_id=tid and (n.kind='passive' and n.effects='[]'::jsonb or n.kind='power' and not p.is_published))) then raise exception 'Ready tree requires configured published rewards';end if;
 return jsonb_build_object('id',tid,'revision',(select revision from public.game_talent_trees where id=tid));
end $$;
create function public.save_talent_tree(p_id uuid,p_revision int,p_document jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.save_talent_tree(p_id,p_revision,p_document)$$;
revoke all on function private.talent_tree_catalog(),public.get_talent_tree_editor_catalog(),private.save_talent_tree(uuid,int,jsonb),public.save_talent_tree(uuid,int,jsonb) from public,anon;
grant execute on function private.talent_tree_catalog(),public.get_talent_tree_editor_catalog(),private.save_talent_tree(uuid,int,jsonb),public.save_talent_tree(uuid,int,jsonb) to authenticated;
