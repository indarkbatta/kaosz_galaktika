-- Keep SECURITY DEFINER behind the private schema; public RPC is SECURITY INVOKER.
alter function public.create_captain(text,uuid,uuid,uuid,jsonb,jsonb) set schema private;
alter function private.create_captain(text,uuid,uuid,uuid,jsonb,jsonb) rename to create_captain_impl;
revoke all on function private.create_captain_impl(text,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.create_captain_impl(text,uuid,uuid,uuid,jsonb,jsonb) to authenticated;
create function public.create_captain(
 p_name text,p_species uuid,p_class uuid,p_ship uuid,p_attribute_points jsonb,p_skill_points jsonb
) returns uuid
language sql security invoker set search_path=''
as $$select private.create_captain_impl(p_name,p_species,p_class,p_ship,p_attribute_points,p_skill_points)$$;
revoke all on function public.create_captain(text,uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_captain(text,uuid,uuid,uuid,jsonb,jsonb) to authenticated;
