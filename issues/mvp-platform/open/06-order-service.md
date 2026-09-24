# 06 — Order Service: place order, history, status

**What to build:** An authenticated shopper can place an order from their cart, view their order history, and see order details with item snapshots. An admin can list all orders filtered by status and update order status. The order placement orchestrates a saga across Cart and Product services. The service consumes payment events from Kafka and publishes order events. Runs on port 3004 with its own Postgres database.

**Blocked by:** 04 — Product Service: CRUD, categories, search; 05 — Cart Service: add, view, update, remove

**Status:** ready-for-agent

- [ ] Drizzle schema for `orders` (id, user_id, status enum, total in cents, timestamps) and `order_items` (id, order_id, product_id, product_name snapshot, price snapshot in cents, quantity)
- [ ] Migrations run automatically on service startup
- [ ] `POST /orders` — orchestrates: call Cart `/cart/checkout` → call Product `/products/validate-order` → create order + items in DB transaction → publish `order.placed` to Kafka → return order. Compensates on failure (restores cart, restores stock)
- [ ] `GET /orders` — authenticated user sees their orders; admin sees all orders with optional `status` filter; paginated
- [ ] `GET /orders/:id` — returns order with items; user can only see own orders, admin can see any
- [ ] `PATCH /orders/:id/status` — admin only, updates status, publishes `order.status-changed`
- [ ] Kafka consumer for `payment.confirmed` — updates order status to `paid`
- [ ] Kafka consumer for `payment.failed` — updates order status to `cancelled`, calls Product Service to restore stock
- [ ] Order items store snapshot of product_name and price at order time
- [ ] Status transitions: pending → paid → shipped → delivered, or pending → cancelled
