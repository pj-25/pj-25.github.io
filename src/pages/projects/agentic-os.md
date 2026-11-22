---
layout: ../../layouts/Base.astro
title: "A harness for coding agents on one laptop"
description: "Personal Agentic OS (2026): guard and trace hooks, a bounded DAG runner and verification loops on top of Claude Code."
---

<p class="eyebrow">Case study · 2026 · Shell, Python, Claude Code</p>

# A harness for coding agents on one laptop

**Status:** in daily use; the repository is private. This page describes the design. A cleaned-up public extract of the reusable parts is planned.

## The problem
Coding agents are fast, but they are also confidently wrong, and willing to run `git push --force`. I wanted agents to do real work on my own machine across research, implementation and verification, under three constraints:
1. **Nothing destructive or externally visible happens without me.**
2. **Everything is observable afterwards**: what ran, what it decided, what it cost.
3. **Parallelism is bounded by the machine**, not by optimism.

## Principle: the agent runtime is the platform; add only thin glue
Claude Code already provides the main loop, subagents, tools, hooks and memory. Building another orchestrator on top would duplicate it. So the custom code is small, about 250 lines across the runner and the hooks, and every piece fills a gap I could demonstrate.

## The pieces
| Piece | What it does | Why |
|---|---|---|
| **Guard hook** (PreToolUse) | Classifies every shell command and file path before it runs. Catastrophic commands are denied outright. Privilege escalation, destructive git, pipe-to-shell, recursive deletes, publishing actions (`git push`, `gh pr create/merge`, `npm publish`) and secret-bearing paths require my approval. | Turns "please be careful" in a prompt into an enforced policy. Heredoc bodies are stripped before matching, so text *about* a command doesn't trigger it, but heredocs fed to a shell or interpreter are still inspected. |
| **Trace hook** (PostToolUse / Stop / SubagentStop) | Appends a JSONL event for each tool call and gate decision. | An audit trail I can grep, and later the basis for reports on tokens and cost. |
| **DAG runner** (`aos-run`, stdlib Python) | Runs a JSON spec of shell and agent tasks with dependencies and per-task checks. Concurrency is `min(spec cap, advised parallelism)`, taken from live memory pressure. Every failure is typed: `timeout`, `transient` (retried), `exit_nonzero`, `check_failed`, `dep_failed`, `spawn_error`. `--resume` re-runs only the tasks that didn't pass. | Bounded, observable fan-out with honest failure semantics, instead of "ran 5 agents, something happened". |
| **Specialist agents** | researcher (every claim needs a source URL), implementer (isolated git worktree, tests), verifier (skeptical re-check against acceptance criteria). | Separating the producer from the checker caught real errors. |
| **Ops glue** | One-screen resource and token status; secrets via the OS keychain; scheduled encrypted backups with a *restore drill* that must pass before the schedule can be installed; a doctor command as the acceptance check. | A system you can't restore isn't a system. |

## Evidence
- **Tests:** 36 automated tests on the glue: 15 for the guard's decision table, 17 for the runner (retry, dependency failure, resume, cycles), and 4 for tracing.
- **Workflow 1 (research → intelligence):** two parallel researchers plus a verifier corrected **7 wrong assumptions** in my own keyboard-shortcut spec before I configured anything.
- **Workflow 2 (build → verify):** an implementer in a worktree, then a verifier that ran the suite *and* checked it catches deliberately injected bugs.
- **Workflow 3 (parallel execution):** a real two-agent run under the runner, with cost captured per task ($0.011 total), plus self-tests for retry, `dep_failed` and resume.
- **In daily use:** the guard gated every `git push` and PR merge that went into building this portfolio.

## Trade-offs
- **Regex guard vs a real shell parser.** Regexes are transparent and fast, but they can be evaded by sufficiently creative quoting. The guard is a seatbelt, not a sandbox; the OS permission prompts remain the last line of defence.
- **Stdlib Python with no framework.** There's nothing to install and it's easy to audit. The cost is hand-rolled scheduling; a framework would be justified only if specs grow beyond tens of tasks.
- **Human approval as a hard gate** slows autonomy down on purpose. The aim is that I can trust what ran without re-checking it all myself; finishing faster isn't the goal.

## What it taught me
- Most "agent reliability" is ordinary engineering: typed errors, idempotent resume, audit logs, and least privilege.
- Verification needs to be adversarial. A verifier that only re-runs tests misses tests that can't fail, so mutation checks found what "36/36 green" alone would not.
