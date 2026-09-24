# order-service: group publishers and export OrderStatus

**What to fix:** `publishOrderPlaced` and `publishOrderStatusChanged` are passed separately in `IDeps` (order.service.ts) and `IBuildAppOptions` (app.ts) — they always travel together (Data Clump). Additionally, `OrderStatus` (`'pending' | 'paid' | ...`) is defined inline in two places.

**Blocked by:** none

**Status:** todo

- [ ] Export `OrderStatus` from the schema or service as single source of truth
- [ ] Group publishers into `publishers: { orderPlaced, orderStatusChanged }` object
- [ ] Update `IDeps` and `IBuildAppOptions` to use the grouped object
