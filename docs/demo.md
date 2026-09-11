# Two-to-three-minute CookieLens demo

Status: real deployed-origin walkthrough completed and evidence recorded on 2026-09-11. This guide can be used to record a concise public demo without recreating the transaction.

Verified app: https://stonegate-labs.github.io/cookielens/

Verified reclaim: https://cookiescan.io/tx/22MFsSaQCHNqr1vQnX8PzsXjyuRmNTgGrmT3YpJvA2ez2x2hyvd5UuPkBpx8VtMtyy5b28fbrbpLe5U3yQ4bai6w

## Walkthrough

**0:00–0:25 — Connect and orient.** Open the public URL, show the Cookie Chain label and Nightly selection, connect Nightly, and compare the complete wallet address. Mention that public-address inspection is read-only and does not require wallet connection.

**0:25–1:00 — Read wallet insights.** Show native COOK, exact balances, sampled activity and actual known fees. Point out the bounded seven-day UTC sample and that missing transaction details remain visible rather than guessed.

**1:00–1:40 — Explain safe reclaim.** Explain that CookieLens only offers `Review reclaim` for supported empty legacy SPL Token accounts. The real demonstration account used was `DdBDwVy3MuRtgS3v56YLMSquJaoWWyqZody9xWxvLAcj`, mint `12DLwYxJ8scRSoF9xnm3QUcvdzosWcVhYqy4B9vhKfsb`, with zero raw token units and 0.002039280 COOK of refundable storage.

**1:40–2:10 — Show what was approved.** Explain that before Nightly signing, CookieLens verified genesis/program/account state, estimated a 0.000005 COOK fee, checked fee balance, and simulated the exact single CloseAccount transaction. Only the explicit final confirmation requested Nightly approval.

**2:10–2:40 — Verify the real outcome.** Open the finalized CookieScan transaction. Show `meta.err = null`, fee 5,000 base units, wallet transaction balances `0.000906720 -> 0.002941000 COOK`, and the closed source balance `2,039,280 -> 0`.

**2:40–2:55 — Refresh.** On CookieLens, show `No legacy token accounts` and the real reclaim signature in Recent activity. Close with the public app and open-source repository.

## Safety notes

Do not replay the reclaim just to record a video. Do not expose wallet secrets, raw signed transactions or approval tokens. If demonstrating bridge onboarding, direct users to https://docs.cookiechain.wtf/bridge; bridging is external onboarding, not a CookieLens reclaim transaction.
