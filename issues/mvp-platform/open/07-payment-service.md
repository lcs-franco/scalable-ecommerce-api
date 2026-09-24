# 07 — Payment Service: event-driven processing

**What to build:** When an order is placed, the Payment Service automatically processes payment by consuming the `order.placed` Kafka event. It charges via Stripe (test mode) when configured, or falls back to a mock processor. After processing, it publishes `payment.confirmed` or `payment.failed`. A REST endpoint lets users check payment status. Runs on port 3005 with its own Postgres database.

**Blocked by:** 06 — Order Service: place order, history, status

**Status:** ready-for-agent

- [ ] Drizzle schema for `payments` (id, order_id, user_id, amount in cents, status enum, provider, provider_payment_id, failure_reason, timestamps)
- [ ] Migrations run automatically on service startup
- [ ] Kafka consumer for `order.placed` — creates pending payment record, invokes processor, updates record, publishes outcome event
- [ ] Stripe processor: uses Stripe SDK `paymentIntents.create` in test mode when `STRIPE_SECRET_KEY` is set
- [ ] Mock processor: activated when no Stripe key, simulates 1s delay, succeeds based on `MOCK_PAYMENT_SUCCESS_RATE` (default 90%)
- [ ] Both processors implement the same interface: `processPayment({ amount, currency, metadata }) → { success, paymentId?, error? }`
- [ ] Publishes `payment.confirmed` with `{ orderId, paymentId, amount, provider }` on success
- [ ] Publishes `payment.failed` with `{ orderId, paymentId, reason }` on failure
- [ ] `GET /payments/order/:orderId` — returns payment status for an order (authenticated, user sees own, admin sees any)
- [ ] Processor strategy selected at startup, logged clearly
