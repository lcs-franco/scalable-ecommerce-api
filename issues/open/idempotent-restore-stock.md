# Make restore-stock compensation idempotent with compensation ID

**What to build:** The `POST /products/restore-stock` endpoint increments stock without tracking whether the operation was already applied. If the order-service retries after a successful update but a lost response, stock gets incremented twice. This is relevant for the saga compensation flow in issue 06 (order service): `POST /orders` compensates on failure, and the Kafka consumer for `payment.failed` also calls restore stock.

**Blocked by:** none

**Status:** todo

- [ ] Add a `compensationId` field to `RestoreStockBodySchema`
- [ ] Create a `compensations` table with a unique constraint on the ID
- [ ] Inside `restoreStock` transaction, insert the compensation ID — if it already exists (unique violation), return success without incrementing stock
- [ ] Order-service generates a stable compensation ID per saga instance and sends it on every retry
