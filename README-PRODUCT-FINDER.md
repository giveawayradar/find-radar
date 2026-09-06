# Find Radar Product Finder v13

Product Finder now works without requiring a paid search API key.

## Search stack
1. If `TAVILY_API_KEY` exists, Find Radar uses Tavily as the high-quality first pass.
2. Without that key, the server performs a keyless web-search pass limited to the selected stores/marketplaces.
3. If the search provider is temporarily unavailable or rate-limited, Find Radar still returns direct live retailer searches with the user's target pre-filled instead of failing.

`TAVILY_API_KEY` is therefore optional, not required.

The Product Finder supports natural-language product targets, budget/currency, region, condition, must-haves, exclusions, marketplaces, stores and second-hand sources. Results are ranked against the brief and open the source so the user can verify current price and stock.
