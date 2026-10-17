
-- M4.0: a small connected, explorable star system with server-owned travel.
create table public.game_locations(
 id uuid primary key default gen_random_uuid(),
 slug text unique not null check(slug ~ '^[a-z][a-z0-9_]*$'),
 kind text not null check(kind in ('station','wreck','planet','anomaly')),
 x integer not null check(x between 7 and 93),
 y integer not null check(y between 7 and 93),
 is_published boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.game_locations_i18n(
 location_id uuid not null references public.game_locations(id) on delete cascade,
 locale text not null references public.game_locales(code),
 name text not null check(length(trim(name))>0),
 description text not null default '',
 primary key(location_id,locale)
);
create table public.game_routes(
 id uuid primary key default gen_random_uuid(),
 origin_id uuid not null references public.game_locations(id) on delete cascade,
 destination_id uuid not null references public.game_locations(id) on delete cascade,
 energy_cost integer not null check(energy_cost between 1 and 500),
 is_published boolean not null default true,
 unique(origin_id,destination_id),
 check(origin_id<>destination_id)
);
create table public.game_location_actions(
 location_id uuid not null references public.game_locations(id) on delete cascade,
 action_id uuid not null references public.game_actions(id) on delete cascade,
 primary key(location_id,action_id)
);
insert into public.game_locations(slug,kind,x,y) values
 ('frontier_station','station',23,50),
 ('wreck_field','wreck',55,22),
 ('cinder_colony','planet',79,68),
 ('rift_gate','anomaly',32,81);
insert into public.game_locations_i18n(location_id,locale,name,description)
select g.id,v.locale,v.name,v.description from (values
 ('frontier_station','hu','Határvidéki állomás','A civilizáció utolsó biztonságos kikötője a feltérképezetlen szektor szélén.'),
 ('frontier_station','en','Frontier Station','The last safe harbor of civilization on the edge of the uncharted sector.'),
 ('wreck_field','hu','Árnyékroncs-mező','Egy eltűnt flotta darabjai sodródnak a hideg porfelhőben.'),
 ('wreck_field','en','Shadow Wreck Field','Fragments of a vanished fleet drift through a cold dust cloud.'),
 ('cinder_colony','hu','Parázs-kolónia','Egy elhagyott bányavilág, ahol a vészjeladók még életjeleket sugároznak.'),
 ('cinder_colony','en','Ember Colony','An abandoned mining world whose distress beacons still transmit signs of life.'),
 ('rift_gate','hu','Hasadékkapu','Ismeretlen eredetű gravitációs anomália, amely meghajlítja a térképet.'),
 ('rift_gate','en','Rift Gate','A gravitational anomaly of unknown origin that bends navigational readings.')
) v(slug,locale,name,description) join public.game_locations g on g.slug=v.slug;

insert into public.game_routes(origin_id,destination_id,energy_cost)
select a.id,b.id,v.cost from (values
 ('frontier_station','wreck_field',8),
 ('wreck_field','cinder_colony',10),
 ('frontier_station','rift_gate',12),
 ('rift_gate','cinder_colony',9)
) v(a,b,cost) join public.game_locations a on a.slug=v.a join public.game_locations b on b.slug=v.b;
insert into public.game_location_actions(location_id,action_id)
select l.id,a.id from (values
 ('frontier_station','trade'),('frontier_station','repair'),
 ('wreck_field','recon'),('wreck_field','repair'),
 ('cinder_colony','recon'),('cinder_colony','trade'),
 ('rift_gate','navigate'),('rift_gate','recon')
) v(loc,act) join public.game_locations l on l.slug=v.loc join public.game_actions a on a.slug=v.act;
create table public.character_positions(
 character_id uuid primary key references public.characters(id) on delete cascade,
 location_id uuid not null references public.game_locations(id),
 arrived_at timestamptz not null default clock_timestamp()
);
create table public.character_location_discoveries(
 character_id uuid not null references public.characters(id) on delete cascade,
 location_id uuid not null references public.game_locations(id) on delete cascade,
 discovered_at timestamptz not null default clock_timestamp(),
 primary key(character_id,location_id)
);
create table public.character_travel_log(
 id bigint generated always as identity primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 origin_id uuid not null references public.game_locations(id),
 destination_id uuid not null references public.game_locations(id),
 energy_spent integer not null,
 traveled_at timestamptz not null default clock_timestamp()
);
create index character_travel_by_char_time on public.character_travel_log(character_id,traveled_at desc);
alter table public.game_locations enable row level security;
alter table public.game_locations_i18n enable row level security;
alter table public.game_routes enable row level security;
alter table public.game_location_actions enable row level security;
alter table public.character_positions enable row level security;
alter table public.character_location_discoveries enable row level security;
alter table public.character_travel_log enable row level security;
create policy locations_read on public.game_locations for select to authenticated
 using(is_published or (select private.can_edit_content()));
create policy locations_edit on public.game_locations for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy location_translations_read on public.game_locations_i18n for select to authenticated
 using(exists(select 1 from public.game_locations l where l.id=location_id));
create policy location_translations_edit on public.game_locations_i18n for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy routes_read on public.game_routes for select to authenticated
 using(is_published and exists(select 1 from public.game_locations g where g.id=origin_id)
  and exists(select 1 from public.game_locations g where g.id=destination_id));
create policy routes_edit on public.game_routes for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy location_actions_read on public.game_location_actions for select to authenticated
 using(exists(select 1 from public.game_locations g where g.id=location_id));
create policy location_actions_edit on public.game_location_actions for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy positions_read_own on public.character_positions for select to authenticated
 using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
create policy discoveries_read_own on public.character_location_discoveries for select to authenticated
 using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
create policy travel_log_read_own on public.character_travel_log for select to authenticated
 using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
revoke all on public.game_locations,public.game_locations_i18n,public.game_routes,public.game_location_actions,
 public.character_positions,public.character_location_discoveries,public.character_travel_log from anon,authenticated;
grant select,insert,update,delete on public.game_locations,public.game_locations_i18n,public.game_routes,public.game_location_actions to authenticated;
grant select on public.character_positions,public.character_location_discoveries,public.character_travel_log to authenticated;

-- Both newly created and already existing captains start at Frontier Station.
create function private.initialize_character_position() returns trigger
 language plpgsql security definer set search_path='' as $$
declare v_start uuid;
begin
 select id into strict v_start from public.game_locations where slug='frontier_station';
 insert into public.character_positions(character_id,location_id) values(new.id,v_start);
 insert into public.character_location_discoveries(character_id,location_id) values(new.id,v_start);
 return new;
end $$;
create trigger character_start_location after insert on public.characters
 for each row execute function private.initialize_character_position();
insert into public.character_positions(character_id,location_id)
 select c.id,l.id from public.characters c cross join public.game_locations l
 where l.slug='frontier_station'
 on conflict(character_id) do nothing;
insert into public.character_location_discoveries(character_id,location_id)
 select character_id,location_id from public.character_positions on conflict do nothing;

-- Enforce location-specific activities at the last stage of the existing D6 transaction.
-- Any denial rolls back the full operation (including energy and XP changes).
create function private.enforce_action_location() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if not exists(
   select 1 from public.character_positions cp
   join public.game_location_actions la on la.location_id=cp.location_id
   join public.game_locations l on l.id=cp.location_id
   where cp.character_id=new.character_id and la.action_id=new.action_id and l.is_published
 ) then
   raise exception 'Action unavailable at current location' using errcode='P0001';
 end if;
 return new;
end $$;
create trigger action_requires_location before insert on public.character_action_log
 for each row execute function private.enforce_action_location();

create function private.travel_to_location_impl(p_target uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid();
 v_id uuid;v_position public.character_positions%rowtype;
 v_progress public.character_progress%rowtype;
 v_rules public.gameplay_rules%rowtype;
 v_cost integer;v_elapsed bigint;v_energy integer;v_at timestamptz;
 v_discovered boolean;v_log bigint;v_now timestamptz:=clock_timestamp();
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id into v_id from public.characters where user_id=v_uid;
 if v_id is null then raise exception 'Captain required' using errcode='P0001';end if;
 select * into v_progress from public.character_progress where character_id=v_id for update;
 if not found then raise exception 'Missing progress' using errcode='P0001';end if;
 select * into v_position from public.character_positions where character_id=v_id for update;
 if not found then raise exception 'Missing position' using errcode='P0001';end if;
 if v_position.location_id=p_target then raise exception 'Already at destination' using errcode='P0001';end if;
 select * into strict v_rules from public.gameplay_rules where id=1;
 select r.energy_cost into v_cost
 from public.game_routes r
 join public.game_locations origin on origin.id=r.origin_id
 join public.game_locations dest on dest.id=r.destination_id
 where r.is_published and origin.is_published and dest.is_published
 and ((r.origin_id=v_position.location_id and r.destination_id=p_target)
   or (r.destination_id=v_position.location_id and r.origin_id=p_target))
 order by r.energy_cost asc limit 1;
 if v_cost is null then raise exception 'No direct route to destination' using errcode='P0001';end if;
 v_elapsed:=greatest(0,floor(extract(epoch from (v_now-v_progress.energy_at)))::bigint);
 v_energy:=least(v_rules.energy_max,v_progress.energy+floor(v_elapsed::numeric/v_rules.energy_regen_seconds)::integer);
 v_at:=case when v_energy>=v_rules.energy_max then v_now
            else v_progress.energy_at+(floor(v_elapsed::numeric/v_rules.energy_regen_seconds)::bigint
                        *v_rules.energy_regen_seconds)*interval '1 second' end;
 if v_energy<v_cost then raise exception 'Insufficient energy' using errcode='P0001';end if;
 update public.character_progress set energy=v_energy-v_cost,energy_at=v_at,updated_at=v_now where character_id=v_id;
 update public.character_positions set location_id=p_target,arrived_at=v_now where character_id=v_id;
 insert into public.character_location_discoveries(character_id,location_id)
 values(v_id,p_target) on conflict do nothing;
 v_discovered:=found;
 insert into public.character_travel_log(character_id,origin_id,destination_id,energy_spent,traveled_at)
 values(v_id,v_position.location_id,p_target,v_cost,v_now) returning id into v_log;
 return jsonb_build_object('log_id',v_log,'from',v_position.location_id,'to',p_target,
 'discovered',v_discovered,'energy',v_energy-v_cost,'energy_at',v_at,
 'energy_spent',v_cost,'server_time',v_now);
end $$;
revoke all on function private.travel_to_location_impl(uuid) from public,anon;
grant execute on function private.travel_to_location_impl(uuid) to authenticated;
create function public.travel_to_location(p_target uuid) returns jsonb
 language sql security invoker set search_path=''
 as $$select private.travel_to_location_impl(p_target)$$;
revoke all on function public.travel_to_location(uuid) from public,anon;
grant execute on function public.travel_to_location(uuid) to authenticated;
