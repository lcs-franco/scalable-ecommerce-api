# Unify KafkaJS logs with Pino

**What to fix:** KafkaJS uses its own internal logger, so its output (`{"level":"WARN","logger":"kafkajs",...}`) bypasses the Pino pipeline configured via Fastify. This causes three problems:

1. **Format mismatch** — KafkaJS logs are raw JSON while the rest of the app uses pino-pretty in dev
2. **Partitioner warning spam** — KafkaJS v2 emits a noisy warning about the default partitioner on every startup
3. **Negative timeout warning** — Node.js `TimeoutNegativeWarning` likely from a KafkaJS timer miscalculation

**Blocked by:** none

**Status:** todo

- [ ] Create `createKafkaLogCreator(pinoLogger)` in `@ecommerce/events` that bridges KafkaJS → Pino
  - Map KafkaJS log levels (ERROR/WARN/INFO/DEBUG) to Pino methods
  - Use `logger.child({ kafka: namespace })` for context
- [ ] Pass `logCreator` when instantiating `new Kafka({...})` in order-service and user-service
- [ ] Set `KAFKAJS_NO_PARTITIONER_WARNING=1` in service env configs (or switch to `Partitioners.LegacyPartitioner`)
- [ ] Investigate the negative timeout warning (likely a KafkaJS config issue with `sessionTimeout` or `rebalanceTimeout`)
- [ ] Review log level in order-service (`app.ts` → `level: 'warn'`). Consumer handlers use `log.info()` which is silenced — Kafka events are processed but nothing is logged. Either bump to `info` or change handlers to `log.warn()`
