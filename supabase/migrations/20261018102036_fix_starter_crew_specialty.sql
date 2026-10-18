-- The cantina migration made specialty mandatory; starter crew must set it too.
do $migration$
declare
 definition text;
 old_insert constant text := $old$insert into public.character_crew(character_id,position,name) values
 (v_id,'pilot','Astra-7'),(v_id,'navigator','Navi-12');$old$;
 new_insert constant text := $new$insert into public.character_crew(character_id,position,name,specialty) values
 (v_id,'pilot','Astra-7','pilot'),(v_id,'navigator','Navi-12','navigator');$new$;
begin
 definition := pg_get_functiondef('private.create_captain_impl(text,uuid,uuid,uuid,jsonb,jsonb)'::regprocedure);
 if strpos(definition,new_insert)>0 then return; end if;
 if strpos(definition,old_insert)=0 then
   raise exception 'Unexpected create_captain_impl definition; refusing to overwrite concurrent changes';
 end if;
 execute replace(definition,old_insert,new_insert);
end;
$migration$;
