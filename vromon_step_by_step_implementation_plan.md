# Vromon — Step-by-Step Implementation Plan
## Human-Reviewed Build Workflow for the AI Coding Agent

**Project:** Intelligent Adaptive Travel Itinerary Planning and Recommendation System Using RAG and Constraint Optimization  
**Product:** Vromon  
**Timeline:** Approximately 4–5 weeks  
**Workflow:** One phase at a time. The developer manually checks every build before authorizing the next phase.

---

# 1. Purpose of This Document

This file is the execution plan for the AI coding agent working in the existing Vromon repository.

The demo is already complete and has been moved into `demo/`. The real application must be built in the existing `backend/`, `mobile/`, `data/`, `evaluation/`, and `docs/` directories.

The agent must not attempt to build the entire project in one run. It must implement **only one phase at a time**, provide a clear report, and wait for the developer to manually inspect the result and explicitly authorize the next phase.

The goal is to deliver a working, testable application while preserving all features from the demo and maintaining the project's research contribution: RAG + explainable recommendation ranking + constraint-aware itinerary optimization.

# 2. Non-Negotiable Rules

1. **Preserve `demo/`.** Treat it as a read-only reference unless the developer explicitly authorizes a change.
2. **Do not skip phases.** Complete the current phase, report results, and stop.
3. **Wait for human approval.** Never start the next phase automatically, even if the current phase is complete.
4. **Do not claim tests passed unless they were actually run.**
5. **Do not claim a feature is complete just because files exist.**
6. **Do not remove demo features.** Track every feature in `docs/feature-inventory.md`.
7. **Do not overwrite existing work.** Inspect files and Git status first.
8. **Do not run destructive Git commands.** Never reset, force-push, or discard changes.
9. **Do not commit or push unless explicitly authorized.**
10. **Do not expose credentials.** Keep real secrets out of code, logs, and Git.
11. **Do not invent travel facts.** Distinguish verified information, estimates, sample data, and missing data.
12. **Use compatible stable dependencies.** Check the existing environment and official documentation before installing or upgrading packages.
13. **Avoid unnecessary complexity.** Do not add microservices, Kubernetes, multiple competing AI frameworks, or multiple LLM providers without a concrete requirement.
14. **Keep the project runnable after every phase.** Avoid leaving the repository in a broken state.
15. **When blocked, stop and report the blocker.** Do not silently substitute fake behavior.
16. **Preserve all existing user changes and files.**

# 3. Default Technology Decisions

First inspect the existing repository. Retain compatible working technologies where that avoids unnecessary rewrites. If a change from the following defaults is necessary, explain and document it before proceeding.

## Backend

- Python 3.11+ (confirm available version)
- FastAPI for REST APIs
- Uvicorn for serving the API
- Pydantic v2 and Pydantic Settings for validation/configuration
- SQLAlchemy 2.x for database access
- Alembic for database migrations
- PostgreSQL as the target relational database
- PostGIS for geographic queries if required and available
- pgvector for vector search if compatible with the selected database deployment
- Pytest for unit and integration tests
- HTTPX for API tests
- One PostgreSQL driver compatible with the chosen SQLAlchemy setup

## Mobile

- React Native
- Expo
- TypeScript
- Expo Router
- TanStack Query for server-state fetching/caching
- React Hook Form and Zod for forms and validation
- Axios **or** a typed Fetch wrapper; choose one, not both
- Zustand only when shared client state genuinely needs it
- React Native Testing Library and Jest if compatible with the chosen Expo setup
- `react-native-maps` only after confirming compatibility with the Expo SDK and build environment

## AI, RAG, and optimization

- One configurable LLM provider using its official SDK
- One configurable embedding provider/model
- Python modules for ingestion, normalization, chunking, retrieval, and grounded generation
- PostgreSQL + pgvector for persistent vector retrieval where available
- A deterministic Python recommendation-ranking baseline
- A deterministic heuristic itinerary scheduler
- Google OR-Tools CP-SAT as the formal optimization option, after the baseline works
- Pydantic structured schemas for model/API outputs
- Pytest and reproducible scripts for evaluation

Do not install LangChain, LlamaIndex, Haystack, and overlapping custom pipelines together. Use an existing framework only if it has a clear, documented benefit.

## Development and delivery

- Git and the existing GitHub repository
- Python `pyproject.toml` and a suitable lockfile
- `package.json` and the existing JavaScript package lockfile
- `.env` for local secrets, excluded from Git
- `.env.example` with placeholders only
- FastAPI OpenAPI documentation
- Docker Compose only if it simplifies repeatable local setup
- GitHub Actions only when the core project is stable enough and time permits
- Expo/EAS only as required for development builds or distribution

Technology versions must be compatible with the repository. Do not blindly install the latest versions if they break compatibility.

# 4. Required Human-Approval Workflow

At the beginning of every phase:

1. Read this document.
2. Inspect the actual repository and the previous phase report.
3. Check Git status and preserve uncommitted changes.
4. State the current phase and its scope.
5. List the files you intend to create or modify.
6. Implement only the approved phase.
7. Run applicable tests and checks.
8. Fix regressions introduced by your work.
9. Update documentation and the phase report.
10. Stop and wait for explicit developer approval.

At the end of each phase, output:

- **Phase completed:** phase number and name.
- **Changes made:** files created/modified and why.
- **Features working:** only behavior verified by running it.
- **Commands executed:** exact commands.
- **Test results:** pass/fail/not run, with reasons.
- **Manual verification steps:** exact steps the developer should follow.
- **Known issues:** unresolved problems and limitations.
- **Next phase proposal:** what would be done after approval.
- **Approval request:** ask the developer to review and explicitly authorize the next phase.

Do not continue to the next phase in the same run. Do not interpret silence as approval.

The developer may ask for fixes to the current phase. Fix those issues and repeat its checks without advancing the phase.

# 5. Phase Plan

## Phase 0 — Repository audit and implementation contract

**Goal:** Understand the current project before modifying application code.

Tasks:

- Inspect the root folder and all existing project directories.
- Inspect `demo/` to understand its behavior and dependencies; do not edit it.
- Check Git status and existing uncommitted changes.
- Inspect Python and Node versions.
- Inspect manifests, lockfiles, environment examples, database code, routes, components, and tests.
- Run existing safe baseline checks when possible.
- Identify reusable logic and features that must be preserved.
- Identify missing external services, API keys, and platform constraints.
- Avoid unnecessary dependency changes.

Create or update:

- `docs/current-state-audit.md`
- `docs/feature-inventory.md`
- `docs/technology-decisions.md`
- `docs/architecture.md`
- `docs/implementation-plan.md`

Acceptance criteria:

- The real existing repository structure is documented.
- Every demo feature is in the inventory.
- Technology decisions are explicit and compatible.
- Risks and missing prerequisites are recorded.
- No application code has been destructively replaced.
- Baseline results are recorded honestly.

**Developer manual check:** inspect the audit, feature inventory, architecture, and proposed plan.

**Stop here and wait for approval before Phase 1.**

## Phase 1 — Backend foundation and health check

**Goal:** Establish a runnable backend without implementing the entire product.

Tasks:

- Create or repair the FastAPI application in `backend/`.
- Configure Pydantic Settings and environment loading.
- Add safe logging and consistent exception handling.
- Add the versioned API router structure.
- Implement `GET /health`.
- Configure CORS from environment settings.
- Add backend dependency and run instructions.
- Add an initial test for the health endpoint.
- Keep secrets out of source code.
- Avoid unnecessary database or AI dependencies until their phase.

Suggested structure, adapted to existing files:

```text
backend/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py
│   │   ├── logging.py
│   │   └── exceptions.py
│   └── api/
│       └── v1/
│           └── router.py
├── tests/
├── pyproject.toml
└── README.md
```

Acceptance criteria:

- Backend starts using documented commands.
- `/health` returns a meaningful success response.
- API documentation is accessible locally.
- Configuration validation works.
- The health test passes.
- Existing project files are preserved.

**Developer manual check:** start the backend, open `/health` and `/docs`, and run the test command.

**Stop and wait for approval before Phase 2.**

## Phase 2 — PostgreSQL data layer and seed data

**Goal:** Implement persistent, structured travel data.

Tasks:

- Configure SQLAlchemy 2.x.
- Configure PostgreSQL connection handling.
- Add Alembic migrations.
- Design normalized tables for destinations, places, restaurants/hotels where appropriate, trips, preferences, itineraries, activities, feedback, and source metadata as justified by actual requirements.
- Use a common Place model where appropriate instead of duplicating shared fields.
- Add Pydantic request/response schemas.
- Add repository/service separation where it improves maintainability.
- Add indexes, foreign keys, timestamps, and constraints.
- Store prices with a consistent numeric representation and explicit currency.
- Add repeatable seed/import scripts based on valid demo data and documented sources.
- Validate coordinates, categories, IDs, and missing fields.
- Document PostgreSQL setup and migration commands.

Acceptance criteria:

- Database configuration is documented.
- Migrations create the schema.
- Seed data can be loaded repeatably without accidental duplication.
- Database operations are tested.
- Missing PostgreSQL or extension support is reported honestly.
- Do not claim PostgreSQL-specific features were tested using SQLite.

**Developer manual check:** start the configured database, apply migrations, load seed data, and inspect a sample of destinations and places.

**Stop and wait for approval before Phase 3.**

## Phase 3 — Destination/place API and trip persistence

**Goal:** Provide real data through tested API endpoints.

Implement suitable endpoints:

- `GET /api/v1/destinations`
- `GET /api/v1/destinations/{id}`
- `GET /api/v1/places`
- `GET /api/v1/places/{id}`
- `POST /api/v1/trips`
- `GET /api/v1/trips`
- `GET /api/v1/trips/{id}`
- `PATCH /api/v1/trips/{id}`
- `DELETE /api/v1/trips/{id}`

Adapt naming if the repository already has a sensible convention.

Tasks:

- Add validation and response schemas.
- Add pagination and filters where useful.
- Persist trip dates, budget, interests, pace, activity limits, daily times, must-visit places, and excluded places.
- Add appropriate database transactions and error handling.
- Add API tests for valid and invalid requests.
- Avoid fake successful responses.

Acceptance criteria:

- The endpoints return real database records.
- Trip creation persists and can be retrieved.
- Invalid data returns useful validation errors.
- Database failures are handled safely.
- Tests cover the core operations.

**Developer manual check:** use Swagger UI or HTTP requests to browse places, create a trip, retrieve it, update it, and delete a test trip.

**Stop and wait for approval before Phase 4.**

## Phase 4 — Recommendation ranking and itinerary constraint validator

**Goal:** Build a deterministic, testable planning core before adding LLM dependency.

Tasks:

- Retrieve candidate places by destination, preferences, and available structured data.
- Implement explainable ranking based on interests, budget compatibility, proximity, pace, and other available evidence.
- Keep hard constraints separate from ranking scores.
- Implement the baseline itinerary scheduler.
- Implement an independent validator for overlaps, dates, daily boundaries, activity limits, excluded places, and feasible must-visit requirements.
- Respect verified opening hours and available duration data.
- Report missing information rather than inventing values.
- Classify hard violations, soft preference mismatches, and missing data.
- Add tests for valid schedules and conflicting constraints.
- Document ranking weights and scheduler assumptions.

Acceptance criteria:

- Same inputs produce repeatable baseline results.
- Excluded places are not scheduled.
- Overlapping activities are rejected.
- Daily limits and time boundaries are checked.
- Conflicts produce explicit warnings or validation errors.
- The validator does not trust the generator blindly.

**Developer manual check:** run the test suite and use a small script or API request to generate and inspect sample itineraries, including one deliberately conflicting request.

**Stop and wait for approval before Phase 5.**

## Phase 5 — Connect the mobile app to the backend

**Goal:** Establish the first real end-to-end mobile flow.

Tasks:

- Inspect and preserve the existing `mobile/` work.
- Initialize or repair the Expo/React Native/TypeScript project as needed.
- Set up Expo Router.
- Add reusable UI components and shared types.
- Add a single typed API client.
- Configure the backend URL through safe environment configuration.
- Add TanStack Query for server state.
- Implement a home screen and navigation.
- Implement the trip-planning wizard using React Hook Form and Zod.
- Implement destination/place selection from real API data.
- Submit a validated trip to the backend.
- Display API loading, empty, validation, and error states.
- Do not replace real APIs with hardcoded mock success responses.

Acceptance criteria:

- The app starts on the available emulator or device.
- Navigation works.
- Destination/place data comes from the backend.
- A trip can be submitted and persisted.
- API errors are visible and recoverable.
- TypeScript and applicable tests pass.

**Developer manual check:** run the backend and mobile app, configure a reachable development-machine IP when testing on a physical phone, browse destinations, submit a trip, and verify it in the backend/database.

**Stop and wait for approval before Phase 6.**

## Phase 6 — Itinerary generation and display

**Goal:** Show the actual generated itinerary in the mobile app.

Tasks:

- Add `POST /api/v1/itineraries/generate`.
- Connect candidate retrieval, ranking, scheduling, and independent validation.
- Persist the itinerary and activities.
- Return a typed response containing days, activities, times, known costs, explanations, warnings, and source references where available.
- Build the day navigation/tabs and chronological timeline.
- Add trip overview and budget breakdown.
- Display unknown costs and missing information honestly.
- Handle failed generation and validation conflicts.
- Add backend and mobile tests.

Acceptance criteria:

- A user can submit trip preferences and see an itinerary generated by the backend.
- The UI uses actual API response data.
- Invalid schedules are not silently accepted.
- Warnings and incomplete information are displayed.
- The trip can be retrieved after generation.

**Developer manual check:** generate trips of different durations and preferences, inspect the daily schedule, refresh/reopen the saved trip, and test a conflicting set of constraints.

**Stop and wait for approval before Phase 7.**

## Phase 7 — RAG ingestion and retrieval foundation

**Goal:** Add a source-traceable retrieval pipeline.

Tasks:

- Inspect available travel datasets and source documents.
- Create source ingestion and normalization.
- Add text chunking with source metadata.
- Preserve source IDs, titles, URLs when available, dates, and destination/place association.
- Select one embedding provider/model based on availability, language support, and cost.
- Add an embedding-provider interface.
- Configure pgvector only when supported by the selected PostgreSQL environment.
- Add semantic retrieval and metadata filtering.
- Add a small retrieval evaluation dataset.
- Test chunking, metadata preservation, ranking, and insufficient evidence.
- Avoid requiring live paid LLM calls for ordinary unit tests.

Acceptance criteria:

- Ingestion is repeatable.
- Chunks retain their source provenance.
- Retrieval returns actual stored chunks.
- Missing credentials are handled explicitly.
- Evaluation commands are documented.
- No fake embeddings or invented source references are presented as real.

**Developer manual check:** ingest a small documented dataset, search for several questions, and inspect returned source snippets and metadata.

**Stop and wait for approval before Phase 8.**

## Phase 8 — Grounded RAG generation and integration

**Goal:** Use retrieved evidence to improve explanations and relevant travel information.

Tasks:

- Integrate one configurable LLM provider using its official SDK.
- Keep provider code behind a small interface.
- Construct prompts using retrieved evidence and structured trip context.
- Use Pydantic schemas or provider-supported structured outputs.
- Validate generated responses.
- Preserve real source references.
- Handle unsupported questions with an insufficient-evidence response.
- Keep scheduling and hard constraint validation deterministic.
- Avoid allowing the LLM to invent prices, opening hours, IDs, or URLs.
- Add provider-independent unit tests and optional live integration tests.
- Record provider/model configuration and evaluation results.

Acceptance criteria:

- RAG explanations use retrieved evidence.
- Source references map to real ingested records.
- Missing evidence is handled safely.
- The itinerary validator remains independent of the LLM.
- Provider failures do not crash the whole app without a useful error.

**Developer manual check:** test questions with strong evidence, weak evidence, and no relevant evidence. Inspect the sources and claims.

**Stop and wait for approval before Phase 9.**

## Phase 9 — OR-Tools optimization and comparison

**Goal:** Add formal constraint optimization if the baseline is stable.

Tasks:

- Model scheduling decisions with OR-Tools CP-SAT.
- Define hard constraints and soft objectives explicitly.
- Include relevant activity duration, daily limits, opening hours when verified, must-visit places, exclusions, and costs when data is sufficient.
- Add solver time limits and status handling.
- Keep the deterministic baseline.
- Compare both approaches on the same fixed inputs.
- Report infeasible, feasible, and optimal statuses accurately.
- Add tests for constraint satisfaction and solver failure cases.

Acceptance criteria:

- The baseline remains available.
- The solver returns a clearly identified status.
- Hard constraints are validated independently.
- Comparison metrics are reproducible.
- No unsupported claim of optimality or superiority is made.

**Developer manual check:** run both approaches on the same sample trips, inspect schedules and validation reports, and review evaluation outputs.

**Stop and wait for approval before Phase 10.**

## Phase 10 — Adaptation, saved trips, feedback, maps, and budget

**Goal:** Reimplement remaining demo features in a sensible priority order.

Feature inventory to preserve:

- Six-step trip wizard.
- Budget presets.
- Interests and travel pace.
- Daily time/activity limits.
- Must-visit and excluded places.
- Multi-day itinerary.
- Opening-hour constraints where data exists.
- Budget-aware ranking.
- Restaurant and hotel suggestions.
- Match scores and explanations.
- Day tabs and timeline.
- Map markers and routes where available.
- Budget breakdown and trip summary.
- Regenerate a day.
- Remove/replace activities.
- Adapt an itinerary.
- Duplicate, save, view, and delete trips.
- Feedback ratings and tags.
- Responsive/PWA behavior in the demo.
- Any existing API behavior discovered in the audit.

Tasks:

- Implement each feature in the real application.
- Revalidate itineraries after edits.
- Persist edits safely.
- Invalidate or refresh client caches after successful changes.
- Use native-compatible map tooling if map implementation is feasible.
- Distinguish actual route estimates from straight-line distances.
- Do not invent prices or travel times.
- Preserve the demo unchanged.

Acceptance criteria:

- Each implemented feature has a test or documented manual verification.
- The feature inventory reflects the true status.
- No feature is labelled complete without verification.

**Developer manual check:** manually test each implemented action, including regenerate, remove, adapt, duplicate, delete, feedback, and map interactions.

**Stop and wait for approval before Phase 11.**

## Phase 11 — Evaluation, security, deployment, and final verification

**Goal:** Prepare a reproducible academic demonstration and report.

Tasks:

- Complete backend unit and integration tests.
- Complete essential mobile checks.
- Run available type checks, lint, and builds.
- Add RAG evaluation scripts.
- Add recommendation evaluation scripts.
- Add optimization/constraint evaluation scripts.
- Record actual results and limitations.
- Verify `.gitignore` and `.env.example`.
- Check for accidentally tracked credentials.
- Document local setup and deployment.
- Add Docker Compose only if useful.
- Add CI only if the core application is stable and time permits.
- Verify the demo has not been modified.
- Update the README and final feature inventory.

Acceptance criteria:

- Setup is documented and repeatable.
- Test and build results are recorded accurately.
- Research evaluation can be rerun.
- Security limitations are documented.
- Remaining defects are listed.
- The project can be demonstrated using the available environment.

**Developer manual check:** follow the README from a clean terminal, run the test commands, start the system, complete the end-to-end flow, and inspect the final report.

**Stop and wait for final approval.**

# 6. Required manual checkpoint after every phase

Use this checklist yourself before authorizing the next phase:

- [ ] The agent gave a clear phase report.
- [ ] The expected files exist in the correct folders.
- [ ] No unexpected changes were made to `demo/`.
- [ ] I reviewed the important code/configuration changes.
- [ ] I ran the documented commands myself where practical.
- [ ] I checked the app/API manually where applicable.
- [ ] I reviewed test results and any failures.
- [ ] I understand known issues and missing prerequisites.
- [ ] I am satisfied that the current phase is stable.
- [ ] I explicitly approved the next phase.

If any item fails, ask the agent to fix the current phase. Do not proceed simply to stay on schedule.

# 7. Prompt to use at the beginning of each agent session

Paste the following after attaching or referencing this Markdown file:

> Read the entire `docs/step_by_step_implementation_plan.md` file, or the location where I saved this plan. Inspect the repository and Git status before changing files. We are using a human-reviewed, phase-by-phase workflow. Implement **only the current phase I explicitly authorize**. Do not begin later phases, do not alter `demo/`, do not discard my changes, and do not commit or push without permission. First tell me the current phase, its acceptance criteria, and the files you intend to modify. Then implement that phase, run applicable checks, update documentation, provide exact manual verification steps, and stop for my review. If I have not specified which phase to execute, ask me. Never claim success without evidence.

# 8. Prompts for manual phase control

After reviewing a phase, use one of these:

**Approve:**

> I reviewed the current phase and approve it. Proceed with Phase N only. Follow the plan and stop for manual review when Phase N is complete.

**Request fixes:**

> Do not advance to the next phase. Fix the following issues in the current phase, rerun the relevant checks, update the report, and stop again: [describe issues].

**Ask for explanation:**

> Do not change any files yet. Explain how the current implementation works, which files are involved, and how I can manually verify it.

**Pause:**

> Stop implementation. Summarize the current repository state, unfinished work, and any commands I need to run manually. Do not make further changes.

# 9. Practical schedule for the 4–5 weeks

This schedule is a guide, not permission to skip manual checkpoints.

| Time | Target |
|---|---|
| Week 1 | Phases 0–4: audit, backend, database, APIs, baseline scheduler and validator |
| Week 2 | Phases 5–6: mobile connection and end-to-end itinerary flow |
| Week 3 | Phases 7–8: RAG ingestion, retrieval, grounded generation |
| Week 4 | Phases 9–10: optimization and remaining features |
| Week 5, if available | Phase 11: evaluation, bug fixing, deployment, final demonstration |

If a phase takes longer, fix the problem and reassess scope with the developer. Do not hide failures or sacrifice the core flow merely to match the calendar.

# 10. Final instruction to the agent

**Start with Phase 0 only. Inspect the repository and document the current state. Do not implement Phase 1 until I have personally reviewed Phase 0 and explicitly approved it.**

The developer will inspect every build manually. Your job is to make each phase small enough to understand, test, and approve before moving forward.
