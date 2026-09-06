# Find Radar v13 — Product Finder working fallback

This version removes the hard dependency on TAVILY_API_KEY.

- Tavily is optional if you later add a key.
- Without Tavily, Product Finder performs a keyless web-search pass against the selected shopping domains.
- If that provider is unavailable/rate-limited, the API returns direct retailer searches with the user query prefilled rather than failing.
- Existing Lost & Found, shared auth, Radar+, messaging, My Posts and duplicate guards are preserved.

No new Supabase SQL is required for Product Finder.
