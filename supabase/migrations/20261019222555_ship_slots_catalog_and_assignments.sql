-- Ship-specific equipment and crew stations. All spending shares character_progress locks.
create table public.game_ship_slots(
 ship_id uuid not null references public.game_starter_ships(id) on delete cascade,
 slot_key text not null check(slot_key ~ '^[a-z][a-z0-9_]*$'),
 kind text not null check(kind in ('module','crew')),
 module_kind text check(module_kind in ('engine','reactor','shield','weapon','hull','sensor','utility')),
 crew_role text check(crew_role in ('pilot','navigator','engineer','security','medic')),
 size integer not null default 1 check(size between 1 and 3),
 min_aptitude integer not null default 1 check(min_aptitude between 1 and 5),
 required boolean not null default false,sort_order integer not null,
 name_hu text not null,name_en text not null,
 primary key(ship_id,slot_key),
 check((kind='module' and module_kind is not null and crew_role is null) or
       (kind='crew' and crew_role is not null and module_kind is null))
);
create table public.game_ship_modules(
 item_id uuid primary key references public.game_items(id) on delete cascade,
 module_kind text not null check(module_kind in ('engine','reactor','shield','weapon','hull','sensor','utility')),
 size integer not null check(size between 1 and 3),
 power_draw integer not null default 0 check(power_draw between 0 and 100),
 power_output integer not null default 0 check(power_output between 0 and 200),
 hull_bonus integer not null default 0 check(hull_bonus between 0 and 1000),
 shield_bonus integer not null default 0 check(shield_bonus between 0 and 1000),
 damage_bonus integer not null default 0 check(damage_bonus between 0 and 1000),
 speed_bonus integer not null default 0 check(speed_bonus between -20 and 20),
 cargo_bonus integer not null default 0 check(cargo_bonus between 0 and 1000),
 is_starter boolean not null default false
);
create unique index ship_one_starter_module_per_kind on public.game_ship_modules(module_kind) where is_starter;
create table public.character_ship_equipment(
 character_id uuid not null references public.characters(id) on delete cascade,
 ship_id uuid not null,slot_key text not null,
 item_id uuid not null references public.game_ship_modules(item_id),
 primary key(character_id,ship_id,slot_key),
 foreign key(ship_id,slot_key) references public.game_ship_slots(ship_id,slot_key)
);
create index ship_equipment_slot_fk on public.character_ship_equipment(ship_id,slot_key);
create index ship_equipment_item_fk on public.character_ship_equipment(item_id);
create table public.character_ship_crew(
 character_id uuid not null references public.characters(id) on delete cascade,
 ship_id uuid not null,slot_key text not null,crew_id uuid not null,
 primary key(character_id,ship_id,slot_key),unique(character_id,crew_id),
 foreign key(ship_id,slot_key) references public.game_ship_slots(ship_id,slot_key),
 foreign key(crew_id,character_id) references public.character_crew(id,character_id) on delete cascade
);
create index ship_crew_slot_fk on public.character_ship_crew(ship_id,slot_key);
create index ship_crew_member_fk on public.character_ship_crew(crew_id,character_id);
alter table public.game_ship_slots enable row level security;
alter table public.game_ship_modules enable row level security;
alter table public.character_ship_equipment enable row level security;
alter table public.character_ship_crew enable row level security;
create policy ship_slots_read on public.game_ship_slots for select to authenticated using(
 exists(select 1 from public.game_starter_ships s where s.id=ship_id and s.is_published));
create policy ship_modules_read on public.game_ship_modules for select to authenticated using(
 exists(select 1 from public.game_items i where i.id=item_id and i.is_published));
create policy ship_equipment_own on public.character_ship_equipment for select to authenticated using(
 exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
create policy ship_crew_own on public.character_ship_crew for select to authenticated using(
 exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
revoke all on public.game_ship_slots,public.game_ship_modules,public.character_ship_equipment,public.character_ship_crew from public,anon,authenticated;
grant select on public.game_ship_slots,public.game_ship_modules,public.character_ship_equipment,public.character_ship_crew to authenticated;

