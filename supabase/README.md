# Run DATA QUEST with Supabase

Players and organizers use the same DATA QUEST sign-in and Supabase project.

## Prepare the competition

1. Initialize the Supabase CLI from the project root if no CLI config exists. Link your staging project with `supabase link --project-ref YOUR_PROJECT_REF`, then run `supabase db push` to apply the migrations. Review existing assignments before applying migration 003. It requires at most two existing organizer rows with distinct users.
2. Run [bootstrap-event.sql](bootstrap-event.sql) in the SQL Editor. It creates the `data-quest` competition and four track records. In **Challenge Library**, upload a CSV and add checkpoints with answer keys for each track. Teams can begin when all four tracks have datasets and the same number of consecutive checkpoints.
3. Under **Authentication**, enable email and password sign-in and configure SMTP for signup confirmation and recovery. Set the site URL and allowlist `<your SITE_URL>/auth/confirm`. Use the same hostname in the app configuration, dashboard, and browser. Use these destinations in the email templates.

   - **Confirm signup** — `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email`
   - **Reset password** — `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery`

   Open a fresh confirmation link and select **Confirm email** to finish signup. Signed-in players can create a team or join with a captain’s code. Migration 009 keeps existing team progress and roster records and creates codes for existing teams that have not started.

4. Set the competition slug, site URL, Supabase URL, and publishable key in `.env.local` and restart the app.

To enable Google sign-in, configure the Google provider in Supabase. In Google Cloud, enter the Supabase provider’s callback as an authorized redirect URI. In Supabase **Authentication → URL Configuration**, add `<your SITE_URL>/auth/callback` to Redirect URLs. Use `http://127.0.0.1:3000/auth/callback` for the local site if `SITE_URL` uses that host. Test in the same browser session from **Continue with Google**. First-time players choose whether to create or join a team.

## Authorize up to two organizers

Have each organizer create and confirm their account, or create the user yourself in **Authentication → Users**. Copy each approved user's UUID from the dashboard. Run the SQL below in the dashboard SQL Editor after replacing the UUID placeholders. For one organizer, omit the slot 2 row and end the slot 1 row with a semicolon.

```sql
insert into public.admin_roles (competition_id, user_id, slot)
values
  ('<competition UUID>', '<first organizer Auth UUID>', 1),
  ('<competition UUID>', '<second organizer Auth UUID>', 2);
```

The database permits only slots 1 and 2 across this installation. Each slot is unique and each user can occupy only one slot. Public registration creates a player identity. The participant role has no permission to write to `admin_roles`. Role checks use the authenticated user ID and the configured competition. To rotate an organizer, update the intended slot as a project operator.

## Access boundaries

| Surface | Protection |
| --- | --- |
| `/admin` | Verified Supabase user and a competition-scoped role check before loading data |
| `/api/admin/submissions` | Same role check, 401 for no session and 403 for players |
| Organizer Server Actions | Verify the role on every invocation. Management RPCs also verify it in PostgreSQL |
| Participant lobby and arena | Authenticated team membership and team-scoped RLS |
| Team join codes | Captain-only reads. Joining requires an open registration and an available seat before the team starts |
| Expected answers | Private schema. Only the organizer editor uses the role-checked answer-key RPC |
| Competition CSVs | Private bucket. Every linked team member can download the case after the captain starts |
| Leaderboard | Public team and score projection, refreshed through Supabase Realtime with polling fallback |

The submission transaction uses server time, serializes scoring by team, prevents duplicate accepted records, and rate-limits attempts. Accepted answers update the shared leaderboard. The organizer monitor refreshes the latest submissions every five seconds.

## Verify staging

Sign in as each of the two organizers and as a player from each of two teams. Confirm the redirect destinations, denial of direct organizer page and API access for players, private answers and CSV scope, and cross-device leaderboard updates. Also test email confirmation, team registration, assignment, and independent checkpoint timers and progression.

Use separate browser profiles to test a captain and two teammates. Create a team, copy its code, and join from both teammate profiles. Verify the roster updates and the captain starts everyone’s arena. Submit the same correct answer from two profiles and verify it advances once. Reveal a hint from one profile and submit from another to verify the shared deduction.

If testing in the event project, record the test captain IDs. Before inviting participants, remove only the identified test teams and their test Auth accounts. Remove the team records first so their submissions, unlocks, and scores are cleared. Keep organizer accounts, challenge records, and datasets.

Reference: [Supabase SSR clients for Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs&queryGroups=framework).
