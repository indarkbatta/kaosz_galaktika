-- Seed separate HU/EN skill scope descriptions and asset keys.
update public.game_skills s set icon_path='hatarvilag/skills/'||s.slug||'.jpg' where icon_path is null;
update public.game_skills_i18n tr set description=case when tr.locale='hu' then v.hu else v.en end from public.game_skills s join (values
('athletics','Futás, ugrás, mászás és fizikai akadályok leküzdése.','Running, jumping, climbing and overcoming physical obstacles.'),
('endurance','Kimerülés, terhelés és hosszabb fizikai megpróbáltatások elviselése.','Enduring exhaustion, exertion and extended physical hardship.'),
('reflexes','Váratlan veszélyekre való gyors, ösztönös reagálás.','Reacting quickly and instinctively to sudden hazards.'),
('stealth','Észrevétlen mozgás és rejtőzködés a terepen.','Unnoticed movement and remaining concealed in the field.'),
('physical_arms','Lőfegyverek és közelharci fegyverek pontos, hatékony használata.','Accurate and effective use of ranged and melee weapons.'),
('analysis','Adatokból logikai következtetések és mintázatok felismerése.','Drawing logical conclusions and recognising patterns in data.'),
('engineering','Gépek, áramkörök és szerkezetek javítása, építése.','Repairing and constructing machines, circuits and mechanisms.'),
('navigation','Csillagtérképek, útvonalak és térbeli helyzetek értelmezése.','Interpreting star charts, routes and spatial positioning.'),
('research','Források felkutatása, vizsgálatok tervezése és ismeretszerzés.','Locating sources, planning investigations and acquiring knowledge.'),
('psionic_arms','Pszionikus energiával működő fegyverek vezérlése.','Controlling weapon systems powered by psionic energy.'),
('intuition','Rejtett összefüggések és szándékok megérzése.','Sensing hidden connections and intentions.'),
('willpower','Tudati kényszer és külső mentális nyomás visszaverése.','Resisting mental coercion and external psychic pressure.'),
('attunement','Kapcsolódás rendellenes energiamezőkhöz és rezonanciákhoz.','Attuning to anomalous energy fields and resonances.'),
('meditation','Belső egyensúly, tudatösszpontosítás és regeneráció.','Maintaining inner balance, mental focus and recovery.'),
('terror_arms','Stressz- és terrorhatású különleges eszközök működtetése.','Operating specialized devices producing stress and terror effects.'),
('command','Csapatok szervezése, utasítások kiadása és koordinálás.','Organizing teams, giving orders and coordinating operations.'),
('discipline','Fegyelmezett feladatvégzés fenntartása zavaró körülmények között.','Maintaining procedural discipline under distracting conditions.'),
('rally','Szövetségesek harci kedvének és kitartásának megerősítése.','Restoring the resolve and fighting spirit of allies.'),
('tactics','Harctéri helyzetek értékelése és manőverek tervezése.','Assessing battle situations and planning tactical manoeuvres.'),
('fear_arms','Félelemkeltő és az ellenfél teljesítményét gyengítő eszközök.','Using fear-inducing and enemy-debilitating equipment.'),
('diplomacy','Nyílt tárgyalás, kompromisszumkeresés és szövetségkötés.','Open negotiation, finding compromises and forging alliances.'),
('deception','Álca, félrevezetés és hihető megtévesztés.','Disguises, misdirection and convincing deception.'),
('trade','Áralku, piaci értékbecslés és áruforgalmi ügyletek.','Price negotiation, market appraisal and commercial deals.'),
('networking','Kapcsolatok építése és információs hálózatok fenntartása.','Developing contacts and maintaining information networks.'),
('sonic_arms','Hanghullámokkal működő támadó és támogató eszközök.','Operating sonic equipment for offensive and support effects.')
) v(slug,hu,en) on v.slug=s.slug where tr.skill_id=s.id and tr.locale in ('hu','en') and tr.description='';
-- Existing skill slots remain stable; editors can edit names, descriptions and asset paths only.
revoke insert,delete on public.game_skills from authenticated;
