import {readFile} from 'node:fs/promises';
import {setupActorDatabase,actorMigration} from './expedition-actors-db-fixture.mjs';
export const recruitMigration='supabase/migrations/20261023185918_expedition_companion_recruitment.sql';
export async function setupRecruitDatabase(db){
 await setupActorDatabase(db);
 await db.exec(`create table game_rules(id int primary key,base_attribute_pips int,free_attribute_pips int,max_attribute_pips int,free_skill_pips int,max_allocated_skill_pips int);
 insert into game_rules values(1,3,6,18,6,6);
 create table game_species_skill_bonuses(species_id uuid,skill_id uuid,bonus_pips int);
 create table game_classes_skill_bonuses(class_id uuid,skill_id uuid,bonus_pips int);
 create table game_starter_ships(id uuid primary key default gen_random_uuid(),is_published boolean default true);insert into game_starter_ships default values;
 alter table characters add column starter_ship_id uuid;
 create table character_crew(id uuid primary key default gen_random_uuid(),character_id uuid,position text,name text);
 alter table character_skill_upgrades add unique(character_id,skill_id);`);
 // Replay the actual captain allocator instead of the tree fixture's unrelated creation stub.
 const original=await readFile('supabase/migrations/20261017080000_m12_skills_rules_characters_ship_and_crew.sql','utf8');
 let create=original.slice(original.indexOf('create or replace function public.create_captain('),original.indexOf('revoke all on function public.create_captain('));
 create=create.replace('public.create_captain(','private.create_captain_impl(');
 await db.exec(create);
 const gameplay=await readFile('supabase/migrations/20261017120000_m20_gameplay_energy_xp_actions.sql','utf8');
 await db.exec(gameplay.slice(gameplay.indexOf('create function private.upgrade_captain_skill_impl'),gameplay.indexOf('revoke all on function private.upgrade_captain_skill_impl')));
 await db.exec(await readFile(actorMigration,'utf8'));
 await db.exec(await readFile(recruitMigration,'utf8'));
}
export async function seedRecruitTemplate(db){
 const c=(await db.query('select public.get_expedition_template_catalog() c')).rows[0].c;
 const skill=c.skills.find(s=>s.attribute==='body').id;
 const doc={slug:'qa_companion',name_hu:'Vaskéz',name_en:'Ironhand',description_hu:'Egy expedíciós társ.',description_en:'An expedition companion.',
 species_id:c.species[0].id,class_id:c.classes[0].id,portrait_path:'hatarvilag/species/qa.webp',attribute_points:{body:6},skill_points:{[skill]:6},species_node:null,class_node:null,hire_energy:1,is_published:true};
 const row=(await db.query('select public.save_expedition_template(null,null,$1) t',[JSON.stringify(doc)])).rows[0].t;
 return {doc,row,skill};
}
