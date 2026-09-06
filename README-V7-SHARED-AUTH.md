# Find Radar v7 — Shared Opportunity Radar account

This version removes the local/fake Find Radar account state and uses the same Supabase-backed Radar account model as the rest of the ecosystem.

## Included
- real Supabase Log in / Sign up
- Remember me: persistent local storage when enabled, session storage when disabled
- real logged-in email + Log out
- shared Supabase user id
- Radar Plus check against `radar_plus_memberships`
- Radar Plus button links to `https://opportunityradar.site/radar-plus`
- all Find Radar Lost & Found/map/photo/private-location behavior retained

## Required environment variables
Find Radar must use the SAME values as Opportunity Radar / Save Radar:

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

Add them to the Find Radar Vercel project for Production, Preview and Development, then redeploy.

Do not create a second Supabase project for Find Radar.
