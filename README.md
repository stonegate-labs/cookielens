# CookieLens

CookieLens is an MIT-licensed Cookie Chain wallet overview by stonegate-labs. Inspect a public address or connect Nightly to see native COOK, legacy SPL token accounts, a bounded activity sample, fees actually paid by the inspected wallet, and eligible refundable account storage.

The only transaction is closing one explicitly selected empty legacy SPL token account. There are no platform fees, transfers, burns, bulk closures, trading features, price estimates, accounts, database, or server-held signing material.

## Delivery status

This source is a candidate for verification. Automated checks, browser screenshots, live network identity, real Nightly approval, public deployment and bounty eligibility must be verified before release. No live reclaim or public delivery is claimed. See [acceptance](docs/acceptance.md) and [submission](docs/submission.md).

## Setup

Use Node.js 22.15 or later and npm supporting lockfile version 3. Commit the generated `package-lock.json` after dependency resolution and check it uses public registry artifacts and integrity hashes. A release checkout must contain that lockfile. Do not replace `npm ci` with an unpinned installation for release verification.

```sh
npm ci --ignore-scripts
cp .env.example .env
npm run dev
```

The only application environment variable is `VITE_COOKIE_GENESIS_HASH`. It is public and bundled into the app. Leave it blank for read-only inspection. Follow [network verification](docs/network.md) before setting it. Never place a credential, seed phrase, private key or signed transaction in environment variables.

The RPC URL is fixed in `integrations/rpc.ts` to `https://rpc.cookiescan.io`. There is no Solana mainnet/devnet fallback and no metadata service dependency. All product network and wallet access is behind `integrations/` adapters.

Tooling is included in the dependency manifest so the same selected tool versions are available to offline verification. Installation does not require package lifecycle scripts. Preserve installed third-party license notices; inspect `npm ls --all` and dependency licenses before publication. CookieLens's MIT license does not replace dependency licenses.

## Local checks

```sh
npm run test
npm run check
npm run build
npm run preview
```

`test` runs non-watching deterministic product tests with local RPC and wallet fixtures. It does not contact a chain or extension. `check` fails on TypeScript, lint, unit/integration, build or public-artifact audit errors. Build produces `dist/index.html`.

For browser acceptance, provision the Chromium browser matching the locked Playwright package, then run:

```sh
npx playwright install chromium
npm run test:e2e
```

Browser provisioning is a separate environment setup step and may require network access. The tests use intercepted RPC responses and a browser-only Nightly fixture. They run at 390px and 1440px and save screenshots under ignored test output. Review those screenshots; their existence alone is not visual review. Browser mocks do not establish real Nightly compatibility. Browser tests must be run separately from `check` when browser binaries are available.

## Nightly and Cookie Chain

Install Nightly from its official distribution and configure Cookie Chain following the current [Cookie Chain developer guide](https://docs.cookiechain.wtf/developer-guide) and [Nightly signing documentation](https://docs.nightly.app/docs/solana/solana/sign_transaction/). Verify those instructions before deployment.

CookieLens detects Wallet Standard features at runtime and also supports a detected Nightly injected Solana interface with transaction signing and account-change detection. Wallet Standard signing requires the selected account to advertise the verified genesis-derived chain and `solana:signTransaction`. An unsupported extension remains visibly blocked. CookieLens never calls a wallet's sign-and-send method: it requests transaction signing, validates the returned message and signature, then broadcasts explicitly through the verified Cookie Chain RPC.

The injected signing interface does not independently attest the wallet's UI network setting. Configure and verify Cookie Chain in Nightly during the real browser acceptance gate. Network identity and executable program checks in the application are mandatory before any write. Connection alone is not proof of that gate.

For funding guidance, consult the [official bridge page](https://docs.cookiechain.wtf/bridge) and its current [Hyperlane bridge](https://hyperlane.cookiescan.io). Recheck the official link before use. Bridging is outside the application and requires the operator's own decision and authorization. CookieLens never generates or funds wallets.

## What the numbers mean

COOK uses nine decimal places. Balances, refundable storage, fees and net return use integer base units. Token quantities use the RPC's raw integer amount and decimal count, never floating-point `uiAmount`.

Analytics fetch at most the newest 50 signatures and at most 50 details with four concurrent detail requests. Signatures are deduplicated and ordered by slot. The seven-day UTC chart and summary use the same sample as the activity list. Missing timestamps and unavailable/pruned/version-unsupported details are explicit. Known fees include only transactions whose first account is the inspected wallet. A missing detail is not a zero fee. Native balance changes include all changes in that transaction; they are not profit or a historical portfolio balance. Unknown instruction types remain unknown, and inner instructions are not presented as comprehensively classified.

Inventory covers only the canonical legacy SPL Token program. Token-2022 and other programs are excluded. Token names, icons, remote metadata and market data are not fetched or trusted. Public keys and signatures link to CookieScan.

## Reclaim safety and consequences

An eligible account must have the canonical legacy token program owner, exactly zero raw tokens, initialized non-frozen non-native state, no delegate, the connected wallet as token owner, and the same effective close authority. Multisig layouts, native wrappers, unsupported layouts and foreign authorities are rejected. These are conservative product restrictions, not a complete description of what SPL Token permits.

Each preview re-reads the selected binary account, verifies the configured genesis and executable program, builds one CloseAccount instruction, estimates its fee and simulates it. The wallet is always both signer and refund destination. Only the final confirmation button requests signing. The application revalidates the same wallet revision, account bytes, storage balance, fee, network and blockhash validity before signing and before broadcast. Changed or expired previews require a new review; there is no silent rebuild or automatic re-sign.

Closure removes the token account and refunds its current native storage balance to the connected wallet. Receiving that token later may require account recreation and storage funding. The estimated net refund must be positive and the wallet must already hold enough COOK to pay the fee. Simulation and estimates do not guarantee inclusion or success.

The application saves public submission metadata in local browser storage before a single broadcast: signature, addresses, genesis, original blockhash and validity bound. It never stores the signed transaction. A timeout is unknown/pending. Reconcile the saved signature before another reclaim. Confirmed/finalized status with explicit null transaction error is required for success. Expired validity plus an absent RPC record does not prove that a transaction never landed, so unresolved outcomes remain blocked. Keep this browser storage until pending signatures are resolved. Do not clear it to bypass reconciliation.

## Deployment

Deployment requires explicit operator authorization. Build a static HTTPS site from an audited release commit and serve `dist/` without a login or protection wall. Configure the verified public genesis hash before building. Do not publish test outputs or local environment files. No application server is required.

From the actual public origin, verify browser RPC/CORS access, refresh latency, CookieScan links, real Nightly connection/account changes and one separately authorized reclaim. If direct browser RPC access fails, stop and document the concrete blocker before introducing a proxy or changing architecture. Record the public URL and actual source commit in `docs/submission.md` only after observation.

A real demo needs an operator-controlled funded Nightly wallet and an eligible existing empty legacy token account. Request approved demo setup if one is unavailable. Do not create accounts, mints or funding transactions automatically.

## Troubleshooting

- **Nightly missing or unsupported:** install/update the official extension, configure Cookie Chain and reload. Rejection is safe to retry after reviewing the connection request.
- **Reclaim disabled:** inspect `docs/network.md`; a blank genesis config, wrong network, unavailable canonical program, another inspected address or unresolved submission blocks writes.
- **RPC offline/rate-limited:** retry after recovery. Reads use bounded backoff; existing data stays visible with a stale indicator. Fixture data is never substituted.
- **Insufficient COOK:** the refund cannot pay the upfront fee. Funding is an external, separately authorized step.
- **Expired preview/account changed:** cancel and explicitly select the account again. Review all new estimates.
- **Unknown submission:** keep its signature and use reconciliation. Check CookieScan; do not assume failure or create a replacement.
- **Storage unavailable/corrupt:** reclaim fails closed. Preserve any known signatures and reconcile independently before repairing storage.

No third-party tracking is enabled. The RPC operator and wallet extension can observe requests made to them. Public inspection sends the address to the configured RPC. Read [release acceptance](docs/acceptance.md) before publishing or submitting.
