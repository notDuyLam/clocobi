# Clocobi — CLAUDE.md

Web app: the user registers clothes from photos, views them by category, and generates outfits per occasion with AI. MVP, single user (the developer). Free tiers only, no paid billing.

Source of truth (read before changing behaviour):
- Software Requirements Specification (SRS) v0.7: what the app does (FR-xxx, NFR-xxx)
- Technical Design Document (TDD) v0.12: stack, infrastructure, AI and image design
- Database Design Document (DB) v0.6: tables, rules R1 to R10, decisions D1 to D9
- API Design Document (API) v0.7: endpoints, errors, decisions AD1 to AD12

Current build plan and status: [memory/project-status.md](memory/project-status.md). Documents live in `E:/Hoc/duylaam-nexus/Project/Clocobi` (separate repo, owner commits).

If code and these documents disagree, stop and ask. Do not silently change a contract. If a change is approved, update the affected document and its version table in the same piece of work.

---

## 1. Working rules (for Claude)

- The user makes all decisions and runs the code. You write most of the code and review technical choices.
- Never assume requirements, versions, or intent. If missing information changes the result, ask first. Do not ask about trivial details.
- State uncertainty explicitly. Separate verified fact, recommendation, and opinion. Never invent APIs, flags, or libraries.
- Before recommending a new library: check it is actively maintained and check its latest stable version. If you cannot verify, say your information may be outdated.
- No praise or validation. If the user is wrong or a plan has a flaw, say so directly, ordered by severity (blocking, should fix, optional). If the user decides against your recommendation, implement their decision properly.
- Code: complete and working (imports, types, error handling, config). State the file path and whether the file is new or changed. List dependencies with exact versions and install commands. Add tests for non-trivial logic. End with how to run or verify, and known limitations.
- Keep answers short and in simple language, with an example when explaining. Go into detail only when asked.
- Do not over-engineer. This is a single-user MVP.

---

## 2. Stack and repository

| Layer | Choice |
| --- | --- |
| Monorepo | npm workspaces: `apps/web` (Next.js), `apps/api` (NestJS). Commit `package-lock.json`. |
| Frontend | Next.js 16.4.3 + React 19.3 + TypeScript |
| Backend | NestJS 12.0.x + TypeScript, ES module (`"type": "module"`) |
| Database | PostgreSQL on Neon, free plan (1 GB, 100 compute-hours/month, 10 branches, scale-to-zero after 5 min idle). Branches: `main` (deployed, default), `dev` (local, in `apps/api/.env`) |
| ORM | Prisma 7.10.x + `@prisma/adapter-neon` |
| Auth | JWT HS256 (email + password), argon2id hashes |
| Image storage | Cloudinary, free plan (25 credits/month) |
| Text and vision AI | Gemini API (REST via `fetch`, no SDK), free tier, rotation over several keys |
| Outfit image generation | Cloudflare Workers AI `@cf/black-forest-labs/flux-2-klein-9b`, free allowance 10,000 neurons/day |
| Background removal | `@imgly/background-removal` (1.7.0), in the browser |
| Hosting | Vercel Hobby (both Next.js and NestJS), personal use only |

- Node: v24.22.2 LTS (npm 11.19.1). Node 26 is also LTS but not used: Vercel support unverified. Unverified: Vercel support for Node 24 and how Vercel runs NestJS (deployment spike, TDD open item 8). Install dependencies with `npm ci` so the lockfile is not rewritten.
- Install latest stable versions. Verify before relying on any version number in this file.
- Tooling (TDD 3): Vitest in both apps (AI/Cloudflare mocked), oxlint (api), ESLint Next config (web), Prettier at the root (single quotes, trailing commas), Conventional Commits, no CI.
- Backend libraries (TDD 3): `zod` (validation via `ZodPipe`), `jose` (JWT), `@node-rs/argon2` (argon2id). Global `AuthGuard`; open routes use `@Public()`.

### Prisma 7 notes
- Connection URLs live in `prisma.config.ts`, not in `schema.prisma`. Driver adapter `@prisma/adapter-neon`. Generator `prisma-client`.
- `DATABASE_URL` (pooled) for the app, `DIRECT_URL` for migrations.
- Migrations: `prisma migrate dev` on the Neon `dev` branch; apply to `main` by hand with `prisma migrate deploy` before pushing. Never in the Vercel build.
- Client generated at build time; `apps/api/src/generated/` is git-ignored (`postinstall` and `build` run `prisma generate`).
- Physical names = DB document names (no `@map`). Ids: Prisma `uuid()`.

### Environment variables (TDD 10)
api: `DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `GEMINI_API_KEYS` (comma-separated), `GEMINI_MODEL_TAG`, `GEMINI_MODEL_RANK`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_IMAGE_MODEL`, `CF_IMAGE_WIDTH`, `CF_IMAGE_HEIGHT`, `DEBUG_ENDPOINTS`, `SEED_PASSWORD` (seed only). web: `BACKEND_URL`. Tuning values (timeouts, sample size 200, accessory cap 2, tips limits) are code constants.

### Proxy
Next.js rewrites `/api/:path*` to `${BACKEND_URL}/:path*`. The frontend always calls `/api/...`. Backend routes have no `/api` prefix. Single origin, so the refresh cookie can be `SameSite=Strict`.

---

## 3. Hard constraints

1. Vercel rejects function request bodies over 4.5 MB (HTTP 413). Photos never pass through NestJS (NFR-007). The browser uploads to Cloudinary directly with a signed upload.
2. NestJS runs serverless on Vercel: no background workers, no in-process cron, no queues. Each AI action finishes inside one request (NFR-004, AD8).
3. Hobby function duration: 300 s with Fluid Compute (verify it is enabled in Project Settings → Functions). Whether the Next.js proxy adds its own limit is unverified: test with `GET /debug/slow?seconds=40` (TDD open item 8). Remove that endpoint afterwards.
4. Free tiers only. Gemini free tier has no image generation. Cloudflare image generation costs about 1,400 to 1,500 neurons per image (about 6 to 7 images per day).
5. Every user-data query filters by `userId` (NFR-006). Another user's id returns `404 NOT_FOUND`, the same as a missing id. `OutfitItem` has no `userId` and is always reached through its `Outfit` (DB D2).
6. Secrets (Cloudflare token, Gemini keys, JWT secrets, Cloudinary API secret) live only in server environment variables. Never in the frontend or the repository.
7. UI and AI output are English. Units are metric (cm, kg).
8. Licences (`@imgly/background-removal` AGPL, Black Forest Labs terms) are accepted for the personal MVP only. Review before anyone else uses the app (NFR-012).

---

## 4. Domain model

Entities: `User`, `StyleProfile`, `Item`, `Occasion`, `Outfit`, `OutfitItem`.

- IDs: UUID v4. Timestamps: UTC; `createdAt` + `updatedAt` on every table except `OutfitItem` (none). Optional text is `NULL` when empty, never `""`. The backend trims strings and converts empty strings to `null`.
- `ItemCategory` enum: `TOP`, `BOTTOM`, `OUTERWEAR`, `ONE_PIECE`, `SHOES`, `ACCESSORY` (also used by `OutfitItem.slot`).
- `ItemStatus` enum: `DRAFT`, `COMPLETE`.
- All other attributes (pattern, fit, formality, colors, seasons) are `text` / `text[]` validated by the application, not DB enums (DB D3).
- Item stores `originalPublicId` (required) and `cleanPublicId` (nullable). Outfit stores `imagePublicId` (nullable). Only `public_id` values are stored. API responses return full Cloudinary URLs.
- `comboKey` on Outfit: SHA-256 hex of the sorted IDs of the required items (`TOP`+`BOTTOM`+`SHOES`, or `ONE_PIECE`+`SHOES`), joined with a comma. Unique with `occasionId`. Optional items are not part of it.
- "Incomplete" outfit is derived, not stored (DB D1): at least one `OutfitItem` with `itemId` NULL and slot not `OUTERWEAR`/`ACCESSORY`. A deleted optional item does not make an outfit incomplete.

### Delete behaviour
| Delete | Effect |
| --- | --- |
| User | Cascade to all its data |
| Occasion | Cascade to its outfits and their `OutfitItem` rows |
| Outfit | Cascade to its `OutfitItem` rows |
| Item | `OutfitItem.itemId` set to `NULL`; slot is kept |

After the DB delete, the backend deletes Cloudinary files best-effort (AD2). Failures are logged, never shown to the user.

### Indexes
- `Item(userId, status, category)`, `Item(userId, liked)`, unique `Item(originalPublicId)`, unique `Item(cleanPublicId)`
- `Occasion(userId)`
- unique `Outfit(occasionId, comboKey)`, `Outfit(occasionId, createdAt)`, `Outfit(userId, liked)`
- `OutfitItem(outfitId)`, `OutfitItem(itemId)`
- unique `StyleProfile(userId)`, unique `User(email)`

---

## 5. Business rules

| Rule | Statement | Enforced at |
| --- | --- | --- |
| R1 | `COMPLETE` item has `category`, `primaryColor`, `pattern`, `fabric`, `fit`, `formality`, and at least one `seasons` value. A `DRAFT` may leave them empty. | `POST /items`, `PATCH /items/:id` |
| R2 | Drafts are never used in outfits. | Candidate query: `status = COMPLETE` |
| R3 | Valid outfit: (`TOP` + `BOTTOM`) or `ONE_PIECE`, plus `SHOES`. At most one `OUTERWEAR`; at most 2 `ACCESSORY` (configurable, DB D9). | Candidate builder, generate step 8 |
| R4 | Every item id in an AI response must be in the candidate list; outerwear and accessory ids must be in that combination's allowed options. | Generate step 8 |
| R5 | No outfit image generation for incomplete outfits. An image made before the outfit became incomplete is kept and shown with the "incomplete" label. | Image step 1 |
| R6 | Profile minimum fields exist before generation. | DB NOT NULL + no row = incomplete |
| R7 | One profile per user. | DB unique `userId` |
| R8 | No repeated core combination per occasion. | Generate steps 5 and 9, DB unique |
| R9 | Outerwear and accessories allowed only if their `seasons` overlap the `seasons` of every required item. Applies at generation time only (API open issue 2). | Candidate builder |
| R10 | AI suggests outerwear by default when the occasion is outside and an option exists. | `rankOutfits` prompt |

---

## 6. Value lists (fixed, served by `GET /meta`)

| List | Values |
| --- | --- |
| seasons | `hot`, `mild`, `cold` |
| formality | `casual`, `smart casual`, `business`, `formal` |
| fit | `slim`, `regular`, `loose` |
| pattern | `solid`, `striped`, `checked`, `printed`, `other` |
| colors (16) | `black`, `white`, `gray`, `beige`, `brown`, `navy`, `blue`, `green`, `olive`, `red`, `burgundy`, `pink`, `orange`, `yellow`, `purple`, `cream` |
| clothingCategory | `Menswear`, `Womenswear`, `Unisex` |
| build | `Slim`, `Average`, `Broad` |
| skinUndertone | `Warm`, `Cool`, `Neutral` |
| fitPreference | `Loose`, `Regular`, `Slim` |

Free text, lowercased by the backend (not rejected): `subcategory` and `fabric` (up to 40 characters), `preferredStyles` (up to 10 values, each up to 30). Arrays have no repeats: a repeat (checked after lowercasing) returns `400 VALIDATION_FAILED`, it is not removed silently. List values must match exactly, including case (`Menswear`, not `menswear`). Single source: backend constants served by `GET /meta`. The frontend forms, the validation, and the AI prompt must all use the same lists.

Field limits: `stylingTips` 600, `aiNote` 300, `size` 20, `brand` 60, `notes` 500. Occasion `name` 1 to 60, `description` 1 to 300. Profile: `heightCm` integer 50 to 250, `weightKg` 20 to 300, `climate` up to 100, `freeNotes` up to 500.

---

## 7. API summary

Format: JSON, camelCase. No pagination in the MVP. Auth: `Authorization: Bearer <accessToken>` on everything except `POST /auth/login`, `POST /auth/refresh`, `GET /health/db` and `GET /debug/slow`. A non-UUID id in a path → `404 NOT_FOUND`. No CORS on the backend.

Tokens: access JWT 15 min (`expiresIn` in seconds). Frontend keeps it in memory only, calls refresh on page load, shares one refresh between parallel 401s. Refresh JWT 7 days in cookie `refresh_token` (`httpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`), a new cookie on each refresh. Stateless, logout only clears the cookie (AD1). No register endpoint; the account (`admin@email.com`) is created by the seed script (`npm run seed` in `apps/api`). The password comes from `SEED_PASSWORD` when the seed runs, never committed; re-running the seed resets it.

Error body for every non-2xx:
```json
{ "error": { "code": "MISSING_SLOTS", "message": "No shoes in your wardrobe.", "details": { "missing": ["SHOES"] } } }
```

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` (204) |
| Profile | `GET /profile` (404 `PROFILE_NOT_FOUND`), `PUT /profile` (full replace) |
| Uploads | `POST /uploads/sign` body `purpose`: `ITEM_ORIGINAL` or `ITEM_CLEAN`. Returns `{ uploadUrl, cloudName, apiKey, timestamp, publicId, signature }`. `publicId` is `clocobi/{userId}/items/original/{uuid}` or `.../items/clean/{uuid}`; signature covers `public_id` + `timestamp` |
| Items | `POST /items/analyze`, `POST /items`, `GET /items`, `GET /items/summary`, `GET /items/:id`, `PATCH /items/:id`, `DELETE /items/:id` |
| Occasions | `GET /occasions`, `POST /occasions`, `PATCH /occasions/:id`, `DELETE /occasions/:id` |
| Outfits | `POST /occasions/:id/outfits/generate`, `GET /occasions/:id/outfits`, `GET /outfits?liked=true`, `GET /outfits/:id`, `PATCH /outfits/:id` (`{ liked }`), `DELETE /outfits/:id`, `DELETE /outfits/:id/items/:outfitItemId`, `POST /outfits/:id/image` |
| Meta / dev | `GET /meta`, `GET /health/db` (no auth; `200 { ok: true }` after `SELECT 1`, AD12), `GET /debug/slow?seconds=40` (no auth; `404` unless `DEBUG_ENDPOINTS=true`; `seconds` 1 to 290; temporary, AD11) |

Item endpoint details:
- `POST /items/analyze`: body `originalPublicId`. Downloads the photo, calls `tagClothing`. Saves nothing. Returns `{ proposed }`. A value outside the lists becomes `null`, not an error. Photo not found in Cloudinary → `400 INVALID_PUBLIC_ID`.
- `POST /items`: `originalPublicId` required; `cleanPublicId`, `status` (default `COMPLETE`), attributes, `liked`. Returns `201`.
- `GET /items`: query `status` (`COMPLETE` default or `DRAFT`), `category`, `liked=true`. With `liked=true` and no `status`, both statuses are returned; the frontend marks drafts. Newest first. Returns `{ items }`.
- `GET /items/summary`: `{ counts, drafts, liked }`. `counts` has all 6 categories (0 if empty) and counts `COMPLETE` only. `liked` counts both statuses.
- `PATCH /items/:id`: partial. Only `DRAFT` → `COMPLETE` status change is allowed (else `409 INVALID_STATUS_CHANGE`). Category change while the item is in any outfit → `409 ITEM_IN_USE`. Replacing `cleanPublicId` deletes the old file best-effort. `originalPublicId` cannot change.
- `originalPublicId` must start with `clocobi/{userId}/items/original/`, `cleanPublicId` with `clocobi/{userId}/items/clean/`, else `400 INVALID_PUBLIC_ID`. A public ID used by another item (unique, P2002) → `400 INVALID_PUBLIC_ID`. File existence is not checked on save.
- Completing a draft is a status change; the item keeps its id and photo (DB D6).

Other shape rules:
- Item response: `originalUrl`, `cleanUrl` (null if background removal failed; the frontend then shows `originalUrl`). ItemSummary (inside outfits): `id`, `category`, `subcategory`, `primaryColor`, `originalUrl`, `cleanUrl`.
- Outfit response: `id`, `occasionId`, `occasionName`, `stylingTips`, `liked`, `imageUrl` (null = show collage; may be set on an incomplete outfit), `isIncomplete` (derived), `createdAt`, `updatedAt`, `items[]` (ordered `TOP`, `BOTTOM`, `ONE_PIECE`, `OUTERWEAR`, `SHOES`, `ACCESSORY`). OutfitItem: `id`, `slot`, `optional` (true for `OUTERWEAR`, `ACCESSORY`), `item` (ItemSummary or `null` if deleted; slot kept).
- Occasion response: `id`, `name`, `description`, `outfitCount`, `createdAt`, `updatedAt`. Names need not be unique (AD5). `DELETE /occasions/:id` cascades; the frontend confirms first using `outfitCount`.
- Likes are `PATCH` fields. No like/unlike endpoints (AD6).
- Display URLs carry no Cloudinary transformations (saves credits). Only AI reference images use a size-limiting transformation.

### Error codes
| HTTP | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | Bad body or query; `details` lists fields |
| 400 | `INVALID_PUBLIC_ID` | `public_id` outside the user's folder for its purpose, used by another item, or (analysis) not found |
| 401 | `UNAUTHENTICATED` | Missing, invalid, or expired token or cookie |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 404 | `NOT_FOUND` | Missing, owned by someone else, not a UUID, or unknown route |
| 404 | `PROFILE_NOT_FOUND` | No profile yet |
| 409 | `ITEM_IN_USE` | Category change on an item in an outfit |
| 409 | `REQUIRED_ITEM` | Removing a required slot from an outfit |
| 409 | `OUTFIT_INCOMPLETE` | Image requested for an incomplete outfit |
| 409 | `INVALID_STATUS_CHANGE` | `COMPLETE` → `DRAFT` |
| 422 | `PROFILE_REQUIRED` | Generating without a profile |
| 422 | `MISSING_SLOTS` | Wardrobe cannot form a valid outfit |
| 422 | `IMAGE_REJECTED` | Image content filter (code 8007) |
| 500 | `INTERNAL_ERROR` | Any unexpected failure (generic message, cause only logged) |
| 502 | `AI_FAILED` | Gemini error other than 429 (other keys not tried) or unusable response |
| 503 | `AI_QUOTA_EXHAUSTED` | All Gemini keys returned 429 |
| 504 | `AI_TIMEOUT` | Gemini exceeded the configured timeout |
| 502 | `IMAGE_FAILED` | Cloudflare error |
| 503 | `IMAGE_QUOTA_EXHAUSTED` | Daily Cloudflare allowance used |
| 504 | `IMAGE_TIMEOUT` | Image service too slow |

`message` is English and safe to show. `details` is optional.

---

## 8. Core flows

### 8.1 Add item (FR-020 to FR-025)
1. Browser: pick photo (camera or file), resize (longest edge 1600 px, JPEG 0.85, never enlarge), `POST /uploads/sign` (`ITEM_ORIGINAL`), upload to Cloudinary.
2. In parallel: (a) `POST /items/analyze`; (b) remove background (`@imgly/background-removal`), `POST /uploads/sign` (`ITEM_CLEAN`, PNG, same size), upload. (b) runs whether (a) succeeds or fails. If removal fails, the item is saved without a clean image; retry later from item details via `PATCH` with `cleanPublicId`.
3. Analysis OK → pre-filled form. Analysis `502/503/504` → empty form with a message.
4. User reviews and edits (size, brand, notes are user-entered). Save waits for step 2(b) to finish.
5. Nothing is saved until the user taps. "Save" needs R1 fields → `POST /items` `COMPLETE`. On the failure path, "Save as draft" → `POST /items` `DRAFT` (NFR-005, AD7). Leaving before saving leaves orphan uploads (accepted, AD2).

### 8.2 Generate outfits (`POST /occasions/:id/outfits/generate`)
1. No profile row → `422 PROFILE_REQUIRED`.
2. Load the user's `COMPLETE` items only.
3. No valid outfit possible → `422 MISSING_SLOTS` with `details.missing`. No `SHOES` → `SHOES`. With no `ONE_PIECE`: no `TOP` → `TOP`, no `BOTTOM` → `BOTTOM`.
4. Build all core combinations ((top + bottom, or one-piece) + shoes). For each, compute allowed outerwear and allowed accessories (seasons overlap with every required item, R9).
5. Remove combinations whose `comboKey` already exists for this occasion.
6. None left → `201 { outfits: [], notice: { code: "NO_NEW_COMBINATIONS" } }`.
7. `count` = min(3, left). More than 200 left → random sample of 200 (initial value, tune after testing). Send only items used by the sent candidates.
8. Call `rankOutfits`, then repair or drop (TDD 4.2, AD10): unknown candidate, duplicate, extra beyond `count`, or empty tips → drop the selection; outerwear/accessory id not in that candidate's options → remove just that id; keep ≤ 2 accessories; cut tips to 600. Nothing valid → `502 AI_FAILED`.
9. Insert each outfit in its own transaction. On Prisma `P2002` for (`occasionId`, `comboKey`), skip and continue.
10. Return `201 { outfits, notice }`. `notice` is `null` or `{ code, message }`: saved = `count` < 3 → `FEWER_THAN_REQUESTED` ("Only 2 valid outfits exist."); saved < `count` → `AI_RETURNED_FEWER` ("Only 1 new outfit was created. Generate again for more."). No automatic retry.

The AI never creates outfits. It selects the best 3 combinations, picks at most one outerwear and at most 2 accessories per outfit from the allowed options, and writes styling tips.

### 8.3 Outfit image (`POST /outfits/:id/image`)
1. Incomplete outfit → `409 OUTFIT_INCOMPLETE`. An existing image is kept when an outfit becomes incomplete.
2. Up to 4 references in order: top or one-piece, bottom, shoes, outerwear, then accessories while slots are free. Use `cleanUrl`, else `originalUrl`. Request each through a Cloudinary transformation limiting it to 500x500 (Cloudflare needs < 512x512). Remaining items are described in the prompt text.
3. Call `generateOutfitImage` (default 768 x 1024, random seed), upload the result to `clocobi/{userId}/outfits/{uuid}`, store the `public_id`.
4. On regeneration, delete the previous file best-effort. On any failure the previous image stays and the collage logic is unchanged.
5. Prompt: studio fashion photo, plain light background, "a man" / "a woman" / "a person" from `clothingCategory`, garments described by category, subcategory, colors, pattern, fabric. No body traits (height, weight, build, skin). The content filter rejected a fashion-model prompt on `flux-1-schnell`.
6. Errors: 8007 → `IMAGE_REJECTED`; daily allowance (assumed 429 or allowance message, shape unverified) → `IMAGE_QUOTA_EXHAUSTED`; timeout → `IMAGE_TIMEOUT`; else `IMAGE_FAILED`. Log the raw error, never return it.

Removing an optional item from an outfit does not regenerate the image (FR-057). The collage (FR-061) is built by the frontend from item URLs whenever `imageUrl` is null.

---

## 9. AI design

Two interfaces, so the provider can change without touching business logic (NFR-009):

```ts
interface TextAiProvider {
  tagClothing(image: { data: Buffer; mimeType: string }): Promise<ClothingTags>; // includes the AI note; caller downloads the photo
  rankOutfits(input: RankInput): Promise<RankedOutfit[]>;
}
// RankInput: occasion { name, description }, full profile, items (sent once), candidates
//   { id, requiredItemIds, outerwearOptionIds, accessoryOptionIds }, count, maxAccessories (2).
// RankedOutfit: { candidateId, outerwearId | null, accessoryIds, stylingTips }. Full shape: TDD 4.1.

interface ImageGenProvider {
  // at most 4 references, each smaller than 512x512
  generateOutfitImage(references: ImageRef[], prompt: string): Promise<GeneratedImage>;
}
```

Gemini (text and vision):
- REST `generateContent` via `fetch`, key in `x-goog-api-key`, JSON output with a response schema; still validate the parsed result. The item photo is downloaded from Cloudinary and sent inline.
- Models live in configuration. Chosen after a test (2026-11-01, TDD 4.1): `GEMINI_MODEL_TAG=gemini-3.5-flash-lite` (5/5 photos, about 3.5 s), `GEMINI_MODEL_RANK=gemini-3.6-flash` (best outfit choices, about 10 s). `gemini-3.8-flash` failed every call that day (503 or timeout). Per-model rate limits are not verified (see Google AI Studio).
- Key rotation across keys from separate Google Cloud projects (quota is per project). No stored state: each request starts at a random key. Only 429 moves to the next key. All keys 429 → `AI_QUOTA_EXHAUSTED`. Any other error (5xx, network, bad response) → `AI_FAILED` immediately; timeout → `AI_TIMEOUT`.
- Timeouts (configuration): `tagClothing` 30 s, `rankOutfits` 90 s, Cloudflare 60 s, each backend Cloudinary fetch or upload 15 s.
- Gemini is never used for images (free tier not available for image models).
- Free-tier prompts may be reviewed and used for training. Accepted for the single-user MVP.

Cloudflare Workers AI (images):
- Endpoint: `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}`, header `Authorization: Bearer {API_TOKEN}` (token needs `Workers AI - Read` and `Workers AI - Edit`).
- `flux-2-klein-9b`: multipart form data (use `fetch` + `FormData`, no SDK). Fields: `prompt`, `width`, `height` (256 to 1920), `seed`, `input_image_0` to `input_image_3`. `steps` fixed at 4. Output is a base64 string in `image`.
- Model name, width, and height are configuration. Allowance resets at 00:00 UTC. The exact quota error shape is unverified.
- Untested alternatives: `flux-2-klein-4b` (reference-image support unverified), `flux-2-dev`. Rejected: `flux-1-schnell` (no references, NSFW false positive).

---

## 10. Frontend rules

- Mobile-first responsive, also usable on desktop (NFR-002).
- Wardrobe: category tabs with counts from `GET /items/summary` (`COMPLETE` only). Separate Drafts section. Liked view.
- Show a loading state for every AI action and an error with a retry on failure or timeout (NFR-004). `generate` and `image` are not idempotent: each call uses quota, so do not auto-retry.
- Background removal downloads a model on first use (about 80 MB default, about 40 MB small). Show progress and handle failure (NFR-011).
- When `cleanUrl` is null, show `originalUrl`.
- Outfit view: show the "optional" tag for `OUTERWEAR`/`ACCESSORY`, an "incomplete" label from `isIncomplete`, and the "missing shoes" style message when `item` is `null`. No remove option for required slots.
- The refresh flow: on `401 UNAUTHENTICATED`, call `POST /auth/refresh` once, then retry the original request.
- Liked items view includes drafts, visibly marked (for example blurred or with a "Draft" badge).
- Outfit with `imageUrl` and `isIncomplete`: keep showing the image with the "incomplete" label; no "generate image" action.
- Generate notices: show `notice.message` for `FEWER_THAN_REQUESTED`, `AI_RETURNED_FEWER`, `NO_NEW_COMBINATIONS`.
- Screens follow the owner's wireframe (provided at implementation start).

---

## 11. Out of scope (do not build)

OAuth, password reset, email verification, account deletion, public registration, AI-generated item images, try-on with the user's own photo, multiple images per outfit, weather API, wear history, sharing, shopping suggestions, wardrobe search and filters, per-user AI limits, multiple users, more than one outerwear per outfit.

Later, not MVP: filter outfit candidates by occasion before the AI step (example: "Work" removes shorts and slippers).

---

## 12. Open items (do not decide silently)

These are tests and checks, not undecided design (TDD section 7):
1. Deployment spike (TDD 8): `GET /debug/slow` through the proxy; how Vercel runs NestJS + Node 24; proxy passes `Authorization` and `Set-Cookie`; Fluid Compute on. Then remove the endpoint.
2. Outfit image cost: test `flux-2-klein-4b` and sizes smaller than 768 x 1024 (TDD 10).
3. Background removal spike: quality, phone speed, 80 vs 40 MB model, Cloudinary CORS for the retry, COOP/COEP need (TDD 11).
4. Cloudinary transformation cost on the free plan (TDD 12).
5. Licences: `@imgly/background-removal` 1.7.0 and Black Forest Labs terms (TDD 13).
6. Cloudflare quota error shape: record it on first hit, adjust the mapping (TDD 14).
7. ~~Gemini model choice~~ (done 2026-11-01). Gemini free rate limits per model still unchecked (TDD 15).
8. Login has no brute-force protection. Add a throttle before other people use the app.

## 13. Build order (from TDD section 8)

1. ~~Fix `GET /debug/slow` (gate + cap)~~ (done), deploy both apps, run the deployment spike.
2. Reduce outfit image cost (test `flux-2-klein-4b`, smaller output).
3. Spike: browser background removal on sample photos.
4. ~~Base setup: Prisma schema from the DB document, JWT auth with seeded account, Cloudinary signing, error format~~ (done).
5. API areas in order: ~~meta, profile, uploads~~ (done), Gemini provider, items, occasions, outfits (generate), outfit image. Status per feature: [memory/project-status.md](memory/project-status.md).
6. Frontend from the owner's wireframe.

---

## 14. Conventions for code in this repo

- TypeScript strict mode in both apps.
- Backend: one NestJS module per area (auth, profile, uploads, items, occasions, outfits, meta). Validate all bodies and queries against the lists in section 6. Map every failure to the error format and codes in section 7. Never leak raw provider errors to the client.
- Every Prisma query includes `userId` in its `where`. Queries on `OutfitItem` go through `Outfit`.
- Outfit insertion: one transaction per outfit. Handle `P2002` explicitly.
- Cloudinary deletes happen after the DB delete and never throw to the caller.
- Passwords: argon2id. Never log tokens, passwords, or API keys.
- Do not put code in the design documents. Documents hold decisions; code lives in the repo.
- Every change to a contract (endpoint, error code, column, rule) updates the matching document and its version table.

## 15. Workflow
> The workflow must follow strictly to these steps below

1. **Plan**: Before writing any code, review the SRS, TDD, DB, API and every documents. Ensure you understand the requirements and constraints. If there are any ambiguities or missing information, ask for clarification before proceeding.

2. **Design**: Create a design for the feature or change you are implementing. This may include diagrams, flowcharts, or pseudocode. Ensure that your design adheres to the requirements and constraints outlined in the documents. Show the design or plan to the user for approval before proceeding to implementation.

3. **Implement**: Write the code according to the approved design. Ensure that your code is complete, working, and adheres to the conventions outlined in section 14. Include imports, types, error handling, and configuration as necessary. Add tests for non-trivial logic.

4. **Review**: After implementing the code, review it for correctness, adherence to the design, and compliance with the requirements and constraints. Ensure that all tests pass and that the code is well-documented.

5. **Test**: Run the code and verify that it works as expected. Test all edge cases and error conditions. Ensure that the code meets the requirements and constraints outlined in the documents.

6. **Document**: Update the relevant documents (SRS, TDD, DB, API) to reflect any changes made during implementation. Ensure that the version tables in the documents are updated accordingly.

## 16. Notes

- To keep the memory intact through out the conversation, you can write a markdown file in the `.claude/memory` folder. The file name should be descriptive of the topic, and the content should be a summary of the relevant information. This will help you remember important details and context for future reference.

- Keep updating the CLAUDE.md file with any new decisions, changes, or updates to the project. This will ensure that all team members have access to the latest information and can work effectively together. However, do not change the CLAUDE.md file without the user's approval. Always ask for confirmation before making any changes to the document.

- CLAUDE.md could expand so large when the project grows, so it is recommended to split the document into multiple files if necessary. Each file should have a clear and descriptive name, and the content should be organized in a logical manner inside the `.claude` folder (I have already created some placeholder folder like `.claude/rules`). This will make it easier to navigate and find relevant information. Also, always keep the CLAUDE.md file as the main entry point for the project, and provide links to the other files as needed.

## 17. TEMPORARY NOTES

- You are now fully in charge of most of the decision for developing the app. You will be responsible for writing code, reviewing technical choices, and ensuring that the app meets the requirements and constraints outlined in the documents. You will also be responsible for updating the CLAUDE.md file with any new decisions, changes, or updates to the project. However, you must always ask for confirmation before making any changes to the CLAUDE.md file or any other documents.

- This is very important. Since you are now fully in charge of most of the decision for developing the app, you must ensure that all decisions are made in accordance with the requirements and constraints outlined in the documents. You must also ensure that all code is complete, working, and adheres to the conventions outlined in section 14. You must also ensure that all tests pass and that the code is well-documented.

- However, if any decision is large and create impact on the project, you must ask for confirmation before proceeding. This is to ensure that all team members are aware of the decision and can provide input if necessary. You must also ensure that all changes are documented in the relevant documents (SRS, TDD, DB, API) and that the version tables in the documents are updated accordingly.