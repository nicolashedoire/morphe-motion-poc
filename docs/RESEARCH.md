# Research notes

**The working question:** can an animation author teach a meaningful correction once, inspect what was remembered, and reuse it across supported bodies and scenes?

This is a focused proof of concept for that interaction. It is not a new foundation model or evidence that this interaction is unprecedented. The references below were checked on **30 October 2026** and form a selected reading list, not an exhaustive landscape or patent search.

## What already exists

| Work | Demonstrated direction | Implication for Morphé |
| --- | --- | --- |
| [MDM — Human Motion Diffusion Model](https://guytevet.github.io/mdm-page/) | Text- and action-conditioned human motion generation, plus editing and in-betweening | Generating or editing motion from language is established prior work. |
| [MotionGPT](https://motion-gpt.github.io/) | A shared motion/language model with motion generation, captioning, prediction and completion | Representing movement as a language is an existing research direction. |
| [DART / DartControl](https://zkf1997.github.io/DART/index.html) | Sequential motion generation from text with real-time control and spatial constraints | A stream of prompts and controllable motion are existing capabilities to build on. |
| [CLoSD](https://guytevet.github.io/CLoSD-page/) | A diffusion planner coupled to a physics-based tracking controller for multiple tasks | Physical interaction and closed-loop character control need specialized systems beyond this POC. |
| [NVIDIA Kimodo](https://research.nvidia.com/labs/sil/projects/kimodo/) | Text- and constraint-conditioned motion, with an authoring demo supporting prompt sequences, keyframes, end-effectors and paths | Text plus interactive constraints is already an implemented authoring pattern. |

These projects have different goals, datasets, licenses and runtime requirements. They are references, not dependencies of this repository, and the POC does not reproduce or benchmark their published results. No model weights are included.

## The experiment in this repository

The user first sees an intentionally imperfect carrying motion. A correction changes the object's orientation. Saving the correction creates an inspectable rule keyed to `carry` and `carried-object`, which the animation engine can use again.

The second scene changes both the object and the supplied body. The rule remains applicable because each rig adapter can compute its hands from the object's grip points. The difference is visible without asking the user to repeat the correction.

That is a useful product hypothesis: **reusable editing intent may reduce repetitive work.** This is an inference motivating an experiment, not a claim established by the cited papers or by the current demo.

| Implemented now | Research or product work still required |
| --- | --- |
| Two hand-authored 2D rig adapters | Importing and mapping many skeletons; handling reachability and incompatible anatomy |
| One orientation rule in browser storage | Multiple rules, scoping, precedence, conflicts and explanations |
| A fixed carrying choreography | A broad motion library or integration with a learned generator |
| Bounded local parsing; optional LLM scene planning | Measured instruction adherence, ambiguity handling and reliable multi-step editing |
| Kinematic grip and tilt measurements | Contact, balance, collisions, dynamics and physically plausible object interaction |
| A visible before/after comparison | User studies and comparison against strong existing workflows |

The four-legged character is a stylized creature with two arms. It is not an anatomical animal model. The transfer is engineered for the two supplied adapters, not learned from examples. The level baseline correction reduces an authored wobble; it does not establish that the system discovered a natural law.

## Why start with a small symbolic layer?

A rule is easy to inspect, reset, test and explain. It separates the creator's intent from a particular character's joint coordinates. That makes the POC useful for testing the interaction before spending time on training infrastructure or motion datasets.

A later implementation could retain that rule representation while replacing the procedural source motion with an existing generator. Such an integration would need to measure whether constraints remain satisfied after generation, retargeting and editing. A language model returning JSON does not solve those motion problems by itself.

## A concrete evaluation plan

1. **Define a repeatable task.** Ask creators to build several short carrying scenes using different supported characters and destinations. Include explicit level-carrying requirements.
2. **Compare conditions.** Compare repeated manual correction with persistent rules. Keep the source motion and interface comparable so the result measures memory rather than visual polish.
3. **Measure editing work.** Record completion time, repeated corrections, final constraint violations, accidental rule reuse and whether creators correctly understand what is remembered.
4. **Test changed conditions.** Change object size, destination height and rig proportions. Include unreachable grips and conflicting rules; success must include a useful failure explanation.
5. **Choose a next milestone from evidence.** Expand only if the memory workflow reduces repeated work without creating more confusion or cleanup.

The POC's unit tests verify executable behavior, such as parser negation, rule validation and kinematic invariants. They are not a user study, model-quality benchmark or evidence of commercial demand. The optional provider is tested using mocks; no live inference was run during creation because API credentials were unavailable.

## Source reuse and reverse engineering

[StykAnimate-App](https://github.com/filippocalippo/StykAnimate-App) provides source code for a stick-figure animation application. This POC reuses its point-based inverse-kinematics solver with explicit attribution and a pinned source revision. The exact extracted functions and license are documented in [`NOTICE`](../NOTICE).

[Rea](https://github.com/morluto/rea) is an agent-oriented reverse-engineering toolkit. It and Ghidra are analysis tools, not motion-generation models or animation runtimes. Neither is a runtime dependency of Morphé. The included solver can be reviewed directly from its available source; the POC does not claim to have obtained it by decompiling a binary.

## Design boundary

The intended direction is an animation editor that remembers useful corrections and exposes their scope. Whether that becomes a compelling business depends on measurable time saved, compatibility with creators' existing tools, reliable behavior and a workflow they prefer. The current repository makes that direction concrete enough to try and critique.
