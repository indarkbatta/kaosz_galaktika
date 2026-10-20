-- A limited named roster may legitimately have fewer than the desired 3–5 applicants.
create or replace function private.ensure_cantina_roster(p_character uuid) returns void
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
while n<rot.target_count loop
 begin perform private.generate_cantina_candidate(p_character);
 exception when raise_exception then
  if sqlerrm='No recruitable crew templates available' then exit;else raise;end if;
 end;
 n:=n+1;
end loop;
end $$;
