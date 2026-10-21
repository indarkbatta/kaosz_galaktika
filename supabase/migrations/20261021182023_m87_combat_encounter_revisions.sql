-- Encounter authoring has the same optimistic revision contract as the other editors.
create function private.combat_encounter_validate() returns trigger language plpgsql set search_path='' as $$begin
 if length(btrim(new.name_hu)) not between 1 and 100 or length(btrim(new.name_en)) not between 1 and 100 then raise exception 'Hungarian and English encounter names required';end if;
 if new.is_published and not exists(select 1 from public.game_enemies where id=new.enemy_id and is_published) then raise exception 'Publish the enemy before publishing its encounter';end if;
 if tg_op='UPDATE' then new.revision:=old.revision+1;end if;return new;
end $$;
revoke all on function private.combat_encounter_validate() from public,anon,authenticated;
create trigger combat_encounter_validate before insert or update on public.game_combat_encounters for each row execute function private.combat_encounter_validate();
-- Preserve the two directly matching, recovered DarkPlanet Health-per-rank decisions.
update public.game_combat_profiles set hp_per_rank=5 where species_id in (select id from public.game_species where slug='ember');
update public.game_combat_profiles set hp_per_rank=4 where class_id in (select id from public.game_classes where slug='pszion');
