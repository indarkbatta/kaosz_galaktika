# HV-057 species and class HP

At level 1, maximum health is **species HP + class HP**. Each later shared talent point adds the HP value of the selected branch when actually spent. The two reserved starting choices do not add HP again; unspent level-up points do not add HP. Existing `hp_per_rank` values on the species/class combat profiles are reused as both starting and per-additional-point HP, exposed with a clear editor label.

For each branch, the multiplier is `1 + legacy spent points + max(new learned nodes - 1, 0)`. Legacy spent points are the existing branch rank minus one; new purchases are the persisted learned-node rows. The first new node consumes the reserved starting point and is excluded from growth. No earned advantages or character rows are reset.

The old attribute-derived HP contribution is removed, so the starting HP is exactly the requested two-branch sum. Defense curves and rank progression remain unchanged. Current health is not automatically healed on learning; existing combat logic caps it at maximum health. Active battle snapshots are not rewritten. Profile edits continue to affect subsequent derived character snapshots.

One private helper calculates the breakdown for both the combat actor and the authenticated talent catalog. The wizard and learning cards show the total and branch values, with starting points distinguished from additional growth. No new public write grants.

Tests: `supabase/tests/talent_branch_hp.sql` runs with the real linked schema inside rollback. Distinct test coefficients 4/7 prove 11 starting HP, 15 after species spending, 22 after class spending, and 29 with an additional legacy class point. Includes the learning suite's ownership/revision/overspend/duplicate/level checks and preservation of wounded current health. The browser contract suite verifies displayed HP after learning and card layout.

Release: apply `20261022191143_talent_branch_hp.sql`, then deploy the matching frontend. This task does not deploy automatically. HP coefficients remain the existing editable content values; no new balance numbers are introduced.
