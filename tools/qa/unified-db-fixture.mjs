import {readFile} from 'node:fs/promises';
import {setupTreeDatabase} from './talent-tree-database.mjs';
export async function upgradeUnifiedDatabase(db){
 await db.exec(`alter table game_skills_i18n add column if not exists description text default '';
 create table character_skill_challenge_runs(character_id uuid,status text);
 create function private.create_captain_impl(text,uuid,uuid,uuid,jsonb,jsonb) returns uuid language sql as $$select id from public.characters where user_id=auth.uid()$$;
 `);
 // Unrelated challenge/action evaluators are exercised by the linked integration suite.
 let learning=await readFile('supabase/migrations/20261022162724_talent_tree_learning.sql','utf8');
 const start=learning.indexOf('-- Passives affect noncombat actions');const end=learning.indexOf('revoke all on function private.tree_points',start);learning=learning.slice(0,start)+learning.slice(end);
 await db.exec(learning);
 await db.exec(await readFile('supabase/migrations/20261022174624_talent_card_presentation.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261022191143_talent_branch_hp.sql','utf8'));
 // Add real active-defense slots and descriptions to the minimal combat fixture.
 await db.exec(`insert into game_skills(slug,attribute,is_combat) values('reflexes','body',false),('analysis','mind',false),('willpower','soul',false),('discipline','morale',false),('networking','social',false);
 insert into game_skills_i18n select id,'hu',slug,'' from game_skills where not is_combat;insert into game_skills_i18n select id,'en',slug,'' from game_skills where not is_combat;`);
 await db.exec(await readFile('supabase/migrations/20261022194323_unified_talents_defenses.sql','utf8'));
}
export async function setupUnifiedDatabase(db){await setupTreeDatabase(db);await upgradeUnifiedDatabase(db);}
