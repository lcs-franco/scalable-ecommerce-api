# 08 — Notification Service: email dispatch

**What to build:** A purely event-driven service that consumes all domain events from Kafka and dispatches email notifications via Ethereal (fake SMTP with a viewable dashboard) and logs SMS to console. A developer can see all "sent" emails in the Ethereal web UI. Runs on port 3006.

**Blocked by:** 02 — Shared packages: logger, auth, events

**Status:** ready-for-agent

- [ ] Kafka consumers for: `user.registered`, `order.placed`, `payment.confirmed`, `payment.failed`, `order.status-changed`
- [ ] Ethereal SMTP transport auto-configured via `nodemailer.createTestAccount()` at startup
- [ ] Ethereal dashboard URL logged at startup so developers can view emails
- [ ] Welcome email sent on `user.registered`
- [ ] Order confirmation email sent on `order.placed` (includes items and total)
- [ ] Payment success email sent on `payment.confirmed`
- [ ] Payment failure email sent on `payment.failed` (includes reason)
- [ ] Status update email sent on `order.status-changed`
- [ ] SMS notifications logged to console via Pino (same interface as a real provider)
- [ ] No database — service is stateless
- [ ] `GET /health` endpoint for container health checks
- [ ] Email content is simple inline HTML (no template engine)
