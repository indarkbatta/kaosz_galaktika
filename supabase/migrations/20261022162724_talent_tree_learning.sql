-- Two reserved starting choices, then one shared point per level after first.
alter table public.game_talent_tree_nodes add column min_level integer not null default 1 check(min_level between 1 and 1000);
create table public.character_tree_nodes(
 character_id uuid not null references public.characters(id) on delete cascade,
 node_id uuid not null, tree_id uuid not null references public.game_talent_trees(id) on delete restrict,
 branch text not null check(branch in ('species','class')), snapshot jsonb not null,
 learned_at timestamptz not null default now(), primary key(character_id,node_id)
);
create index character_tree_nodes_tree on public.character_tree_nodes(tree_id);
alter table public.character_tree_nodes enable row level security;
revoke all on public.character_tree_nodes from public,anon,authenticated;
grant select on public.character_tree_nodes to authenticated;
create policy own_tree_nodes on public.character_tree_nodes for select to authenticated using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));

create function private.tree_points(cid uuid) returns jsonb language sql stable set search_path='' as $$
 with n as(select count(*) filter(where branch='species')::int s,count(*) filter(where branch='class')::int c from public.character_tree_nodes where character_id=cid)
 select jsonb_build_object('species',greatest(0,1-n.s),'class',greatest(0,1-n.c),'shared',greatest(0,coalesce(p.level,1)-1-greatest(0,n.s-1)-greatest(0,n.c-1)-coalesce(g.species_rank+g.class_rank-2,0)))
 from n left join public.character_progress p on p.character_id=cid left join public.character_combat_progress g on g.character_id=cid
$$;
create function private.tree_skill_bonus(cid uuid,sk uuid,attr text) returns integer language sql stable set search_path='' as $$
 select coalesce(sum((e->>'amount')::int),0)::int from public.character_tree_nodes n cross join lateral jsonb_array_elements(n.snapshot->'effects') e where n.character_id=cid and e->>'type'='modifier' and (e->>'stat'='skill' and e->>'key'=sk::text or e->>'stat'='attribute' and e->>'key'=attr)
$$;
create function private.player_tree_catalog(p_species uuid,p_class uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;lvl int:=1;begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
 select id into cid from public.characters where user_id=auth.uid();
 if cid is not null then select species_id,class_id into p_species,p_class from public.characters where id=cid;select level into lvl from public.character_progress where character_id=cid;end if;
 return jsonb_build_object('level',lvl,'points',case when cid is null then '{"species":1,"class":1,"shared":0}'::jsonb else private.tree_points(cid) end,
 'owned',coalesce((select jsonb_agg(node_id) from public.character_tree_nodes where character_id=cid),'[]'),
 'trees',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('nodes',coalesce((select jsonb_agg(to_jsonb(n)||jsonb_build_object('power_published',coalesce(p.is_published,false)) order by n.y,n.x) from public.game_talent_tree_nodes n left join public.game_powers p on p.id=n.power_id where n.tree_id=t.id),'[]'),'connections',coalesce((select jsonb_agg(e) from public.game_talent_tree_edges e where e.tree_id=t.id),'[]'))) from public.game_talent_trees t where t.is_published and (t.species_id=p_species or t.class_id=p_class)),'[]'));
end $$;
create function public.get_player_talent_trees(p_species uuid default null,p_class uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.player_tree_catalog(p_species,p_class)$$;

create function private.learn_tree_node(p_node uuid,p_revision int) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;c public.characters%rowtype;t public.game_talent_trees%rowtype;n public.game_talent_tree_nodes%rowtype;pts jsonb;b text;lvl int;begin
 cid:=private.combat_owned_character();select * into c from public.characters where id=cid;
 if exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation) or exists(select 1 from public.character_skill_challenge_runs where character_id=cid and status='active') then raise exception 'Finish active encounter first';end if;
 select tr.* into t from public.game_talent_trees tr join public.game_talent_tree_nodes nd on nd.tree_id=tr.id where nd.id=p_node for update of tr;
 if not found or not t.is_published or not(coalesce(t.species_id=c.species_id,false) or coalesce(t.class_id=c.class_id,false)) then raise exception 'Talent unavailable';end if;
 if t.revision is distinct from p_revision then raise exception 'Tree changed; reload before learning' using errcode='40001';end if;
 select * into strict n from public.game_talent_tree_nodes where id=p_node and tree_id=t.id;
 if exists(select 1 from public.character_tree_nodes where character_id=cid and node_id=n.id) then raise exception 'Talent already learned';end if;
 select level into lvl from public.character_progress where character_id=cid;
 if n.min_level>lvl or exists(select 1 from public.game_talent_tree_edges e where e.tree_id=t.id and e.to_node_id=n.id and not exists(select 1 from public.character_tree_nodes o where o.character_id=cid and o.node_id=e.from_node_id)) then raise exception 'Talent prerequisites unmet';end if;
 if n.kind='power' and not exists(select 1 from public.game_powers where id=n.power_id and is_published and min_level<=lvl) then raise exception 'Power unavailable';end if;
 -- Damage authoring metadata does not yet have a live evaluator.
 if exists(select 1 from jsonb_array_elements(n.effects) e where e->>'stat'='damage') then raise exception 'Talent effect not supported in gameplay yet';end if;
 perform private.combat_check_effects(n.effects,true);
 b:=case when t.species_id is not null then 'species' else 'class' end;pts:=private.tree_points(cid);
 if (pts->>b)::int=0 and (pts->>'shared')::int=0 then raise exception 'No talent points available';end if;
 insert into public.character_tree_nodes(character_id,node_id,tree_id,branch,snapshot) values(cid,n.id,t.id,b,to_jsonb(n));
 if n.kind='power' then insert into public.character_powers(character_id,power_id) values(cid,n.power_id) on conflict do nothing;end if;
 return private.player_tree_catalog(null,null);
end $$;
create function public.learn_talent_tree_node(p_node uuid,p_revision int) returns jsonb language sql security invoker set search_path='' as $$select private.learn_tree_node(p_node,p_revision)$$;

create function private.create_captain_with_talents(p_name text,p_species uuid,p_class uuid,p_ship uuid,p_attribute_points jsonb,p_skill_points jsonb,p_species_node uuid,p_class_node uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; b text; node uuid; tr public.game_talent_trees%rowtype;begin
 cid:=private.create_captain_impl(p_name,p_species,p_class,p_ship,p_attribute_points,p_skill_points);
 foreach b in array array['species','class'] loop
 node:=case when b='species' then p_species_node else p_class_node end;
 select * into tr from public.game_talent_trees where is_published and (b='species' and species_id=p_species or b='class' and class_id=p_class) for update;
 if found then
 if node is null then raise exception 'Choose one starting talent in each available tree';end if;
 if not exists(select 1 from public.game_talent_tree_nodes where id=node and tree_id=tr.id) then raise exception 'Wrong starting talent tree';end if;
 perform private.learn_tree_node(node,tr.revision);
 elsif node is not null then raise exception 'Talent tree unavailable';end if;
 end loop;return cid;
end $$;
create function public.create_captain_with_talents(p_name text,p_species uuid,p_class uuid,p_ship uuid,p_attribute_points jsonb,p_skill_points jsonb,p_species_node uuid,p_class_node uuid) returns uuid language sql security invoker set search_path='' as $$select private.create_captain_with_talents(p_name,p_species,p_class,p_ship,p_attribute_points,p_skill_points,p_species_node,p_class_node)$$;
-- Legacy entry point cannot bypass the new mandatory starting selections.
create or replace function public.create_captain(p_name text,p_species uuid,p_class uuid,p_ship uuid,p_attribute_points jsonb,p_skill_points jsonb) returns uuid language sql security invoker set search_path='' as $$select private.create_captain_with_talents(p_name,p_species,p_class,p_ship,p_attribute_points,p_skill_points,null,null)$$;
revoke execute on function private.create_captain_impl(text,uuid,uuid,uuid,jsonb,jsonb) from authenticated;

-- Preserve editor-supplied level gates, defaulting older documents to level 1.
do $$declare d text;begin
 d:=pg_get_functiondef('private.save_talent_tree(uuid,integer,jsonb)'::regprocedure);
 if position('power_id,effects)' in d)=0 then raise exception 'Unexpected tree save function';end if;
 d:=replace(d,'power_id,effects)','power_id,effects,min_level)');
 d:=replace(d,$x$n->'effects');$x$,$x$n->'effects',coalesce((n->>'min_level')::int,1));$x$);
 execute d;
end $$;
-- Existing spent legacy points and new shared spending consume the same budget.
do $$declare d text;begin
 d:=pg_get_functiondef('private.combat_learn(uuid,integer)'::regprocedure);
 if position('if g.species_rank+g.class_rank-2>=lvl-1' in d)=0 then raise exception 'Unexpected legacy learning function';end if;
 d:=replace(d,'if g.species_rank+g.class_rank-2>=lvl-1', $x$if (private.tree_points(cid)->>'shared')::int<=0$x$);execute d;
 d:=pg_get_functiondef('private.combat_catalog()'::regprocedure);
 d:=replace(d,$x$'talent_points',(select level-1 from public.character_progress where character_id=cid)-(select species_rank+class_rank-2 from public.character_combat_progress where character_id=cid),$x$,$x$'talent_points',(private.tree_points(cid)->>'shared')::int,$x$);execute d;
 d:=pg_get_functiondef('private.combat_hero(uuid)'::regprocedure);
 if position('select coalesce(jsonb_agg(p||' in d)=0 then raise exception 'Unexpected hero function';end if;
 d:=replace(d,'select coalesce(jsonb_agg(p||',$x$select effects||coalesce(jsonb_agg(ne.value),'[]') into effects from public.character_tree_nodes tn cross join lateral jsonb_array_elements(tn.snapshot->'effects') ne(value) where tn.character_id=c.id;
 select coalesce(jsonb_agg(p||$x$);execute d;
end $$;

-- Passives affect noncombat actions and challenge rolls, not stored base stats.
do $$declare d text;needle text;begin
 d:=pg_get_functiondef('private.roll_skill_challenge_impl(uuid,integer,uuid)'::regprocedure);
 needle:='+coalesce((v_c.skill_bonus_pips->>(p_skill::text))::integer,0)+v_pool;';
 if position(needle in d)=0 then raise exception 'Unexpected challenge pool';end if;
 d:=replace(d,needle,needle||' v_pool:=v_pool+private.tree_skill_bonus(v_c.id,p_skill,v_skill_attr);');execute d;
 d:=pg_get_functiondef('private.perform_game_action_once_impl(text,uuid)'::regprocedure);
 needle:='+coalesce((v_c.skill_bonus_pips->>(v_a.skill_id::text))::integer,0)+v_pool;';
 if position(needle in d)=0 then raise exception 'Unexpected action pool';end if;
 d:=replace(d,needle,needle||' v_pool:=v_pool+private.tree_skill_bonus(v_c.id,v_a.skill_id,v_a.attr);');execute d;
end $$;

revoke all on function private.tree_points(uuid),private.tree_skill_bonus(uuid,uuid,text),private.player_tree_catalog(uuid,uuid),private.learn_tree_node(uuid,integer),private.create_captain_with_talents(text,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function private.player_tree_catalog(uuid,uuid),private.learn_tree_node(uuid,integer),private.create_captain_with_talents(text,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) to authenticated;
revoke all on function public.get_player_talent_trees(uuid,uuid),public.learn_talent_tree_node(uuid,integer),public.create_captain_with_talents(text,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) from public,anon;
grant execute on function public.get_player_talent_trees(uuid,uuid),public.learn_talent_tree_node(uuid,integer),public.create_captain_with_talents(text,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) to authenticated;

-- Activate the authored human/Mercenary set by stable content keys, not generated IDs.
update public.game_powers set is_published=true,revision=revision+1 where slug ~ '^mercenary_(weapons|assault|tactics)_[123]$';
update public.game_talent_tree_nodes n set min_level=p.min_level from public.game_powers p,public.game_talent_trees t,public.game_classes c where n.power_id=p.id and n.tree_id=t.id and t.class_id=c.id and c.slug='hadur' and p.slug ~ '^mercenary_(weapons|assault|tactics)_[123]$';
update public.game_talent_tree_nodes n set min_level=case when n.name_en in ('Hardy Settler','Common Sense','Common Ground') then 1 when n.name_en in ('Hardened Constitution','Improviser','Network of Contacts') then 2 else 3 end from public.game_talent_trees t,public.game_species s where n.tree_id=t.id and t.species_id=s.id and s.slug='ember' and n.name_en in ('Hardy Settler','Common Sense','Common Ground','Hardened Constitution','Improviser','Network of Contacts','Unbroken','Danger Sense','Natural Mediator');
update public.game_talent_trees t set is_published=true,revision=revision+1 where
 (exists(select 1 from public.game_species s where s.id=t.species_id and s.slug='ember') and (select count(*) from public.game_talent_tree_nodes n where n.tree_id=t.id and n.name_en in ('Hardy Settler','Common Sense','Common Ground','Hardened Constitution','Improviser','Network of Contacts','Unbroken','Danger Sense','Natural Mediator'))=9)
 or (exists(select 1 from public.game_classes c where c.id=t.class_id and c.slug='hadur') and (select count(*) from public.game_talent_tree_nodes n join public.game_powers p on p.id=n.power_id where n.tree_id=t.id and p.slug ~ '^mercenary_(weapons|assault|tactics)_[123]$')=9);
