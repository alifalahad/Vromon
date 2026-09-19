# ROLE

You are a senior full-stack engineer, UI/UX designer, software architect, and AI-system engineer.

Your task is to build a **complete, polished, runnable demo application** for the following university research project:

> **Intelligent Adaptive Travel Itinerary Planning and Recommendation System Using RAG and Constraint Optimization**

The application should initially focus on building a strong working travel-planner MVP/demo.

IMPORTANT:

Do NOT try to implement the entire research system at once.

The current goal is to build the **complete demo foundation** with clean architecture so that RAG, constraint optimization, and adaptive planning can be added incrementally later.

The application must feel like a real modern travel-planning product, not a simple CRUD demo.

---

# 1. PROJECT OBJECTIVE

The application should allow a user to:

1. Select a destination.
2. Enter travel dates/duration.
3. Set a budget.
4. Select interests.
5. Select travel style.
6. Set basic preferences and constraints.
7. Generate a personalized multi-day itinerary.
8. View the itinerary day by day.
9. View places on a map.
10. See estimated cost.
11. See estimated travel time.
12. See why places were recommended.
13. Modify the generated itinerary.
14. Save the trip.
15. Provide feedback.
16. Regenerate/re-plan the itinerary.

The application should demonstrate the foundation of an intelligent travel planning system.

---

# 2. CURRENT SCOPE

Build the following components NOW:

### MUST IMPLEMENT

- Modern landing page
- User interface
- Trip creation flow
- Destination selection
- Date/duration selection
- Budget selection
- Interest selection
- Travel-style selection
- Basic constraints
- Travel preferences
- Destination/places dataset
- Recommendation engine
- Basic itinerary generation engine
- Budget calculation
- Time calculation
- Travel-distance/time estimation
- Day-by-day itinerary
- Interactive map
- Place details
- Itinerary editing
- Regeneration
- Saved trips
- User feedback
- Responsive design
- Loading states
- Empty states
- Error handling
- Demo/sample data
- Clean backend API
- Database persistence if practical

### DO NOT IMPLEMENT YET

Do NOT spend time implementing:

- Production-grade RAG
- Complex vector database pipeline
- Fine-tuning
- Machine-learning recommender training
- Advanced constraint solver
- Complex mathematical optimization
- Flight booking
- Hotel booking
- Payment
- Real reservations
- Social network
- Real-time travel agent
- Autonomous external actions
- Large worldwide travel database

However, structure the code so these features can be added later without rewriting the application.

---

# 3. CORE PRODUCT IDEA

The application follows this conceptual pipeline:

```text
User Preferences
        ↓
Destination / Place Data
        ↓
Recommendation Engine
        ↓
Candidate Places
        ↓
Basic Itinerary Planner
        ↓
Time + Budget + Travel Checks
        ↓
Personalized Itinerary
        ↓
User Feedback
        ↓
Re-planning
```

Future architecture:

```text
User
 ↓
Recommendation
 ↓
RAG
 ↓
Constraint Optimization
 ↓
Adaptive Planner
 ↓
Final Itinerary
```

The current implementation should expose clean interfaces for these future modules.

---

# 4. TECHNOLOGY

Use a modern, maintainable stack.

Preferred:

### Frontend

- React
- TypeScript
- Vite or Next.js
- Tailwind CSS
- Modern component architecture

### Backend

Preferred:

- Python
- FastAPI
- Pydantic

### Database

Preferred:

- PostgreSQL

For a simple local demo, SQLite is acceptable if PostgreSQL setup would make the application unnecessarily difficult.

However, structure database access so PostgreSQL can be introduced easily.

### Maps

Use a practical map solution such as:

- Leaflet + OpenStreetMap

Avoid paid APIs unless necessary.

### Icons

Use a consistent icon library such as Lucide.

### Charts

Use a lightweight chart library only where useful.

---

# 5. IMPORTANT ENGINEERING PRINCIPLE

Separate the system into modules.

Do NOT put all itinerary logic inside React components.

Use architecture similar to:

```text
frontend/
backend/
data/
```

Backend:

```text
app/
├── api/
├── models/
├── schemas/
├── services/
│   ├── recommendation/
│   ├── itinerary/
│   ├── optimization/
│   ├── rag/
│   └── adaptation/
├── database/
└── main.py
```

The following services should exist conceptually even if some are simple implementations now:

```text
RecommendationService
ItineraryService
ConstraintService
OptimizationService
RAGService
AdaptationService
```

For now:

```text
RecommendationService = weighted scoring

ConstraintService = basic validation

OptimizationService = simple heuristic scheduling

RAGService = placeholder interface

AdaptationService = basic feedback/re-generation
```

This is important because these will be replaced/improved later.

---

# 6. TARGET DEMO DESTINATION

Initially optimize the demo for:

> **Cox's Bazar, Bangladesh**

Do not build a worldwide database.

Create realistic demo data for Cox's Bazar.

Include attractions such as:

- Laboni Beach
- Sugandha Beach
- Kolatoli Beach
- Inani Beach
- Himchari National Park
- Marine Drive
- Ramu
- Buddhist temples / cultural attractions
- local markets
- viewpoints
- nature attractions

You may add additional reasonable attractions.

IMPORTANT:

Clearly mark demo/sample information where appropriate.

Do not pretend that mocked data is live real-world information.

---

# 7. SAMPLE DATA

Create structured data for approximately:

### Attractions

20–30 places.

Each place should have:

```text
id
name
destination
category
description
latitude
longitude
rating
review_count
average_visit_duration
estimated_cost
opening_time
closing_time
best_time
crowd_level
activity_level
tags
```

Example categories:

```text
Beach
Nature
Adventure
Culture
History
Food
Shopping
Relaxation
Family
Photography
```

### Restaurants

At least 8–10 demo restaurants.

Fields:

```text
id
name
cuisine
price_level
rating
latitude
longitude
average_meal_cost
tags
```

### Hotels

At least 8 demo hotels.

Fields:

```text
id
name
price_per_night
rating
latitude
longitude
category
```

If real hotel data is not verified, label it as demo data.

---

# 8. USER INPUT

The trip creation form should collect:

### Destination

Example:

```text
Cox's Bazar
```

### Dates

Start date and end date.

### Travelers

Number of travelers.

### Budget

Example:

```text
৳15,000
৳25,000
৳50,000
Custom
```

### Interests

Multi-select:

```text
Beach
Nature
Adventure
Culture
History
Food
Shopping
Photography
Relaxation
Family
Nightlife
```

### Travel style

```text
Relaxed
Balanced
Packed
```

### Preferred activity level

```text
Low
Medium
High
```

### Basic constraints

Allow:

```text
Maximum activities per day
Preferred start time
Preferred end time
Maximum daily budget
Must-visit places
Places to avoid
```

---

# 9. LANDING PAGE

Create a polished landing page.

Hero section:

```text
Plan trips that fit YOU.

Your preferences.
Your budget.
Your time.
Your perfect itinerary.
```

CTA:

```text
Plan My Trip
```

Show feature cards:

```text
Personalized Planning
Smart Recommendations
Budget Awareness
Time-Aware Itineraries
Interactive Maps
Adaptive Planning
```

Add a simple explanation of the research idea.

Example:

```text
From preferences to a practical itinerary.
Our system combines personalized recommendations,
travel constraints and intelligent planning to create
a trip designed around your needs.
```

Do NOT claim that advanced RAG/optimization is already fully implemented if it is not.

---

# 10. TRIP CREATION UX

Create a multi-step wizard.

### Step 1

Destination + dates

### Step 2

Budget + travelers

### Step 3

Interests

### Step 4

Travel style

### Step 5

Constraints

### Step 6

Review

Then:

```text
Generate My Itinerary
```

Use a progress indicator:

```text
1 Destination
2 Preferences
3 Interests
4 Constraints
5 Review
```

The UI should feel smooth and modern.

---

# 11. RECOMMENDATION ENGINE

Implement a simple transparent recommendation algorithm.

Do NOT use random selection.

Calculate a recommendation score such as:

```text
score =
    interest_match
    + rating_score
    + budget_match
    + travel_style_match
    + activity_match
    + popularity_score
    - distance_penalty
    - crowd_penalty
```

Use configurable weights.

For example:

```text
interest_match: 35%
rating: 20%
budget: 15%
travel_style: 10%
activity_level: 10%
distance: 10%
```

Keep weights in a configuration file.

The user should be able to see an explanation:

```text
Why we recommend this:

✓ Matches your interest in nature
✓ Suitable for a relaxed trip
✓ Fits your budget
✓ High visitor rating
✓ Short travel distance
```

This transparency is important for the research demo.

---

# 12. ITINERARY GENERATION

Generate a realistic day-by-day itinerary.

Example:

```text
DAY 1
Beach & Relaxation

09:00
Breakfast

10:00
Laboni Beach
Duration: 2h

12:30
Lunch

14:00
Kolatoli Beach
Duration: 2h

17:00
Sunset

19:00
Dinner
```

Day 2:

```text
DAY 2
Nature & Scenic Route

08:30
Breakfast

09:30
Himchari

12:00
Lunch

14:00
Inani Beach

17:30
Marine Drive

19:30
Return
```

The actual generated itinerary should depend on user preferences.

---

# 13. BASIC SCHEDULING LOGIC

The planner must consider:

- opening hours
- closing hours
- visit duration
- travel time
- meal time
- maximum activities
- preferred start/end time
- budget
- user interests
- must-visit places
- excluded places

Avoid obvious conflicts such as:

```text
10:00–12:00 Place A
11:00–13:00 Place B
```

Do not schedule a place outside its opening hours.

Do not exceed the daily activity limit.

Do not exceed the configured budget unnecessarily.

---

# 14. TRAVEL TIME

For the demo, you may use:

- predefined travel-time estimates
- geographic distance calculation
- simple Haversine distance
- approximate travel speed

Do NOT claim that these are live traffic estimates.

Display:

```text
Travel
25 min
2.4 km
```

If using approximate values, label appropriately.

---

# 15. ITINERARY PAGE

This is one of the most important screens.

Layout:

```text
------------------------------------------------
Trip: Cox's Bazar
10 Oct – 13 Oct
Budget: ৳15,000
------------------------------------------------

DAY 1
[Timeline]

09:00 Breakfast

10:00 Laboni Beach
     ★ 4.5
     Beach • 2 hours
     ৳0

12:30 Lunch

14:00 Kolatoli Beach
     ★ 4.3
     Beach • 2 hours

17:00 Sunset

------------------------------------------------

MAP
------------------------------------------------
```

Add:

- day tabs
- timeline
- map
- total daily cost
- total travel time
- activity count
- edit buttons
- remove button
- replace button
- regenerate button

---

# 16. MAP

Use Leaflet/OpenStreetMap if possible.

Display:

- hotel/base location
- attractions
- restaurants
- itinerary route
- markers

Clicking a marker should show:

```text
Place Name
Rating
Category
Estimated duration
Cost
View details
Add to itinerary
```

---

# 17. PLACE DETAILS

Create a reusable place-details component.

Show:

```text
Name
Image/placeholder
Rating
Category
Description
Opening hours
Estimated visit duration
Estimated cost
Best time
Crowd level
Activity level
Location
```

Buttons:

```text
Add to Trip
Replace Activity
View on Map
```

---

# 18. BUDGET DASHBOARD

Show:

```text
Estimated Trip Cost

Accommodation      ৳8,000
Food               ৳3,000
Activities         ৳1,000
Transportation     ৳1,500
--------------------------
Total              ৳13,500

Budget             ৳15,000

Remaining          ৳1,500
```

Also show:

```text
Budget utilization: 90%
```

Use a visual progress bar.

---

# 19. ITINERARY EDITING

The user must be able to:

### Remove

```text
Remove Himchari
```

### Replace

```text
Replace this activity
```

Show alternatives.

### Add

```text
Add activity
```

### Regenerate

```text
Regenerate Day
```

### Re-plan whole trip

```text
Re-plan Trip
```

When modifications happen, recalculate:

- schedule
- travel time
- budget
- activity count

---

# 20. ADAPTIVE DEMO

Implement a simple adaptation mechanism.

Example:

User clicks:

```text
Make today more relaxed
```

The system should:

1. Reduce activities.
2. Remove lower-priority activity.
3. Recalculate schedule.
4. Recalculate travel time.
5. Recalculate cost.

Another:

```text
Reduce my budget
```

System should select cheaper alternatives.

Another:

```text
I don't want crowded places
```

System should penalize high-crowd places.

This can initially be rule-based.

Do not pretend this is a sophisticated ML adaptation model.

---

# 21. FEEDBACK

After viewing the itinerary, show:

```text
How useful was this itinerary?

☆ ☆ ☆ ☆ ☆
```

And:

```text
What should we improve?

[Too many activities]
[Too much travel]
[Too expensive]
[Not enough nature]
[Not enough food]
[Other]
```

Store feedback.

Use feedback to update the current trip preferences.

---

# 22. SAVED TRIPS

Create a dashboard:

```text
My Trips

Cox's Bazar
10 Oct – 13 Oct
৳15,000
3 Days

[Open]

-------------------

Sylhet
20 Nov – 23 Nov
৳20,000
4 Days

[Open]
```

Allow:

```text
Open
Edit
Duplicate
Delete
```

---

# 23. USER DASHBOARD

Show:

```text
Welcome back!

Your Trips
Saved Places
Recent Itineraries
Travel Preferences
```

Keep it simple.

---

# 24. DATA MODEL

Use entities similar to:

```text
User
Destination
Place
Restaurant
Hotel
Trip
TripPreference
Constraint
Itinerary
ItineraryItem
Feedback
```

Relationships:

```text
User
 └── Trips

Trip
 ├── Destination
 ├── Preferences
 ├── Constraints
 └── Itinerary

Itinerary
 └── ItineraryItems

ItineraryItem
 └── Place
```

Use proper validation.

---

# 25. API DESIGN

Create clean REST endpoints.

Examples:

```text
GET    /api/destinations
GET    /api/destinations/{id}

GET    /api/places
GET    /api/places/{id}

POST   /api/trips
GET    /api/trips
GET    /api/trips/{id}
PUT    /api/trips/{id}
DELETE /api/trips/{id}

POST   /api/trips/{id}/generate

GET    /api/trips/{id}/itinerary

POST   /api/trips/{id}/regenerate

POST   /api/trips/{id}/feedback

POST   /api/trips/{id}/adapt

POST   /api/recommendations
```

Keep APIs logically separated.

---

# 26. FUTURE RAG INTERFACE

Create a placeholder service such as:

```text
RAGService
```

with conceptual methods:

```text
retrieve_context(query)
generate_grounded_explanation(query, context)
```

For the current demo it can return structured mock context.

Example:

```json
{
  "source": "Cox's Bazar Destination Knowledge",
  "context": "Demo destination information..."
}
```

DO NOT build a fake RAG system and claim it is real.

Instead make the architecture ready for real RAG later.

---

# 27. FUTURE OPTIMIZATION INTERFACE

Create:

```text
OptimizationService
```

with a method conceptually like:

```text
optimize_itinerary(
    candidates,
    preferences,
    constraints
)
```

For now use a deterministic heuristic.

Later this can be replaced with:

- OR-Tools
- MILP
- CP-SAT
- other optimization methods

without changing the frontend.

---

# 28. FUTURE ADAPTATION INTERFACE

Create:

```text
AdaptationService
```

Conceptually:

```text
adapt_trip(
    current_itinerary,
    user_feedback,
    updated_preferences
)
```

Current implementation can use rule-based adaptation.

---

# 29. DESIGN SYSTEM

Use a polished travel-app design.

Visual direction:

- modern
- clean
- premium
- spacious
- mobile-friendly
- card-based
- clear typography
- subtle shadows
- rounded corners
- intuitive icons
- good whitespace

Avoid:

- excessive gradients
- excessive animations
- clutter
- giant text everywhere
- unnecessary decorative elements

Use a coherent design system.

---

# 30. RESPONSIVE DESIGN

The app must work on:

```text
Desktop
Tablet
Mobile
```

Mobile itinerary should become:

```text
DAY 1

09:00
Breakfast

10:00
Laboni Beach

12:30
Lunch
```

Map should resize properly.

Navigation should become mobile-friendly.

---

# 31. LOADING STATES

When generating an itinerary, show an intelligent-looking but honest progress state:

```text
Creating your itinerary...

✓ Reading your preferences
✓ Finding matching places
✓ Checking time constraints
✓ Estimating travel
✓ Building your schedule

Preparing your trip...
```

These are UI stages only.

Do not claim that an actual AI/RAG operation happened if it did not.

---

# 32. ERROR HANDLING

Handle:

- invalid dates
- end date before start date
- zero/negative budget
- no matching places
- impossible constraints
- API failure
- database failure
- map loading failure

Provide friendly messages.

Example:

```text
We couldn't create a feasible itinerary with these constraints.

Try:
• increasing your budget
• allowing more activities
• extending your trip
• removing a must-visit restriction
```

---

# 33. DEMO MODE

The application must work immediately after setup.

Provide:

```text
Demo Mode
```

with sample user/trip data.

The evaluator should be able to launch the project and immediately test:

```text
Cox's Bazar
3 days
৳15,000
Nature + Beach + Food
Relaxed
```

and generate an itinerary.

Do not require external API keys for the basic demo if avoidable.

If an API key is optional, provide a fallback.

---

# 34. README

Create an excellent README.

Include:

```text
Project Overview
Features
Architecture
Tech Stack
Installation
Environment Variables
Database Setup
Running Frontend
Running Backend
Demo Instructions
API Documentation
Project Structure
Future AI/RAG Integration
Future Optimization Integration
Research Direction
```

Also include example commands.

---

# 35. ENVIRONMENT CONFIGURATION

Create:

```text
.env.example
```

Document variables such as:

```text
DATABASE_URL=
MAP_API_KEY=
LLM_API_KEY=
```

But the basic demo should work without an LLM key if possible.

Never hard-code secret keys.

---

# 36. CODE QUALITY

Follow these rules:

- Type-safe frontend
- Pydantic validation
- Clean API boundaries
- Reusable components
- No giant components
- No duplicated business logic
- Meaningful variable names
- Comments only where useful
- Modular services
- Error handling
- Consistent formatting
- Basic tests for core itinerary logic

---

# 37. TESTING

At minimum test:

### Recommendation

Given preferences, suitable places receive higher scores.

### Budget

Generated itinerary does not exceed budget unnecessarily.

### Schedule

No overlapping activities.

### Opening hours

Places are scheduled within opening hours.

### Daily activity limit

The configured limit is respected.

### Excluded places

Excluded places are never selected.

### Must-visit places

Must-visit places are included when feasible.

### Adaptation

"Make trip more relaxed" reduces activity load.

---

# 38. IMPORTANT RESEARCH DESIGN

The system must be designed so we can later compare:

```text
Baseline
vs
Personalized Recommendation
vs
Constraint-aware Planning
vs
Optimization
vs
RAG + Optimization
vs
Adaptive System
```

Therefore, don't hide all logic inside one black-box function.

Keep intermediate outputs accessible:

```text
Candidate places
Recommendation scores
Constraints
Optimization result
Final itinerary
Feedback
```

This will later help with research experiments and evaluation.

---

# 39. EXPLAINABILITY

For every recommended activity, provide a reason.

Example:

```text
Why this place?

85% preference match

✓ Matches Beach interest
✓ Fits relaxed travel style
✓ Low estimated cost
✓ Good rating
✓ Fits today's route
```

Also show:

```text
Planning summary

12 places considered
6 matched preferences
4 selected
0 constraint violations
```

This is valuable for demonstrating the intelligence of the system.

---

# 40. DO NOT FAKE INTELLIGENCE

This is extremely important.

If something is currently:

```text
rule-based
mocked
sample data
heuristic
approximate
```

keep the implementation honest.

The UI can explain the current functionality without falsely claiming:

```text
"Powered by advanced RAG"
"AI optimized with machine learning"
```

unless those components actually exist.

Architecture should be future-ready.

---

# 41. IMPLEMENTATION PROCESS

Follow this order:

### STEP 1

Inspect the environment and existing project files.

### STEP 2

Create the project structure.

### STEP 3

Build the backend foundation.

### STEP 4

Create database/data models.

### STEP 5

Create sample Cox's Bazar data.

### STEP 6

Create REST APIs.

### STEP 7

Build frontend layout.

### STEP 8

Build trip creation wizard.

### STEP 9

Build recommendation engine.

### STEP 10

Build itinerary generator.

### STEP 11

Build map.

### STEP 12

Build itinerary editing.

### STEP 13

Build adaptive rule-based modifications.

### STEP 14

Build feedback.

### STEP 15

Build saved trips.

### STEP 16

Add tests.

### STEP 17

Polish UI.

### STEP 18

Create README.

### STEP 19

Run the entire application.

### STEP 20

Fix all obvious errors before finishing.

---

# 42. ACCEPTANCE CRITERIA

The project is NOT complete until the following flow works end-to-end:

```text
Open application
       ↓
Landing page
       ↓
Click "Plan My Trip"
       ↓
Select Cox's Bazar
       ↓
Select dates
       ↓
Enter budget
       ↓
Select interests
       ↓
Select travel style
       ↓
Set constraints
       ↓
Review
       ↓
Generate itinerary
       ↓
View multi-day itinerary
       ↓
View map
       ↓
See recommendation reasons
       ↓
Edit activity
       ↓
Replace activity
       ↓
Regenerate day
       ↓
View updated budget
       ↓
Give feedback
       ↓
Adapt itinerary
       ↓
Save trip
       ↓
Open saved trip
```

Every major step must actually work.

---

# 43. FINAL DEMO SCENARIO

Make sure this exact demo works:

```text
Destination:
Cox's Bazar

Duration:
3 days

Travelers:
2

Budget:
৳15,000

Interests:
Beach
Nature
Food
Photography

Travel style:
Relaxed

Activity level:
Medium

Preferred time:
09:00 – 20:00

Maximum activities/day:
4

Avoid:
Crowded places
```

Expected result:

```text
3-day personalized itinerary

Day 1
Beach + relaxation

Day 2
Nature + scenic route

Day 3
Food + culture + relaxed activities
```

The exact activities should be determined by the recommendation and scheduling logic.

---

# 44. FINAL OUTPUT REQUIRED FROM YOU

After implementation, provide:

1. Complete working source code.
2. Project structure.
3. Setup instructions.
4. Environment variable instructions.
5. Database instructions.
6. Demo credentials if authentication is implemented.
7. Test instructions.
8. README.
9. Explanation of architecture.
10. List of currently implemented features.
11. List of intentionally deferred features.
12. Clear explanation of where future RAG will be integrated.
13. Clear explanation of where future constraint optimization will be integrated.
14. Clear explanation of where future adaptive learning will be integrated.

Before declaring completion:

- run the application
- test the main user flow
- fix build errors
- fix API errors
- fix obvious UI issues
- verify itinerary generation
- verify map
- verify editing
- verify adaptation
- verify saved trips
- verify responsive layout

Do not stop after creating a few screens.

Build the **complete end-to-end demo**.

---

# 45. PRIORITY RULE

If you encounter time, complexity, or dependency problems, prioritize in this order:

```text
1. Application runs
2. Trip creation works
3. Itinerary generation works
4. Recommendation works
5. Constraints work
6. Map works
7. Editing works
8. Adaptation works
9. Feedback works
10. Saved trips work
11. UI polish
12. Optional extras
```

Do NOT sacrifice the working core application for unnecessary advanced features.

---

# 46. MOST IMPORTANT ARCHITECTURAL PRINCIPLE

The current application is **Version 1** of a larger research system.

Build it so that we can later upgrade:

```text
CURRENT

Rule-based Recommendation
        ↓
Heuristic Itinerary Planner
        ↓
Rule-based Adaptation


FUTURE

RAG
 ↓
Context-aware Recommendation
 ↓
Constraint Optimization
 ↓
Adaptive Itinerary Planning
 ↓
Feedback Learning
```

The frontend should not need to be rewritten when these future intelligence modules are added.

The backend should expose clean service interfaces for these future upgrades.

---

# START NOW

First inspect the available project/environment.

Then implement the application incrementally.

Do not ask unnecessary questions if reasonable engineering decisions can be made.

When a choice is ambiguous, choose the simplest maintainable solution that supports the research roadmap.

Do not merely provide a plan.

**Actually build the complete runnable demo application.**