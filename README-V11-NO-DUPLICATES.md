FIND RADAR V11 — NO DUPLICATE POSTS

Changes:
- Publish locks immediately after the first click.
- Button visibly changes to Publishing… while Supabase is working.
- A client_submission_id makes the write idempotent in Supabase.
- The report list itself de-duplicates by database id.
- Includes a one-time SQL migration that deletes existing exact duplicate posts.

Run once in Supabase SQL Editor:
  supabase/find_radar_dedupe_and_publish_guard.sql

Then deploy the project normally.
