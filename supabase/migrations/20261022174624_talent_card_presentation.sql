-- Add display data to the existing authenticated player catalog; no new write grants.
do $$declare d text;needle text:=$n$'owned',coalesce$n$;begin
 d:=pg_get_functiondef('private.player_tree_catalog(uuid,uuid)'::regprocedure);
 if position(needle in d)=0 then raise exception 'Unexpected player tree catalog';end if;
 d:=replace(d,needle,$r$
 'powers',coalesce((select jsonb_agg(to_jsonb(p)) from public.game_powers p where p.is_published and exists(select 1 from public.game_talent_tree_nodes n join public.game_talent_trees t on t.id=n.tree_id where n.power_id=p.id and t.is_published and (t.species_id=p_species or t.class_id=p_class))),'[]'),
 'skills',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name_hu',coalesce((select name from public.game_skills_i18n i where i.skill_id=s.id and i.locale='hu'),s.slug),'name_en',coalesce((select name from public.game_skills_i18n i where i.skill_id=s.id and i.locale='en'),s.slug))) from public.game_skills s),'[]'),
 'owned',coalesce$r$);
 execute d;
end $$;
