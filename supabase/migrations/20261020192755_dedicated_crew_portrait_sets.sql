-- Dedicated faces, never class banners. Preserve sets already customized in the editor.
update public.game_crew_portrait_sets set image_paths=array['hatarvilag/crew/portraits-v1/mara.webp','hatarvilag/crew/portraits-v1/aren.webp']
where revision=0 and (slug='species_ember' or slug like 'human_%');
update public.game_crew_templates set portrait_path='hatarvilag/crew/portraits-v1/kael.webp' where slug='kael_ross' and revision=0;
create function private.resolve_crew_portrait_for(p_character uuid,p_species uuid,p_class uuid,p_set uuid default null,p_override text default null) returns text
language plpgsql volatile security definer set search_path='' as $$
declare paths text[];chosen text;
begin
 if p_override is not null then return p_override;end if;
 select x.image_paths into paths from public.game_crew_portrait_sets x where x.is_published
 and (p_set is null or x.id=p_set) and (x.species_id is null or x.species_id=p_species) and (x.class_id is null or x.class_id=p_class)
 order by ((x.species_id is not null)::integer+(x.class_id is not null)::integer) desc,(x.species_id is not null) desc,x.slug limit 1;
 -- Prefer a fresh face within this captain's roster when one remains available.
 select path into chosen from unnest(paths) path where not exists(select 1 from public.character_crew where character_id=p_character and portrait_path=path)
 and not exists(select 1 from public.character_cantina_candidates where character_id=p_character and portrait_path=path) order by gen_random_uuid() limit 1;
 if chosen is null then select path into chosen from unnest(paths) path order by gen_random_uuid() limit 1;end if;
 if chosen is null then select image_path into chosen from public.game_species where id=p_species;end if;
 return chosen;
end $$;
revoke all on function private.resolve_crew_portrait_for(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
create or replace function private.initialize_crew_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare species uuid;
begin
 if new.species_slug is null then select s.slug into new.species_slug from public.characters c join public.game_species s on s.id=c.species_id where c.id=new.character_id;end if;
 if new.class_id is null then select class_id into new.class_id from public.characters where id=new.character_id;end if;
 select id into species from public.game_species where slug=new.species_slug;
 if new.portrait_path is null then new.portrait_path:=private.resolve_crew_portrait_for(new.character_id,species,new.class_id);end if;
 return new;
end $$;
create or replace function private.generate_cantina_candidate(p_character uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.game_crew_templates%rowtype;sp uuid;cl uuid;race text;nm text;pic text;
first_names text[]:=array['Aren','Kira','Marek','Nessa','Tarek','Lyra','Venn','Sora','Dax','Rian','Zera','Kael','Mira','Bren','Orin','Ilya','Varo','Syra'];
last_names text[]:=array['Voss','Rhett','Kade','Arden','Kross','Talon','Senn','Drake','Nyx','Rook','Astra','Fane','Korr','Thorne','Vale','Raxx','Vek'];
begin
 select * into t from public.game_crew_templates x where x.is_published and x.source='cantina' and x.weight>0
 and (x.species_id is null or exists(select 1 from public.game_species where id=x.species_id and is_published))
 and (x.class_id is null or exists(select 1 from public.game_classes where id=x.class_id and is_published))
 and (x.max_per_character=0 or x.max_per_character>(select count(*) from public.character_crew where character_id=p_character and template_id=x.id)+(select count(*) from public.character_cantina_candidates where character_id=p_character and template_id=x.id))
 order by -ln(1-random())/x.weight limit 1;
 if not found then raise exception 'No recruitable crew templates available';end if;
 sp:=t.species_id;cl:=t.class_id;
 if t.portrait_set_id is not null then select coalesce(sp,species_id),coalesce(cl,class_id) into sp,cl from public.game_crew_portrait_sets where id=t.portrait_set_id;end if;
 if sp is null then select id into sp from public.game_species where is_published order by gen_random_uuid() limit 1;end if;
 if cl is null then select id into cl from public.game_classes where is_published order by gen_random_uuid() limit 1;end if;
 select slug into race from public.game_species where id=sp;
 if sp is null or cl is null then raise exception 'Published species and class required';end if;
 nm:=case when t.kind='named' then t.translations->'hu'->>'name' else first_names[1+private.cantina_roll(cardinality(first_names))]||' '||last_names[1+private.cantina_roll(cardinality(last_names))] end;
 pic:=private.resolve_crew_portrait_for(p_character,sp,cl,t.portrait_set_id,t.portrait_path);
 insert into public.character_cantina_candidates(character_id,name,specialty,aptitude,species_slug,class_id,template_id,portrait_path,rarity,biography,hull_bonus,shield_bonus,damage_bonus,speed_bonus)
 values(p_character,nm,t.specialty,t.aptitude,race,cl,t.id,pic,t.rarity,t.translations,t.hull_bonus,t.shield_bonus,t.damage_bonus,t.speed_bonus);
end $$;

-- Repair only the initial class-banner placeholders; real/custom portrait snapshots stay fixed.
do $$declare x record;begin
 for x in select c.id,c.character_id,c.class_id,s.id as species from public.character_crew c join public.game_species s on s.slug=c.species_slug where c.portrait_path like 'hatarvilag/classes/torchlight-banner-v1/%' order by c.id loop
  update public.character_crew set portrait_path=private.resolve_crew_portrait_for(x.character_id,x.species,x.class_id) where id=x.id;
 end loop;
end $$;
update public.character_cantina_candidates set portrait_path='hatarvilag/crew/portraits-v1/kael.webp' where template_id=(select id from public.game_crew_templates where slug='kael_ross') and portrait_path like 'hatarvilag/classes/torchlight-banner-v1/%';
notify pgrst,'reload schema';
