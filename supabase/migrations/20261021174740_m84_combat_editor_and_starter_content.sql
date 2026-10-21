-- M84: shared-template editor backing and small playable starting catalog.
create function private.combat_editor_catalog() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required';end if;
 return jsonb_build_object(
 'powers',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_powers_i18n t where t.power_id=p.id),'[]'),'grants',coalesce((select jsonb_agg(g) from public.game_power_grants g where g.power_id=p.id),'[]'))) from public.game_powers p),'[]'),
 'talents',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_talents_i18n t where t.talent_id=p.id),'[]'))) from public.game_talents p),'[]'),
 'enemies',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_enemies_i18n t where t.enemy_id=p.id),'[]'))) from public.game_enemies p),'[]'),
 'encounters',coalesce((select jsonb_agg(p) from public.game_combat_encounters p),'[]'),
 'profiles',coalesce((select jsonb_agg(p) from public.game_combat_profiles p),'[]'),
 'items',coalesce((select jsonb_agg(p) from public.game_item_combat p),'[]'),
 'rules',(select to_jsonb(p) from public.game_combat_rules p where id=1),
 'skills',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_skills_i18n t where t.skill_id=s.id),'[]'))) from public.game_skills s where s.is_combat),'[]'),
 'species',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_species_i18n t where t.species_id=s.id),'[]'))) from public.game_species s),'[]'),
 'classes',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_classes_i18n t where t.class_id=s.id),'[]'))) from public.game_classes s),'[]'),
 'equipment',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_items_i18n t where t.item_id=i.id),'[]'))) from public.game_items i where i.equip_owner is not null),'[]'),
 'locations',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_locations_i18n t where t.location_id=l.id),'[]'))) from public.game_locations l),'[]'),
 'locales',(select jsonb_agg(l order by sort_order) from public.game_locales l where is_enabled));
end $$;
create function private.save_combat_content(p_kind text,p_id uuid,p_document jsonb,p_translations jsonb,p_grants jsonb,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare tab text;prefix text;pk text:='id';ident uuid;existing integer;cols text;sets text;allowed text[];k text;t jsonb;g jsonb;result jsonb;begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required';end if;
 tab:=case p_kind when 'powers' then 'game_powers' when 'talents' then 'game_talents' when 'enemies' then 'game_enemies' when 'encounters' then 'game_combat_encounters' when 'profiles' then 'game_combat_profiles' when 'items' then 'game_item_combat' when 'rules' then 'game_combat_rules' end;
 if tab is null or jsonb_typeof(p_document) is distinct from 'object' then raise exception 'Invalid combat document';end if;
 if p_kind='rules' then
  select revision into existing from public.game_combat_rules where id=1 for update;if p_revision is distinct from existing then raise exception 'Content changed; reload';end if;
  update public.game_combat_rules set defense_curves=p_document->'defense_curves',recovery_energy=(p_document->>'recovery_energy')::int,injury_recovery_ticks=(p_document->>'injury_recovery_ticks')::int,max_rounds=(p_document->>'max_rounds')::int where id=1 returning to_jsonb(game_combat_rules) into result;return result;
 end if;
 if p_kind='items' then pk:='item_id';ident:=coalesce(p_id,(p_document->>'item_id')::uuid);else ident:=coalesce(p_id,gen_random_uuid());end if;
 execute format('select revision from public.%I where %I=$1 for update',tab,pk) into existing using ident;
 if existing is not null and p_revision is distinct from existing or existing is null and p_revision is not null then raise exception 'Content changed; reload';end if;
 select array_agg(attname::text) into allowed from pg_attribute where attrelid=('public.'||tab)::regclass and attnum>0 and not attisdropped and attname not in ('id','revision');
 for k in select jsonb_object_keys(p_document) loop if not k=any(allowed) then raise exception 'Unknown content field: %',k;end if;end loop;
 p_document:=p_document||jsonb_build_object(pk,ident,'revision',coalesce(existing,0)+1);
 select string_agg(format('%I',key),','),string_agg(format('%1$I=excluded.%1$I',key),',') into cols,sets from jsonb_object_keys(p_document)key where key<>'revision';
 -- Populate from the existing row for updates so omitted optional fields retain their values.
 if existing is not null then execute format('select to_jsonb(t) from public.%I t where %I=$1',tab,pk) into result using ident;p_document:=result||p_document;end if;
 execute format('insert into public.%1$I(%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) on conflict(%3$I) do update set %4$s returning to_jsonb(%1$I)',tab,cols,pk,sets) into result using p_document;
 if p_kind in ('powers','talents','enemies') then
  if jsonb_typeof(p_translations) is distinct from 'array' or jsonb_array_length(p_translations)>30 or not exists(select 1 from jsonb_array_elements(p_translations)x where x->>'locale'='hu' and length(btrim(x->>'name'))>0) or not exists(select 1 from jsonb_array_elements(p_translations)x where x->>'locale'='en' and length(btrim(x->>'name'))>0) then raise exception 'Hungarian and English names required';end if;
  prefix:=case p_kind when 'powers' then 'power_id' when 'talents' then 'talent_id' else 'enemy_id' end;
  execute format('delete from public.%I_i18n where %I=$1',tab,prefix) using ident;
  for t in select value from jsonb_array_elements(p_translations) loop execute format('insert into public.%I_i18n(%I,locale,name,description) values($1,$2,$3,$4)',tab,prefix) using ident,t->>'locale',t->>'name',coalesce(t->>'description','');end loop;
 end if;
 if p_kind='powers' then
  if jsonb_typeof(p_grants) is distinct from 'array' or jsonb_array_length(p_grants)>100 then raise exception 'Invalid power grants';end if;
  delete from public.game_power_grants where power_id=ident;
  for g in select value from jsonb_array_elements(p_grants) loop
   insert into public.game_power_grants(power_id,source,species_id,class_id,item_id,faction_id,min_level,min_rank) values(ident,g->>'source',nullif(g->>'species_id','')::uuid,nullif(g->>'class_id','')::uuid,nullif(g->>'item_id','')::uuid,nullif(g->>'faction_id','')::uuid,coalesce((g->>'min_level')::int,1),coalesce((g->>'min_rank')::int,1));
  end loop;
 end if;
 return result;
end $$;
create function public.get_combat_editor_catalog() returns jsonb language sql security invoker set search_path='' as $$select private.combat_editor_catalog()$$;
create function public.save_combat_content(p_kind text,p_id uuid,p_document jsonb,p_translations jsonb default '[]',p_grants jsonb default '[]',p_revision integer default null) returns jsonb language sql security invoker set search_path='' as $$select private.save_combat_content(p_kind,p_id,p_document,p_translations,p_grants,p_revision)$$;
revoke all on function private.combat_editor_catalog(),private.save_combat_content(text,uuid,jsonb,jsonb,jsonb,integer),public.get_combat_editor_catalog(),public.save_combat_content(text,uuid,jsonb,jsonb,jsonb,integer) from public,anon;
grant execute on function private.combat_editor_catalog(),private.save_combat_content(text,uuid,jsonb,jsonb,jsonb,integer),public.get_combat_editor_catalog(),public.save_combat_content(text,uuid,jsonb,jsonb,jsonb,integer) to authenticated;
-- Profiles: exact curves were not recovered; these editable pip curves are provisional balancing defaults.
do $$declare row record;a text;rest text[];profile jsonb;begin
 for row in select id,'species' kind,primary_attribute::text primary_attr,secondary_attribute::text secondary_attr from public.game_species union all select id,'class',primary_attribute::text,secondary_attribute::text from public.game_classes loop
  select array_agg(x order by ord) into rest from unnest(array['body','mind','soul','morale','social'])with ordinality u(x,ord) where x not in (row.primary_attr,row.secondary_attr);
  profile:=jsonb_build_object(row.primary_attr,'primary',row.secondary_attr,'secondary',rest[1],'secondary',rest[2],'tertiary',rest[3],'tertiary');
  insert into public.game_combat_profiles(species_id,class_id,defenses,hp_per_rank) values(case when row.kind='species' then row.id end,case when row.kind='class' then row.id end,profile,case when row.primary_attr='body' then 7 when row.primary_attr='mind' then 4 else 5 end);
 end loop;
end $$;
-- Five basic attacks use the FIVE EXISTING combat skill UUIDs; no new skills or attribute changes.
do $$declare s record;pid uuid;dtype text;begin
 for s in select * from public.game_skills where is_combat loop
  dtype:=case s.attribute::text when 'body' then 'weapon' when 'mind' then 'psionic' when 'soul' then 'soul' when 'morale' then 'void' else 'sonic' end;
  insert into public.game_powers(slug,skill_id,defense,effects,is_published,image_path) values('basic_'||s.attribute::text,s.id,s.attribute::text,jsonb_build_array(jsonb_build_object('type','damage','formula',jsonb_build_object('weapon',1),'damage_types',jsonb_build_array(dtype))),true,s.icon_path) returning id into pid;
  insert into public.game_power_grants(power_id,source) values(pid,'basic');
  insert into public.game_powers_i18n(power_id,locale,name,description) values(pid,'hu','Alaptámadás · '||s.attribute::text,'Egy támadás a hozzá tartozó harci képzettséggel. A döntetlent a védekező nyeri.'),(pid,'en','Basic attack · '||s.attribute::text,'Attack using the associated combat skill. Defender wins ties.');
 end loop;
end $$;
-- Species/class signatures preserve existing identities, adding one signature and one passive talent each.
do $$declare r record;pid uuid;tid uuid;skill uuid;dtype text;effects jsonb;names text[];i int;begin
 for r in select s.id,s.slug,'species' kind,s.primary_attribute::text attr,s.image_path,coalesce((select name from public.game_species_i18n where species_id=s.id and locale='hu'),s.slug) name from public.game_species s
 union all select c.id,c.slug,'class',c.primary_attribute::text,c.image_path,coalesce((select name from public.game_classes_i18n where class_id=c.id and locale='hu'),c.slug) from public.game_classes c loop
  select id into skill from public.game_skills where is_combat and attribute::text=r.attr;
  dtype:=case r.attr when 'body' then 'kinetic' when 'mind' then 'psionic' when 'soul' then 'soul' when 'morale' then 'void' else 'sonic' end;
  if r.slug in ('ember','ferron','karszid','hadur','muszeresz') then
   effects:=jsonb_build_array(jsonb_build_object('type','modifier','target','self','stat','defense','key',r.attr,'amount',3,'duration',3,'group','signature_'||r.slug));
   insert into public.game_powers(slug,kind,target,range_kind,requires_hit,cooldown,max_uses,limit_scope,effects,is_published,image_path) values(r.kind||'_'||r.slug,'active','self','self',false,3,2,'operation',effects,true,r.image_path) returning id into pid;
  elsif r.slug in ('mycelion','navigator') then
   effects:='[{"type":"heal","target":"self","formula":{"dice":2}}]';
   insert into public.game_powers(slug,target,range_kind,requires_hit,cooldown,max_uses,limit_scope,effects,is_published,image_path) values(r.kind||'_'||r.slug,'self','self',false,3,2,'operation',effects,true,r.image_path) returning id into pid;
  else
   effects:=jsonb_build_array(jsonb_build_object('type','damage','formula',jsonb_build_object('dice',2,'pips',1),'damage_types',jsonb_build_array(dtype)),jsonb_build_object('type','modifier','stat','defense','key',r.attr,'amount',-2,'duration',2,'group','signature_'||r.slug));
   insert into public.game_powers(slug,skill_id,defense,cooldown,max_uses,limit_scope,effects,is_published,image_path) values(r.kind||'_'||r.slug,skill,r.attr,3,2,'operation',effects,true,r.image_path) returning id into pid;
  end if;
  insert into public.game_power_grants(power_id,source,species_id,class_id) values(pid,r.kind,case when r.kind='species' then r.id end,case when r.kind='class' then r.id end);
  insert into public.game_powers_i18n values(pid,'hu',r.name||' · Ösztön','A faj vagy kaszt saját harci fogása. Műveletenként legfeljebb kétszer.'),(pid,'en',initcap(r.slug)||' · Instinct','Signature ability. At most twice per operation.');
  insert into public.game_talents(slug,species_id,class_id,image_path,effects,is_published) values(r.kind||'_'||r.slug||'_resolve',case when r.kind='species' then r.id end,case when r.kind='class' then r.id end,r.image_path,jsonb_build_array(jsonb_build_object('type','modifier','stat','defense','key',r.attr,'amount',1,'group','talent_'||r.kind||'_'||r.slug)),true) returning id into tid;
  insert into public.game_talents_i18n values(tid,'hu',r.name||' · Állhatatosság','Passzív: rangonként +1 pip a kapcsolódó Defense-hez.'),(tid,'en',initcap(r.slug)||' · Resolve','Passive: +1 Defense pip per talent rank.');
 end loop;
end $$;
-- Three enemies: direct attacks, healing priority, and a Defense-disrupting power.
do $$declare basic uuid;disrupt uuid;heal uuid;skill uuid;enemy uuid;loc uuid;r record;begin
 select id into basic from public.game_powers where slug='basic_body';select id into skill from public.game_skills where is_combat and attribute::text='body';
 insert into public.game_powers(slug,target,range_kind,requires_hit,cooldown,effects,is_published) values('enemy_regenerate','self','self',false,3,'[{"type":"heal","target":"self","formula":{"dice":1}}]',true) returning id into heal;
 insert into public.game_powers_i18n values(heal,'hu','Önregeneráció','1D gyógyítás.'),(heal,'en','Regenerate','Heal 1D.');
 insert into public.game_powers(slug,skill_id,defense,cooldown,effects,is_published) values('enemy_disrupt',skill,'mind',3,'[{"type":"damage","formula":{"dice":1},"damage_types":["psionic"]},{"type":"modifier","stat":"defense","key":"mind","amount":-3,"duration":2,"group":"disrupt"}]',true) returning id into disrupt;
 insert into public.game_powers_i18n values(disrupt,'hu','Zavaró impulzus','Pszionikus sebzés és -1D Elme Defense.'),(disrupt,'en','Disrupting pulse','Psionic damage and -1D Mind Defense.');
 select id into loc from public.game_locations where slug='frontier_station';
 for r in select * from (values('scrap_sentry','Ócskavas őrszem','Scrap sentry','aggressive',12,3,10),('repair_drone','Javítódrón','Repair drone','healer',14,3,15),('signal_wraith','Jelvisszhang','Signal echo','disruptor',16,4,20))v(slug,hu,en,behavior,hp,weapon,xp) loop
  insert into public.game_enemies(slug,image_path,behavior,health,weapon_pips,power_ids,reward_xp,is_published) values(r.slug,(select image_path from public.game_items where slug=case r.behavior when 'healer' then 'field_scanner' when 'disruptor' then 'captain_relic' else 'crew_armor' end),r.behavior,r.hp,r.weapon,case r.behavior when 'healer' then array[basic,heal] when 'disruptor' then array[disrupt,basic] else array[basic] end,r.xp,true) returning id into enemy;
  insert into public.game_enemies_i18n values(enemy,'hu',r.hu,'Határvidéki kiképző összecsapás.'),(enemy,'en',r.en,'Frontier training encounter.');
  if loc is not null then insert into public.game_combat_encounters(slug,location_id,enemy_id,name_hu,name_en,is_published) values('training_'||r.slug,loc,enemy,r.hu,r.en,true);end if;
 end loop;
end $$;
-- Explicit sample stats only: do not rewrite every item or invent Excel records.
insert into public.game_item_combat(item_id,weapon_pips,resistances)
select id,case when equip_slot in ('main_weapon','sidearm','weapon') then 6 else 0 end,case when equip_slot in ('body_armor','armor') then '{"kinetic":2,"heat":1}'::jsonb else '{}'::jsonb end
from public.game_items where slug in ('captain_sidearm','captain_rifle','captain_vest','crew_weapon','crew_armor') and equip_owner is not null;
