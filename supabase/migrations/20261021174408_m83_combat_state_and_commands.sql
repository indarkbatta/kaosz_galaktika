-- M83: one shared server combat engine for live PvE and editor simulations.
create table public.character_combat_progress(
 character_id uuid primary key references public.characters(id) on delete cascade,
 species_rank integer not null default 1,class_rank integer not null default 1,
 health integer,injuries jsonb not null default '{}',injury_until timestamptz,
 check(species_rank between 1 and 100 and class_rank between 1 and 100),check(health is null or health>=0)
);
create table public.character_talents(character_id uuid not null references public.characters(id) on delete cascade,talent_id uuid not null references public.game_talents(id) on delete restrict,rank integer not null check(rank between 1 and 20),primary key(character_id,talent_id));
create index character_talents_talent_idx on public.character_talents(talent_id);
create table public.character_powers(character_id uuid not null references public.characters(id) on delete cascade,power_id uuid not null references public.game_powers(id) on delete restrict,primary key(character_id,power_id));
create index character_powers_power_idx on public.character_powers(power_id);
create table public.combat_operations(id uuid primary key default gen_random_uuid(),character_id uuid not null references public.characters(id) on delete cascade,uses jsonb not null default '{}',is_active boolean not null default true,started_at timestamptz not null default now(),finished_at timestamptz);
create unique index combat_operation_active on public.combat_operations(character_id) where is_active;
create table public.combat_runs(
 id uuid primary key default gen_random_uuid(),character_id uuid references public.characters(id) on delete cascade,owner_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid references public.combat_operations(id) on delete cascade,encounter_id uuid references public.game_combat_encounters(id) on delete restrict,
 simulation boolean not null default false,state jsonb not null,revision integer not null default 0,
 status text not null default 'active' check(status in ('active','victory','defeat','retreated','draw')),
 reward_snapshot jsonb not null default '{}',rewarded boolean not null default false,started_at timestamptz not null default now(),finished_at timestamptz
);
create unique index combat_one_active on public.combat_runs(character_id) where status='active' and not simulation;
create index combat_runs_owner on public.combat_runs(owner_id,started_at desc);
create index combat_runs_history on public.combat_runs(character_id,started_at desc);create index combat_runs_operation on public.combat_runs(operation_id);create index combat_runs_encounter on public.combat_runs(encounter_id);
create table public.combat_commands(run_id uuid not null references public.combat_runs(id) on delete cascade,request_id uuid not null,response jsonb not null,primary key(run_id,request_id));
create table public.combat_events(id bigint generated always as identity primary key,run_id uuid not null references public.combat_runs(id) on delete cascade,sequence integer not null,event jsonb not null,created_at timestamptz not null default now(),unique(run_id,sequence));
-- Player tables are read-only to their owner; no player supplied health, dice or rewards.
do $$declare t text;begin
 foreach t in array array['character_combat_progress','character_talents','character_powers','combat_operations'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
  execute format('create policy combat_owner_read on public.%I for select to authenticated using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())))',t);
 end loop;
 alter table public.combat_runs enable row level security;revoke all on public.combat_runs from public,anon,authenticated;grant select on public.combat_runs to authenticated;
 create policy combat_run_owner on public.combat_runs for select to authenticated using(owner_id=(select auth.uid()));
 foreach t in array array['combat_commands','combat_events'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
  execute format('create policy combat_run_owner on public.%I for select to authenticated using(exists(select 1 from public.combat_runs r where r.id=run_id))',t);
 end loop;
end $$;
create function private.combat_owned_character() returns uuid language plpgsql security definer set search_path='' as $$declare cid uuid;begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
 select id into cid from public.characters where user_id=auth.uid();if cid is null then raise exception 'Create a captain first';end if;
 perform 1 from public.character_progress where character_id=cid for update;
 insert into public.character_combat_progress(character_id) values(cid) on conflict do nothing;return cid;
end $$;
create function private.combat_hero(p_character uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters%rowtype;g public.character_combat_progress%rowtype;lvl integer;cfg jsonb;prof record;a text;rank integer;defenses jsonb:='{}';effects jsonb:='[]';resist jsonb:='{}';skills jsonb:='{}';powers jsonb;hp integer:=0;weapon integer:=3;weapon_chosen boolean:=false;weapon_types jsonb:='["kinetic"]';r record;e jsonb;v integer;
begin
 select * into c from public.characters where id=p_character;select * into g from public.character_combat_progress where character_id=p_character;select level into lvl from public.character_progress where character_id=p_character;select defense_curves into cfg from public.game_combat_rules where id=1;
 for a in select unnest(array['body','mind','soul','morale','social']) loop hp:=hp+coalesce((c.attribute_pips->>a)::int,3)/3;defenses:=jsonb_set(defenses,array[a],'0');end loop;
 for prof in select * from public.game_combat_profiles where species_id=c.species_id or class_id=c.class_id loop
  rank:=case when prof.species_id is not null then coalesce(g.species_rank,1) else coalesce(g.class_rank,1) end;hp:=hp+prof.hp_per_rank*rank;
  for a in select unnest(array['body','mind','soul','morale','social']) loop v:=coalesce((defenses->>a)::int,0)+(cfg->(prof.defenses->>a)->>'base')::int+(cfg->(prof.defenses->>a)->>'per_rank')::int*(rank-1);defenses:=jsonb_set(defenses,array[a],to_jsonb(v));end loop;
  for a,e in select * from jsonb_each(prof.resistances) loop resist:=jsonb_set(resist,array[a],to_jsonb(coalesce((resist->>a)::int,0)+(e::text)::int));end loop;
 end loop;
 for r in select ic.*,eq.slot from public.character_equipment eq join public.game_item_combat ic on ic.item_id=eq.item_id where eq.character_id=c.id and eq.crew_id is null order by case eq.slot when 'main_weapon' then 0 when 'sidearm' then 1 else 2 end loop
  if r.slot in ('main_weapon','sidearm') and r.weapon_pips>0 and not weapon_chosen then weapon:=r.weapon_pips;weapon_types:=r.damage_types;weapon_chosen:=true;end if;
  effects:=effects||r.effects;
  for a,e in select * from jsonb_each(r.resistances) loop resist:=jsonb_set(resist,array[a],to_jsonb(coalesce((resist->>a)::int,0)+(e::text)::int));end loop;
 end loop;
 for r in select t.effects,ct.rank from public.character_talents ct join public.game_talents t on t.id=ct.talent_id where ct.character_id=c.id loop
  for e in select value from jsonb_array_elements(r.effects) loop effects:=effects||jsonb_build_array(jsonb_set(e,'{amount}',to_jsonb((e->>'amount')::int*r.rank)));end loop;
 end loop;
 select coalesce(jsonb_agg(p||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_powers_i18n t where t.power_id=(p->>'id')::uuid),'[]'))),'[]') into powers from (
 select distinct to_jsonb(p) p from public.game_powers p left join public.game_power_grants gr on gr.power_id=p.id
 where p.is_published and p.min_level<=lvl and ((gr.min_level<=lvl and (
 gr.source='basic' or gr.source='species' and gr.species_id=c.species_id and gr.min_rank<=coalesce(g.species_rank,1)
 or gr.source='class' and gr.class_id=c.class_id and gr.min_rank<=coalesce(g.class_rank,1)
 or gr.source='item' and exists(select 1 from public.character_equipment eq where eq.character_id=c.id and eq.crew_id is null and eq.item_id=gr.item_id)))
 or exists(select 1 from public.character_powers cp where cp.character_id=c.id and cp.power_id=p.id))) available;
 for e in select value from jsonb_array_elements(powers) where value->>'kind'='passive' loop effects:=effects||(e->'effects');end loop;
 for r in select s.id,s.attribute,coalesce(u.bonus_pips,0) earned from public.game_skills s left join public.character_skill_upgrades u on u.skill_id=s.id and u.character_id=c.id where s.is_combat loop
  skills:=jsonb_set(skills,array[r.id::text],to_jsonb(coalesce((c.attribute_pips->>r.attribute::text)::int,3)+coalesce((c.skill_bonus_pips->>r.id::text)::int,0)+r.earned));
 end loop;
 return jsonb_build_object('id','captain','player',true,'name_hu',c.captain_name,'name_en',c.captain_name,'image_path',(select image_path from public.game_species where id=c.species_id),
 'level',lvl,'danger',0,'attributes',c.attribute_pips,'defenses',defenses,'skills',skills,'skill_attributes',(select jsonb_object_agg(id::text,attribute::text) from public.game_skills where is_combat),
 'health',least(hp,coalesce(g.health,hp)),'max_health',hp,'injuries',coalesce(g.injuries,'{}'),'weapon_pips',weapon,'weapon_damage_types',weapon_types,
 'has_weapon',exists(select 1 from public.character_equipment eq join public.game_item_combat ic on ic.item_id=eq.item_id where eq.character_id=c.id and eq.crew_id is null and eq.slot in ('main_weapon','sidearm') and ic.weapon_pips>0),
 'resistances',resist,'effects',effects,'powers',powers,'turn',0,'cooldowns','{}'::jsonb,'uses','{}'::jsonb);
end $$;
create function private.combat_enemy(p_enemy uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare e public.game_enemies%rowtype;powers jsonb;begin
 select * into e from public.game_enemies where id=p_enemy;if not found then raise exception 'Enemy not found';end if;
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_powers_i18n t where t.power_id=p.id),'[]'))),'[]') into powers from public.game_powers p where p.id=any(e.power_ids) and p.is_published;
 return jsonb_build_object('id',e.id,'player',false,'name_hu',coalesce((select name from public.game_enemies_i18n where enemy_id=e.id and locale='hu'),e.slug),'name_en',coalesce((select name from public.game_enemies_i18n where enemy_id=e.id and locale='en'),e.slug),'image_path',e.image_path,
 'level',e.level,'danger',e.danger,'behavior',e.behavior,'skill_attributes',(select jsonb_object_agg(id::text,attribute::text) from public.game_skills where is_combat),'attributes',e.attributes,'defenses',e.defenses,'skills','{}'::jsonb,'health',e.health,'max_health',e.health,'injuries','{}'::jsonb,'weapon_pips',e.weapon_pips,'has_weapon',true,
 'resistances',e.resistances,'effects','[]'::jsonb,'powers',powers,'turn',0,'cooldowns','{}'::jsonb,'uses','{}'::jsonb);
end $$;
create function private.combat_log(p_state jsonb,p_event jsonb) returns jsonb language plpgsql immutable set search_path='' as $$declare seq integer:=coalesce((p_state->>'event_sequence')::int,0)+1;begin
 return jsonb_set(p_state,'{events}',coalesce(p_state->'events','[]')||jsonb_build_array(p_event||jsonb_build_object('round',(p_state->>'round')::int,'sequence',seq)))||jsonb_build_object('event_sequence',seq);
end $$;
create function private.combat_power_reason(p_actor jsonb,p_power jsonb,p_operation_uses jsonb) returns text language plpgsql immutable set search_path='' as $$declare key text:=p_power->>'id';uses integer;begin
 if p_power is null or p_power->>'kind'<>'active' then return 'unavailable';end if;
 if coalesce((p_power->>'requires_weapon')::boolean,false) and not (p_actor->>'has_weapon')::boolean then return 'weapon';end if;
 if (p_power->>'min_level')::int>(p_actor->>'level')::int then return 'level';end if;
 if coalesce((p_actor->'cooldowns'->>key)::int,0)>(p_actor->>'turn')::int then return 'cooldown';end if;
 uses:=case when p_power->>'limit_scope'='operation' and (p_actor->>'player')::boolean then coalesce((p_operation_uses->>key)::int,0) else coalesce((p_actor->'uses'->>key)::int,0) end;
 if p_power->>'max_uses' is not null and uses>=(p_power->>'max_uses')::int then return 'limit';end if;
 return null;
end $$;
create function private.combat_hurt(p_actor jsonb,p_damage integer,p_defense text) returns jsonb language plpgsql immutable set search_path='' as $$declare hp integer:=(p_actor->>'health')::int;inj integer;begin
 if p_damage<=0 then return p_actor;end if;
 if hp>0 then return jsonb_set(p_actor,'{health}',to_jsonb(greatest(0,hp-p_damage)));end if;
 inj:=coalesce((p_actor->'injuries'->>p_defense)::int,0)+3;
 p_actor:=jsonb_set(p_actor,array['injuries',p_defense],to_jsonb(inj));
 if private.combat_stat(p_actor,'attributes',p_defense)=0 then p_actor:=p_actor||'{"extracted":true}'::jsonb;end if;
 return p_actor;
end $$;
create function private.combat_apply_effect(p_state jsonb,p_source integer,p_target integer,p_effect jsonb) returns jsonb language plpgsql volatile set search_path='' as $$
declare source jsonb:=p_state->'actors'->p_source;target jsonb:=p_state->'actors'->p_target;e jsonb:=p_effect;roll jsonb;old jsonb;list jsonb:='[]';same boolean;block boolean:=false;duration integer;
begin
 if e->>'type' in ('damage','ongoing_damage') then
  roll:=private.combat_damage(source,target,e->'formula',e->'damage_types');target:=private.combat_hurt(target,(roll->>'damage')::int,coalesce(e->>'defense',p_state->>'attack_defense','body'));
  p_state:=private.combat_log(p_state,jsonb_build_object('type','damage','source',p_source,'target',p_target,'roll',roll,'health',target->'health','injuries',target->'injuries'));
 elsif e->>'type' in ('heal','ongoing_heal') then
  roll:=private.combat_roll(least(900,private.combat_formula(source,e->'formula')),'plain');target:=jsonb_set(target,'{health}',to_jsonb(least((target->>'max_health')::int,(target->>'health')::int+(roll->>'roll_total')::int)));
  p_state:=private.combat_log(p_state,jsonb_build_object('type','heal','source',p_source,'target',p_target,'roll',roll,'health',target->'health'));
 elsif e->>'type'='cleanse' then
  select coalesce(jsonb_agg(v),'[]') into list from jsonb_array_elements(target->'effects')v where coalesce(v->>'group','default')<>e->>'group' or coalesce((v->>'duration')::int,0)=0;
  target:=jsonb_set(target,'{effects}',list);
 elsif e->>'type'='modifier' then
  e:=e||jsonb_build_object('source',p_source,'applied_sequence',coalesce((p_state->>'event_sequence')::int,0),'remaining',(e->>'duration')::int);
  for old in select value from jsonb_array_elements(target->'effects') loop
   same:=old->>'type'='modifier' and old->>'stat'=e->>'stat' and old->>'key'=e->>'key' and coalesce(old->>'group','default')=coalesce(e->>'group','default') and sign((old->>'amount')::int)=sign((e->>'amount')::int) and coalesce((old->>'duration')::int,0)>0;
   if same then if abs((old->>'amount')::int)>abs((e->>'amount')::int) then block:=true;list:=list||jsonb_build_array(old);end if;
   else list:=list||jsonb_build_array(old);end if;
  end loop;
  if not block then list:=list||jsonb_build_array(e);end if;target:=jsonb_set(target,'{effects}',list);
 end if;
 if e->>'type' in ('modifier','cleanse') then p_state:=private.combat_log(p_state,jsonb_build_object('type','effect','source',p_source,'target',p_target,'effect',e,'blocked',block));end if;
 p_state:=jsonb_set(p_state,array['actors',p_target::text],target);return p_state;
end $$;
-- One active action, with explicit caller-selected target. Ongoing effects use this same evaluator.
create function private.combat_resolve_action(p_state jsonb,p_power uuid,p_target integer) returns jsonb language plpgsql volatile set search_path='' as $$
declare idx integer:=(p_state->>'current')::int;actor jsonb:=p_state->'actors'->idx;power jsonb;e jsonb;target jsonb;attack jsonb;defense jsonb;pool integer;attr text;hit boolean:=true;reason text;key text;where_target integer;list jsonb;startseq integer:=coalesce((p_state->>'event_sequence')::int,0);old jsonb;current_effect jsonb;status_list jsonb;blocked boolean;strength integer;old_strength integer;
begin
 if p_state->>'status'<>'active' or p_target not between 0 and jsonb_array_length(p_state->'actors')-1 then raise exception 'Invalid combat action';end if;
 if p_power is not null then
  select value into power from jsonb_array_elements(actor->'powers') where value->>'id'=p_power::text;
  reason:=private.combat_power_reason(actor,power,p_state->'operation_uses');if reason is not null then raise exception 'Power unavailable: %',reason;end if;
  if power->>'target'='self' and p_target<>idx or power->>'target'='enemy' and p_target=idx then raise exception 'Wrong target';end if;
  key:=p_power::text;actor:=jsonb_set(actor,array['cooldowns',key],to_jsonb((actor->>'turn')::int+(power->>'cooldown')::int));actor:=jsonb_set(actor,array['uses',key],to_jsonb(coalesce((actor->'uses'->>key)::int,0)+1));
  if power->>'limit_scope'='operation' and (actor->>'player')::boolean then p_state:=jsonb_set(p_state,array['operation_uses',key],to_jsonb(coalesce((p_state->'operation_uses'->>key)::int,0)+1));end if;
  p_state:=jsonb_set(p_state,array['actors',idx::text],actor);
  p_state:=private.combat_log(p_state,jsonb_build_object('type','power','source',idx,'target',p_target,'power_id',p_power,'texts',power->'texts'));
  if (power->>'requires_hit')::boolean then
   target:=p_state->'actors'->p_target;attr:=coalesce(actor->'skill_attributes'->>(power->>'skill_id'),power->>'defense');
   if (actor->>'player')::boolean then pool:=coalesce((actor->'skills'->>(power->>'skill_id'))::int,private.combat_stat(actor,'attributes',attr)) +private.combat_modifier(actor,'skill',power->>'skill_id')+private.combat_modifier(actor,'attribute',attr)-coalesce((actor->'injuries'->>attr)::int,0);
   else pool:=private.combat_stat(actor,'attributes',attr)+(actor->>'danger')::int;end if;
   attack:=private.combat_roll(least(900,greatest(0,pool)),case when (actor->>'player')::boolean then 'skill' else 'plain' end);
   defense:=private.combat_roll(least(900,private.combat_stat(target,'defenses',power->>'defense')+case when (target->>'player')::boolean then 0 else (target->>'danger')::int end),'plain');
   hit:=(attack->>'roll_total')::int>(defense->>'roll_total')::int;
   p_state:=private.combat_log(p_state,jsonb_build_object('type','attack','source',idx,'target',p_target,'roll',attack));p_state:=private.combat_log(p_state,jsonb_build_object('type','defense','source',p_target,'target',idx,'roll',defense,'hit',hit));
  end if;
  p_state:=p_state||jsonb_build_object('attack_defense',power->>'defense');
  if hit then
   for e in select value from jsonb_array_elements(power->'effects') loop
    where_target:=case when e->>'target'='self' then idx else p_target end;
    if e->>'type' in ('ongoing_damage','ongoing_heal') then
     old:=p_state->'actors'->where_target;
     e:=e||jsonb_build_object('source',idx,'remaining',(e->>'duration')::int,'applied_sequence',coalesce((p_state->>'event_sequence')::int,0),'defense',power->>'defense');
     status_list:='[]';blocked:=false;strength:=private.combat_formula(actor,e->'formula');
     for current_effect in select value from jsonb_array_elements(old->'effects') loop
      if current_effect->>'type'=e->>'type' and coalesce(current_effect->>'group','default')=coalesce(e->>'group','default') then
       old_strength:=private.combat_formula(p_state->'actors'->coalesce((current_effect->>'source')::int,idx),current_effect->'formula');
       if old_strength>strength then blocked:=true;status_list:=status_list||jsonb_build_array(current_effect);end if;
      else status_list:=status_list||jsonb_build_array(current_effect);end if;
     end loop;
     if not blocked then status_list:=status_list||jsonb_build_array(e);end if;
     old:=jsonb_set(old,'{effects}',status_list);p_state:=jsonb_set(p_state,array['actors',where_target::text],old);
     p_state:=private.combat_log(p_state,jsonb_build_object('type','effect','source',idx,'target',where_target,'effect',e,'blocked',blocked));
    else p_state:=private.combat_apply_effect(p_state,idx,where_target,e);end if;
   end loop;
  end if;
 else p_state:=private.combat_log(p_state,jsonb_build_object('type','wait','source',idx));end if;
 -- Age effects after their owner's action; self effects created during this action keep their first full turn.
 actor:=p_state->'actors'->idx;list:='[]';
 for e in select value from jsonb_array_elements(actor->'effects') loop
  if coalesce((e->>'duration')::int,0)>0 and coalesce((e->>'applied_sequence')::int,0)<=startseq then e:=jsonb_set(e,'{remaining}',to_jsonb((e->>'remaining')::int-1));end if;
  if coalesce((e->>'duration')::int,0)=0 or (e->>'remaining')::int>0 then list:=list||jsonb_build_array(e);end if;
 end loop;
 actor:=jsonb_set(actor,'{effects}',list);p_state:=jsonb_set(p_state,array['actors',idx::text],actor);
 return p_state;
end $$;
create function private.combat_next_turn(p_state jsonb) returns jsonb language plpgsql volatile set search_path='' as $$declare cursor integer:=(p_state->>'cursor')::int;idx integer;actor jsonb;e jsonb;source integer;begin
 -- A zero-health participant can keep acting until an attribute is reduced to zero.
 if coalesce((p_state->'actors'->0->>'extracted')::boolean,false) then return p_state||'{"status":"defeat"}'::jsonb;end if;
 if coalesce((p_state->'actors'->1->>'extracted')::boolean,false) then return p_state||'{"status":"victory"}'::jsonb;end if;
 cursor:=cursor+1;if cursor>=jsonb_array_length(p_state->'order') then cursor:=0;p_state:=jsonb_set(p_state,'{round}',to_jsonb((p_state->>'round')::int+1));end if;
 if (p_state->>'round')::int>(p_state->>'max_rounds')::int then return p_state||'{"status":"draw"}'::jsonb;end if;
 idx:=(p_state->'order'->>cursor)::int;actor:=p_state->'actors'->idx;actor:=jsonb_set(actor,'{turn}',to_jsonb((actor->>'turn')::int+1));
 p_state:=p_state||jsonb_build_object('cursor',cursor,'current',idx);p_state:=jsonb_set(p_state,array['actors',idx::text],actor);
 for e in select value from jsonb_array_elements(actor->'effects') where value->>'type' in ('ongoing_damage','ongoing_heal') loop
  source:=coalesce((e->>'source')::int,idx);p_state:=private.combat_apply_effect(p_state,source,idx,e);
 end loop;
 if coalesce((p_state->'actors'->0->>'extracted')::boolean,false) then p_state:=p_state||'{"status":"defeat"}'::jsonb;
 elsif coalesce((p_state->'actors'->1->>'extracted')::boolean,false) then p_state:=p_state||'{"status":"victory"}'::jsonb;end if;
 return p_state;
end $$;
create function private.combat_auto(p_state jsonb) returns jsonb language plpgsql volatile set search_path='' as $$declare actor jsonb;power jsonb;selected jsonb;target integer;begin
 while p_state->>'status'='active' and (p_state->>'current')::int<>0 loop
  actor:=p_state->'actors'->1;selected:=null;
  for power in select value from jsonb_array_elements(actor->'powers') order by case
   when actor->>'behavior'='healer' and (actor->>'health')::int<(actor->>'max_health')::int/2 and value->>'target'='self' then 0
   when actor->>'behavior'='disruptor' and value->'effects' @> '[{"type":"modifier"}]' then 1
   when value->>'target'='enemy' then 2 else 3 end,value->>'slug'
  loop if private.combat_power_reason(actor,power,'{}') is null then selected:=power;exit;end if;end loop;
  target:=case when selected->>'target'='self' then 1 else 0 end;
  p_state:=private.combat_resolve_action(p_state,(selected->>'id')::uuid,target);p_state:=private.combat_next_turn(p_state);
 end loop;return p_state;
end $$;
create function private.combat_initial(p_hero jsonb,p_enemy jsonb,p_uses jsonb) returns jsonb language plpgsql volatile set search_path='' as $$declare h jsonb;e jsonb;s jsonb;first integer;begin
 h:=private.combat_roll((p_hero->>'level')::int*3,'plain');e:=private.combat_roll((p_enemy->>'level')::int*3,'plain');e:=e||jsonb_build_object('roll_total',(e->>'roll_total')::int+(p_enemy->>'danger')::int,'flat_bonus',(p_enemy->>'danger')::int);
 first:=case when (h->>'roll_total')::int>=(e->>'roll_total')::int then 0 else 1 end;
 s:=jsonb_build_object('actors',jsonb_build_array(p_hero,p_enemy),'round',1,'cursor',0,'order',case when first=0 then '[0,1]'::jsonb else '[1,0]'::jsonb end,'current',first,'status','active','operation_uses',coalesce(p_uses,'{}'),'max_rounds',(select max_rounds from public.game_combat_rules where id=1),'events','[]'::jsonb,'event_sequence',0);
 s:=jsonb_set(s,array['actors',first::text,'turn'],'1');s:=private.combat_log(s,jsonb_build_object('type','initiative','source',0,'roll',h));s:=private.combat_log(s,jsonb_build_object('type','initiative','source',1,'roll',e));return private.combat_auto(s);
end $$;
-- Write authoritative state, immutable events and rewards together.
create function private.combat_commit(p_run uuid,p_state jsonb) returns void language plpgsql security definer set search_path='' as $$declare r public.combat_runs%rowtype;cfg public.gameplay_rules%rowtype;p public.character_progress%rowtype;xp integer;level_after integer;points integer;e jsonb;seq integer;begin
 select * into r from public.combat_runs where id=p_run for update;
 for e in select value from jsonb_array_elements(p_state->'events') loop seq:=(e->>'sequence')::int;insert into public.combat_events(run_id,sequence,event) values(r.id,seq,e) on conflict(run_id,sequence) do nothing;end loop;
 update public.combat_runs set state=p_state,status=p_state->>'status',revision=revision+1,finished_at=case when p_state->>'status'<>'active' then clock_timestamp() end where id=r.id;
 if not r.simulation then
  update public.combat_operations set uses=p_state->'operation_uses' where id=r.operation_id;
  update public.character_combat_progress set health=(p_state->'actors'->0->>'health')::int,injuries=p_state->'actors'->0->'injuries',injury_until=case when p_state->>'status'<>'active' and exists(select 1 from jsonb_each_text(p_state->'actors'->0->'injuries') where value::int>0) then clock_timestamp()+((select injury_recovery_ticks from public.game_combat_rules where id=1)*(select energy_regen_seconds from public.gameplay_rules where id=1))*interval '1 second' else injury_until end where character_id=r.character_id;
  if p_state->>'status'='victory' and not r.rewarded then
   xp:=coalesce((r.reward_snapshot->>'xp')::int,0);select * into p from public.character_progress where character_id=r.character_id;select * into cfg from public.gameplay_rules where id=1;level_after:=p.level;points:=p.upgrade_points;
   while level_after<100 and p.xp_total+xp>=cfg.xp_level_base::bigint*level_after*(level_after+1)/2 loop level_after:=level_after+1;points:=points+cfg.skill_points_per_level;end loop;
   update public.character_progress set xp_total=xp_total+xp,level=level_after,upgrade_points=points,updated_at=clock_timestamp() where character_id=r.character_id;
   if r.reward_snapshot->>'item_id' is not null then insert into public.character_inventory(character_id,item_id,quantity,updated_at) values(r.character_id,(r.reward_snapshot->>'item_id')::uuid,(r.reward_snapshot->>'quantity')::int,clock_timestamp()) on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+excluded.quantity,updated_at=excluded.updated_at;end if;
   update public.combat_runs set rewarded=true where id=r.id;
  end if;
 end if;
end $$;
create function private.combat_view(p_run uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.combat_runs%rowtype;state jsonb;actor jsonb;idx int;a text;stats jsonb;powers jsonb;
begin
 select * into r from public.combat_runs where id=p_run;state:=r.state;
 for idx in 0..jsonb_array_length(state->'actors')-1 loop
  actor:=state->'actors'->idx;stats:='{}';
  for a in select unnest(array['body','mind','soul','morale','social']) loop stats:=jsonb_set(stats,array[a],to_jsonb(private.combat_stat(actor,'defenses',a)+case when (actor->>'player')::boolean then 0 else (actor->>'danger')::int end));end loop;
  state:=jsonb_set(state,array['actors',idx::text],actor||jsonb_build_object('effective_defenses',stats));
 end loop;
 select coalesce(jsonb_agg(p||jsonb_build_object('blocked_reason',private.combat_power_reason(state->'actors'->0,p,state->'operation_uses'),
 'cooldown_remaining',greatest(0,coalesce((state->'actors'->0->'cooldowns'->>(p->>'id'))::int,0)-(state->'actors'->0->>'turn')::int),
 'uses_remaining',case when p->>'max_uses' is null then null else greatest(0,(p->>'max_uses')::int-case when p->>'limit_scope'='operation' and (state->'actors'->0->>'player')::boolean then coalesce((state->'operation_uses'->>(p->>'id'))::int,0) else coalesce((state->'actors'->0->'uses'->>(p->>'id'))::int,0) end) end)),'[]') into powers from jsonb_array_elements(state->'actors'->0->'powers')p where p->>'kind'='active';
 return to_jsonb(r)||jsonb_build_object('state',state,'available_powers',powers);
end $$;
create function private.combat_spend_energy(p_character uuid,p_cost integer) returns void language plpgsql security definer set search_path='' as $$declare p public.character_progress%rowtype;cfg public.gameplay_rules%rowtype;v_energy integer;at_time timestamptz;elapsed integer;begin
 select * into p from public.character_progress where character_id=p_character for update;select * into cfg from public.gameplay_rules where id=1;elapsed:=greatest(0,floor(extract(epoch from(clock_timestamp()-p.energy_at)))::int);v_energy:=least(cfg.energy_max,p.energy+(elapsed/cfg.energy_regen_seconds)*cfg.energy_per_tick);
 if v_energy<p_cost then raise exception 'Insufficient energy';end if;
 at_time:=case when v_energy>=cfg.energy_max then clock_timestamp() else p.energy_at+((elapsed/cfg.energy_regen_seconds)*cfg.energy_regen_seconds)*interval '1 second' end;
 update public.character_progress set energy=v_energy-p_cost,energy_at=at_time,updated_at=clock_timestamp() where character_id=p_character;
end $$;
create function private.combat_start(p_encounter uuid,p_sim_enemy uuid default null,p_attacker uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;enc public.game_combat_encounters%rowtype;enemy public.game_enemies%rowtype;op uuid;run uuid;hero jsonb;state jsonb;uses jsonb;v_simulation boolean:=p_sim_enemy is not null;begin
 if auth.uid() is null then raise exception 'Login required';end if;
 if not v_simulation then cid:=private.combat_owned_character();else select id into cid from public.characters where user_id=auth.uid();end if;
 if v_simulation then if not private.can_edit_content() then raise exception 'Editor permission required';end if;select * into enemy from public.game_enemies where id=p_sim_enemy;
 else
  select id into run from public.combat_runs where character_id=cid and status='active' and not simulation; if found then return private.combat_view(run);end if;
  select * into enc from public.game_combat_encounters where id=p_encounter and is_published;if not found then raise exception 'Combat encounter unavailable';end if;
  if not exists(select 1 from public.character_positions where character_id=cid and location_id=enc.location_id) then raise exception 'Travel to the encounter location first';end if;
  select * into enemy from public.game_enemies where id=enc.enemy_id and is_published;
 end if;
 if enemy.id is null then raise exception 'Enemy unavailable';end if;
 if v_simulation and p_attacker is not null then hero:=private.combat_enemy(p_attacker);
 elsif v_simulation and cid is null then hero:=private.combat_enemy(enemy.id);
 else hero:=private.combat_hero(cid);end if;
 if v_simulation then hero:=hero||jsonb_build_object('health',hero->'max_health','injuries','{}'::jsonb);end if;
 if not v_simulation and exists(select 1 from jsonb_each_text(hero->'injuries') where value::int>=coalesce((hero->'attributes'->>key)::int,0)) then raise exception 'Recover severe injuries first';end if;
 if not v_simulation then
  perform private.combat_spend_energy(cid,enc.energy_cost);
  select id,combat_operations.uses into op,uses from public.combat_operations where character_id=cid and is_active for update;
  if op is null then insert into public.combat_operations(character_id) values(cid) returning id into op;uses:='{}';end if;
 end if;
 state:=private.combat_initial(hero,private.combat_enemy(enemy.id),uses);
 insert into public.combat_runs(character_id,owner_id,operation_id,encounter_id,simulation,state,reward_snapshot) values(cid,auth.uid(),op,case when v_simulation then null else enc.id end,v_simulation,state,jsonb_build_object('xp',enemy.reward_xp,'item_id',enemy.reward_item_id,'quantity',enemy.reward_quantity)) returning id into run;
 perform private.combat_commit(run,state);return private.combat_view(run);
end $$;
create function private.combat_act(p_run uuid,p_revision integer,p_request uuid,p_power uuid,p_target integer,p_retreat boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare cid uuid;r public.combat_runs%rowtype;response jsonb;s jsonb;begin
 if auth.uid() is null then raise exception 'Login required';end if;
 select * into r from public.combat_runs where id=p_run and owner_id=auth.uid();
 if not found then raise exception 'Combat not found';end if;
 if not r.simulation then cid:=private.combat_owned_character();end if;
 select * into r from public.combat_runs where id=p_run and owner_id=auth.uid() for update;
 if not found then raise exception 'Combat not found';end if;
 if r.simulation and not private.can_edit_content() then raise exception 'Editor permission required';end if;
 if p_request is null then raise exception 'Request ID required';end if;
 select combat_commands.response into response from public.combat_commands where run_id=r.id and request_id=p_request;if found then return response;end if;
 if r.status<>'active' then raise exception 'Combat has ended';end if;
 if p_revision is distinct from r.revision then raise exception 'Combat state changed; reload';end if;
 if (r.state->>'current')::int<>0 then raise exception 'Not your turn';end if;
 if p_retreat then s:=private.combat_log(jsonb_set(r.state,'{events}','[]')||'{"status":"retreated"}'::jsonb,'{"type":"retreat","source":0}');
 else s:=private.combat_resolve_action(jsonb_set(r.state,'{events}','[]'),p_power,p_target);s:=private.combat_auto(private.combat_next_turn(s));end if;
 perform private.combat_commit(r.id,s);response:=private.combat_view(r.id);insert into public.combat_commands(run_id,request_id,response) values(r.id,p_request,response);return response;
end $$;
create function private.combat_recover(p_recover boolean) returns jsonb language plpgsql security definer set search_path='' as $$declare cid uuid;g public.character_combat_progress%rowtype;begin
 cid:=private.combat_owned_character();if exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation) then raise exception 'Finish combat first';end if;
 if not exists(select 1 from public.character_positions pos join public.game_locations l on l.id=pos.location_id where pos.character_id=cid and l.slug='frontier_station') then raise exception 'Return to Frontier Station first';end if;
 if p_recover then
  select * into g from public.character_combat_progress where character_id=cid;
  if g.injury_until>clock_timestamp() then raise exception 'Severe injuries are still recovering';end if;
  perform private.combat_spend_energy(cid,(select recovery_energy from public.game_combat_rules where id=1));update public.character_combat_progress set health=null,injuries='{}',injury_until=null where character_id=cid;
 end if;
 update public.combat_operations set is_active=false,finished_at=clock_timestamp() where character_id=cid and is_active;
 return jsonb_build_object('returned',true,'recovered',p_recover);
end $$;
create function private.combat_learn(p_talent uuid,p_expected_rank integer) returns jsonb language plpgsql security definer set search_path='' as $$declare cid uuid;c public.characters%rowtype;g public.character_combat_progress%rowtype;t public.game_talents%rowtype;lvl int;owned int;branch int;begin
 cid:=private.combat_owned_character();if exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation) then raise exception 'Finish combat first';end if;
 select * into c from public.characters where id=cid;select * into g from public.character_combat_progress where character_id=cid for update;select level into lvl from public.character_progress where character_id=cid;
 if g.species_rank+g.class_rank-2>=lvl-1 then raise exception 'No talent points available';end if;
 select * into t from public.game_talents where id=p_talent and is_published and (species_id=c.species_id or class_id=c.class_id);if not found then raise exception 'Talent unavailable';end if;
 select rank into owned from public.character_talents where character_id=cid and talent_id=t.id;owned:=coalesce(owned,0);
 if owned is distinct from p_expected_rank or owned>=t.max_rank then raise exception 'Talent rank changed or maximum reached';end if;
 branch:=case when t.species_id is not null then g.species_rank else g.class_rank end;
 if branch+1<t.min_rank or t.prerequisite_id is not null and not exists(select 1 from public.character_talents where character_id=cid and talent_id=t.prerequisite_id and rank>=t.prerequisite_rank) then raise exception 'Talent prerequisites unmet';end if;
 insert into public.character_talents(character_id,talent_id,rank) values(cid,t.id,owned+1) on conflict(character_id,talent_id) do update set rank=excluded.rank;
 update public.character_combat_progress set species_rank=species_rank+case when t.species_id is not null then 1 else 0 end,class_rank=class_rank+case when t.class_id is not null then 1 else 0 end where character_id=cid;
 return jsonb_build_object('talent_id',t.id,'rank',owned+1);
end $$;
create function private.combat_catalog() returns jsonb language plpgsql security definer set search_path='' as $$declare cid uuid;c public.characters%rowtype;data jsonb;begin
 cid:=private.combat_owned_character();select * into c from public.characters where id=cid;
 return jsonb_build_object('hero',private.combat_hero(cid),'growth',(select to_jsonb(g) from public.character_combat_progress g where character_id=cid),
 'talent_points',(select level-1 from public.character_progress where character_id=cid)-(select species_rank+class_rank-2 from public.character_combat_progress where character_id=cid),
 'talents',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_talents_i18n i where i.talent_id=t.id),'[]'),'owned_rank',coalesce((select rank from public.character_talents ct where ct.character_id=cid and ct.talent_id=t.id),0))) from public.game_talents t where t.is_published and (t.species_id=c.species_id or t.class_id=c.class_id)),'[]'),
 'encounters',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('image_path',n.image_path,'enemy_level',n.level)) from public.game_combat_encounters e join public.game_enemies n on n.id=e.enemy_id where e.is_published and n.is_published and exists(select 1 from public.character_positions where character_id=cid and location_id=e.location_id)),'[]'),
 'run',(select private.combat_view(id) from public.combat_runs where character_id=cid and not simulation order by started_at desc limit 1),
 'history',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,status,started_at,finished_at,reward_snapshot from public.combat_runs where character_id=cid and not simulation order by started_at desc limit 10)r),'[]'),
 'recovery_energy',(select recovery_energy from public.game_combat_rules where id=1));
end $$;
-- Blocking combat-sensitive changes uses the same progress lock as all existing authoritative commands.
create function private.combat_guard_changes() returns trigger language plpgsql security definer set search_path='' as $$declare cid uuid;begin
 cid:=case when tg_op='DELETE' then old.character_id else new.character_id end;
 perform 1 from public.character_progress where character_id=cid for update;
 if exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation) then raise exception 'Finish combat before changing location or equipment';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger combat_guard_equipment before insert or update or delete on public.character_equipment for each row execute function private.combat_guard_changes();
create trigger combat_guard_travel before update or delete on public.character_positions for each row execute function private.combat_guard_changes();
create function public.get_combat_state() returns jsonb language sql security invoker set search_path='' as $$select private.combat_catalog()$$;
create function public.start_combat(p_encounter uuid) returns jsonb language sql security invoker set search_path='' as $$select private.combat_start(p_encounter)$$;
create function public.simulate_combat(p_enemy uuid,p_attacker uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.combat_start(null,p_enemy,p_attacker)$$;
create function public.combat_action(p_run uuid,p_revision integer,p_request uuid,p_power uuid,p_target integer) returns jsonb language sql security invoker set search_path='' as $$select private.combat_act(p_run,p_revision,p_request,p_power,p_target)$$;
create function public.retreat_combat(p_run uuid,p_revision integer,p_request uuid) returns jsonb language sql security invoker set search_path='' as $$select private.combat_act(p_run,p_revision,p_request,null,0,true)$$;
create function public.return_from_combat(p_recover boolean) returns jsonb language sql security invoker set search_path='' as $$select private.combat_recover(p_recover)$$;
create function public.learn_combat_talent(p_talent uuid,p_expected_rank integer) returns jsonb language sql security invoker set search_path='' as $$select private.combat_learn(p_talent,p_expected_rank)$$;
-- Only these narrow authenticated entrypoints are granted. Pure helpers remain uncallable by clients.
do $$declare r record;begin
 for r in select oid::regprocedure sig,proname from pg_proc where pronamespace='private'::regnamespace and proname like 'combat_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',r.sig);
  if r.proname in ('combat_catalog','combat_start','combat_act','combat_recover','combat_learn') then execute format('grant execute on function %s to authenticated',r.sig);end if;
 end loop;
 for r in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('get_combat_state','start_combat','simulate_combat','combat_action','retreat_combat','return_from_combat','learn_combat_talent') loop execute format('revoke all on function %s from public,anon',r.sig);execute format('grant execute on function %s to authenticated',r.sig);end loop;
end $$;
-- Content validator helpers used by editor-RLS writes need explicit EXECUTE.
grant execute on function private.combat_attribute(text),private.combat_damage_types(),private.combat_check_map(jsonb,text),private.combat_check_types(jsonb),private.combat_check_formula(jsonb),private.combat_check_effects(jsonb,boolean) to authenticated;
