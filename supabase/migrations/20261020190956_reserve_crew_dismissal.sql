-- Reserve-only dismissal returns personal equipment atomically; failure preserves the member.
create function private.dismiss_reserve_crew_impl(p_crew uuid,p_confirmation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cid uuid;member public.character_crew%rowtype;gear record;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id into cid from public.characters where user_id=auth.uid();if cid is null then raise exception 'Captain required';end if;
 perform 1 from public.character_progress where character_id=cid for update;
 select * into member from public.character_crew where id=p_crew and character_id=cid for update;
 if not found then raise exception 'Not your crew member';end if;
 if p_confirmation is distinct from member.name then raise exception 'Crew dismissal confirmation required';end if;
 if exists(select 1 from public.character_ship_crew where character_id=cid and crew_id=p_crew) then raise exception 'Return crew to reserve before dismissal';end if;
 for gear in select slot from public.character_equipment where character_id=cid and crew_id=p_crew loop
  perform private.set_equipment_from_storage_impl(gear.slot,null,p_crew,'cargo');
 end loop;
 delete from public.character_crew where id=p_crew and character_id=cid;
 return jsonb_build_object('dismissed',member.name);
end $$;
create function public.dismiss_reserve_crew(p_crew uuid,p_confirmation text) returns jsonb language sql security invoker set search_path='' as $$select private.dismiss_reserve_crew_impl(p_crew,p_confirmation)$$;
revoke all on function private.dismiss_reserve_crew_impl(uuid,text),public.dismiss_reserve_crew(uuid,text) from public,anon;
grant execute on function private.dismiss_reserve_crew_impl(uuid,text),public.dismiss_reserve_crew(uuid,text) to authenticated;
notify pgrst,'reload schema';
