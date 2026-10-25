-- Authoring metadata for the accepted standard + partial expedition turn.
-- Existing powers remain standard; current legacy combat does not consume this field.
alter table public.game_powers add column action_cost text not null default 'standard'
 constraint game_powers_action_cost_check check (action_cost in ('standard','partial'));
comment on column public.game_powers.action_cost is 'Expedition action budget consumed by this power: standard or partial. Legacy combat does not enforce this metadata.';
