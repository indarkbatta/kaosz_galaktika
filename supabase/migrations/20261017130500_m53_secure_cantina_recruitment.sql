
alter table public.character_crew drop constraint if exists character_crew_position_check;
alter table public.character_crew add constraint character_crew_position_check check(position in ('pilot','navigator','engineer','security','medic'));
alter table public.character_crew add column if not exists specialty text;
alter table public.character_crew add column if not exists aptitude integer not null default 2 check(aptitude between 1 and 5);
alter table public.character_crew add column if not exists species_slug text;
update public.character_crew set specialty=position where specialty is null;
alter table public.character_crew alter column specialty set not null;
alter table public.character_crew add constraint crew_specialty_check check(specialty in ('pilot','navigator','engineer','security','medic'));
create table public.character_cantina_rotation(character_id uuid primary key references public.characters(id) on delete cascade,
expires_at timestamptz not null,target_count smallint not null check(target_count between 3 and 5));
create table public.character_cantina_candidates(
id uuid primary key default gen_random_uuid(),character_id uuid not null references public.characters(id) on delete cascade,
name text not null,specialty text not null check(specialty in ('pilot','navigator','engineer','security','medic')),
aptitude smallint not null check(aptitude between 1 and 5),species_slug text not null,
created_at timestamptz not null default clock_timestamp());
create index candidate_by_captain on public.character_cantina_candidates(character_id);
create table public.character_recruit_log(id bigint generated always as identity primary key,
character_id uuid not null references public.characters(id) on delete cascade,
candidate_name text not null,assigned_position text not null,replaced_name text,energy_cost integer not null,
recruited_at timestamptz not null default clock_timestamp());
create index recruit_logs_recent on public.character_recruit_log(character_id,recruited_at desc);
alter table public.character_cantina_rotation enable row level security;
alter table public.character_cantina_candidates enable row level security;
alter table public.character_recruit_log enable row level security;
create policy rotation_own on public.character_cantina_rotation for select to authenticated
 using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
create policy candidates_own on public.character_cantina_candidates for select to authenticated
 using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
create policy recruiting_log_own on public.character_recruit_log for select to authenticated
 using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
revoke all on public.character_cantina_rotation,public.character_cantina_candidates,public.character_recruit_log from public,anon,authenticated;
grant select on public.character_cantina_rotation,public.character_cantina_candidates,public.character_recruit_log to authenticated;
create function private.cantina_roll(p_range integer) returns integer
 language sql volatile security definer set search_path='' as $$
 select (get_byte(extensions.gen_random_bytes(1),0)%p_range)::integer $$;
revoke all on function private.cantina_roll(integer) from public,anon;
create function private.generate_cantina_candidate(p_character uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare first_names text[]:=array['Aren','Kira','Marek','Nessa','Tarek','Lyra','Venn','Sora','Dax','Rian','Zera','Kael','Mira','Bren','Orin','Ilya','Varo','Syra'];
last_names text[]:=array['Voss','Rhett','Kade','Arden','Kross','Talon','Senn','Drake','Nyx','Rook','Astra','Fane','Korr','Thorne','Vale','Raxx','Vek'];
roles text[]:=array['pilot','navigator','engineer','security','medic'];
race text;
begin
select slug into race from public.game_species where is_published order by gen_random_uuid() limit 1;
insert into public.character_cantina_candidates(character_id,name,specialty,aptitude,species_slug)
values(p_character,
first_names[1+private.cantina_roll(array_length(first_names,1))]||' '||
last_names[1+private.cantina_roll(array_length(last_names,1))]||'-'||(10+private.cantina_roll(90))::text,
roles[1+private.cantina_roll(5)],1+private.cantina_roll(5),coalesce(race,'unknown'));
end $$;
revoke all on function private.generate_cantina_candidate(uuid) from public,anon;
create function private.ensure_cantina_roster(p_character uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare rot public.character_cantina_rotation%rowtype; n integer;
begin
select * into rot from public.character_cantina_rotation where character_id=p_character for update;
if not found then
insert into public.character_cantina_rotation(character_id,expires_at,target_count)
values(p_character,clock_timestamp()+interval '24 hours',3+private.cantina_roll(3)) returning * into rot;
elsif rot.expires_at<=clock_timestamp() then
delete from public.character_cantina_candidates where character_id=p_character;
update public.character_cantina_rotation set expires_at=clock_timestamp()+interval '24 hours',
target_count=3+private.cantina_roll(3) where character_id=p_character returning * into rot;
end if;
select count(*) into n from public.character_cantina_candidates where character_id=p_character;
while n<rot.target_count loop perform private.generate_cantina_candidate(p_character);n:=n+1;end loop;
end $$;
revoke all on function private.ensure_cantina_roster(uuid) from public,anon;
create function private.get_cantina_impl() returns jsonb
 language plpgsql security definer set search_path='' as $$
declare cid uuid;expiry timestamptz;roster jsonb;
begin
if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
select id into cid from public.characters where user_id=auth.uid();
if cid is null then raise exception 'Captain required';end if;
perform 1 from public.character_progress where character_id=cid for update;
if not exists(select 1 from public.character_positions p join public.game_locations l on l.id=p.location_id
where p.character_id=cid and l.slug='frontier_station') then raise exception 'Cantina is only accessible at Frontier Station';end if;
perform private.ensure_cantina_roster(cid);
select expires_at into expiry from public.character_cantina_rotation where character_id=cid;
select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'specialty',a.specialty,
'aptitude',a.aptitude,'species_slug',a.species_slug,'portrait_path',s.image_path)
order by a.created_at,a.id),'[]'::jsonb) into roster
from public.character_cantina_candidates a left join public.game_species s on s.slug=a.species_slug
where a.character_id=cid;
return jsonb_build_object('candidates',roster,'expires_at',expiry,'hire_energy_cost',20,'replace_energy_cost',25);
end $$;
revoke all on function private.get_cantina_impl() from public,anon;
create function public.get_cantina_roster() returns jsonb
language sql security invoker set search_path='' as $$ select private.get_cantina_impl() $$;
revoke all on function public.get_cantina_roster() from public,anon;
grant execute on function public.get_cantina_roster() to authenticated;
create function private.hire_cantina_impl(p_candidate uuid,p_position text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare cid uuid;c public.character_cantina_candidates%rowtype;previous text;
e integer;elapsed bigint;regen_at timestamptz;now_at timestamptz:=clock_timestamp();
cfg public.gameplay_rules%rowtype;p public.character_progress%rowtype;cost integer;
begin
if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
if p_position is null or p_position not in ('pilot','navigator','engineer','security','medic')
then raise exception 'Invalid crew position';end if;
select id into cid from public.characters where user_id=auth.uid();
if cid is null then raise exception 'Captain required';end if;
select * into p from public.character_progress where character_id=cid for update;
if not found then raise exception 'Missing progress';end if;
if not exists(select 1 from public.character_positions loc join public.game_locations l on l.id=loc.location_id
where loc.character_id=cid and l.slug='frontier_station') then raise exception 'Cantina is only accessible at Frontier Station';end if;
perform private.ensure_cantina_roster(cid);
select * into c from public.character_cantina_candidates where id=p_candidate and character_id=cid for update;
if not found then raise exception 'Candidate not available';end if;
select name into previous from public.character_crew where character_id=cid and position=p_position for update;
cost:=case when previous is null then 20 else 25 end;
select * into strict cfg from public.gameplay_rules where id=1;
elapsed:=greatest(0,floor(extract(epoch from(now_at-p.energy_at)))::bigint);
e:=least(cfg.energy_max,p.energy+floor(elapsed::numeric/cfg.energy_regen_seconds)::integer);
regen_at:=case when e>=cfg.energy_max then now_at else
p.energy_at+(floor(elapsed::numeric/cfg.energy_regen_seconds)::bigint*cfg.energy_regen_seconds)*interval '1 second' end;
if e<cost then raise exception 'Insufficient energy';end if;
update public.character_progress set energy=e-cost,energy_at=regen_at,updated_at=now_at where character_id=cid;
insert into public.character_crew(character_id,position,name,specialty,aptitude,species_slug)
values(cid,p_position,c.name,c.specialty,c.aptitude,c.species_slug)
on conflict(character_id,position) do update set name=excluded.name,specialty=excluded.specialty,
aptitude=excluded.aptitude,species_slug=excluded.species_slug;
insert into public.character_recruit_log(character_id,candidate_name,assigned_position,replaced_name,energy_cost)
values(cid,c.name,p_position,previous,cost);
delete from public.character_cantina_candidates where id=c.id and character_id=cid;
perform private.ensure_cantina_roster(cid);
return jsonb_build_object('name',c.name,'position',p_position,'replaced',previous,'energy_spent',cost,'energy',e-cost);
end $$;
revoke all on function private.hire_cantina_impl(uuid,text) from public,anon;
create function public.hire_cantina_candidate(p_candidate uuid,p_position text) returns jsonb
 language sql security invoker set search_path='' as $$ select private.hire_cantina_impl(p_candidate,p_position) $$;
revoke all on function public.hire_cantina_candidate(uuid,text) from public,anon;
grant execute on function public.hire_cantina_candidate(uuid,text) to authenticated;
