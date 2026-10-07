# ShopHub E-Commerce Frontend

React + TypeScript + Vite + Tailwind CSS + Axios + React Router.

## 1. Start the FastAPI backend

From the `BACKEND` folder:

```powershell
.\.venv\Scripts\activate
uvicorn app.main:app --reload
```

Backend: `http://127.0.0.1:8000`

## 2. Start the frontend

Open another terminal:

```powershell
cd FRONTEND
npm install
copy .env.example .env
npm run dev
```

Frontend: `http://localhost:5173`

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
- Refresh-token interceptor using `POST /api/auth/refresh`
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
  all orders and cancel confirmed orders.
- The admin area supports product creation, editing, image upload, deletion,
  and order management against the FastAPI admin endpoints.
- The navigation theme control switches between light and dark modes and
  remembers the user's choice in local storage.
- TanStack Query coordinates catalog, admin product, cart, and order data with
  cache invalidation after mutations.

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
  The suite is organized into exactly two E2E files with 10 tests each:
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

## Important

The backend must be running before opening the frontend. If the browser shows a CORS error, verify that `app/main.py` contains the CORS middleware added for `http://localhost:5173`.
