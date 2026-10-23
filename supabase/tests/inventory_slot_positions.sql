begin;
do $$declare cid uuid;uid uuid;a uuid;b uuid;v jsonb;begin
select c.id,c.user_id into cid,uid from public.characters c where exists(select 1 from public.character_inventory i where i.character_id=c.id and quantity>0) limit 1;
perform set_config('request.jwt.claim.sub',uid::text,true);
select item_id into a from public.character_inventory where character_id=cid and quantity>0 order by item_id limit 1;
v:=public.drop_inventory_item(a,1,'cargo','personal',4);
if not exists(select 1 from jsonb_array_elements(v->'personal')x where (x->>'item_id')::uuid=a and (x->>'position')::int=4) then raise exception 'Target slot not preserved';end if;
v:=public.get_storage_inventory();
if not exists(select 1 from jsonb_array_elements(v->'personal')x where (x->>'item_id')::uuid=a and (x->>'position')::int=4) then raise exception 'Reload lost slot';end if;
select item_id into b from public.character_inventory where character_id=cid and quantity>0 and item_id<>a order by item_id limit 1;
v:=public.drop_inventory_item(b,1,'cargo','personal',2);
v:=public.drop_inventory_item(a,1,'personal','personal',2);
if not exists(select 1 from jsonb_array_elements(v->'personal')x where (x->>'item_id')::uuid=b and (x->>'position')::int=4) then raise exception 'Swap lost displaced item';end if;
begin perform public.drop_inventory_item(a,1,'personal','personal',-1);raise exception 'Invalid slot accepted';exception when others then if sqlerrm='Invalid slot accepted' then raise;end if;end;
set constraints all immediate;
end $$;
rollback;
