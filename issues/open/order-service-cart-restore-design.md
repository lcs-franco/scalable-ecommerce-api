# order-service: cart restore — batch endpoint and correct mock

**What to fix:** Two problems in the cart compensation flow: (1) `cartClient.restore` fires one POST per cart item while `productClient.restoreStock` uses a single batch request — inconsistent compensation design. (2) The cart client mock in tests defines `restore` as `async () => {}` (no args), but the real implementation receives `(items, userToken)` — the mock doesn't validate correct arguments.

**Blocked by:** none

**Status:** todo

- [ ] Evaluate whether cart-service supports (or should support) a batch restore endpoint
- [ ] If yes, update `cartClient.restore` to use batch
- [ ] Fix test mock to accept and validate arguments
