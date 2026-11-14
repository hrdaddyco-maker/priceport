# Priceport — the AI VPN for better deals

Prices for games, apps and subscriptions differ by country. A VPN lets you *see* those regional prices; Priceport does that region-hopping for you from public, keyless sources, converts everything to your currency, ranks countries cheapest-first, and explains (with AI) whether the cheaper price is actually usable from abroad.

Live: https://priceport.onrender.com

## Live price sources (no API keys)
| Store | How | Countries |
|---|---|---|
| Steam | `store.steampowered.com/api/appdetails?appids=ID&cc=XX&filters=price_overview`, search via `storesearch` | 49 |
| Xbox / Microsoft Store (Game Pass, Xbox games) | `displaycatalog.mp.microsoft.com/v7.0/products?bigIds=ID&market=XX`, search via `productFamilies/autosuggest` | where sold |
| Apple App Store | iTunes Lookup API `?id=ID&country=xx` (app price) + public `apps.apple.com/xx/app/idID` pages ("Top In-App Purchases" for subscription tiers like ChatGPT Plus) | 49 storefronts |
| Spotify | official `spotify.com/<country>/premium/` pages (Next.js data) | ~40 |
| FX | `open.er-api.com/v6/latest/USD` (fallback `api.frankfurter.app`) | — |

Not live (no public per-country feed without a real exit IP / sign-in): Netflix, YouTube Premium, Disney+, Google Play.

## AI
Keyless Pollinations by default (`https://text.pollinations.ai/openai`). Swap with env vars:
- `LLM_URL` — any OpenAI-compatible chat completions URL
- `LLM_KEY` — bearer key
- `LLM_MODEL` — model name
The AI parses free-text requests into lookups (popular items skip it via rules) and writes the verdict. If the AI is down, a rule-based verdict is shown.

## Run
`npm start` (Node 18+, no dependencies). Watch list is stored in the browser (localStorage) and rechecked on each visit.

Using a VPN to buy at another region's price can break a store's terms and get an account flagged. Priceport only shows public prices.
