-- HP is the two branch bases plus the branch selected for each later point.
create function private.talent_hp(p_species uuid,p_class uuid,p_character uuid) returns jsonb language sql stable set search_path='' as $$
 with bases as (
 select coalesce((select hp_per_rank from public.game_combat_profiles where species_id=p_species),0) s,
 coalesce((select hp_per_rank from public.game_combat_profiles where class_id=p_class),0) c),
 spent as(select greatest(0,count(*) filter(where branch='species')::int-1) s,greatest(0,count(*) filter(where branch='class')::int-1) c from public.character_tree_nodes where character_id=p_character),
 ranks as(select coalesce((select species_rank-1 from public.character_combat_progress where character_id=p_character),0) s,coalesce((select class_rank-1 from public.character_combat_progress where character_id=p_character),0) c)
 select jsonb_build_object('species_base',b.s,'class_base',b.c,'species_points',n.s+r.s,'class_points',n.c+r.c,'species_total',b.s*(1+n.s+r.s),'class_total',b.c*(1+n.c+r.c),'max_health',b.s*(1+n.s+r.s)+b.c*(1+n.c+r.c)) from bases b cross join spent n cross join ranks r
$$;
revoke all on function private.talent_hp(uuid,uuid,uuid) from public,anon,authenticated;
do $$declare d text;begin
 d:=pg_get_functiondef('private.combat_hero(uuid)'::regprocedure);
 if position('hp:=hp+coalesce((c.attribute_pips->>a)::int,3)/3;' in d)=0 or position('hp:=hp+prof.hp_per_rank*rank;' in d)=0 then raise exception 'Unexpected HP formula';end if;
 d:=replace(d,'hp:=hp+coalesce((c.attribute_pips->>a)::int,3)/3;','');
 d:=replace(d,'hp:=hp+prof.hp_per_rank*rank;','');
 d:=replace(d,$n$return jsonb_build_object('id','captain'$n$,$r$hp:=(private.talent_hp(c.species_id,c.class_id,c.id)->>'max_health')::int;
 return jsonb_build_object('id','captain'$r$);
 execute d;
 d:=pg_get_functiondef('private.player_tree_catalog(uuid,uuid)'::regprocedure);
 if position($n$'level',lvl,$n$ in d)=0 then raise exception 'Unexpected player catalog';end if;
 d:=replace(d,$n$'level',lvl,$n$,$r$'level',lvl,'hp',private.talent_hp(p_species,p_class,cid),$r$);execute d;
end $$;
