# DialFactory Phase 2-B · Production Deployment Plan

> **状态：** Plan
> **日期：** 2026-08-06

---

## 1. Deployment Options Evaluation

| Criteria | GitHub Pages | Vercel | Netlify |
|----------|:-----------:|:------:|:-------:|
| **Cost** | Free | Free | Free |
| **Build step required** | No | No | No |
| **HTTPS** | Yes | Yes | Yes |
| **Custom domain** | Yes | Yes | Yes |
| **SPA support** | 404.html workaround | Native | `_redirects` file |
| **Deploy method** | `git push` | `git push` | `git push` |
| **Vanilla HTML/CSS/JS** | ✅ Native | ✅ | ✅ |
| **Supabase external backend** | ✅ | ✅ | ✅ |
| **Learning curve** | Minimal | Low | Low |
| **V1 Complexity match** | ✅ Perfect fit | Overqualified | Overqualified |

---

## 2. Recommendation: GitHub Pages

```
Selected: GitHub Pages

Reasoning:
1. Zero configuration — push HTML/CSS/JS, site is live
2. Native SPA support via 404.html redirect for hash-based routing
3. No build step — matches V1 architecture exactly
4. Free HTTPS — required for Supabase secure connection
5. No additional platform to learn
```

---

## 3. Deployment Steps

### Step 1: Initialize Git (if not already)

```bash
cd DialFactory
git init
git add .
git commit -m "DialFactory V1.0 — Initial release

Phase 1 Complete:
- 8 Tables · 6 Pages · 0 CASCADE
- Supabase backend (wzfkmwrqnvjegunjueka)
- Vanilla HTML/CSS/JS SPA"

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Step 2: Create GitHub Repository

```
1. github.com → New Repository
2. Name: dialfactory
3. Public
4. Do NOT initialize with README (we have existing files)
```

### Step 3: Push

```bash
git remote add origin https://github.com/<username>/dialfactory.git
git branch -M main
git push -u origin main
```

### Step 4: Enable GitHub Pages

```
1. Repository → Settings → Pages
2. Source: Deploy from a branch
3. Branch: main · / (root)
4. Save
5. Wait ~1 minute for deployment
6. URL: https://<username>.github.io/dialfactory/
```

### Step 5: SPA Routing (Hash-based — no extra config needed)

V1 uses hash-based routing (`#/orders`, `#/routes`). Hash routing works natively with GitHub Pages — no 404.html workaround needed for navigation. Only the initial `index.html` load goes through the server; all subsequent navigation is client-side.

### Step 6: Verify

```
1. Open https://<username>.github.io/dialfactory/
2. Check: Nav bar renders
3. Check: P5 Route List loads demo data
4. Check: P3 Order Create form works
5. Check: Supabase connection (Console: "DB connected")
```

---

## 4. Environment Variables

| Variable | Location | Exposure |
|----------|----------|:--------:|
| `SUPABASE_URL` | `js/config.js` | Public (by design) |
| `SUPABASE_ANON_KEY` | `js/config.js` | Public (by design) |
| `SUPABASE_SERVICE_KEY` | Not in codebase | **Never exposed** |

**Supabase Key Protection:**
- Anon key is designed to be public — it's rate-limited and RLS-gated
- Service key (full database access) is never in the frontend code
- RLS is the security boundary, not API key secrecy
- See: [Supabase Docs — API Keys](https://supabase.com/docs/guides/api/api-keys)

---

## 5. Rollback Method

```
Option A (Recommended): git revert
  git revert <deploy-commit-hash>
  git push
  → GitHub Pages auto-deploys previous version

Option B: Re-deploy from tag
  git checkout v1.0
  git push -f
  → Force-push previous version

Option C: Disable Pages
  Settings → Pages → Source: None
  → Site goes offline
```

---

## 6. `.gitignore`

```gitignore
node_modules/
.DS_Store
*.log
.env
supabase/.temp/
```

---

## 7. Post-Deployment

| Task | Owner |
|------|:-----:|
| Verify all 6 routes at production URL | Tester |
| Run demo scenario (§26) | Tester |
| Share URL with factory for feedback | PM |
| Monitor Supabase dashboard for errors | Developer |

---

> **Deployment method selected. Ready for git init + push + Pages enable.**
