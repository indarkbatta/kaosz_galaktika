begin;
do $$declare cid uuid;uid uuid;v jsonb;ids uuid[];actual uuid[];begin
select id,user_id into cid,uid from public.characters limit 1;perform set_config('request.jwt.claim.sub',uid::text,true);
v:=public.get_expedition_loadout();
select array_agg((p->>'id')::uuid order by n desc) into ids from jsonb_array_elements(v->'powers') with ordinality x(p,n) where n<=3;
perform public.save_expedition_powers(ids);
select array_agg((p->>'id')::uuid order by n) into actual from jsonb_array_elements(private.combat_hero(cid)->'powers') with ordinality x(p,n) where p->>'kind'='active';
if actual is distinct from ids then raise exception 'Prepared power order not used by combat';end if;
if public.get_expedition_loadout()->'prepared' <> to_jsonb(ids) then raise exception 'Reload lost prepared powers';end if;
begin perform public.save_expedition_powers(array[ids[1],ids[1]]);raise exception 'Duplicate accepted';exception when others then if sqlerrm='Duplicate accepted' then raise;end if;end;
begin perform public.save_expedition_powers(array[ids[1],ids[1],ids[1],ids[1],ids[1],ids[1]]);raise exception 'Six accepted';exception when others then if sqlerrm='Six accepted' then raise;end if;end;
begin perform public.save_expedition_powers(array[gen_random_uuid()]);raise exception 'Unlearned accepted';exception when others then if sqlerrm='Unlearned accepted' then raise;end if;end;
perform public.save_expedition_powers('{}');
if exists(select 1 from jsonb_array_elements(private.combat_hero(cid)->'powers')p where p->>'kind'='active') then raise exception 'Empty selection ignored';end if;
if has_function_privilege('anon','public.save_expedition_powers(uuid[])','EXECUTE') then raise exception 'Anonymous save permitted';end if;
end $$;
rollback;
