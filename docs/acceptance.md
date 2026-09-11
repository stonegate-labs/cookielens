# Acceptance and release gates

Review date: 2026-09-11.

Bounty source: https://superteam.fun/earn/listing/create-an-app-on-cookie-chain-app

## Current rules review

The live Superteam listing was reviewed on 2026-09-11. It is an open Global bounty with 1,000 USDC total prizes (500 USDC first, 500 USDC second) and 42 submissions in the observed public snapshot.

Observed requirements: Nightly wallet support, meaningful Cookie Chain on-chain interaction, transaction execution with status/error feedback, public deployment, open-source source code, and a comprehensive README. Submission fields include the live application URL, GitHub repository, and relevant addresses. The demo requirement asks for an X thread explaining and demonstrating the app and directing users to the Cookie Chain Bridge where relevant, followed by sharing the X thread in the Cookie Chain Telegram community.

The listing shows a sponsor winner-announcement date of 2026-09-28. The retrieved public text did not expose one unambiguous absolute submission timestamp/timezone, so none is invented here. The listing was open at review time.

No special authorship/tooling disclosure requirement was visible in the reviewed listing text. No human-authorship claim is made here.

## Product acceptance matrix

| Requirement | Status | Evidence |
| --- | --- | --- |
| Reproducible browser app | PASS | `npm check` passed: typecheck, lint, 63/63 Vitest tests, production build, public audit. |
| Nightly connection | PASS | Real Nightly extension connected from the public HTTPS origin; custom Cookie RPC compatibility fixed and regression-tested. |
| Native balance and inventory | PASS | Real public-origin reads observed before and after reclaim; exact base-unit balances preserved. |
| Sampled analytics | PASS | Deterministic tests plus deployed public inspection; recent activity rendered the real reclaim signature. |
| Read-only address inspection | PASS | Browser acceptance and final public-origin inspection passed. |
| Conservative eligibility | PASS | Real source account verified as zero-balance initialized legacy SPL account with correct owner/mint; unit coverage passed. |
| Preview and approval | PASS | Exact fee/net preview and simulation observed; signing requested only after final confirmation. |
| Transaction safety | PASS | Signed message validation, fresh revalidation, single broadcast, pending reconciliation and account-change defenses covered by tests. |
| Real reclaim | PASS | Real deployed-origin Nightly `CloseAccount` finalized successfully; full balance/account reconciliation recorded below. |
| RPC resilience | PASS | Unit/e2e coverage for malformed/offline/rate-limited/stale paths; real Cookie RPC/CORS used on deployed origins. |
| Responsive/accessibility | PASS | Playwright 24/24 across 390x844 mobile and 1440x1000 desktop. |
| Public artifact hygiene | PASS | Public text/bundle audit passed; no signing material or secret data committed. |
| Open-source setup | PASS | Public GitHub repository, MIT license, README/setup documentation present. |
| Public delivery | PASS | Public HTTPS GitHub Pages deployment and external browser inspection passed. |
| Submission/social package | PARTIAL | Submission evidence is ready; X publication, Telegram sharing and final Superteam submission are not yet observed. |

## Published application and test identity

- Public repository: https://github.com/stonegate-labs/cookielens
- Public HTTPS application used for the real reclaim: https://stonegate-labs.github.io/cookielens/
- Application source code commit under the real reclaim test: `da767449f843a01880262355f3906b9826a52242`.
- GitHub Pages workflow run `34550935794`: successful, including deploy job.
- Verified Cookie Chain genesis: `9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2`.
- Canonical executable legacy SPL Token Program: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`.
- Real Nightly wallet/refund destination: `9tkcm8gFHiNeFS6eMfGbHJ7Y1qvKkyQKa5yuuPKPRd67`.

## Real reclaim evidence

Source token account: `DdBDwVy3MuRtgS3v56YLMSquJaoWWyqZody9xWxvLAcj`

Mint: `12DLwYxJ8scRSoF9xnm3QUcvdzosWcVhYqy4B9vhKfsb`

Before reclaim, the source was an initialized legacy SPL token account with raw token amount `0`, rent/storage balance `2,039,280` base units, and the connected Nightly wallet as token owner, signer and refund destination.

Real reclaim signature: `22MFsSaQCHNqr1vQnX8PzsXjyuRmNTgGrmT3YpJvA2ez2x2hyvd5UuPkBpx8VtMtyy5b28fbrbpLe5U3yQ4bai6w`

CookieScan: https://cookiescan.io/tx/22MFsSaQCHNqr1vQnX8PzsXjyuRmNTgGrmT3YpJvA2ez2x2hyvd5UuPkBpx8VtMtyy5b28fbrbpLe5U3yQ4bai6w

- Transaction slot: `24427275`.
- Finality: `finalized`.
- Signature status error: `null`.
- Transaction `meta.err`: `null`.
- Actual network fee: `5,000` base units = `0.000005 COOK`.
- Indexed pre balances: `[906720, 2039280, 934087680]`.
- Indexed post balances: `[2941000, 0, 934087680]`.
- Wallet balance in the reclaim transaction: `0.000906720 -> 0.002941000 COOK`.
- Source account native balance: `2,039,280 -> 0` base units.
- Program log: legacy SPL Token `Instruction: CloseAccount`, success; 2,916 compute units consumed.
- Source account was absent at finalized account context slot `24427477`.
- Refreshed production inspection showed `0.002941 COOK`, `No legacy token accounts`, omitted the closed source address, and included the reclaim signature in Recent activity.

## Supporting setup evidence

The demo account was created by transaction `5Ds7TtmBWqsyHoC3MaMJuoKwpv5St55WbXop5aDUyuYbmnAARkJKgeLkQ5SeJoFzgTBHJqiYpRgKzKmTatUPPG5P`, finalized with `meta.err = null`, creating the zero-token legacy account with `2,039,280` base units of storage balance.

The final fee-buffer top-up source transaction was `5YkTb4axJX3xq1D4dg2gVfpYoJZzXNd8CpQmFvvDroPS3rHR2Zcz4EbsKrVefNczviWVyr9vAMtNycnw4YTL8hRv`, finalized with null error; it moved the final 15 sCOOK base units and left source sCOOK at zero. This is funding support evidence, not the reclaim transaction.

No seed phrase, private key, raw signed transaction or approval secret is included in the public evidence.

## Remaining external delivery actions

The technical release and real reclaim acceptance are complete. The Superteam submission itself has not yet been observed as sent. X-thread publication and Telegram sharing are also not yet observed. No prize, winner or payment outcome is claimed.
