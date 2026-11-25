-- Org switching (same mechanism as the CRM web app: POST /connect/token grant_type=switch_organization).
-- A connection row either holds its own refresh token (the org the user signed in to via id4), or,
-- for orgs reached by switching, points at that sign-in row via source_org_id and holds no token.
-- Tokens for switched orgs are minted on demand: refresh the source token, then switch.
alter table connections alter column refresh_token_enc drop not null;
alter table connections add column if not exists source_org_id text;
-- Organizations the user belongs to, from GET /ups/api/users/{userId} at sign-in: [{ "id", "name" }]
alter table connections add column if not exists user_orgs jsonb;

alter table connections drop constraint if exists connections_token_or_source;
alter table connections add constraint connections_token_or_source
  check (refresh_token_enc is not null or source_org_id is not null);
