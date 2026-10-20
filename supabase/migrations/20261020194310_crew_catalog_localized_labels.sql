-- Localized starter labels; editor-customized records are never overwritten.
update public.game_crew_templates t set translations=jsonb_set(jsonb_set(t.translations,'{hu,name}',to_jsonb(r.hu||' · '||q.hu)),'{en,name}',to_jsonb(r.en||' · '||q.en))
from(values('pilot','Pilóta','Pilot'),('navigator','Navigátor','Navigator'),('engineer','Gépész','Engineer'),('security','Biztonsági tiszt','Security officer'),('medic','Orvos','Medic'))r(role,hu,en),
(values('common','Gyakori','Common'),('uncommon','Nem gyakori','Uncommon'),('rare','Ritka','Rare'),('epic','Epikus','Epic'))q(rarity,hu,en)
where t.revision=0 and t.kind='generated' and t.slug='recruit_'||r.role||'_'||q.rarity;
update public.game_crew_portrait_sets p set
 name_hu=coalesce((select name from public.game_classes_i18n where class_id=p.class_id and locale='hu'),(select name from public.game_species_i18n where species_id=p.species_id and locale='hu'),p.slug)||' portrék',
 name_en=coalesce((select name from public.game_classes_i18n where class_id=p.class_id and locale='en'),(select name from public.game_species_i18n where species_id=p.species_id and locale='en'),p.slug)||' portraits'
where p.revision=0 and (p.slug like 'species_%' or p.slug like 'human_%');
