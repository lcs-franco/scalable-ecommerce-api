# 05 — Cart Service: add, view, update, remove

**What to build:** An authenticated shopper can add products to their cart, update quantities, remove items, view their cart with enriched product details (name, price, total), and clear it. An internal checkout endpoint atomically returns cart contents and clears the cart for order placement. Cart data lives in Redis with a 7-day TTL. The service runs on port 3003.

**Blocked by:** 04 — Product Service: CRUD, categories, search

**Status:** ready-for-agent

- [ ] Cart stored as Redis Hash (`cart:{userId}`, fields = productId → quantity)
- [ ] `POST /cart/items` — adds item `{ productId, quantity }` to cart, refreshes TTL
- [ ] `PATCH /cart/items/:productId` — updates quantity, refreshes TTL
- [ ] `DELETE /cart/items/:productId` — removes item from cart
- [ ] `GET /cart` — returns cart items enriched with product name, price, and computed line totals + grand total (fetched from Product Service)
- [ ] `DELETE /cart` — clears entire cart
- [ ] `POST /cart/checkout` — internal endpoint, returns cart contents and atomically deletes cart (Redis MULTI/EXEC)
- [ ] TTL of 7 days set on every write operation
- [ ] Handles missing/unavailable products gracefully in GET response (flags them)
- [ ] All endpoints require authentication (userId from JWT)
