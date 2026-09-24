# Fix: createConsumer chama run() dentro de cada subscribe

**What to build:** `packages/events/src/consumer.ts` — o `createConsumer` chama `consumer.run()` dentro de cada `subscribe()`. No KafkaJS, `run()` só pode ser chamado uma vez. A segunda chamada lança erro ("Cannot subscribe to topic while consumer is running") ou sobrescreve o handler anterior.

**Impacto:** Todo serviço que consome mais de um tópico quebra. Hoje o order-service consome `payment.confirmed` e `payment.failed` — o segundo subscribe falha silenciosamente ou sobrescreve o primeiro.

**Blocked by:** none

**Status:** todo

- [ ] Separar `subscribe` de `run` no `createConsumer`: subscribe só registra topic + handler num Map
- [ ] Expor um método `start()` que chama `consumer.run()` uma única vez, despachando mensagens pro handler correto pelo topic name
- [ ] Atualizar todos os consumers dos serviços para chamar `consumer.start()` depois de registrar todos os subscribes
- [ ] Rebuildar `@ecommerce/events` e verificar que os serviços compilam
- [ ] Considerar se é breaking change — se sim, bump de versão major do pacote
