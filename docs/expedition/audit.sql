-- HV-066 read-only release preflight. No identities, names, secrets or mutations.
begin read only;
select jsonb_build_object(
 'captains',(select count(*) from public.characters),
 'crew',(select count(*) from public.character_crew),
 'selected_companions',(select count(*) from public.character_salvage_party),
 'ship_assignments',(select count(*) from public.character_ship_crew),
 'selected_also_on_ship',(select count(*) from public.character_salvage_party p join public.character_ship_crew s on s.crew_id=p.crew_id),
 'equipment',(select count(*) from public.character_equipment),
 'crew_equipment',(select count(*) from public.character_equipment where crew_id is not null),
 'personal_stacks',(select count(*) from public.character_personal_inventory),
 'cargo_stacks',(select count(*) from public.character_inventory),
 'learned_nodes',(select count(*) from public.character_tree_nodes),
 'learned_talents',(select count(*) from public.character_talents),
 'learned_powers',(select count(*) from public.character_powers),
 'prepared_loadouts',(select count(*) from private.character_power_loadouts),
 'real_active_combats',(select count(*) from public.combat_runs where status='active' and not simulation),
 'all_combats',(select count(*) from public.combat_runs),
 'crew_classes',(select count(*) from public.game_crew_classes),
 'powers',(select count(*) from public.game_powers),
 'crew_with_no_species',(select count(*) from public.character_crew c where not exists(select 1 from public.game_species s where s.slug=c.species_slug)),
 'crew_with_no_full_class',(select count(*) from public.character_crew where class_id is null),
 'nonzero_crew_xp',(select count(*) from public.character_crew where xp>0)
) as inventory;
select conrelid::regclass::text as table_name,conname,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in ('public.characters'::regclass,'public.character_crew'::regclass,
 'public.character_equipment'::regclass,'public.character_ship_crew'::regclass,'public.character_salvage_party'::regclass)
order by table_name,conname;
select p.oid::regprocedure::text as signature,md5(pg_get_functiondef(p.oid)) as definition_hash
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private' and p.proname in ('combat_owned_character','combat_initial','combat_next_turn','combat_auto',
 'combat_act','combat_hero','combat_hero_before_loadout','talent_hp','branch_defenses','crew_sheet','set_salvage_party')
order by signature;
commit;
