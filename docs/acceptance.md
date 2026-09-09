# Acceptance and release gates

Preparation date: 2026-09-08. This is not a live source-review date. No live source review or release verification is recorded yet.

Bounty source: https://superteam.fun/earn/listing/create-an-app-on-cookie-chain-app

The supplied brief describes two 500 USDC prizes. Prize details, eligibility, exact submission requirements and the deadline require a current review of the live listing. No award is promised. A sponsor announcement date must not be used as a submission deadline.

## Current rules review — unresolved

Before publication, record the actual review date, submission deadline with timezone, eligibility restrictions, judging requirements, open-source requirements, required submission fields and any authorship/tooling disclosure rule. Retain a source link for each material rule. Confirm the deadline has not passed and the project is eligible. Do not infer these facts from this preparation date or a cached draft.

Disclosure decision: unresolved pending current rules and operator review. Make no false human-authorship claim. Preserve mandatory attribution. If a required disclosure conflicts with publication confidentiality, obtain an explicit decision before publishing; do not omit or conceal the disclosure.

## Product acceptance matrix

All rows below are unverified until the indicated check is actually observed. Source files and test cases are implementation artifacts, not passing results.

| Requirement | Candidate coverage | Required verification / current status |
| --- | --- | --- |
| Reproducible browser app | React, TypeScript, Vite, public registry package manifest | Generate and commit npm lockfile v3; offline `npm ci --ignore-scripts`, `npm run test`, `npm run check`, nonempty production output — unverified |
| Nightly connection | Runtime Wallet Standard and detected injected interface; account revision invalidation | Browser missing/rejected/connected/disconnected/switched cases and real extension on deployed origin — unverified |
| Native balance and inventory | Lossless RPC integer parsing; legacy inventory; exact decimals; refresh and slot labels | Healthy deployed-origin refresh within 15 seconds; empty and malformed responses — unverified |
| Sampled analytics | At most 50 signatures/details, four concurrent details, deduplication, UTC days, actual wallet-paid fees | Precision, UTC boundary, missing detail, other payer and versioned detail tests — unverified |
| Read-only address inspection | Canonical 32-byte validation; abort old requests; connected-owner signing restriction | Browser address-switch and network timing tests — unverified |
| Conservative eligibility | Canonical program, binary layout, zero amount, initialized, non-frozen, non-native, no delegate, owner and close authority | Raw account and instruction-deserialization tests — unverified |
| Preview and approval | Current account, gross/fee/net, positive net, upfront fee balance, simulation, explicit confirmation | Failure cases and only-final-click signing tests — unverified |
| Transaction safety | Exact signed message validation, pre-broadcast revalidation, single broadcast, original signature validity retention | Rejection, timeout, expiry, account change, chain error, repeated click, reload reconciliation tests — unverified |
| Real reclaim | Existing SPL Token CloseAccount only | Separately authorized deployed-origin Nightly transaction and balance reconciliation — unresolved |
| RPC resilience | Bounded backoff, aborts, no send retry, stale-data UI | Offline, 429, timeout, malformed and stale fixtures plus origin CORS — unverified |
| Responsive/accessibility | 390px/1440px projects, labelled inputs, keyboard controls, live regions, chart table | Run browser suite, review screenshots and keyboard flow — unverified |
| Public artifact hygiene | Tracked/worktree text and production bundle audit | Run audit; separately review commit metadata, assets, notices and sanitized evidence — unverified |
| Open-source setup | README, MIT license, setup/network/reclaim troubleshooting | Clean clone setup and dependency notice review — unverified |
| Public delivery | Static HTTPS architecture | Authorization, public URL, no login wall, source commit, external browser checks — unresolved |
| Submission/social package | Submission checklist, demo, X draft and Telegram draft | Populate observed links/evidence; approve and publish separately — unresolved |

## Real reclaim evidence required

With explicit authorization, use an operator-controlled Nightly wallet with existing fee funds and one eligible empty legacy account. Record only operator-approved public data:

- Deployment URL and exact published source commit.
- Observed genesis, canonical executable program and verification time/slot.
- Source token account, mint, connected signer/refund destination.
- Signature, CookieScan link, original blockhash and validity bound.
- Confirmation slot and confirmed/finalized status; explicit null transaction `meta.err`.
- Token account absent after confirmation at an adequate context slot.
- That transaction's indexed pre/post wallet and source balances and actual fee. Reconcile the storage refund from those transaction values, not a wallet balance measured across unrelated activity.
- Refreshed inventory removes the closed account and sampled activity includes the signature.
- Real Nightly connection and approval from the public HTTPS origin; no mocked signing.

A simulation, a successful build, a generated screenshot or a deployment plan cannot satisfy these gates. Do not mark an unresolved required item passed or submit the project as complete.

## Optional integrations

CookieScan account/transaction links are included and require live link verification. DAS metadata enrichment is deferred until the real API, browser access, terms and limits are verified; core functionality has no dependency on it. Cookieswap, Cookiebox and automated chain tooling are deferred because they do not belong to this reclaim workflow. Do not add invented endpoints, labels, prices or program addresses.

Deployment, funding, real signing, demo account setup, final submission, X publication and Telegram sharing each require corresponding explicit authorization. No authorization is recorded in this document.
