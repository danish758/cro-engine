# 024. Product name: Splitbeam

## Context
`cro-engine` was a working name. The dashboard will need a real domain (for same-site cookies), and the API needed a stable public URL.

## Options
Names considered and dropped:

| Name | Why not |
| --- | --- |
| Conversionize, Convertly | Too close to existing A/B testing tools (Convertize, Convert) |
| Liftify, Variantify, Experify, Splitwave, Testify | Already products or popular libraries |
| a/b + word (abfork, abforge) | Crowded next to AB Tasty, ABlyft, ABsmartly; slash can't be used in domains or npm |
| Forkpoint, Splitray | Taken on npm |
| Twinbeam, Twinpath | Didn't like the word "twin" |
| Doraha, Parakh, Bisect | Didn't fit the feel I wanted |

## Decision
- Brand: **Splitbeam** (one word, capital S only). Technical names: `splitbeam`, lowercase
- Domain: `splitbeam.dev`, registered at Cloudflare. `splitbeam.com` is held by a reseller ($9,995)
- API: `api.splitbeam.dev`, CNAME to Railway, Cloudflare proxy **off** (DNS only, grey cloud)
- Dashboard later: `app.splitbeam.dev`
- GitHub org `splitbeam`; repo moved and renamed to `splitbeam/splitbeam`
- Code and package names (`@cro-engine/*`) stay for now; rename in one sitting later

## Why
- Developer-tool name: the product is an SDK and API, not a marketer's visual editor
- Free on npm and no existing product found with the name
- `.dev` is the usual ending for developer tools and is cheap; Cloudflare sells at cost, so it's the cheapest over several years
- `api.` and `app.` on the same site keep `sameSite: 'lax'` cookies working, so the open cookie question is settled
- Grey cloud keeps exactly one proxy (Railway) in front of the API, so `trust proxy 1` stays correct (023). Turning the orange cloud on would need `trust proxy 2`
