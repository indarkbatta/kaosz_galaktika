-- The actor foundation helper lockdown also matched the existing guarded loadout RPC.
-- Restore only this entry point; internal actor helpers remain inaccessible.
grant execute on function private.expedition_loadout() to authenticated;
