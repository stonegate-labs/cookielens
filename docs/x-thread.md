# X thread — final publication draft

Status: technically verified and ready for publication. Not yet observed as published.

1/ CookieLens is a focused Cookie Chain wallet dashboard that shows native COOK, recent activity, sampled fees, and eligible storage locked in empty legacy SPL token accounts — with one carefully reviewed reclaim at a time.

2/ Connect Nightly or inspect any public address read-only. CookieLens uses exact base units and a bounded seven-day UTC view from at most 50 recent signatures. Missing transaction details stay explicit. No invented prices, portfolio values or PnL.

3/ Empty token accounts can still hold refundable storage. CookieLens only allows conservative legacy SPL Token eligibility: zero token amount, initialized, non-native, no delegate, correct owner and close authority. No bulk closes and no custom on-chain program.

4/ Before signing, CookieLens re-verifies Cookie Chain identity, re-reads the account, estimates the fee, checks positive net return and existing fee balance, and simulates the exact CloseAccount transaction. Only the final confirmation asks Nightly to sign.

5/ We verified the full flow on-chain. A real empty account holding 0.002039280 COOK of storage was closed through Nightly. Actual network fee: 0.000005 COOK. The wallet moved from 0.000906720 to 0.002941000 COOK in the transaction.

6/ Finalized reclaim: https://cookiescan.io/tx/22MFsSaQCHNqr1vQnX8PzsXjyuRmNTgGrmT3YpJvA2ez2x2hyvd5UuPkBpx8VtMtyy5b28fbrbpLe5U3yQ4bai6w
After confirmation, CookieLens refreshed to `No legacy token accounts` and the real signature appeared in Recent activity.

7/ Try CookieLens: https://stonegate-labs.github.io/cookielens/
Source: https://github.com/stonegate-labs/cookielens
Need COOK on Cookie Chain? Official bridge guidance: https://docs.cookiechain.wtf/bridge

Publication note: no prize or award is claimed. After publishing, record the actual X thread URL in `docs/submission.md` and use that URL in `docs/telegram.md`.
