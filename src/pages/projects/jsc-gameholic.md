---
layout: ../../layouts/Base.astro
title: "Designing a library by building its first user"
description: "JavaServerClientAPI and Gameholic (2021): an event-driven TCP library, its first consumer, and what revisiting both in 2026 revealed."
---

<p class="eyebrow">Case study · 2021 · Java</p>

# Designing a library by building its first user

## The itch
By mid-2021 I had written the same networking code three times: chitChat on desktop (Feb), chitChat on web and Android (May), and small multiplayer games in `codeholic`. Each project had its own accept loop, its own message format and its own "tell the UI something happened" glue.

## The bet
Pull the plumbing out once, as a library, **JavaServerClientAPI (JSC)**. Then prove it by building something real on top of it within days, not months. Gameholic was started five days after JSC's first commit.

## What I built
- **JSC:**
  - `JConnection`: a socket with a reader thread and a lambda consumer, which can pause and resume reads.
  - `JServer`: one thread per client, with a fresh request manager per connection, created by reflection.
  - A small typed text protocol, an observer event bus and object serialisation.
- **Gameholic:**
  - A relay server built from JSC parts. `PlayerConnection` routes `CREATE / JOIN / START / PASS_DATA / END` events into two-seat `GameSession`s.
  - A client SDK (`GameManager`) and a JavaFX control panel.
  - Games plug in as jars and never touch sockets.

## Decisions and trade-offs
| Decision | Why then | What it cost | What I'd do now |
|---|---|---|---|
| Thread per connection | The simplest correct model for tens of players | Doesn't scale to thousands of connections | NIO/Netty or Java 21 virtual threads |
| Human-readable delimiter protocol | Debuggable with `telnet` | Delimiters aren't escaped, so field decoding can break | Length-prefixed JSON or binary with a version field |
| A relay that doesn't understand games | No server change per game | The server can't validate moves; clients are trusted | Optional per-game validators on the server |
| In-memory sessions | No infrastructure needed for a student project | Not thread-safe, lost on restart, predictable IDs | `ConcurrentHashMap` with TTL, or Redis; random IDs |

## Revisiting it in 2026
I came back to both repos with fresh eyes and tests:
- **JSC's Maven build didn't work as committed.** One module declared JUnit twice, and the server module's dependency on the connection module existed only in IntelliJ's settings. I fixed both and added an end-to-end echo test and CI.
- **The test exposed a subtle concurrency behaviour.** Pausing reads takes effect only *after* the in-flight `readUTF()` returns, so one message can still slip through. I documented it and pinned it with a deterministic test instead of pretending it doesn't happen.
- **Gameholic's 2021 README advertised a chat window and a game store.** The code shows both were UI layouts with empty classes. The README now says so.

## What it taught me
- A library's API is only as good as its first real consumer. Gameholic forced JSC's event bus and connection manager into shape.
- "Works on my IDE" is not a build. Reproducibility belongs in the repo.
- Honest limitations make a stronger case than a polished claim. I now write the trade-off table first.

## Links
[JavaServerClientAPI](https://github.com/pj-25/JavaServerClientAPI) · [JavaDocs](https://pj-25.github.io/JavaServerClientAPI/docs) · [Gameholic](https://github.com/pj-25/Gameholic) · [Gameholic docs](https://pj-25.github.io/Gameholic/docs)
