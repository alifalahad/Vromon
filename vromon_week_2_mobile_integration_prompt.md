# Vromon — Week 2 Agent Prompt
## Mobile-to-Backend Integration and End-to-End Itinerary Display

**Project:** Intelligent Adaptive Travel Itinerary Planning and Recommendation System Using RAG and Constraint Optimization  
**Product:** Vromon  
**Week 2 target:** Complete the first real mobile-to-backend workflow, then connect itinerary generation and display — with manual approval between the two phases.

> Important: The uploaded project document is the overall phase plan, not a verified report of the repository's current implementation. The agent must inspect the actual repository and its latest phase reports before deciding what is already complete. Do not assume any endpoint, screen, database table, or test exists until verified.

---

# 1. How to Use This Prompt

1. Put this file in the repository, preferably at `docs/week_2_mobile_integration_prompt.md`.
2. Open the **repository root** in your coding agent.
3. Start with **Prompt A — Phase 5 only**.
4. Run the app and manually inspect Phase 5.
5. If anything fails, ask the agent to fix Phase 5. Do not proceed.
6. Only after you approve Phase 5, use **Prompt B — Phase 6 only**.
7. Manually inspect Phase 6 and approve or request fixes.

The agent must not run both phases in one uninterrupted implementation session.

---

# 2. Mandatory Repository and Human-Review Rules

These rules override any general instruction to work quickly.

- Inspect the actual repository, current Git status, previous phase reports, and the feature inventory before changing files.
- Preserve all existing user changes.
- Treat `demo/` as read-only. Use it to understand the intended UX and features, but do not edit it.
- Do not overwrite a working mobile project or backend to match an idealized folder tree.
- Do not run destructive Git commands, reset branches, discard changes, commit, or push without explicit permission.
- Do not start Phase 6 until the developer explicitly approves Phase 5.
- Do not claim a feature works unless it has been exercised or tested.
- Do not use fake/mock data as a substitute for backend integration in the real user flow. Test mocks are allowed in isolated automated tests.
- Do not invent travel facts, prices, opening hours, distances, or travel times.
- Keep LLM and embedding credentials on the backend. Never place them in `EXPO_PUBLIC_*` variables.
- Do not install unnecessary libraries. First inspect existing dependencies and compatibility.
- Use the repository's established package manager and lockfiles.
- If a prerequisite is missing or a previous phase is incomplete, stop and explain the blocker rather than silently building around it.
- At the end of each phase, provide the report defined in Section 8 and stop.

---

# 3. Technology Requirements

Use the existing, compatible implementation where it already works. Do not replace technology without a documented reason.

## Mobile

- React Native + Expo.
- TypeScript with strict checks where the existing setup supports it.
- Expo Router for navigation if already selected by the architecture.
- TanStack Query for API/server state.
- React Hook Form + Zod for the trip form if compatible with the current project.
- One API client only: use the existing Axios client or typed Fetch wrapper. Do not add a second competing client.
- Zustand only if shared local state genuinely requires it.
- React Native StyleSheet or the project's established styling solution.
- Jest and React Native Testing Library if already configured or compatible with the current Expo SDK.
- `react-native-maps` only if the current SDK/build environment supports it; maps are not a blocker for this week's core flow.

## Backend

- Existing FastAPI application.
- Existing Pydantic request/response schemas.
- Existing SQLAlchemy/PostgreSQL data layer and migrations from prior phases.
- Existing trip and place endpoints, if implemented and verified.
- Pytest and HTTPX for backend/API tests.

## Integration and configuration

- Use the backend's documented API base URL.
- Keep environment-specific configuration outside source code.
- Use a reachable development-machine IP when testing on a physical phone; `localhost` on a phone refers to the phone itself.
- Handle local emulator networking according to the target platform.
- Do not expose secrets in logs or client bundles.
- Keep mobile API types aligned with the backend's actual schemas.

---

# 4. Before Implementing Either Phase

The agent must first provide a short, evidence-based preflight report:

1. Current Git status and any uncommitted changes.
2. Actual directory structure for `backend/` and `mobile/`.
3. Which prior phases are demonstrably complete.
4. Existing backend routes and request/response schemas relevant to places, trips, and itineraries.
5. Existing mobile screens, navigation, API client, state/query setup, and forms.
6. Commands that currently work for backend and mobile.
7. Existing test/build results, including tests not run.
8. Any blocker that makes Phase 5 unsafe or impossible to start.

The agent may read files and run safe checks during this preflight. It must not make implementation changes until it has summarized its intended Phase 5 scope and files to modify. Then proceed with Phase 5 only.

---

# PROMPT A — PHASE 5 ONLY
## Connect the mobile app to the backend

Paste this prompt first. Do not execute Prompt B until you have manually approved Phase 5.

---

## A1. Objective

Build the first genuine end-to-end mobile flow in Vromon.

A user must be able to open the mobile app, browse destinations/places from the real backend, enter trip preferences, submit a valid trip, receive the backend response, and confirm that the trip was persisted.

This phase is **not** the full itinerary-generation feature. Do not start Phase 6 until Phase 5 is reviewed and approved.

## A2. First inspect and map the existing implementation

Before editing, inspect:

- `mobile/package.json` and its lockfile.
- Expo configuration and TypeScript configuration.
- Existing `mobile/app/`, screens, components, feature folders, services, hooks, stores, and types.
- Existing backend routes for health, destinations, places, and trip CRUD.
- Actual Pydantic schemas and required/optional fields.
- Backend CORS and configuration.
- Existing README run instructions.
- Current tests and build scripts.

Write down the actual endpoint paths and field names. Do not guess API contracts from this prompt.

If the mobile project is absent, initialize it inside the existing `mobile/` directory without creating a nested `mobile/mobile/` project. If the project exists, repair or extend it without discarding working screens.

## A3. Plan the smallest safe change set

Before implementation, tell the developer:

- Which screens/components will be added or changed.
- Which backend endpoints will be consumed.
- Which API schemas/types will be used.
- Which dependencies, if any, need installation.
- How the developer can run the build and manually test it.

Then implement only Phase 5.

## A4. Mobile application structure

Adapt to the repository rather than forcing an exact structure. Keep responsibilities clear. A suitable pattern is:

```text
mobile/
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── destinations/
│   │   └── index.tsx
│   └── trip-planning/
│       └── index.tsx
├── components/
├── features/
│   ├── destinations/
│   └── trip-planning/
├── services/
│   ├── api-client.ts
│   ├── destinations-api.ts
│   └── trips-api.ts
├── hooks/
├── types/
├── constants/
├── app.json
├── package.json
└── tsconfig.json
```

Do not create duplicate files if equivalent modules already exist. Use the current architecture when sound.

## A5. API client

Implement or reuse one typed API client.

Requirements:

- Base URL comes from mobile environment/configuration.
- Set reasonable request timeouts.
- Parse error responses safely.
- Do not log secrets or sensitive trip details.
- Use consistent TypeScript types for backend responses.
- Avoid `any` where a proper type is practical.
- Handle network errors, HTTP errors, validation errors, and unexpected response shapes.
- Do not convert a failed request into a fake success.
- Keep API functions separate from screen components.
- Use TanStack Query for server-state caching, loading, retrying, and invalidation if this is the selected project architecture.

The client should support only endpoints verified to exist, such as:

- Health check, if useful for development diagnostics.
- Destination list/detail.
- Place list/detail.
- Trip creation.
- Trip retrieval/listing where available.

Use the actual route paths and schemas discovered in the repository. If the backend is missing a required endpoint, report it as a blocker or propose the smallest backend change and request approval before expanding scope.

## A6. Networking configuration

Document the correct base URL for:

- Browser/web preview if applicable.
- Android emulator.
- iOS simulator.
- Physical Android/iOS device.

Do not assume one URL works on all platforms.

For physical-device testing, explain how to use the development computer's reachable local network IP and ensure the backend binds to an appropriate development host. Do not expose the backend publicly just to avoid configuring the local network.

Do not place provider secrets in the mobile app. Public API base URLs are acceptable in public client configuration; private credentials are not.

## A7. Navigation and screens

Implement a small but polished and consistent set of screens:

### Home screen
- Vromon name/branding.
- Clear action to start planning.
- Navigation to destination discovery.
- Navigation to saved trips only if the corresponding backend feature exists.

### Destination/place discovery
- Load real destinations/places from the backend.
- Show useful names, categories, and available descriptions.
- Show loading, empty, and error states.
- Add retry behavior.
- Do not show fabricated place data if the API fails.
- Add search/filter controls only if they can be implemented without distracting from the core integration.

### Trip-planning form
Preserve the actual trip requirements in the existing feature inventory and demo. Include available fields such as:

- Destination.
- Start date and end date.
- Budget and currency.
- Interests.
- Travel pace.
- Daily start/end time.
- Maximum activities per day.
- Must-visit places.
- Excluded places.
- Other constraints already specified by the project.

Use React Hook Form and Zod if selected and compatible. Validate at least:

- Required destination.
- Valid dates.
- End date is not before start date.
- Positive/valid budget where supplied.
- Valid activity limits.
- Valid time values.
- Must-visit/excluded places are not contradictory where that can be detected.

Do not silently drop fields that the backend supports. If a field is not yet supported by the backend, document the gap and avoid pretending it has been persisted.

### Submission and confirmation
- Present a clear review/submit action.
- Disable duplicate submissions while the request is in progress.
- Show a loading state.
- Show field validation errors and backend validation errors in a readable way.
- On success, display the actual trip identifier or a clear confirmation based on the response.
- Provide a path to view the saved trip if retrieval is implemented.
- On failure, keep the user's entered form data so they can retry.

## A8. Server state and form state

Use a clear separation:

- TanStack Query: destination/place/trip data from the backend.
- React Hook Form: temporary form values and validation.
- Zustand only if genuinely needed for cross-screen local state.
- Do not duplicate the same server data across several independent stores.
- Invalidate relevant queries after a successful mutation.
- Avoid unnecessary global state.

## A9. Accessibility and UI quality

- Use consistent spacing, typography, colors, and button styles.
- Make text readable on small screens.
- Ensure important controls have accessible labels.
- Show visible disabled/loading states.
- Make touch targets usable.
- Avoid a screen that looks complete but has inert buttons.
- Keep the experience usable on common mobile screen sizes.
- Do not spend the whole phase on decorative styling at the expense of the API flow.

## A10. Testing for Phase 5

Run applicable checks that are actually configured:

- TypeScript type check.
- ESLint/lint.
- Mobile unit/component tests where available.
- Backend tests if any backend changes were made.
- Expo/app startup or platform build check where the environment supports it.

Test or manually verify:

1. App opens.
2. Navigation works.
3. Destinations load from the backend.
4. API loading state appears.
5. API failure displays a useful error and retry action.
6. Form validation prevents invalid submission.
7. Valid trip is submitted to the backend.
8. Backend validation errors are shown clearly.
9. Successful trip creation returns real response data.
10. The saved trip can be confirmed via the backend/API/database.
11. A physical-device URL is documented if device testing is intended.
12. Existing demo remains unchanged.

Do not mark a check as passed unless it was run. Clearly state checks that cannot be run in the current environment.

## A11. Phase 5 acceptance criteria

Phase 5 is complete only when:

- The mobile app starts using documented commands.
- Home/navigation work.
- At least one destination/place list is loaded from the real backend.
- A user can enter and submit valid trip preferences.
- The backend receives and persists the trip.
- The user receives a truthful success/error result.
- Loading, empty, and error states are implemented for core requests.
- Type checks and available tests pass, or remaining failures are explicitly reported.
- The developer can reproduce the flow using the provided manual steps.
- No later-phase work has been started.
- `demo/` remains untouched.

## A12. Stop condition

When Phase 5 is complete:

1. Update `docs/feature-inventory.md` with accurate statuses.
2. Update relevant mobile/backend README instructions.
3. Create or update `docs/phase-5-report.md`.
4. List changed files and the reason for each significant change.
5. List exact commands run and their results.
6. Provide step-by-step manual verification instructions.
7. List unresolved bugs and limitations.
8. State what Phase 6 would add.
9. **STOP. Do not implement Phase 6 until I explicitly approve it.**

Ask the developer to test the app and approve or request fixes.

---

# PROMPT B — PHASE 6 ONLY
## Generate, persist, retrieve, and display a real itinerary

Use this prompt only after you have personally reviewed Phase 5 and explicitly approved it.

---

## B1. Objective

Connect the existing trip-planning flow to a real itinerary-generation pipeline and display the returned itinerary in the mobile app.

A user must be able to select or create a trip, request itinerary generation, see the generated multi-day schedule, and retrieve the saved result later.

The backend should use the existing deterministic candidate retrieval, ranking, scheduler, and independent constraint validator from earlier phases. Do not replace the validated planning core with an LLM-only implementation.

Do not add RAG or formal OR-Tools optimization during this phase unless already implemented and verified. Those belong to their designated later phases. This phase integrates the current baseline into a usable end-to-end experience.

## B2. Preflight and scope gate

Before editing:

- Read `docs/phase-5-report.md` and the actual phase reports.
- Check Git status.
- Run the current mobile and backend checks.
- Verify the existing trip creation and retrieval flow.
- Inspect the current scheduler, ranking code, validator, database models, and API schemas.
- Identify the real request/response contracts.
- Confirm the database supports saving itinerary and activity records.
- Identify any schema/migration gap.

If the prerequisite planning core, trip persistence, or database schema is incomplete, do not fake it. Report the gap and ask whether to fix the prerequisite or narrow Phase 6.

Provide the proposed files and scope before editing.

## B3. Backend generation endpoint

Implement or extend an endpoint consistent with the existing API conventions, such as:

`POST /api/v1/itineraries/generate`

Use the actual naming convention already in the project if one exists.

Request should reference a persisted trip or include validated trip constraints. Prefer a persisted trip identifier when the trip has already been created, to avoid conflicting copies of preferences.

Response should use Pydantic schemas and include, where available:

- Itinerary identifier.
- Trip identifier.
- Generation status.
- Days and dates.
- Activities in chronological order.
- Place identifier and name.
- Category.
- Start/end times or duration when known.
- Known cost and currency when available.
- Ranking/recommendation explanation based on real scoring features.
- Validation warnings.
- Hard-constraint violations, if any.
- Missing-data warnings.
- Source references only if real source metadata is available.
- Scheduler/solver metadata where useful and truthful.

Do not include fabricated source IDs, fake prices, guessed opening hours, or unsupported travel times.

## B4. Generation service pipeline

Use a clear service pipeline, with each responsibility kept separate:

1. Load the persisted trip and its constraints.
2. Retrieve eligible place candidates from the database.
3. Exclude prohibited places and apply structured filters.
4. Rank candidates using the implemented, documented ranking function.
5. Generate a schedule using the deterministic baseline scheduler.
6. Run the independent constraint validator.
7. Decide whether to persist, return warnings, or report that a valid schedule could not be produced.
8. Persist itinerary and activity records in a transaction when appropriate.
9. Return the saved itinerary response.

Requirements:

- The scheduler must be deterministic for fixed inputs where practical.
- The validator must independently check the result.
- Excluded places must not appear in the final itinerary.
- Do not silently claim all constraints are satisfied when some are violated.
- Distinguish hard violations, soft preference mismatches, and missing data.
- If no valid itinerary can be generated, return a useful error or explicit infeasible result.
- Avoid long-running generation inside a database transaction if it can be safely structured otherwise.
- Handle duplicate requests and partial failures safely.
- Do not add background job infrastructure unless the measured need justifies it.

## B5. Persist and retrieve the itinerary

Implement or verify endpoints consistent with existing API design, such as:

- `GET /api/v1/itineraries/{id}`
- `PATCH /api/v1/itineraries/{id}` only if editing is within the existing scope.
- `POST /api/v1/itineraries/generate`

Persist:

- Itinerary metadata.
- Trip relationship.
- Day/date grouping.
- Activity ordering.
- Place relationships where available.
- Schedule times and durations where available.
- Known costs and currencies.
- Validation results/warnings where the schema supports them.
- Creation/update timestamps.

Use database transactions and foreign keys. Add a migration only if required, and do not modify production data destructively.

Make generation idempotency/duplicate behavior clear. Repeatedly tapping Generate must not accidentally create a confusing number of duplicate itineraries. Choose and document a sensible behavior, such as creating a new version or regenerating the current trip's itinerary.

## B6. Mobile itinerary experience

Implement or extend the itinerary screen using the real API response.

Display:

### Trip overview
- Destination.
- Trip dates.
- Number of days.
- Known/estimated budget summary where supported.
- Generation state.

### Day navigation
- Tabs, a day selector, or another accessible pattern.
- Correct date/day labels.
- Empty-day state when no activities are scheduled.

### Activity timeline
For each activity, show only fields available from the API:

- Place name.
- Category.
- Time and duration.
- Known cost.
- Recommendation explanation.
- Relevant warnings.

Keep activities in chronological order. Clearly label missing time/cost information rather than displaying fabricated values or treating missing costs as zero.

### Validation warnings
- Display hard violations prominently enough that the user cannot mistake the itinerary for fully valid.
- Display soft preference warnings separately.
- Explain missing-data limitations.
- Do not hide warnings just to improve visual appearance.

### Loading and errors
- Show a progress/loading state while generation is running.
- Prevent duplicate submission.
- Show a useful error and retry option.
- Preserve the trip context if generation fails.
- Do not display a hardcoded example itinerary as though it came from the backend.

## B7. Budget summary

Implement a transparent summary from actual data:

- Sum known activity costs only when their currency is compatible.
- Do not add amounts in different currencies without a real conversion method.
- Distinguish known total from estimated total.
- If some activities lack cost data, show that the total is incomplete.
- Do not make up accommodation, food, or transport costs.
- Compare against the user's budget only when the comparison is meaningful.

If this cannot be completed reliably in Phase 6, display available cost fields and document the remaining budget work for a later phase.

## B8. Data freshness and query handling

- Use TanStack Query for trip and itinerary reads.
- Invalidate/refetch relevant queries after generation succeeds.
- Avoid stale screen state.
- Handle deleted or missing trip/itinerary IDs.
- Keep API response types aligned with Pydantic schemas.
- Avoid duplicate client caches or manually maintained copies of the same server data.

## B9. Testing for Phase 6

Backend tests should cover:

- Generation request validation.
- Unknown trip ID.
- No eligible candidate places.
- Valid schedule generation.
- Excluded-place enforcement.
- Activity ordering.
- Daily limits and time boundaries.
- Overlap detection.
- Required places where feasible.
- Hard-constraint conflict handling.
- Persistence and retrieval.
- Database rollback or safe failure where relevant.
- Duplicate generation behavior.
- Honest warnings for missing costs/opening hours.

Mobile checks should cover:

- Generate button calls the real endpoint.
- Loading state prevents duplicate requests.
- Successful response renders actual API data.
- Multi-day navigation works.
- Activity ordering is correct.
- Warnings are visible.
- Missing costs are not shown as zero.
- Error state and retry work.
- Reopening/refetching retrieves the saved itinerary.

Run available type checks, lint, tests, and platform checks. Record tests that cannot be run.

## B10. Phase 6 acceptance criteria

Phase 6 is complete only when:

- A user can request itinerary generation from the mobile flow.
- The backend uses the implemented planning core rather than hardcoded sample output.
- The generated schedule is independently validated.
- The itinerary and activities are persisted and retrievable.
- The mobile screen renders the real multi-day response.
- Warnings and missing data are represented honestly.
- Repeated generation has defined behavior.
- Automated checks are run and results recorded.
- Manual verification steps are documented.
- The demo remains untouched.
- No unapproved later-phase work has started.

## B11. Stop condition

When Phase 6 is complete:

1. Update `docs/feature-inventory.md`.
2. Update relevant README instructions.
3. Create or update `docs/phase-6-report.md`.
4. List changed files and significant design decisions.
5. List exact commands and test results.
6. Provide a complete manual verification checklist.
7. Record known issues and remaining work for RAG/optimization phases.
8. **STOP and wait for the developer's review.**

---

# 5. Required Report Format After Each Phase

The agent must finish with this structure:

## Phase status
- Phase number/name:
- Result: completed / partially completed / blocked.
- Scope actually implemented:

## Files changed
For each significant file:
- Path:
- Purpose:
- Important behavior:

## Verification
- Command:
- Actual result:
- Pass/fail/not run:
- Reason if not run:

## Manual testing steps
Numbered steps that the developer can follow without guessing.

## Known issues and risks
List all known issues honestly.

## Data and service prerequisites
List database services, environment variables, external accounts, and credentials required. Never print actual secret values.

## Feature inventory updates
State which features are implemented, partial, blocked, or still planned.

## Next step
Describe the next phase without implementing it.

## Approval gate
Ask the developer to manually review and explicitly approve the next phase. Do not continue.

---

# 6. Developer's Manual Checklists

## Phase 5 checklist — mobile/backend integration

- [ ] The backend starts with the documented command.
- [ ] The mobile app starts with the documented command.
- [ ] The correct API base URL is configured.
- [ ] The app loads actual destinations/places from the backend.
- [ ] Loading, empty, and network-error states work.
- [ ] Form validation works for invalid dates and required fields.
- [ ] A valid trip can be submitted.
- [ ] The backend returns a real trip ID/response.
- [ ] The saved trip can be retrieved through the API or database.
- [ ] No credentials are embedded in mobile code.
- [ ] `demo/` remains unchanged.
- [ ] I have reviewed the agent's phase report.
- [ ] I explicitly approve Phase 6.

## Phase 6 checklist — itinerary generation/display

- [ ] Generation uses the actual backend planning code.
- [ ] No hardcoded sample itinerary is shown as real output.
- [ ] The generated schedule is saved.
- [ ] The validator checks the generated schedule independently.
- [ ] Excluded places remain excluded.
- [ ] Time conflicts and daily limits are checked.
- [ ] Multi-day navigation displays the correct activities.
- [ ] Warnings and missing data are visible.
- [ ] Missing costs are not shown as zero.
- [ ] Saved itinerary can be retrieved after reopening/refetching.
- [ ] Duplicate generation behavior is understandable.
- [ ] Automated test results were reviewed.
- [ ] `demo/` remains unchanged.
- [ ] Remaining issues are documented.

---

# 7. Start Here

**First run Prompt A only.** Do not run Prompt B until Phase 5 is manually verified and explicitly approved by the developer.

The most important Week 2 milestone is not the number of screens. It is a dependable path from a real mobile user input to persisted backend data, followed by a real, validated itinerary shown in the app.
