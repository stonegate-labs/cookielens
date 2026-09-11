# CookieLens submission record

Status: technical delivery complete; Superteam submission not yet observed as sent. X publication and Cookie Chain Telegram sharing remain pending external publication actions.

| Submission field | Value |
| --- | --- |
| Product | CookieLens |
| Delivery identity | stonegate-labs |
| Public source URL | https://github.com/stonegate-labs/cookielens |
| Verified live HTTPS URL | https://stonegate-labs.github.io/cookielens/ |
| Application code commit used for real reclaim | `da767449f843a01880262355f3906b9826a52242` |
| GitHub Pages deployment | Workflow run `34550935794`, successful |
| SPL Token program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Verified network genesis | `9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2` |
| Demo wallet/refund destination | `9tkcm8gFHiNeFS6eMfGbHJ7Y1qvKkyQKa5yuuPKPRd67` |
| Demo token account | `DdBDwVy3MuRtgS3v56YLMSquJaoWWyqZody9xWxvLAcj` — closed by real reclaim |
| Demo mint | `12DLwYxJ8scRSoF9xnm3QUcvdzosWcVhYqy4B9vhKfsb` |
| Real reclaim signature | `22MFsSaQCHNqr1vQnX8PzsXjyuRmNTgGrmT3YpJvA2ez2x2hyvd5UuPkBpx8VtMtyy5b28fbrbpLe5U3yQ4bai6w` |
| CookieScan reclaim link | https://cookiescan.io/tx/22MFsSaQCHNqr1vQnX8PzsXjyuRmNTgGrmT3YpJvA2ez2x2hyvd5UuPkBpx8VtMtyy5b28fbrbpLe5U3yQ4bai6w |
| Confirmation | slot `24427275`, `finalized`, signature error `null`, transaction `meta.err = null` |
| Actual reclaim fee | `5,000` base units = `0.000005 COOK` |
| Reclaim wallet balance | `0.000906720 -> 0.002941000 COOK` in indexed transaction balances |
| Closed account verification | absent at finalized context slot `24427477` |
| Published X thread URL | Pending; no publication observed yet |
| Telegram sharing result | Pending; no sharing observed yet |

## Current bounty review

Reviewed 2026-09-11 from the live Superteam listing. The listing is open and describes a Global 1,000 USDC bounty with two 500 USDC prizes. It requires Nightly wallet support, meaningful Cookie Chain on-chain interaction, transaction/status/error feedback, public deployment, open source and a comprehensive README. Submission asks for live app URL, GitHub repository and relevant addresses. Demo requirements call for an X thread plus sharing it in the Cookie Chain Telegram community.

The public text reviewed did not expose one unambiguous absolute submission timestamp/timezone, so this record does not invent one. The sponsor winner-announcement date shown is 2026-09-28.

## Requirement-to-evidence checklist

- [x] Current bounty requirements reviewed from the live listing on 2026-09-11; listing was open at review time.
- [x] No false authorship claim; no special tooling/authorship disclosure requirement was observed in the reviewed listing text.
- [x] TypeScript, lint, deterministic tests, production build and public-artifact audit observed passing.
- [x] Vitest: 63/63 PASS.
- [x] Browser acceptance: 24/24 PASS across mobile 390x844 and desktop 1440x1000.
- [x] Public HTTPS deployment works without reviewer login.
- [x] Public repository and deployed application identity recorded.
- [x] Live Cookie RPC/genesis and executable canonical legacy Token Program verified.
- [x] Real Nightly connection and approval observed from the public HTTPS origin.
- [x] Real eligible empty legacy account created and verified before reclaim.
- [x] Exactly one final real reclaim signed by Nightly and broadcast through Cookie Chain.
- [x] Reclaim reached finalized status with null signature error and null transaction `meta.err`.
- [x] Indexed pre/post balances and actual fee reconcile the storage refund.
- [x] Closed source account was absent at a later finalized context slot.
- [x] Refreshed production inventory removed the account and Recent activity included the real signature.
- [x] Demo/setup documentation exists in the repository.
- [ ] X thread publication observed.
- [ ] Cookie Chain Telegram sharing observed.
- [ ] Superteam submission observed as created/sent.
- [ ] Winner/prize/payment outcome observed.

## Limitations to disclose

Analytics cover at most 50 recent signatures/details and the seven-day UTC chart is derived from that bounded sample. Missing transaction details and unknown instructions remain explicit. CookieLens does not provide prices, valuations, PnL, swaps, trading or custody. Inventory/reclaim covers supported legacy SPL Token accounts and excludes Token-2022, wrapped-native, multisig, nonempty, delegated, frozen and foreign-authority accounts. Reclaim is one explicitly selected account per approval. An unresolved submitted signature blocks replacement until reconciliation.

Do not publish local diagnostics, wallet secrets, approval tokens, signed transaction bytes or other signing material. No prize outcome is promised.
