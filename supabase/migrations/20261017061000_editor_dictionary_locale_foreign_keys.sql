-- Keep every translated catalog record associated with an enabled language code.
-- Languages are added through the editor; deletion of the language code itself is intentionally disabled.
alter table public.game_species_i18n add constraint game_species_i18n_locale_fk
 foreign key(locale) references public.game_locales(code) on update cascade on delete restrict;
alter table public.game_classes_i18n add constraint game_classes_i18n_locale_fk
 foreign key(locale) references public.game_locales(code) on update cascade on delete restrict;
alter table public.game_skills_i18n add constraint game_skills_i18n_locale_fk
 foreign key(locale) references public.game_locales(code) on update cascade on delete restrict;
