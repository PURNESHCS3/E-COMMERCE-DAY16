# ShopHub E-Commerce Frontend

React + TypeScript + Vite + Tailwind CSS + Axios + React Router.

## 1. Start the FastAPI backend

From the `BACKEND` folder:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

If PowerShell blocks activation scripts, allow them for only the current
terminal process, then activate the backend-local environment:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Backend: `http://127.0.0.1:8000`

Run Redis and the Celery worker in separate terminals. For example, start a
local Redis container with Docker:

```powershell
docker run --name shophub-redis -p 6379:6379 -d redis:7-alpine
```

The API and worker must use the same `DATABASE_URL` and `REDIS_URL`; in local
development the default Redis URL is `redis://localhost:6379/0`.

```powershell
# From BACKEND, with the backend virtual environment active
celery -A app.celery_app.celery_app worker --loglevel=INFO --pool=solo
```

The `solo` pool is suitable for local Windows development. Use a prefork worker
on Linux in production. The worker writes generated PDFs and staged CSV files
under `BACKEND/app/uploads`; share that directory between API and worker
processes when they run on separate hosts.

Before the first backend run, copy `BACKEND/.env.example` to `BACKEND/.env` and
set `DATABASE_URL`, a long random `JWT_SECRET`, and a different long random
`JWT_REFRESH_SECRET`. Configure comma-separated frontend origins with
`CORS_ORIGINS`; do not use `*` with credentialed requests. Apply database
migrations from `BACKEND` when deploying schema changes:

```powershell
alembic upgrade head
```

The latest migration enables PostgreSQL's `pg_trgm` extension and creates GIN
indexes for English full-text and typo-tolerant product search. The database
role needs permission to install the extension, or an administrator must
provision `pg_trgm` before applying migrations.

The refresh-session migration invalidates refresh tokens created before the
migration; users will need to sign in once again after it is applied.

## 2. Start the frontend

Open another terminal:

```powershell
cd FRONTEND
npm install
copy .env.example .env
npm run dev
```

Frontend: `http://localhost:5173`

Set `VITE_API_URL` and `VITE_WS_URL` in `FRONTEND/.env` to the backend HTTP API
and WebSocket endpoints. If `VITE_WS_URL` is omitted, the frontend derives
`/ws` from `VITE_API_URL`.

If PowerShell does not accept `copy`, use:

```powershell
Copy-Item .env.example .env
```

## Implemented Day 13 features

- Vite React project
- Tailwind CSS
- Reusable shadcn/ui-style Button, Input and Card components
- Product listing from `GET /api/products/`
- Search
- Stock filtering
- Price/name sorting
- Product details from `GET /api/products/{id}`
- Register from `POST /api/auth/register`
- Login from `POST /api/auth/login`
- JWT access-token interceptor
- Rotating JWT refresh-token interceptor using `POST /api/auth/refresh`;
  access and refresh tokens use separate signing keys
- Protected `/account` route
- Current user from `GET /api/auth/me`
- FastAPI CORS configuration
- Product image URL support through FastAPI static files

## Storefront features

- Zustand provides the shared cart snapshot and cart actions; TanStack Query
  keeps cart contents synchronized with the FastAPI cart endpoints.
- Checkout is a protected route with a React Hook Form form and Zod validation
  for the delivery address. Orders are submitted to the backend and successful
  checkout clears and invalidates the cart cache.
- Order history and order details use cached queries; administrators can list
  all orders, cancel confirmed orders, and advance delivery status through
  dispatched, out for delivery, and delivered. Status changes notify customers
  over the authenticated WebSocket connection.
- The admin area supports product creation, editing, image upload, deletion,
  and order management against the FastAPI admin endpoints. Admins can either
  upload an image file or use a public HTTPS image URL; remote URLs are
  displayed directly rather than fetched/stored by the backend. Remote host
  availability and image rights remain the administrator's responsibility.
- Product search combines PostgreSQL English full-text ranking, partial-letter
  matching while typing, and `pg_trgm` typo tolerance in a single search field.
- Customers can queue PDF invoice generation from an order. Administrators can
  upload a CSV with `name`, `price`, and `stock` columns (optional:
  `description` and `image_url`) for asynchronous product import. The
  `/jobs` page polls active jobs, shows progress/results, and exposes completed
  invoice downloads. CSV uploads are limited to 10 MB; rejected rows are
  reported in the completed job result.
- The navigation theme control switches between light and dark modes and
  remembers the user's choice in local storage.
- TanStack Query coordinates catalog, admin product, cart, and order data with
  cache invalidation after mutations.
- Authenticated WebSockets reconnect with exponential backoff, refresh
  credentials after an expired access token, and invalidate live order data.
- The notification menu shows live order and chat events. Customers and admins
  can exchange support messages at `/support`; chat history is persisted and
  retrieved from the backend.

## Type safety and tests

- The app source is TypeScript (`.ts`/`.tsx`) with strict type-checking enabled.
- Shared API request/response contracts are defined in `src/types.ts` to match
  the FastAPI schemas and route response shapes.
- Vitest and React Testing Library test catalog filtering, request failures, and
  optimistic cart removal, checkout validation and errors, order placement,
  and theme switching. MSW intercepts API calls so component tests do not
  depend on a running backend.
- Playwright runs a mocked browser journey covering product discovery, login,
  adding an item, and checkout. Local E2E runs open Chromium in headed mode,
  slow browser actions so UI changes are visible, and run one test at a time.
  The suite is organized into two E2E files:
  `e2e/login.spec.ts` covers login, and `e2e/pages.spec.ts` covers the storefront
  and other application pages. CI stays headless and can run tests in parallel.
- The `Frontend CI` workflow runs type-checking, component tests, a production
  build, and Chromium E2E tests for frontend changes.

From `FRONTEND`, run:

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` opens a visible Chromium window locally while the terminal
reports test progress. Use `npx playwright test --ui` for Playwright's
interactive test explorer, or `npx playwright test --debug` to step through a
test with the Playwright Inspector.

### Dependency audit

The current full `npm audit` reports advisories in Tailwind CSS 3 and its
build-time dependencies; `npm audit --omit=dev` reports no production
vulnerabilities. The available automatic remediation upgrades Tailwind to v4,
which is a major CSS/tooling migration, so keep Tailwind 3 until that migration
can be separately verified. Recheck both commands after dependency updates.

## State and data architecture

- **React Context** is a good fit for small, low-frequency state that only needs
  to flow through a contained part of the component tree. The auth provider
  keeps the session-bootstrap lifecycle contained, while Zustand holds its
  state and actions.
- **Zustand** is used for the small, frequently-read global auth and cart
  snapshots. Components select only the state they need, without requiring
  Redux's action/reducer boilerplate.
- **Redux Toolkit** is a strong choice when an application needs extensive
  event tracing, middleware, strict action workflows, or a large team-wide
  convention. Those requirements do not justify its extra machinery here.
- **TanStack Query** owns remote data: products, product details, and the
  server-backed cart. It caches results, deduplicates requests, and invalidates
  stale data after writes; Zustand only holds the UI-facing auth/cart snapshot.

The storefront fetches products in 12-item pages and loads more as the user
scrolls (with a manual button fallback). The product endpoint accepts optional
`skip` and `limit` query parameters; requests without `limit` retain the
existing full-list response used by administration. Cart add/remove and admin
product edit/delete actions update the UI optimistically and roll back on API
errors. Route-level `React.lazy`/`Suspense`, memoized product cards, memoized
derived lists, and lazy product images reduce the initial payload and avoid
unnecessary rendering.

The first product image is eagerly loaded with high fetch priority, while
subsequent images remain lazy-loaded. The API preconnects to its configured
origin. Product images have WebP variants served to browsers that advertise
WebP support, with the original PNG retained as a fallback.

## API hardening and load testing

The API uses Redis-backed SlowAPI limits (120 requests/minute by default;
stricter per-route limits protect login, registration, token refresh, logout,
and product search). Limits are shared by API workers through `REDIS_URL`.
GZip compression is enabled for responses of at least 500 bytes. API responses
receive no-store caching and browser security headers; HSTS is set only for
HTTPS requests. Set `PRODUCTION=true` in `BACKEND/.env` to disable the
interactive OpenAPI docs in production. Configure `CORS_ORIGINS` to the exact
frontend origins used in deployment.

The Locust scenario exercises product browsing, product search, registration,
login, refresh, and logout. The authentication requests use invalid credentials
or a unique registration email per simulated user; they do not use real user
accounts. Expected 401/204 responses and HTTP 429 throttling responses are
reported separately from unexpected errors. Registration can create up to a
few test users before its per-IP limit is reached.

Run from `BACKEND` with the API, PostgreSQL, and Redis running:

```powershell
pip install locust
locust -f locustfile.py --host http://127.0.0.1:8000 --users 50 --spawn-rate 5 --run-time 2m --headless
```

All Locust users connecting from one host share the same client IP, so they
also share each route's rate limit. For the 2-minute, 50-user run, expect 429s
for the low-limit authentication and search routes; Locust reports these in
separate `[429 rate limited]` rows, not as unexpected failures. This load test
checks the configured decorated routes. The API-wide default limit is not
currently enforced on undecorated routes.

The Lighthouse workflow above targets the production build. Review the emitted
Vite chunk sizes in `npm run build` output and compare repeat audits against the
same production preview and device profile before and after changes.

## Performance audit

Lighthouse must be run against the **production preview**, not the Vite
development server. The development server sends unminified source modules,
React development builds, and HMR code; scores from `localhost:5173` do not
represent the optimized app and are expected to be much lower.

In PowerShell, start the optimized preview:

```powershell
cd FRONTEND
npm run build
npm run preview
```

Then, in another terminal, run Lighthouse against `http://127.0.0.1:4173/`:

```powershell
npx lighthouse http://127.0.0.1:4173/ --only-categories=performance
```

Keep the backend and product API available for a representative catalog run.
Scores vary by device profile and network conditions; the target is **90+**.
The initial product page defers subsequent product requests and page chunks,
preconnects to the API from the HTML, prioritizes its first image, and lazy-loads
remaining images.

Two repeat Lighthouse runs against the production preview with the catalog
connected scored **96/100** and **97/100**. The first product image was served
as WebP (about 12 KB instead of 198 KB); scores can vary with browser, device,
and network conditions. The LCP image itself is returned by the product API,
so its exact URL is not present in the initial HTML; eliminating that discovery
step entirely would require server-rendering or embedding product data into the
initial document.

## AI catalogue assistant

The AI assistant is a floating button shown to signed-in users; it opens a
chat panel without navigating away from the current page. It is separate from
the human support inbox at `/support`. The transcript is saved in
`sessionStorage`, restored across page reloads in the same browser tab, and
cleared on login and logout so it is not carried into another authentication
session.

Configure at least one provider key in `BACKEND/.env`:

```dotenv
GROQ_API_KEY=
GROQ_MODEL=qwen/qwen3.8-27b
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
```

Provider keys stay on the backend and must not be added to the frontend
environment. The floating assistant always tries Groq first and uses Gemini
as an automatic fallback if Groq fails before streaming starts. There is no
provider switch in the chat UI. If neither provider is configured or available,
the assistant reports the failure instead of silently returning an answer. The
default Groq model is `qwen/qwen3.8-27b`; Groq retired
`llama-3.3-70b-versatile` on August 16, 2026, and its initial replacement
`qwen/qwen3.6-27b` was retired on September 14, 2026. The provider badge shows
`Groq · active` by default and changes to `Gemini · fallback active` only when
Gemini handles a request. The API retrieves relevant active catalogue products
from ChromaDB and includes product citations with streamed answers over
Server-Sent Events. On first use, the embedding model may need to be downloaded;
ensure the backend has network access and writable storage at
`CHROMA_PERSIST_DIRECTORY` (defaults to `BACKEND/app/vector_store`).
Catalogue/category overview questions use up to 100 active product names and
descriptions directly from the database instead of waiting for a ChromaDB
similarity search. The product schema has no dedicated category field, so the
assistant infers categories only when they are evident from those records and
labels the context as a sample when more than 100 active products exist.
The assistant recognizes common category synonyms (such as mobile, phone, and
smartphone). Explicit price ranges and limits are also applied as exact
catalogue-price filters before products are passed to the model, so it can
recommend only products within the requested budget.

Install backend dependencies from `BACKEND` and restart the API after
configuring provider keys. If no provider is configured, the assistant reports
that configuration is missing rather than returning an ungrounded answer. The
first Chroma use may take longer while its embedding model is downloaded and
the product index is built; the downloaded model is cached for later use.

## Routes

| Frontend route | Purpose |
|---|---|
| `/` | Product listing |
| `/products/:id` | Product details |
| `/login` | Login |
| `/register` | Register |
| `/account` | Protected account page |
| `/cart` | Protected server-backed shopping cart |
| `/checkout` | Protected validated checkout |
| `/orders` | Protected order history |
| `/orders/:id` | Protected order details |
| `/admin/products` | Admin product management |
| `/admin/orders` | Admin order listing and management |
| `/support` | Protected customer support chat and admin conversation inbox |

The AI assistant does not have a separate route.

## Important

The backend and Redis must be running before using the cart or real-time
features. WebSocket authentication sends the access token as the first socket
message (not in the URL). The current WebSocket connection manager is
in-process, so run one FastAPI worker unless a shared cross-process pub/sub
adapter is added. If the browser shows a CORS or WebSocket-origin error, check
`CORS_ORIGINS` in `BACKEND/.env` and confirm both frontend URLs are listed.
