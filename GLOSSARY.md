# Scalable E-commerce Platform

An e-commerce backend split into services, plus a stress campaign that deliberately breaks it to find and fix its limits.

## Stress campaign

**Stress world**:
The isolated copy of the platform loaded with the absurd-scale dataset, where every attack runs.
_Avoid_: stress env, stress profile, test environment

**Attack**:
One hypothesis-driven attempt to break the platform along a single axis (data volume, contention, failing dependency, volume ramp, abusive client, spike, soak).
_Avoid_: test, experiment, load test

**Scenario**:
The traffic script an attack drives; one attack can use several scenarios, and a scenario never decides by itself whether the platform broke.
_Avoid_: test, script, attack

**Invariant**:
A fact about the data that must hold after any attack, however much load it applied (no negative stock, every order settles, every event published).
_Avoid_: assertion, consistency check

**Broke**:
An attack's verdict when the platform returned errors, exceeded a latency limit fixed before the run, violated an invariant, or did not recover once the load stopped.
_Avoid_: failed, crashed

**Hot product**:
The single product every buyer competes for, with a small known stock, used to expose overselling under contention.
_Avoid_: popular product, top product

**Fake processor**:
The in-process payment provider that replaces Stripe in the stress world, with configurable latency, jitter and failure rate.
_Avoid_: mock, fake PSP

**Whale**:
A user with an extreme order history, used to expose queries that scale with one user's data.
_Avoid_: power user, heavy user

**Fault**:
A degradation injected into one dependency of the stress world during an attack (added latency, timeout, cut connection, paused container).
_Avoid_: toxic, chaos, failure

**Limits**:
The CPU and memory ceiling of each container in the stress world, part of every attack's result.
_Avoid_: quotas, resources
