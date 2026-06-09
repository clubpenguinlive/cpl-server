# Club Penguin Live — Master Plan

Read-only reconciliation built on 2026-06-05 from the actual repos, the live boxes
(`play`/apex over Cloudflare, prod VM `nick@10.0.0.72`), the handoff note, the four feature
specs, INFRA.md, the perf audit, and the project memory. Every claim was cross-checked against
current code or a live command. Anything not verifiable that way is tagged **(unverified)**.
Companion to `INFRA.md` (how it's wired); this doc is the backlog (what's left).

Tags per item: **[decision-needed]** (gated on Nick), **[ready]** (buildable now, no decision),
**[watch-it-render]** (must be eyeballed live), **[done-verify]** (already done; just confirm).

**Refreshed 2026-06-09** against shipped code: the 06-08/09 session closed both room decisions
(Stage, Recycling), shipped Daily Challenges and Stamps v1 end to end, fixed the sledding row,
hardened the apex CSP, and converted the prod VM to Gen2/UEFI. See §0 second table. Ninja Hideout
was investigated and is now **blocked**, not ready (§2.7).

---

## 0. Read this first — items already done that were listed as pending

The single biggest finding: a cluster of "not started" backlog items shipped at the very end of
the 2026-06-05 session, after the audit/handoff prose was written. The handoff's recorded prod
state (`client 55fc607`) is stale by 3 commits.

| Item (source that called it pending) | Reality | Evidence |
|---|---|---|
| **A1** Cave→Mine door (FEATURE_AUDIT "none started") | DONE & live | `cave/Cave.js:22` now `'mine': triggerRoom(812,760,600)`; commit `26e3627` |
| **A3** Mine up-exit → Mine Shack (FEATURE_AUDIT) | DONE & live | same commit `26e3627` |
| **A2** game prompts: `mine_prompt`, `Sensei_prompt` (case fix), `mission1..10_prompt` (FEATURE_AUDIT "no prompt strings") | DONE & live | all present in `assets-.../media/crumbs/en/crumbs.json` |
| **Font double-load** (perf audit) | DONE & live | commit `7d51576` "Load game fonts once"; the `fonts.css` `<link>` dup is gone |
| **Sled touch (999)** (FEATURE_AUDIT backlog #4) | DONE & live, complete | `scenes/games/sled/ClientSledPlayer.js:14-27` coarse-pointer top/bottom tap zones → existing up/down handlers; commit `c18258a` |
| **Marketing CSP: add default-src, remove unsafe-eval** (perf audit/task) | ALREADY HARDENED | live header on `clubpenguinlive.net` is `default-src 'self'; … script-src 'self'; …` — no `unsafe-eval`, plus `X-Frame-Options: SAMEORIGIN` + HSTS preload. Source: `clubpenguinlive.net/public/_headers:2` |
| **Marketing lockfile / dependency scan** (task) | N/A — nothing to scan | repo has no `package.json` / lockfile; pure static `public/` on Workers, zero npm deps |
| **Game repo remote** (CPJOURNEY_AUDIT open item) | DONE | 4 private repos on GitHub + dev-01→prod deploy flow (INFRA §6) |
| **Hardcoded DB password / secret rotation** (handoff) | DONE | rotated across 4 consumers; `server/ops/rotate-db-password.sh` tracked |

**Prod is fully in sync, not drifted.** Re-verified 2026-06-09: live `git rev-parse` on prod is
client `79adf45`, server `a59e32b` — identical to dev-01 and GitHub `origin`, and the VM is booting
UEFI (`/sys/firmware/efi` present). The 06-05 snapshot in earlier drafts (client `c18258a`, server
`cc08c42`) was likewise in sync at the time.

### Shipped 2026-06-08/09 (second cluster, verified in git + code this refresh)

| Item (plan section that listed it pending) | Reality | Evidence |
|---|---|---|
| **Daily Challenges** (§4 "[ready]") | DONE & live | server `e2459fe` (pool + dailyChallenges util + ChallengeCollection + plugin), client `14c32f3` (ChallengesPanel, J key), assets `c2fdfe1`; migration `0001_user_challenges` applied. 3 date-seeded goals/day, claim pays 80-120 server-side |
| **Recycling economy** (§2.2 "[decision-needed]") | DECIDED + DONE & live | pays **coins**, server-validated: `Economy.js` `RECYCLE_REWARD=3`, `RECYCLE_SESSION_CAP=150` (server `e4acdc7`, client `ee177b9`); rate set below the cheapest minigame per-action earn |
| **Stamps v1** (§4 "[ready]" server / "[watch-it-render]" UI) | DONE & live | server `fe7c9f2`+`a59e32b` (StampCollection, idempotent id-validated award, server-decided triggers), client `79adf45` (StampBook B key + StampPopup), assets `f877b33`; migration `0002_user_stamps` applied. **Curated 12 earnable stamps**, name-based (no icon art yet) — NOT the full ~700 |
| **Stage launch-play** (§2.1 "[decision-needed]") | DECIDED + DONE & live | ships Squidzoid as-is; dead `costumebtn`/`scriptbtn` hidden (`Stage.js:379-380`, commit `6351196`); rotation deferred until a second play exists |
| **SkillsWidget sledding 8th row** (§4 side-fix) | DONE & live | `SkillsWidget.js:19`, commit `6351196` |
| **Apex `style-src 'unsafe-inline'` residue** (§2.9 "tightenable later") | DONE & live | inline CSS externalized to `public/styles.css`, CSP now `style-src 'self'` + `object-src 'none'` (commit `4536fcb`) |
| **Desktop + mobile canvas scaling** (not in plan) | DONE & live | desktop autofits past native on tall monitors (`59a87f7`, `a492725`); mobile-landscape full-bleed + 8px buffer + inset chips (`68c68b1`, `dfe50bd`, `ca255e9`) |
| **nginx cache headers** (not in plan) | DONE on prod | HTML `no-cache`, `/assets/` immutable 1yr (hand-managed `sites-enabled`, NOT in git; apply script in `scripts/`) |
| **Local client dev server** (not in plan) | DONE | `npm run dev` serves the real client at localhost:8080 with hot reload (`4808ba8`); frontend-only |
| **Prod VM Gen2/UEFI** (not in plan) | DONE 2026-06-06 | 2-SCSI-disk layout (root + 1GB ESP), static MAC keeps .72; runbook at `scripts/gen1-to-gen2-hyperv-runbook.md` |

Remaining **[watch-it-render]** from that cluster (Nick's eyes, all deployed): Challenges claim
payout end-to-end; Recycling +3 float / 150 cap in the Eco room; a StampPopup firing (visit Hidden
Lake); iPhone rotate + buffer; 1440p autofit.

### Reality vs notes/memory — contradictions

- **FEATURE_AUDIT.md** closes with "None of the above is started" for A1/A2/A3 — contradicted;
  all three shipped the same day, after the file was written. Treat FEATURE_AUDIT §A as historical.
- **Memory `cpl-flags`** says "Marketing repo renamed to `website-clubpenguinlive`." Contradicted:
  the live repo is `github.com/clubpenguinlive/clubpenguinlive.net` (origin confirmed), the local
  folder is `clubpenguinlive.net`, and the live site serves from it. No `website-clubpenguinlive`
  exists on disk. The rename either never happened or was reverted.
- **FEATURE_AUDIT "Ninja Hideout now buildable via the assets repo"** is imprecise. `hideout` art
  is NOT in `assets-clubpenguinlive` (that repo holds only the 15 already-customized rooms). It's
  buildable via the native-room-port recipe: pull `hideout` from `CPJourney-2/assets` onto prod's
  piefruit tree, then commit the override + the client scene. See §2.7.
- **The perf audit's marketing-CSP finding is stale** (already fixed live). Do not re-apply.

---

## 1. Current state (verified, brief)

Club Penguin Live is **launched, public, and playable end to end**. Two decoupled front doors
(INFRA §1): the apex `clubpenguinlive.net` marketing landing (Cloudflare Workers static site, up
independent of home) and `play.clubpenguinlive.net` (the Yukon game on the on-prem VM via an
outbound Cloudflare Tunnel). The game runs nginx → static `client/dist` + pm2 `Login`/`Blizzard`
World servers → MariaDB. **Live now:** 38 walkable rooms (classic-island coverage); 24 game rooms
(3 native Phaser — Card-Jitsu 998, Sensei 951, Sled 999 — the rest classic CP Flash SWFs via the
self-hosted Ruffle harness); the Tier-5 gathering economy (Fishing/Mining/Surfing/Hauling
minigames → server-capped coins + skill XP + resources → Skills panel + sell-for-coins trade-in);
mobile corner-chip nav + slim toolbar; and the four-repo dev-01→prod deploy chain
(`client`/`server`/`assets`-clubpenguinlive + the apex `clubpenguinlive.net`). Verified this pass:
both sites 200, prod git HEADs == GitHub, marketing CSP hardened.

---

## 2. Closeout items (small: decision-gated or low-effort)

### 2.1 Stage room — launch-play pick — **[done 2026-06-08]**
**Decided + shipped:** Squidzoid ships as-is; the unwired `costumebtn`/`scriptbtn` are hidden
(`Stage.js:379-380`, commit `6351196`) per "don't show dead buttons." Play-rotation is **deferred
until a second play exists** (the 12 sub-atlases make it buildable later). Room live and stable.

### 2.2 Recycling room economy mechanic — **[done 2026-06-08]**
**Decided + shipped:** recycling pays **coins through the server-authoritative cap** (not a skill or
stamp award path — though the Recycler stamp id 20 piggybacks at 10 recycles/session). Rate set
below the cheapest current per-action minigame earn: `RECYCLE_REWARD=3`/item,
`RECYCLE_SESSION_CAP=150` (`Economy.js:22-23`; server `e4acdc7`, client `ee177b9`). Machine
animation re-enabled on successful recycle. **[watch-it-render]** residue: eyeball the +3 float and
the 150 cap in the Eco room live.

### 2.3 Hidden Lake door on the Cave pond — **[ready]** (placement decided)
**What:** Decision is made — Hidden Lake (814) gets a canonical entrance on the **water/pond in the
Cave**. **Read-only confirmation requested (done):** the Cave's right-side wooden gate (octopus sign)
is the `zone` rectangle at **x≈1319** whose only action is `onZoneClick()` → `sendMove(1266,572)` — a
walk-to, **no room/game trigger** (`Cave.js:145-176`). The pond sits at **x≈800** (`water_water_1..11`
+ `line`), and currently carries **no** Button/Zone. So a new `lake` door on the pond does **not**
conflict with the octopus gate. **Note:** Hidden Lake is *already reachable* today via the **Forest**
`'lake'` door (`Forest.js:23` → `triggerRoom(814,760,500)`); the Cave-pond door would be a **second,
more canonical** entrance, not the only one. **Effort:** S (add a `lake` trigger + pond physics zone +
spawn coords to `Cave.js`; the Cave room id and its `cave-physics.json` zone need the new key).
**Risk:** low; watch-it-render to place the click target on the pond art.

### 2.4 Sport Shop / furniture catalog cadence — **[decision-needed]**
**What:** Catalog rotation cadence for the Sport Shop / furniture catalogs is unset. The pattern
exists and is proven (`DailyCatalog.js` weekly clothing rotation). **Blocking:** your cadence pick
(weekly? monthly? which items rotate). **Effort:** S-M (reuse the DailyCatalog deterministic-seed
pattern). **Risk:** low. **(unverified)** — I did not locate a Sport Shop catalog module this pass;
confirm whether a furniture catalog exists yet or is net-new before scoping.

### 2.5 Sensei real-win verification — **[watch-it-render / done-verify]**
**What:** The card payout is verified **by code path**: `CardInstance.js:378`
`user.updateCoins(won ? 10 : 5, true)` (10 coins win / 5 loss, server-side flag), matching the
handoff's "Sensei 951/PvP 998, 10W/5L flat, a2a7a5f". What's *not* confirmed is a **played match**
reaching the win branch end-to-end (does `won=true` fire and pay 10 on a real Sensei victory).
**Blocking:** a live playtest. **Effort:** XS (play one match). **Risk:** none (read-only confirm).

### 2.6 Mine depth glitch — **[watch-it-render]** (needs your screenshot)
**What:** FEATURE_AUDIT A4 — a visual glitch near the Mine's left equipment/desk, almost certainly a
depth-sort or ambient-sprite layering bug. **Blocking:** your screenshot to pin which prop's depth is
wrong. **Effort:** S once located (adjust the `this.sort` order in the Mine scene). **Risk:** low.

### 2.7 Ninja Hideout room — **[blocked]** (investigated 2026-06-08, was wrongly "[ready]")
**Correction to this plan:** the 06-08 investigation found **no `hideout` scene exists in
CPJourney-2/assets** (the native-port recipe has no source), and **Card-Jitsu Fire/Water don't
exist** in any of the forks — so a Hideout today would be an empty placeholder room with nothing to
do in it, violating the no-placeholder rule. **Parked until Card-Jitsu Fire and/or Water are built**
(each is a large game build, not a port). The `dojoext 'dojohide'` null stub stays as the future
door site. Treat the earlier "clearest real room gap / [ready]" framing as historical.

### 2.8 Internal room-name leak (e.g. "hidden_lake" instead of "Hidden Lake") — **[watch-it-render]**
**Root cause (verified):** the UI builds string keys from `room.key` lowercased, but several newer
rooms have a `room.key` that doesn't match the legacy string prefix, so `getString()` misses and the
raw key shows. Mismatches: **Lighthouse**→strings use `light_*`; **HiddenLake**→strings use `lake_*`;
**HQ**→no string at all; **Agent**→`agent_find` is a partial string. **Render sites (only two):**
- `engine/network/plugins/plugins/Join.js:31` — loading screen `getString('load_'+key)`.
- `engine/network/plugins/plugins/Buddy.js:49` — buddy "find" popup `getString(key+'_find')`.
- (Map hints in `Map.js` are hardcoded, not affected.)
**Scope:** NOT systemic — it's the handful of recently-added rooms whose keys diverge from the
classic string prefixes (Lighthouse, HiddenLake, HQ, Agent), not every room. **Recommended fix:** a
small key→string-prefix lookup map consumed at both render sites (e.g. `{HiddenLake:'lake',
Lighthouse:'light', HQ:'hq', Agent:'agent'}` + add the missing `hq_*` strings to crumbs). Cleaner and
far less invasive than adding per-room display fields to every crumb entry. **Effort:** S. **Risk:**
low; verify by watching the loading/buddy popups render the right names. **Do not fix yet** (watch-it-render).

### 2.9 Marketing CSP + dependency scan — **[done-verify]** (already addressed)
Live `clubpenguinlive.net` already serves a hardened CSP **with** `default-src 'self'` and **without**
`unsafe-eval` (`public/_headers:2`), plus `X-Frame-Options: SAMEORIGIN` and HSTS preload. Nothing on
the static site needs eval (vanilla DOM `app.js`/`snow.js`, no framework). The dependency-scan item is
moot: no `package.json`/lockfile, zero npm deps. **Residue closed 2026-06-09:** the inline `<style>` block was
externalized to `public/styles.css`; CSP is now `style-src 'self'` with `object-src 'none'` added
(commit `4536fcb`, render-verified headless). Known benign violation: Cloudflare Insights' injected
beacon is blocked by `script-src 'self'` — pre-existing; fix is disable CF Web Analytics or allow
`static.cloudflareinsights.com` (Nick's call, **[decision-needed]**, XS).
**Do NOT touch the game domain's CSP** — Ruffle/Phaser there genuinely need eval.

### 2.10 Version-control the prod ops scripts — **[done 2026-06-06]**
**Done:** all three (`recover_rebuild.sh`, `backup-db.sh`, `apply_csp.sh`) are now under `ops/` in
the server repo alongside `rotate-db-password.sh`, with a mapping README. The hardcoded sudo password
(`private-penguin-2026`, in `recover_rebuild.sh` **and** `apply_csp.sh`) is removed:
`recover_rebuild.sh`'s swap step is now best-effort `sudo -n` (no-ops since swap exists);
`apply_csp.sh` uses interactive `sudo`. Live `/opt/yukon` copies updated and the sanitized
`recover_rebuild.sh` re-tested (chrome + rotate-overlay verify lines pass). A NOPASSWD sudoers rule
for unattended swap/nginx is still the optional next step but not required for normal deploys.

---

## 3. Mobile completion — Ruffle touch overlay for keyboard Flash games — **[watch-it-render]**

The **last real mobile-playability gap.** Native Sled (999) now has touch (§0). What remains: the
classic CP **Flash** minigames are keyboard-designed and Ruffle does not synthesize touch→keyboard,
so on a phone they have **no controls**.

**Games needing an overlay (keyboard-driven):** Cart Surfer (905), Jet Pack (906), Thin Ice (909),
Aqua Grabber / Sub (916), Astro Barrier (900), Hydro Hopper (903), Puffle Roundup (902).
**Already touch-fine (pointer/click):** Bean Counters (901), Ice Fishing (904), the native pointer
games (Card-Jitsu, Sensei, Connect Four, Mancala). Catchin' Waves (912) and the per-game exact key
map need a playtest pass to confirm (**unverified** per-game control set).

**Approach:** an on-screen control overlay (a CP-style D-pad / buttons) that dispatches synthetic
`KeyboardEvent('keydown'/'keyup', {key:'ArrowUp'…})` at the Ruffle player DOM element. The harness
(`engine/ruffle/RuffleController.js`, `RuffleShim.js`; `RoomManager.addFlashGame→bootGame`) holds the
player element after `ruffle.createPlayer()` and currently has **no** touch injection. Gate on
`matchMedia('(pointer: coarse)')` exactly like Sled. **Why watch-it-render:** button placement and the
per-game key mapping have to be eyeballed against each game live. **Effort:** ~100-150 LOC per game
(shared overlay component + per-game mapping); a shared D-pad reduces marginal cost. **Risk:** low
(standard DOM API; no Ruffle changes). Build incrementally, highest-traffic games first
(Cart Surfer, Jet Pack, Thin Ice).

---

## 4. Net-new features (need real specs)

The **Tier-5 gathering loop is already live** (Fishing/Mining/Surfing/Hauling → coins+XP+resources →
Skills panel → sell). What's left of T5 and the four greenlit specs:

| Feature | One-liner | Spec | Effort | Build mode |
|---|---|---|---|---|
| **Stamps** | CP stamp book; server-authoritative award, mirrors UserSkills | `SPEC_stamps.md` (full) | L | **[done 2026-06-08]** — server `fe7c9f2`+`a59e32b`, client `79adf45` (StampBook B / StampPopup), assets `f877b33`, migration `0002` applied. **v1 = curated 12 earnable stamps, name-based.** Remaining: icon-art sourcing pass, then expand defs toward ~700 (Houdini `stamps.sql`) — both **[decision-needed]** (scope/art). |
| **Daily challenges** | 3 deterministic daily goals (date-seeded like DailyCatalog) + per-user progress + claim | `SPEC_daily_challenges.md` (full) | M | **[done 2026-06-08]** — server `e2459fe`, client `14c32f3` (panel, J key), assets `c2fdfe1`, migration `0001` applied. Rewards 80-120, claim server-validated. **[watch-it-render]** residue: one end-to-end claim with eyes on. |
| **Skills → player-card drawer** | Move Skills into an Items\|Skills tab on the player card | `SPEC_skills_card_drawer.md` (full) | M | **[watch-it-render]** — spec explicitly reserves this for a live layout session (narrow-drawer relayout). Side-fix sledding 8th row: **done** (`6351196`). |
| **Event / party rooms** | Date-driven room re-skins (spooky/winter) from native variant packs | `SPEC_event_rooms.md` (full) | M | **Mechanism: [ready]** (`activeVariant` helper + Join payload + client pack-swap, no DB); **content calendar: [decision-needed]** (which events/dates). Re-skins bulk-pullable; structural variants individual-port. |

Stamps and Challenges shipped 2026-06-08; their spec headers still say "greenlight-pending, not
built" — stale, treat the code as authoritative. Also outstanding within T5: **Cooking /
Performing / Agent** skills have UI but **no game** yet (they'd be coin-multipliers, no resource) —
Pizzatron (Cooking) is the obvious port per the fork audit.

---

## 5. Infra / hardening

| Item | Detail | Tag | Effort |
|---|---|---|---|
| **Atlas-defer (pre-login boot ~7.8MB)** | `mail` (2.46MB) + `iglooedit` (465KB) eagerly in `preload-pack.json`. Deferring is a real engine refactor (persistent sleep/wake scenes), not a config tweak. INFRA §9. | [decision-needed] (scope) / deep | L |
| **Tablet-nav anchoring** | Mobile float-nav is keyed to in-canvas HUD pixel coords + a width-only 700px breakpoint; fragile on ~1.5-1.6 aspect tablets (flagged by code-review). | [watch-it-render] | S-M |
| **Single credential source** | DB creds live in 4 hand-synced copies (server config.json, 2× PHP db-config, .my.cnf). One source the PHP + server both read. INFRA §5/§9. | [ready] | M |
| **Off-prod / atomic builds** | Server `npm run build` does `rimraf dist` first → a failed build wipes `dist`, no rollback; client builds on prod too. Build-to-temp-then-swap. INFRA §9. | [ready] | M |
| **Migration runner** | **DONE 2026-06-06.** `utils/migrate.js` + `migrations/` + `npm run migrate` (`--status`), tracked in `schema_migrations`. Proven twice on prod: `0001_user_challenges` (Challenges) and `0002_user_stamps` (Stamps), both applied + features shipped on top. | [done] | M (enabler) |
| **Deploy dedup** | `deploy.sh`/`DEPLOY.md` duplicated across repos; prod IP hardcoded ~6 places. Handoff. | [ready] | S |
| **Turnstile hostname auth** | Add `clubpenguinlive.net` / `play.*` to sitekey `0x4AAAAAADYRrvWND1L5qZvq` in the CF Turnstile dashboard (error 600010). Cosmetic; signup works via fail-open. `cpl-flags`. | [decision-needed] (your CF action) | XS |
| **PWA install icons** | **Mostly done 2026-06-06.** Icons are the new CP-penguin (192/512/180 + favicon). iOS homescreen `apple-touch-icon` was only 180 (upscaled/soft on retina) → now the 512 source, and the `<link>` is cache-busted (`?v=`) like the favicon. Android manifest already has 512. Only residue: a bespoke maskable/adaptive icon if wanted. | [done-verify] | XS |
| **iOS standalone safe-area** | **Done 2026-06-06.** Homescreen/standalone launch ("full-screen" on iOS) ran edge-to-edge under the notch/rounded corners/home indicator, clipping the canvas + bottom toolbar. Added `env(safe-area-inset-*)` padding to `#cpl-stage` (coarse-landscape) and `#game-wrap:fullscreen`; `env()` is 0 in a normal tab so desktop/in-browser is unchanged (verified PASS). | [done-verify] (eyeball on a notched iPhone) | S |
| **Legacy Houdini repo** | `cpl-flags` says delete `clubpenguinlive/play.clubpenguinlive.net` (needs `gh auth refresh -s delete_repo`). **(unverified)** — confirm it still exists before acting. | [decision-needed] (your action) | XS |

---

## 6. Recommended sequence

### A. Needs your decision first (unblocks the rest)
1. **Event-room content calendar** (§4) and **Sport Shop cadence** (§2.4) — the mechanisms are
   ready/proven; both are gated only on which content and dates.
2. **Stamps v2 scope** (§4): icon-art sourcing, then how far toward the ~700 Houdini defs.
3. Quick chores only you can do: **Turnstile hostnames**, **CF Insights beacon** (§2.9),
   **legacy repo delete** (§5).

### B. Ready to build now (no decision needed)
1. **Hidden Lake door on the Cave pond** (§2.3) — decided, confirmed non-conflicting, S. (Hidden
   Lake is already reachable via the Forest door, so this is polish, not a gap.)
2. **Deploy dedup** (§5) — S, head-down.

### C. Watch-it-render (queue for a live session with you)
1. **Verify the 06-08/09 cluster** (§0 second table) — Challenges claim, Recycling cap, a stamp
   earn, iPhone rotate/buffer, 1440p autofit. Cheapest wins; all already deployed.
2. **Ruffle touch overlay** (§3) — the main remaining mobile gap; biggest single playability win,
   build incrementally per game (Cart Surfer, Jet Pack, Thin Ice first).
3. **Internal-name leak fix** (§2.8), **Mine depth glitch** (§2.6), **Sensei real-match confirm**
   (§2.5) — cheap, but each wants eyes-on to verify the render.
4. **Skills → player-card drawer** (§4) and **Tablet-nav anchoring** (§5).

### D. Later / deep / blocked
1. **Atlas-defer 7.8MB boot refactor** (§5) — real engine work; highest infra payoff but largest risk.
2. **Off-prod atomic builds**, **single credential source** (§5) — hardening, no urgency.
3. **Ninja Hideout** (§2.7) — blocked behind Card-Jitsu Fire/Water; each of those is a large game
   build (the real unlock if Card-Jitsu depth is wanted).

**Why this order:** the old keystones (room decisions, migration runner, Challenges, Stamps) all
shipped 2026-06-06→09, so the backlog is now verification + content decisions + the touch overlay.
The overlay (C.2) is the highest user-visible win left but needs you in the loop for control
placement, so it pairs with a live session. The atlas-defer (D.1) remains the only item that's both
high-value and genuinely risky, so it stays last and deliberate.
