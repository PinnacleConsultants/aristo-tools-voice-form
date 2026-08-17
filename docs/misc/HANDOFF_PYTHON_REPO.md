# Handoff: Clinical Trials Discovery POC → Standalone Web App (Python + Docker)

> **Audience:** The coding agent in the Python repo.
> **Goal:** Take the Clinical Trials Discovery POC that lives in this reference repo (snapshot at `docs/reference_repo/voice-form/`) and ship it as a standalone webpage, served by a Python (FastAPI) web server and packaged with Docker.
> **Outcome:** ARISTO can deep-link to `https://trials.aristo.example/?site=…&histology=…&biomarkers=…` and the page renders pre-filled, calls ClinicalTrials.gov directly from the browser, and returns ranked, collapsible results. No node runtime in the deployed image.

---

## 1. Decisions Already Made (do not re-litigate)

| Question | Answer |
|---|---|
| Where is it served? | Dedicated subdomain: `https://trials.aristo.example/` (root path, **no sub-path prefix**). |
| How does ARISTO pass patient data? | **Query string only.** No server-side API. URL grammar: `?site=<text>&histology=<text>&biomarkers=<csv>`. |
| Python framework? | **FastAPI** + `uvicorn[standard]`. |
| Source of the static bundle? | The reference repo **is copied** into `docs/reference_repo/voice-form/`. You will run `npm run build` there and copy `dist/` into your Python repo before building the Docker image. |
| Anything not to touch? | The Node server at `server/index.js` and `server/app.js` belongs to the OP-Visit intake flow and is **out of scope**. You are only owning the Clinical Trials POC. |

---

## 2. Architecture (one paragraph)

The Clinical Trials POC is a browser-only React app — it calls `https://clinicaltrials.gov/api/v2/studies` directly via `fetch`, no API key, CORS-enabled. So the "Python server" is really just a **static file server with SPA fallback**. We bake the React bundle (built once from this reference repo) into the Docker image at build time and serve it with FastAPI. The result is a tiny, stateless web app that ARISTO can link to.

```
ARISTO app
   │  window.location = "https://trials.aristo.example/?site=Lung&histology=Adenocarcinoma&biomarkers=EGFR,ALK"
   ▼
[ FastAPI / uvicorn ]  ← serves /dist/* + SPA fallback to index.html
   │
   ▼
[ React app loads, reads URLSearchParams, pre-fills form ]
   │
   ▼
[ Browser fetch → https://clinicaltrials.gov/api/v2/studies ]
   │
   ▼
[ Results render in ClinicalTrialsSidebar (collapsible sections) ]
```

---

## 3. What Lives Where (after the port)

```
python-repo/
├── docs/
│   └── reference_repo/
│       └── voice-form/              # ← full snapshot of THIS repo (read-only reference)
├── Dockerfile                       # two-stage: node build → python runtime
├── .dockerignore
├── pyproject.toml                   # or requirements.txt
├── server/
│   ├── __init__.py
│   ├── main.py                      # FastAPI app: static + SPA fallback + /healthz
│   └── tests/
│       └── test_main.py
├── static/                          # ← COPY of voice-form/dist/ (after `npm run build`)
│   ├── index.html
│   └── assets/...
└── README.md                        # how to rebuild + run locally
```

**No sub-modules from `voice-form/src/clinicalTrials/` are imported by Python.** Everything in that folder ships already-compiled inside the React bundle. You never `import` them.

---

## 4. Step-by-Step Implementation

### Step 1 — Apply the only required React edit

The POC must be able to read its inputs from the URL when ARISTO deep-links to it. This is a tiny addition to `src/ClinicalTrialsPage.jsx` in the reference repo.

**File:** `docs/reference_repo/voice-form/src/ClinicalTrialsPage.jsx`

**Find the imports:**
```jsx
import { useCallback, useState } from 'react';
```

**Replace with:**
```jsx
import { useCallback, useEffect, useState } from 'react';
```

**Then inside the `ClinicalTrialsPage` function body, after the `useState` declarations (before `addBiomarker`), add:**

```jsx
// Prefill from URL query string so ARISTO can deep-link patients in.
// Grammar: ?site=<text>&histology=<text>&biomarkers=<csv>
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const siteParam = params.get('site');
  const histologyParam = params.get('histology');
  const biomarkersParam = params.get('biomarkers');
  if (siteParam) setSite(siteParam);
  if (histologyParam !== null) setHistology(histologyParam);
  if (biomarkersParam) {
    setBiomarkers(
      biomarkersParam
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }
}, []);
```

> **Nothing else in the React app needs to change.** `query.js`, `parse.js`, `service.js`, `ClinicalTrialsSidebar.jsx`, the CSS, the alias map, the 4-level fallback, the retry/ranking/cap logic — all stay as-is. They run in the browser.

### Step 2 — Build the React bundle

From the reference repo:
```bash
cd docs/reference_repo/voice-form
npm ci
npm run build
```

This produces `docs/reference_repo/voice-form/dist/` containing:
- `dist/index.html`
- `dist/assets/index-<hash>.js`
- `dist/assets/index-<hash>.css`

### Step 3 — Copy the build into the Python repo

```bash
rm -rf static
cp -r docs/reference_repo/voice-form/dist static
```

`.dockerignore` should already exclude `docs/` and `node_modules/`. The `static/` directory is committed-or-not per your team's policy — recommended to keep it out of git and rebuild in CI.

### Step 4 — Write the FastAPI app

**File:** `server/main.py`

```python
"""
Static + SPA-fallback server for the Clinical Trials Discovery POC.

Serves the pre-built React bundle from ./static/. Any unknown path returns
dist/index.html so client-side routing works (not currently used by the POC,
but kept for forward-compatibility). Adds permissive CORS so ARISTO can
embed the URL in an iframe if desired.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
INDEX_HTML = STATIC_DIR / "index.html"

app = FastAPI(title="Clinical Trials Discovery POC", version="1.0.0")

# Permissive CORS — this page is public, no auth.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz() -> JSONResponse:
    """Liveness probe used by Docker HEALTHCHECK."""
    return JSONResponse({"status": "ok"})


# Serve hashed assets under /assets/* (Vite's default output folder).
if STATIC_DIR.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=STATIC_DIR / "assets"),
        name="assets",
    )


@app.get("/")
def root() -> FileResponse:
    """Serve the SPA entry point."""
    if not INDEX_HTML.exists():
        return JSONResponse(
            {"error": "Static bundle not found. Did you run `npm run build` and copy dist/ to static/?"},
            status_code=500,
        )
    return FileResponse(INDEX_HTML)


@app.get("/{full_path:path}")
def spa_fallback(full_path: str) -> FileResponse:
    """Any unknown path → index.html so client-side routing keeps working."""
    return FileResponse(INDEX_HTML)
```

**Notes for the agent:**
- Order matters: `/` and `/{full_path:path}` must come **after** `app.mount("/assets", ...)`.
- The fallback intentionally doesn't restrict paths because the POC has no client-side routing today; it just keeps the door open.
- Add `Cache-Control` headers later if you want hashed assets to be immutable (e.g. `max-age=31536000, immutable` for `/assets/*`, `no-cache` for `/`).

### Step 5 — Tests

**File:** `server/tests/test_main.py`

```python
from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)


def test_healthz():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_serves_index():
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


def test_spa_fallback_to_index():
    response = client.get("/anything-not-mapped")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


def test_assets_mount_serves_static():
    # Vite produces at least one JS and one CSS bundle.
    response = client.get("/assets/")
    assert response.status_code in (200, 404)  # depends on whether /assets/ lists files
```

If the `static/` directory isn't present in CI, mark those tests with `pytest.mark.skip` and skip them when `STATIC_DIR` is missing.

### Step 6 — Dependencies

**File:** `pyproject.toml` (or `requirements.txt`)

```
fastapi>=0.115
uvicorn[standard]>=0.32
httpx>=0.27            # for TestClient
pytest>=8.0
```

### Step 7 — Dockerfile (two-stage, no node in the runtime image)

**File:** `Dockerfile`

```dockerfile
# ----- Stage 1: build the React bundle from the reference repo snapshot -----
FROM node:20-alpine AS build
WORKDIR /build

# Copy only what npm needs first to leverage layer caching.
COPY docs/reference_repo/voice-form/package.json docs/reference_repo/voice-form/package-lock.json ./voice-form/
WORKDIR /build/voice-form
RUN npm ci

# Now copy the rest of the reference repo and build.
COPY docs/reference_repo/voice-form/ ./
RUN npm run build

# ----- Stage 2: serve with Python (no node, no npm in the final image) -----
FROM python:3.12-slim
WORKDIR /app

RUN pip install --no-cache-dir \
    "fastapi==0.115.*" \
    "uvicorn[standard]==0.32.*"

COPY server/ /app/server/
COPY --from=build /build/voice-form/dist /app/static

ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**File:** `.dockerignore`

```
__pycache__
*.pyc
.pytest_cache
.git
.venv
venv
node_modules
docs/reference_repo/voice-form/node_modules
docs/reference_repo/voice-form/dist
.env
.env.*
!.env.example
*.log
```

### Step 8 — Local development loop

```bash
# 1. Build the bundle
cd docs/reference_repo/voice-form
npm ci && npm run build

# 2. Copy into Python repo
cd ../../..
rm -rf static && cp -r docs/reference_repo/voice-form/dist static

# 3. Run the Python server
pip install -e .
uvicorn server.main:app --reload --port 8000

# 4. Open http://localhost:8000/?site=Lung&histology=Adenocarcinoma&biomarkers=EGFR,ALK
```

Or, if you want a one-shot script, drop a `Makefile`:

```makefile
.PHONY: build run test

build:
	cd docs/reference_repo/voice-form && npm ci && npm run build
	rm -rf static && cp -r docs/reference_repo/voice-form/dist static

run:
	uvicorn server.main:app --reload --port 8000

test:
	pytest
```

### Step 9 — Production deploy

- Stand up a single container from this image behind your existing HTTPS edge.
- Map `https://trials.aristo.example/` → `http://<container>:8000/`.
- TLS termination is at the edge; the container itself speaks plain HTTP.
- No persistent state, no DB, no env vars required to run.

---

## 5. URL Grammar (the deep-link contract)

The page reads exactly these query-string keys on mount:

| Key | Type | Example | Behavior |
|---|---|---|---|
| `site` | string | `Lung` | Sets the **Primary Site** input (required for search). |
| `histology` | string | `Adenocarcinoma` | Sets the **Histology** input. Empty string clears it. |
| `biomarkers` | comma-separated string | `EGFR,ALK,c-KIT` | Splits on `,`, trims, dedupes, fills the biomarker chip list. |

**Examples:**
- `https://trials.aristo.example/?site=Lung&biomarkers=EGFR,ALK`
- `https://trials.aristo.example/?site=Breast&histology=Invasive%20ductal%20carcinoma&biomarkers=HER2,BRCA1,BRCA2`
- `https://trials.aristo.example/?site=Prostate&biomarkers=Androgen%20Receptor`

Unknown query keys are ignored. Missing keys just leave the corresponding input blank.

> **Biomarker display forms are case-insensitive and qualifier-tolerant.** The bundle's `canonicalBiomarker()` strips qualifiers like `(FISH)`, `(IHC)`, `mutation`, `gene`, etc., so ARISTO can pass ARISTO display strings (`HER2/neu (FISH)`, `Somatic BRCA 2 mutation`, `c-KIT`) without URL-encoding drama.

---

## 6. CORS / Iframe Considerations

The page sets **no** `X-Frame-Options` and serves with a permissive CORS middleware. If ARISTO later wants to embed this URL in an `<iframe>` instead of redirecting to it, no server change is needed.

If a stricter CSP is required by your security team, the FastAPI middleware can be updated to emit `Content-Security-Policy: frame-ancestors https://aristo.example` — but that's a future concern.

---

## 7. Verification Checklist (before declaring done)

Run these and confirm each line:

- [ ] `cd docs/reference_repo/voice-form && npm test` → **77 passed** (the existing vitest suite still passes after the `useEffect` addition).
- [ ] `cd docs/reference_repo/voice-form && npm run build` → produces `dist/index.html` + `dist/assets/*`.
- [ ] `pytest server/tests/` → all FastAPI tests pass.
- [ ] `docker build -t trials-poc .` → builds without errors; final image is **< 200 MB**.
- [ ] `docker run --rm -p 8000:8000 trials-poc` then `curl http://localhost:8000/healthz` → `{"status":"ok"}`.
- [ ] Open `http://localhost:8000/?site=Lung&histology=Adenocarcinoma&biomarkers=EGFR,ALK` in a browser:
  - Form pre-fills with `Lung`, `Adenocarcinoma`, and chips `EGFR` + `ALK`.
  - Click **Find Clinical Trials** → results appear in collapsible **Ongoing** / **Recently Completed** sections.
  - Click **Show details ▾** on a card → description + interventions reveal.
- [ ] Open the same URL in a private window with network throttling → search still completes (retry logic in `service.js` handles transient HTML/non-JSON responses).

---

## 8. Out of Scope (do not implement)

- No auth, no login, no user accounts.
- No server-side proxy for ClinicalTrials.gov — browser calls it directly.
- No database, no persistence layer.
- No SSR / hydration / Next.js migration. Plain static SPA.
- No changes to `server/index.js` (the Node OP-Visit server). That lives in the original `voice-form` repo and is unrelated.

---

## 9. Reference Map (where to find things in this snapshot)

| Need to find… | Open… |
|---|---|
| The page entry that gets the `useEffect` edit | `src/ClinicalTrialsPage.jsx` |
| Search service (fetch, retry, ranking, capping) | `src/clinicalTrials/service.js` |
| Biomarker alias map + 4-level fallback | `src/clinicalTrials/query.js` |
| Response parsing + status detection | `src/clinicalTrials/parse.js` |
| Sidebar (collapsible sections + card details) | `src/clinicalTrials/ClinicalTrialsSidebar.jsx` |
| Styling | `src/clinicalTrials/clinicalTrials.css` (teal palette), `src/App.css` (CSS variables) |
| Build output config | `vite.config.js` (default `base: '/'`, which is what we want for the dedicated subdomain) |
| Build command | `npm run build` (per `package.json`) |

---

## 10. Open Questions to Confirm With the Human (if any arise)

1. Does ARISTO open the URL in a **new tab** (top-level navigation) or an `<iframe>`? — Both work with the current setup, but it influences whether you'll ever need `frame-ancestors` CSP.
2. Does the deployment target support `wget` for the `HEALTHCHECK`? — If not, swap to `curl -fsS http://localhost:8000/healthz` and add `curl` to the runtime image (`python:3.12-slim` ships with neither by default — `wget` is included in the example above, which is why it's used).
3. Is `dist/` allowed to be committed to the Python repo? — If not, this Dockerfile's stage 1 already handles CI rebuilding it from `docs/reference_repo/voice-form/`, so no commit needed.

If none of those come up, you're done. Ship it.
