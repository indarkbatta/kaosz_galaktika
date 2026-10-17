grant execute on function private.get_cantina_impl() to authenticated;
grant execute on function private.hire_cantina_impl(uuid,text) to authenticated;
grant execute on function private.craft_item_impl(uuid,integer) to authenticated;
grant execute on function private.save_game_item_impl(uuid,text,text,text,boolean,jsonb,jsonb) to authenticated;
grant execute on function private.set_item_recipe_impl(uuid,jsonb) to authenticated;