# DATA QUEST

DATA QUEST runs on Next.js and Supabase. Players sign in individually and create a team or join with their captain’s code. Each team has up to three players who share checkpoint progress, time, and score.

## Run locally

1. Set the Supabase URL, publishable key, competition slug, and site URL in `.env.local` using `.env.example`.
2. Apply the database migrations, create the competition, and configure login and email templates using the [Supabase setup guide](supabase/README.md).
3. Run `npm ci`, then `npm run dev`. Open [http://localhost:3000](http://localhost:3000).

Use `npm run check:supabase` to check connectivity without printing credentials. Run `npm test`, `npm run typecheck`, and `npm run build` to check the application.

## Organize the competition

Use the Supabase dashboard to allowlist up to two organizer accounts. The same login page sends approved organizers to the console and team members to their lobby.

In the console, open the **Challenge Library** and attach a CSV dataset and checkpoints to each track. You can edit questions individually or import a JSON file containing questions, hints, and answer keys. For a track that already has checkpoints, imports must use the same number of entries. All four tracks need the same number of checkpoints before teams can begin.

Track content locks when the first team starts the track. Each team’s assignment locks when the team starts. Closing registration blocks new team registrations, and registered teams retain arena access.
