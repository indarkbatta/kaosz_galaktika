
-- M5.0: inventory and loot earned exclusively by successful, server-authoritative actions.
create table public.game_items(
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check(slug ~ '^[a-z][a-z0-9_]*$'),
 rarity text not null default 'common' check(rarity in ('common','uncommon','rare','epic')),
 category text not null default 'material' check(category in ('material','data','trade')),
 is_published boolean not null default true
);
create table public.game_items_i18n(
 item_id uuid not null references public.game_items(id) on delete cascade,
 locale text not null references public.game_locales(code),
 name text not null check(length(trim(name))>0),
 description text not null default '',
 primary key(item_id,locale)
);
create table public.game_action_loot(
 action_id uuid not null references public.game_actions(id) on delete cascade,
 item_id uuid not null references public.game_items(id),
 chance_percent integer not null default 100 check(chance_percent between 0 and 100),
 min_qty integer not null default 1 check(min_qty between 1 and 100),
 max_qty integer not null default 1 check(max_qty between min_qty and 100),
 primary key(action_id,item_id)
);
create table public.character_inventory(
 character_id uuid not null references public.characters(id) on delete cascade,
 item_id uuid not null references public.game_items(id),
 quantity bigint not null check(quantity between 0 and 1000000000),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(character_id,item_id)
);
create table public.character_loot_events(
 id bigint generated always as identity primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 action_log_id bigint not null references public.character_action_log(id) on delete cascade,
 item_id uuid not null references public.game_items(id),
 quantity integer not null check(quantity between 1 and 100),
 created_at timestamptz not null default clock_timestamp()
);
create index loot_event_char_recent on public.character_loot_events(character_id,created_at desc);
create index loot_event_action on public.character_loot_events(action_log_id);

alter table public.game_items enable row level security;
alter table public.game_items_i18n enable row level security;
alter table public.game_action_loot enable row level security;
alter table public.character_inventory enable row level security;
alter table public.character_loot_events enable row level security;
create policy item_read on public.game_items for select to authenticated
 using(is_published or (select private.can_edit_content()));
create policy item_editor on public.game_items for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy item_translation_read on public.game_items_i18n for select to authenticated
 using(exists(select 1 from public.game_items i where i.id=item_id));
create policy item_translation_editor on public.game_items_i18n for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy loot_config_read on public.game_action_loot for select to authenticated
 using(exists(select 1 from public.game_actions a where a.id=action_id));
create policy loot_config_editor on public.game_action_loot for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy inventory_owner_read on public.character_inventory for select to authenticated
 using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
create policy loot_events_owner_read on public.character_loot_events for select to authenticated
 using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
revoke all on public.game_items,public.game_items_i18n,public.game_action_loot,
 public.character_inventory,public.character_loot_events from public,anon,authenticated;
grant select,insert,update,delete on public.game_items,public.game_items_i18n,public.game_action_loot to authenticated;
grant select on public.character_inventory,public.character_loot_events to authenticated;

insert into public.game_items(slug,rarity,category) values
 ('alloy_scrap','common','material'),
 ('encrypted_fragments','uncommon','data'),
 ('trade_seals','common','trade'),
 ('stellar_charts','uncommon','data');
insert into public.game_items_i18n(item_id,locale,name,description)
 select i.id,t.locale,t.name,t.description from (values
 ('alloy_scrap','hu','Ötvözettörmelék','Sérült hajók újrahasznosítható fémdarabjai.'),
 ('alloy_scrap','en','Alloy Scrap','Reusable metal fragments from damaged vessels.'),
 ('encrypted_fragments','hu','Titkosított adattöredék','Részben olvasható adatcsomag egy eltűnt expedícióból.'),
 ('encrypted_fragments','en','Encrypted Fragment','Partially readable data packet from a lost expedition.'),
 ('trade_seals','hu','Kereskedelmi pecsét','A határvidéken elfogadott csere- és elszámolási jelzés.'),
 ('trade_seals','en','Trade Seal','A settlement token accepted in frontier trade.'),
 ('stellar_charts','hu','Csillagtérkép-töredék','Nehéz körülmények között rögzített navigációs adatok.'),
 ('stellar_charts','en','Stellar Chart Fragment','Navigation data recovered under difficult conditions.')
 ) t(slug,locale,name,description)
 join public.game_items i on i.slug=t.slug;
insert into public.game_action_loot(action_id,item_id,chance_percent,min_qty,max_qty)
 select a.id,i.id,v.chance,v.min_qty,v.max_qty from (values
  ('repair','alloy_scrap',100,1,3),
  ('recon','encrypted_fragments',100,1,2),
  ('trade','trade_seals',100,1,2),
  ('navigate','stellar_charts',100,1,2)
 ) v(action_slug,item_slug,chance,min_qty,max_qty)
 join public.game_actions a on a.slug=v.action_slug
 join public.game_items i on i.slug=v.item_slug;

-- The existing action RPC writes this table inside its own transaction.
-- AFTER INSERT guarantees XP/energy, action log and loot are atomic.
create function private.award_action_loot() returns trigger
 language plpgsql security definer set search_path='' as $$
declare v_drop record;v_qty integer;
begin
 if not new.succeeded then return new; end if;
 for v_drop in
  select d.item_id,d.chance_percent,d.min_qty,d.max_qty
  from public.game_action_loot d
  join public.game_items i on i.id=d.item_id and i.is_published
  where d.action_id=new.action_id
 loop
  if (random()*100)>=v_drop.chance_percent then continue;end if;
  v_qty:=v_drop.min_qty+floor(random()*(v_drop.max_qty-v_drop.min_qty+1))::integer;
  insert into public.character_inventory(character_id,item_id,quantity,updated_at)
   values(new.character_id,v_drop.item_id,v_qty,clock_timestamp())
   on conflict(character_id,item_id) do update
   set quantity=public.character_inventory.quantity+excluded.quantity,updated_at=clock_timestamp();
  insert into public.character_loot_events(character_id,action_log_id,item_id,quantity)
   values(new.character_id,new.id,v_drop.item_id,v_qty);
 end loop;
 return new;
end $$;
revoke all on function private.award_action_loot() from public,anon,authenticated;
create trigger action_awards_loot after insert on public.character_action_log
 for each row execute function private.award_action_loot();
