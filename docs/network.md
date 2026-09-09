# Cookie Chain network verification

Status: unresolved. No live genesis hash, executable-program observation or browser-origin CORS result has been recorded. Reclaim defaults to disabled.

## Declared configuration

| Setting | Value | Verification status |
| --- | --- | --- |
| Primary read/broadcast RPC | `https://rpc.cookiescan.io` | From project requirements; live and deployed-origin checks pending |
| Native unit | COOK, nine decimals | Current official source review pending |
| Legacy SPL Token | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | Live executable account check pending |
| Expected genesis | Not configured | Must be independently verified before enabling writes |
| Public deployment origin | Not deployed | Authorization and actual browser access check pending |

Sources to review:

- https://docs.cookiechain.wtf/developer-guide
- https://docs.cookiechain.wtf/cook
- https://docs.cookiechain.wtf/ecosystem
- https://docs.nightly.app/docs/solana/solana/sign_transaction/
- https://solana.com/docs/tokens/basics/close-account
- https://docs.cookiechain.wtf/bridge

## Operator procedure

1. Review the current official developer guide and confirm the primary endpoint. Read `getGenesisHash` from that endpoint. Independently confirm that identity against authoritative Cookie Chain information or a second trusted observation. Do not treat a single unverified endpoint response as sufficient to establish the expected identity.
2. Query `getAccountInfo` for the canonical legacy token program with confirmed commitment. Confirm the account exists and `executable` is true. Record the observation time and context slot.
3. Record the confirmed genesis, source of independent corroboration and program observation in the table below. Put that exact public genesis in `VITE_COOKIE_GENESIS_HASH` and rebuild. There is no endpoint or network fallback.
4. From the actual authorized HTTPS deployment, verify browser requests to the primary RPC, CORS access, genesis, account responses and healthy refresh within 15 seconds. Test rejected and unavailable RPC responses visibly.
5. Verify real Nightly connection and account-change events. For Wallet Standard, check the selected account's chain and signing features. For injected signing, verify Cookie Chain setup in the extension and observe transaction approval through this app. The app never invokes sign-and-send.
6. Only after separate transaction authorization, run the real reclaim gate in `acceptance.md`. The application rechecks genesis and executable program before each preview and before broadcast; mismatch fails closed.

## Verified configuration record

| Observation | Actual value |
| --- | --- |
| Review date/time | Unresolved |
| Genesis hash | Unresolved |
| Independent identity corroboration | Unresolved |
| Program executable result and context slot | Unresolved |
| Deployed origin and browser/CORS result | Unresolved |
| Nightly version and detected interface | Unresolved |
| Cookie Chain wallet configuration result | Unresolved |
| Operator-approved evidence reference | Unresolved |

Do not substitute fixtures or a guessed hash into this record. Keep sensitive diagnostics outside the public repository. Record only sanitized, operator-approved product observations.
