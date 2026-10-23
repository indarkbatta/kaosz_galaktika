-- Run after the visual UI layout migration inside BEGIN / ROLLBACK.
do $$declare eid uuid;doc jsonb;r jsonb;bad jsonb;begin
select user_id into eid from public.user_roles where role in ('admin','editor') limit 1;perform set_config('request.jwt.claim.sub',eid::text,true);
r:=public.get_ui_layout_editor();doc:=r->'draft';
doc:=jsonb_set(doc,'{desktop,nodes,personal}', '{"rect":{"x":32,"y":8,"w":24,"h":90},"label":{"hu":"ZSÁK","en":"BAG"},"background":"hatarvilag/items/test.webp","opacity":0.18}');
r:=public.change_ui_layout(0,'save',doc);
if public.get_published_ui_layout() is not null then raise exception 'Draft leaked';end if;
r:=public.change_ui_layout(1,'publish',doc);
if public.get_published_ui_layout() is distinct from doc then raise exception 'Publication failed';end if;
begin perform public.change_ui_layout(1,'save',doc);raise exception 'Stale accepted';exception when serialization_failure then null;end;
bad:=jsonb_set(doc,'{desktop,nodes,personal,background}','"https://evil.invalid/x.svg"');begin perform public.change_ui_layout(2,'publish',bad);raise exception 'Unsafe image accepted';exception when others then if sqlerrm='Unsafe image accepted' then raise;end if;end;
bad:=jsonb_set(doc,'{desktop,nodes,personal,rect,x}','95');begin perform public.change_ui_layout(2,'save',bad);raise exception 'Out of bounds accepted';exception when others then if sqlerrm='Out of bounds accepted' then raise;end if;end;
r:=public.change_ui_layout(2,'rollback',null);if public.get_published_ui_layout()->'desktop'->'nodes'<>'{}'::jsonb then raise exception 'Rollback failed';end if;
perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
begin perform public.get_ui_layout_editor();raise exception 'Player read draft';exception when insufficient_privilege then null;end;
begin perform public.change_ui_layout(3,'save',doc);raise exception 'Player wrote layout';exception when insufficient_privilege then null;end;
if has_table_privilege('authenticated','private.ui_layouts','UPDATE') or has_function_privilege('anon','public.get_published_ui_layout()','EXECUTE') then raise exception 'Unexpected grants';end if;
end $$;
