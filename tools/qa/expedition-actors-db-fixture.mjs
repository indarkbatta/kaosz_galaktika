import {readFile} from 'node:fs/promises';
import {setupUnifiedDatabase} from './unified-db-fixture.mjs';
export const actorMigration='supabase/migrations/20261023184118_expedition_actor_foundation.sql';
export async function setupActorDatabase(db){
 await setupUnifiedDatabase(db);
 // Replay the real loadout migration; unrelated storage commands are inert here.
 await db.exec(`create function private.set_equipment_from_storage_impl(text,uuid,uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function private.move_equipment_impl(text,uuid,text,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;`);
 await db.exec(await readFile('supabase/migrations/20261023140241_expedition_loadout.sql','utf8'));
 await db.exec(`reset role;alter table public.character_progress drop constraint character_progress_character_id_fkey;
 alter table public.character_progress add foreign key(character_id) references public.characters(id) on delete cascade;`);
}
