create function private.ship_status(p_character uuid) returns jsonb
language sql stable security definer set search_path='' as $fn$
 with ship as (select s.* from public.characters c join public.game_starter_ships s on s.id=c.starter_ship_id where c.id=p_character),
 effects as (select coalesce(sum(m.power_draw),0) draw,coalesce(sum(m.power_output),0) output,
 coalesce(sum(m.hull_bonus),0) hull,coalesce(sum(m.shield_bonus),0) shield,
 coalesce(sum(m.damage_bonus),0) damage,coalesce(sum(m.speed_bonus),0) speed,coalesce(sum(m.cargo_bonus),0) cargo
 from public.character_ship_equipment e join public.game_ship_modules m on m.item_id=e.item_id
 where e.character_id=p_character and e.ship_id=(select id from ship)),
 missing as (select count(*) n from public.game_ship_slots s where s.ship_id=(select id from ship) and s.required and
 case when s.kind='module' then not exists(select 1 from public.character_ship_equipment e where e.character_id=p_character and e.ship_id=s.ship_id and e.slot_key=s.slot_key)
 else not exists(select 1 from public.character_ship_crew a join public.character_crew c on c.id=a.crew_id and c.character_id=a.character_id
 where a.character_id=p_character and a.ship_id=s.ship_id and a.slot_key=s.slot_key and c.specialty=s.crew_role and c.aptitude>=s.min_aptitude) end)
 select jsonb_build_object('hull',s.hull+e.hull,'shield',e.shield,'damage',e.damage,
 'speed',greatest(1,s.speed+e.speed),'cargo',s.cargo+e.cargo,'base_speed',s.speed,
 'power_draw',e.draw,'power_output',e.output,'missing_required',m.n,'ready',m.n=0 and e.draw<=e.output and exists(select 1 from public.game_ship_slots z where z.ship_id=s.id))
 from ship s cross join effects e cross join missing m;
 $fn$;
revoke all on function private.ship_status(uuid) from public,anon,authenticated;

