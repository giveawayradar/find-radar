# Find Radar v10 — Private Radar Messaging

This version removes public contact details from Lost & Found reports and adds a simple private account-to-account chat.

## Before deploy
Run `supabase/find_radar_messaging.sql` once in the same Supabase project used by Opportunity Radar / Find Radar.

## What changed
- No public email/phone contact field on reports.
- `Message owner` starts a private chat tied to a report.
- Messages are visible only to the two participating authenticated Radar accounts through RLS.
- A Messages button in the top bar opens the inbox.
- Report owners can see conversations created about their posts.
- Conversation history remains if the report itself is deleted (`report_id` becomes null).
- Existing Lost & Found login-only publishing, My posts, deletion, private location, and draggable pin remain.
