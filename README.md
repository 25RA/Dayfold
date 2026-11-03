# Dayfold

# An AI Chief of Staff for Everyday Decisions.

The Unfolding Day

An intelligent planning companion that turns your responsibilities, priorities and commitments into a day that works.

---

## Overview

Dayfold bridges the gap between conversational intent and realistic time management. Most scheduling tools force users into rigid forms and manual calendar arithmetic, while naive LLM schedulers suffer from hallucinations, scheduling overlaps, and unverified calendar writes.

Dayfold separates these concerns cleanly:
1. **The Language Interface**: A conversational AI layer powered by Google Gemini parses unstructured speech or text into structured tasks, fixed events, deadlines, and preferences.
2. **The Deterministic Scheduler**: A pure Python planning engine performs the mathematical interval calculations, deadline prioritization, focus block splitting, buffer insertion, and break enforcement.
3. **The Approval Gate**: The system cannot directly mutate schedules. Every proposed plan or change is staged as an approval card with a cryptographic SHA-256 payload integrity check. Changes take effect only upon explicit user approval and are committed to an append-only audit trail.

---

## Core Capabilities

- **Voice & Text Intent Extraction**: Speak naturally or type unstructured thoughts (e.g. *"Need to study operating systems for 2 hours before 4pm, team standup at 10am, and grab groceries"*). Dayfold extracts activities, estimates, deadlines, and commitments with structured JSON schema constraints.
- **Deterministic Schedule Engine**: Calculates available working intervals, prioritizes high-urgency items, splits tasks exceeding focus limits into manageable blocks, enforces break rules, and outputs transparent scheduling rationales.
- **Three Profile Lenses**: Tailor the planning experience to your context:
  - **Student**: Manages classes, assignments, revision sessions, and exam study blocks.
  - **Professional**: Balances meetings, focus blocks, deep work intervals, and buffer periods.
  - **Personal**: Accommodates habits, daily routines, opening hours for errands, and personal commitments.
- **What-If Schedule Simulations**: Test hypothetical scenarios (e.g., adding an urgent 90-minute lecture or advancing a project deadline) in an isolated, in-memory sandbox without altering your active schedule or database.
- **Dayfold Reflection**: An end-of-day journaling workflow focused on three reflection anchors: Accomplishments, Friction, and Intent for tomorrow. Includes deterministic and AI-synthesized weekly reviews and trend discovery.
- **Dual-Mode Security**: Supports Bearer token authentication for API clients alongside HttpOnly cookies with double-submit CSRF protection for browser sessions.

---

## Architecture: Interface vs. Scheduler

```
User Input (Voice / Text)
          │
          ▼
┌────────────────────────────────────────┐
│      Conversational AI Layer           │
│   (Google Gemini / Local Parser)       │
│  - Entity extraction                   │
│  - Schema-constrained JSON             │
│  - Disambiguation questions            │
└────────────────────────────────────────┘
          │ Structured Intent Payload
          ▼
┌────────────────────────────────────────┐
│     Deterministic Planning Engine      │
│            (Pure Python)               │
│  - Working hours interval arithmetic   │
│  - Deadline urgency & priority scoring │
│  - Focus block limits & breaks         │
│  - Explanatory rationale generation    │
└────────────────────────────────────────┘
          │ Proposed PlanBlocks + SHA-256 Hash
          ▼
┌────────────────────────────────────────┐
│       Approval Gate & Audit Trail      │
│  - Review card presented to user       │
│  - Staged as immutable PendingAction   │
│  - Applied only on explicit approval   │
│  - Recorded in append-only audit log   │
└────────────────────────────────────────┘
```

---

## Verified Technology Stack

### Frontend
- **React 19**: Modern component architecture utilizing hooks and functional patterns.
- **TypeScript**: End-to-end static typing across pages, components, and data structures.
- **Vite 6**: Next-generation frontend tooling and local development server.
- **Tailwind CSS v4**: Utility-first styling with custom theme definitions for light and dark modes.
- **React Router v7**: Client-side routing with navigation guards and layout hierarchies.
- **Zustand v5**: Lightweight client state management for authentication, workspace preferences, and voice recording.
- **Axios**: HTTP client configured with request/response interceptors for silent token refresh and CSRF token propagation.
- **Framer Motion & Lucide React**: Declarative UI transitions, micro-interactions, and interface iconography.
- **date-fns**: Time and calendar interval manipulation utilities.

### Backend
- **Python 3.10+**: Core backend runtime.
- **FastAPI**: Asynchronous, high-performance web framework for REST APIs and OpenAPI documentation.
- **Pydantic v2**: Strict schema validation, settings management (`pydantic-settings`), and serialization.
- **SQLAlchemy 2.0**: Asynchronous ORM utilizing `AsyncSession` with connection pooling.
- **Alembic**: Database migration environment maintaining linear version scripts across releases.
- **Database Engine Support**:
  - **SQLite** (via `aiosqlite`): Zero-setup asynchronous database for local development.
  - **PostgreSQL**: Uses `asyncpg` for asynchronous application database operations and `psycopg2-binary` for synchronous Alembic migrations.
- **Redis Integration** (via `redis.asyncio`): Distributed multi-worker token revocation and atomic Lua-scripted sliding-window rate limiting; includes a thread-safe in-memory store for local single-process development.
- **Security & Authentication**:
  - Direct `bcrypt` password hashing.
  - JSON Web Tokens (JWT) signed via `python-jose`.
  - Dual-mode authentication: Authorization header Bearer tokens and HttpOnly access/refresh cookies.
  - Double-submit CSRF cookie verification for state-changing browser requests (`POST`, `PUT`, `PATCH`, `DELETE`).

### AI & Language Processing
- **Google GenAI SDK (`google-genai`)**: Gemini 3.6 Flash for structured natural-language extraction with Pydantic response schemas.
- **Rule-Based Heuristic Fallback**: Built-in deterministic regex and NLP parser that automatically activates if the AI service is unconfigured, rate-limited, or unreachable.

### Planning Engine
- **Pure Python Scheduler**: Self-contained mathematical interval arithmetic and conflict resolution with zero runtime AI dependencies.
- **SHA-256 Action Hashing**: Canonical hashing of planned block parameters to prevent tampering between review and execution.

---

## Repository Structure

```
dayfold/
├── .env.example              # Environment variables overview
├── .gitignore                # Git exclusion rules
├── README.md                 # Project documentation
├── render.yaml               # Backend infrastructure definition
├── backend/
│   ├── alembic/              # Database migration scripts
│   ├── app/
│   │   ├── api/routes/       # REST routes (auth, tasks, planning, reflections, etc.)
│   │   ├── core/             # Security, tokens, CSRF, distributed store, config
│   │   ├── db/               # Database engine and session lifecycle
│   │   ├── models/           # SQLAlchemy ORM declarative models (16 tables)
│   │   ├── schemas/          # Pydantic request and response schemas
│   │   └── services/
│   │       ├── planner/      # Deterministic planning engine
│   │       ├── agent/        # Gemini extractor and heuristic fallback
│   │       ├── auth/         # Hashing and authentication services
│   │       └── reflection/   # Journaling and pattern analysis services
│   ├── requirements.txt      # Python dependencies
│   ├── alembic.ini           # Alembic migration configuration
│   └── run.py                # Local server runner
└── frontend/
    ├── public/               # Favicon and static SVGs
    ├── src/
    │   ├── assets/           # Application graphics
    │   ├── components/       # Interface components (VoiceOrb, Timeline, ApprovalCard)
    │   │   └── reflection/   # Journaling, weekly review, and pattern discovery components
    │   ├── hooks/            # Custom React hooks (voice recording, theme)
    │   ├── lib/              # Axios API client with cookie and CSRF handling
    │   ├── pages/            # Page components (MyDay, WhatIf, Tasks, Journal, Settings)
    │   └── store/            # State stores (auth, workspace, voice)
    ├── package.json          # Node dependencies
    ├── pnpm-lock.yaml        # Pnpm lockfile
    ├── vercel.json           # Frontend build and routing specification
    └── vite.config.ts        # Vite configuration
```

---

## Local Setup

### Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher with `pnpm`
- (Optional) A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/) for natural-language extraction. If omitted, the deterministic rule-based fallback parser will operate automatically.

### 1. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Open .env to set your GEMINI_API_KEY (optional) and SECRET_KEY

# Apply database migrations
alembic upgrade head

# Start the development server
python run.py
```
*The FastAPI server will start at `http://127.0.0.1:8000`. Interactive documentation is available at `http://127.0.0.1:8000/docs`.*

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Start the Vite development server
pnpm dev
```
*The frontend application will be accessible at `http://localhost:5173`. In development, API requests are automatically forwarded to `http://127.0.0.1:8000` via the Vite reverse proxy.*

---

## Design System

Dayfold follows a deliberate editorial design identity called **The Unfolding Day**:
- **Palette**: Warm Paper Light (`#FBF9F5`) and Deep Ink Dark (`#0B0D12`), accented with Ember (`#F26A3D`) and Tide (`#1B7F83`).
- **Typography**: Instrument Serif for editorial headers, Geist Sans for interface elements, and Geist Mono for timestamps, durations, and SHA-256 hashes.
- **Design Tokens**: The design system components and tokens can be explored interactively at `/design` within the running application.
