# Notification synchronous fan-out budget

**Canonical issues:** #79, #88

## Principle

A durable Notification row is backend truth. Realtime/push may improve latency,
but they must not determine whether a Notification exists.

Any synchronous producer that can create more than one Notification must have a
Notifications-owned amplification budget before touching persistence. It may not
depend on the producer "usually" sending few recipients.

## Budget

Synchronous Notification fan-out is capped at:

- 50 distinct recipients;
- 50 Notification records per operation.

The common guard is:

`assertNotificationFanoutBudget(records)`

Overflow fails before DB mutation with stable code:

`NOTIFICATION_FANOUT_BUDGET_EXCEEDED`.

Larger delivery sets belong in a future asynchronous/outbox workflow with its
own batching, retry and observability contract.

## Current producers

Current Social and Q&A product flows are single-recipient and preserve atomicity
between the business mutation and its Notification row.

They still call the common fan-out guard before opening their Mongo transaction:

- Follow created;
- Connection requested;
- Connection accepted;
- Question answered;
- Answer accepted.

This prevents those direct transactional writers from becoming a bypass of the
Notifications-owned budget.

## Central future fan-out path

`NotificationService.createMany()`:

1. validates recipient + record budget;
2. returns without persistence for an empty batch;
3. delegates one bounded batch to `NotificationStore.createMany()`.

The Mongo store writes that batch inside one transaction and always ends the
session.

## Why both recipients and records are bounded

Counting recipients alone is insufficient. A producer could send many
Notification rows to the same user and still amplify synchronous DB work.

Therefore both cardinalities must fit the same synchronous budget.

## Current inbox reads

Inbox listing is already cursor-bounded:

- stable `createdAt DESC, id ASC`;
- server-side limit + sentinel;
- opaque cursor;
- unread-only filtering at DB level.

This document does not change inbox pagination.

## Push/realtime

This hardening does not introduce push delivery or a realtime authority model.

When Mobile push is added:

- PushToken/DeviceInstallation must remain separate from AuthSession;
- payload must be minimal and non-authoritative;
- deep links require allowlisting and fresh server authorization;
- retries/batches must have their own budgets;
- delivery failure must never delete or invent durable Notification truth.

## Regression evidence

Required:

- 50 recipients succeeds through the central path;
- 51 recipients fails before store mutation;
- 51 rows to one recipient also fails before store mutation;
- empty batch performs no DB work;
- Mongo batch persistence uses one transaction;
- Social and Q&A source contracts keep the common guard in their transactional paths;
- Quality Gate runs the Notification fan-out contract.
