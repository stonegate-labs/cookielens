# Two-to-three-minute CookieLens demo

Status: rehearsal guide. Public deployment, approved addresses and a real transaction are unresolved. Do not describe a fixture demonstration as a live reclaim.

## Before recording

Obtain explicit authorization for deployment, the real transaction and public use of the selected addresses. Use an operator-controlled Nightly wallet with existing COOK for fees and an existing eligible empty legacy token account. If unavailable, request approved setup; do not create or fund accounts automatically.

Verify the current official bridge guidance at https://docs.cookiechain.wtf/bridge and its linked https://hyperlane.cookiescan.io bridge. Bridging is external onboarding, not an application transaction. Verify the network identity and executable token program according to `network.md`, and record the actual app URL and source commit in `submission.md`.

Use the real extension on the deployed HTTPS origin. Confirm the page has no login wall, RPC/CORS works and the sample contains only real chain data. Approve only the single planned empty-account closure. Keep browser submission storage intact through confirmation.

## Walkthrough

**0:00–0:25 — Connect and orient.** Open the verified public URL. Show CookieLens, the Cookie Chain label and Nightly selection. Connect Nightly and compare the complete displayed public address to the extension. Briefly show that public-address inspection also works read-only.

**0:25–1:00 — Read wallet insights.** Point out native COOK, exact token quantities and gross eligible storage refund. Show the sample size, available timespan, missing details and seven-day UTC chart/table. Open one transaction detail to distinguish its actual network fee, fee payer and wallet native balance change. Explain that the sample is not full history or profit.

**1:00–1:45 — Review one account.** Select the approved empty legacy account. Show its full source address, mint, connected wallet refund destination, gross refund, estimated fee and net return. Show the verified network/program information and passed simulation. Explain that closure removes the account and future receipt may require recreation and storage funding. Nothing has been signed yet.

**1:45–2:20 — Approve and confirm.** Click the explicit final confirmation and show the real Nightly approval. Confirm only the single account closure. Show the retained signature and original validity bound. If status is pending, demonstrate reconciliation and say pending; do not cut the recording to imply unobserved success. Do not submit a replacement after a timeout.

**2:20–2:50 — Verify the outcome.** Once confirmed/finalized with null transaction error, open the real CookieScan transaction. Refresh the app and show the account removed and activity updated. Reconcile the refund with that transaction's pre/post balances and fee. Close with the actual public source and app links.

## Record after the demo

Populate `submission.md` with the approved public wallet, source account, mint, refund destination, signature, explorer URL, genesis, program, confirmation slot/finality, null `meta.err`, closed-account observation and transaction-level refund reconciliation. Keep sensitive or unsanitized recording material outside the public repository. Review desktop/mobile screenshots separately before publication.
