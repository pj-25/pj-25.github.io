---
layout: ../../layouts/Base.astro
title: "A 3D editor where every object brings its own controls"
description: "graphicsAI 3D Editor (2022): a browser-based three.js scene editor built around a property-controller pattern."
---

<p class="eyebrow">Case study · 2022 · JavaScript, three.js</p>

# A 3D editor where every object brings its own controls

**Project:** [graphicsAI 3D Editor](https://github.com/pj-25/graphicsAI-3D-Editor) · [live](https://pj-25.github.io/graphicsAI-3D-Editor/dist/)

**Team:** graphicsAI was a three-person project.
- **The editor:** I built it, with contributions from [LadDeep](https://github.com/LadDeep). By `git blame`, about 95% of the surviving editor source is mine.
- **The AI service:** [mkjodhani](https://github.com/mkjodhani) built the project's image-segmentation service (background blur and replacement), in [graphics.ai](https://github.com/mkjodhani/graphics.ai).
- **The predecessor:** I contributed the 3D editor and 3D home view, including five merged PRs, to graphics.ai before the editor moved to its own repo.

## The problem
We wanted a 3D scene editor that runs in the browser with no install. Users should be able to add primitives, lights and cameras, change any parameter live, move things with gizmos, and export the result. Every new object type multiplies the UI work, so the design had to keep that cost from growing.

## The design: object + helper + property controller
Each object type is made of three pieces:
- **Interactive object:** a three.js mesh, light, camera or particle system, extended with selection, visibility and disposal behaviour.
- **Helper:** selection state, transform-gizmo attachment and select/deselect events.
- **Property controller:** a class that builds the object's panel in dat.gui, such as `BoxProperty`, `SpotLightProperty` or `SpiralGalaxyPropertyController`. Changing a value regenerates the geometry or updates the material live.

A shared base `PropertyController` provides visibility, selection, the transform folder and delete. Subclasses add only what is specific to them: segments for a box, angle and penumbra for a spotlight, arms and spin for the galaxy. An `ObjectGenerator` maps object types to their controllers and registers each new object in the scene outliner.

**Result:**
- 8 mesh primitives plus text, 5 light types, multiple cameras, and a procedural spiral-galaxy particle system.
- Each added with one small controller class.
- OBJ import/export and keyboard shortcuts for the toolbox.

## Delivery
- **Build:** webpack.
- **CI:** a GitHub Actions workflow rebuilt the bundle on every push and committed it, so GitHub Pages always served the latest editor.
- **Collaboration:** through feature branches and PRs (for example PR #3 from LadDeep's fork), 194 commits in total.

## Trade-offs and what I'd change
| Choice | Benefit | Cost | Today |
|---|---|---|---|
| dat.gui as the UI | Every property becomes a control in one line | Limited UX and styling | A real component UI (React + a small state store) generated from the same property schema |
| Inheritance-based controllers | Quick to add types | Deep hierarchies; logic split across helper and controller | Declarative property schemas per type; composition over inheritance |
| CI commits the built bundle to the repo | Pages "just works" | Noisy history (bot commits), large repo | Deploy build artifacts with Pages actions, never commit `dist/` |
| No tests | Speed in a student project | Regressions were caught by hand | Unit-test controllers (property → three.js state), plus a visual smoke test |

## What it taught me
- A good extension point turns an O(n) cost into O(1). The second light type took minutes because the first one paid for the abstraction.
- Credit is part of the engineering record. A team project should say who built which part.
