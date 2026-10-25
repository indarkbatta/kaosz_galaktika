-- Snap points are optional canvas-space attachment targets stored with each layer.
-- Older definitions remain valid; preserve the existing authorization/revision/lock logic.
do $migration$
declare definition text; marker text := 'if coalesce((s->>''x'')'; validation text := $validation$
if s ? 'snap_points' then
 if jsonb_typeof(s->'snap_points') is distinct from 'array' or jsonb_array_length(s->'snap_points')>32 then raise exception 'Invalid snap points';end if;
 if (select count(*)<>count(distinct p->>'id') from jsonb_array_elements(s->'snap_points') p) then raise exception 'Duplicate snap point';end if;
 for v in select * from jsonb_array_elements(s->'snap_points') loop
  if jsonb_typeof(v) is distinct from 'object' or coalesce(length(v->>'id'),0) not between 1 and 80 or not exists(select 1 from public.game_component_types where code=v->>'type_code') then raise exception 'Invalid snap point type';end if;
  if jsonb_typeof(v->'x') is distinct from 'number' or jsonb_typeof(v->'y') is distinct from 'number' then raise exception 'Invalid snap point coordinates';end if;
  if not ((v->>'x')::numeric between 0 and 100 and (v->>'y')::numeric between 0 and 100) then raise exception 'Invalid snap point coordinates';end if;
 end loop;
end if;
$validation$;
begin
 definition:=pg_get_functiondef('private.save_equipment_blueprint(uuid,jsonb,integer)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Blueprint validation insertion point missing';end if;
 execute replace(definition,marker,validation||marker);
end $migration$;
