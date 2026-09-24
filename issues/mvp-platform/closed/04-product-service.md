# 04 — Product Service: CRUD, categories, search

**What to build:** An admin can create, update, and delete products and categories. A shopper can browse products with pagination, filter by category, and search by name/description. An internal endpoint validates product prices and atomically decrements stock for order placement. The service runs on port 3002 with its own Postgres database and Drizzle migrations.

**Blocked by:** 02 — Shared packages: logger, auth, events

**Status:** done

- [x] Drizzle schema for `categories` (id, name, timestamps) and `products` (id, name, description, price in cents, stock, category_id, timestamps)
- [x] Migrations run automatically on service startup
- [x] `GET /products` — paginated (limit/offset, default 20), filterable by `categoryId`, searchable by `q` param (ILIKE on name + description)
- [x] `GET /products/:id` — returns single product with category info
- [x] `POST /products` — admin only, creates product with Zod-validated body
- [x] `PATCH /products/:id` — admin only, partial update
- [x] `DELETE /products/:id` — admin only, deletes product
- [x] `GET /categories` — lists all categories
- [x] `POST /categories` — admin only, creates category
- [x] `PATCH /categories/:id` — admin only, updates category name
- [x] `DELETE /categories/:id` — admin only, deletes category (fails if products reference it)
- [x] `POST /products/validate-order` — internal endpoint, accepts `[{ productId, quantity }]`, validates prices, atomically decrements stock (`WHERE stock >= qty`), returns validated items or error
- [x] Prices stored as integers (cents)
- [x] A dev seed script populates sample categories and products
