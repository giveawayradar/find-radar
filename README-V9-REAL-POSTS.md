# Find Radar v9 — real Lost & Found posts

This version:
- removes all demo/fake Lost & Found items
- ignores and clears old prototype `find-radar-reports` localStorage data
- loads genuine Lost & Found posts from Supabase
- requires a shared Radar account to publish
- adds a **My posts** filter
- allows only the owner to delete their own post
- fixes location picking with a high-priority draggable green marker and explicit **Lock location** confirmation

## Required once: create the Supabase table
Open the same Supabase project used by Opportunity Radar → SQL Editor → New query.
Paste and run the contents of:

`supabase/find_radar_reports.sql`

This enables public reading of reports, authenticated-only posting, and owner-only deletion using RLS.

## Environment
Keep the same existing:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Do not replace `.env.local` when copying these project files over your local Find Radar folder.
