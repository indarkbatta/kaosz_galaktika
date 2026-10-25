-- Layer visibility and locking are optional; old assemblies remain valid.
do $migration$
declare definition text; marker text:='if s ? ''snap_points'' then';
begin
 definition:=pg_get_functiondef('private.save_equipment_blueprint(uuid,jsonb,integer)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Snap validation missing';end if;
 execute replace(definition,marker,$validation$
 if (s ? 'hidden' and jsonb_typeof(s->'hidden') is distinct from 'boolean') or (s ? 'locked' and jsonb_typeof(s->'locked') is distinct from 'boolean') then raise exception 'Invalid layer flags';end if;
$validation$||marker);
end $migration$;
