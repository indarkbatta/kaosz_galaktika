-- M86: content links, reward selection and supporting FK indexes.
create index combat_operations_character_history on public.combat_operations(character_id,started_at desc);
create index game_powers_i18n_locale on public.game_powers_i18n(locale);
create index game_talents_i18n_locale on public.game_talents_i18n(locale);
create index game_enemies_i18n_locale on public.game_enemies_i18n(locale);
create function private.combat_power_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' then
  if exists(select 1 from public.game_enemies where old.id=any(power_ids)) then raise exception 'Power is used by an enemy; reassign it first' using errcode='23503';end if;
  return old;
 end if;
 if (new.kind<>'active' or not new.is_published) and exists(select 1 from public.game_enemies where new.id=any(power_ids) and is_published) then raise exception 'Published enemies require this active published power' using errcode='23503';end if;
 return new;
end $$;
revoke all on function private.combat_power_reference_guard() from public,anon,authenticated;
create trigger combat_power_references before delete or update of kind,is_published on public.game_powers for each row execute function private.combat_power_reference_guard();
-- Every item can be a reward, not just equippable gear. The old editor authorization check remains.
create or replace function public.get_combat_editor_catalog() returns jsonb language sql security invoker set search_path='' as $$
 select private.combat_editor_catalog()||jsonb_build_object('reward_items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_items_i18n t where t.item_id=i.id),'[]'))) from public.game_items i),'[]'))
$$;
update public.game_powers_i18n t set name=case t.locale when 'hu' then 'Alaptámadás · ' else 'Basic attack · ' end||coalesce((select name from public.game_skills_i18n s where s.skill_id=p.skill_id and s.locale=t.locale),p.defense)
from public.game_powers p where p.id=t.power_id and p.slug in ('basic_body','basic_mind','basic_soul','basic_morale','basic_social') and t.locale in ('hu','en');
-- Test any SAVED power, including a draft, without adding a grant to the real character.
create function private.combat_test_power(p_power uuid,p_enemy uuid,p_attacker uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare hero jsonb;power jsonb;cid uuid;state jsonb;run uuid;begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required';end if;
 select to_jsonb(p)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_powers_i18n t where t.power_id=p.id),'[]')) into power from public.game_powers p where id=p_power;
 if power is null then raise exception 'Save the power before testing';end if;
 select id into cid from public.characters where user_id=auth.uid();
 if p_attacker is not null then hero:=private.combat_enemy(p_attacker);elsif cid is not null then hero:=private.combat_hero(cid);else hero:=private.combat_enemy(p_enemy);end if;
 hero:=hero||jsonb_build_object('health',hero->'max_health','injuries','{}'::jsonb);
 if power->>'kind'='active' then hero:=jsonb_set(hero,'{powers}',jsonb_build_array(power));else hero:=jsonb_set(hero,'{effects}',(hero->'effects')||(power->'effects'));end if;
 state:=private.combat_initial(hero,private.combat_enemy(p_enemy),'{}');
 insert into public.combat_runs(character_id,owner_id,simulation,state) values(cid,auth.uid(),true,state) returning id into run;perform private.combat_commit(run,state);return private.combat_view(run);
end $$;
create function public.simulate_power(p_power uuid,p_enemy uuid,p_attacker uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.combat_test_power(p_power,p_enemy,p_attacker)$$;
revoke all on function private.combat_test_power(uuid,uuid,uuid),public.simulate_power(uuid,uuid,uuid) from public,anon;
grant execute on function private.combat_test_power(uuid,uuid,uuid),public.simulate_power(uuid,uuid,uuid) to authenticated;
-- Start intents remain idempotent even if a battle finishes before a network retry.
create table public.combat_start_requests(character_id uuid not null references public.characters(id) on delete cascade,request_id uuid not null,run_id uuid not null references public.combat_runs(id) on delete cascade,primary key(character_id,request_id));
create index combat_start_requests_run on public.combat_start_requests(run_id);
alter table public.combat_start_requests enable row level security;revoke all on public.combat_start_requests from public,anon,authenticated;grant select on public.combat_start_requests to authenticated;
create policy combat_start_owner on public.combat_start_requests for select to authenticated using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
create function private.combat_begin(p_encounter uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare cid uuid;run uuid;result jsonb;begin
 cid:=private.combat_owned_character();if p_request is null then raise exception 'Request ID required';end if;
 select run_id into run from public.combat_start_requests where character_id=cid and request_id=p_request;if found then return private.combat_view(run);end if;
 result:=private.combat_start(p_encounter);run:=(result->>'id')::uuid;insert into public.combat_start_requests(character_id,request_id,run_id) values(cid,p_request,run);return result;
end $$;
create function public.begin_combat(p_encounter uuid,p_request uuid) returns jsonb language sql security invoker set search_path='' as $$select private.combat_begin(p_encounter,p_request)$$;
revoke all on function private.combat_begin(uuid,uuid),public.begin_combat(uuid,uuid) from public,anon;
grant execute on function private.combat_begin(uuid,uuid),public.begin_combat(uuid,uuid) to authenticated;
