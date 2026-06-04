---
phase: 06
slug: bot-difficulty-tiers
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-04
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Bot AI ↔ player fleet state | Bot targeting functions must not read the player's own ship positions (`myShipsRef`) — doing so would be undetectable cheating (D-03 anti-cheat) | Player ship coordinates (sensitive — would break game fairness) |
| Browser localStorage ↔ app | Persisted difficulty preference (`bs_botTier`) read back on load; user-controllable storage | Single string tier value (low sensitivity) |

*No server, network, account, or persistence surface this phase — classic single-player client-side logic only (D-07).*

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-06-01 | Information Disclosure | pickHard / pickInsane / buildDensityMap | mitigate | Architectural: density/axis logic reads only `botShotsRef`, `botHitsRef`, `botRemainingRef`. D-03 grep gate asserts no `myShipsRef` inside these function bodies. Verified: `myShipsRef` appears only in placement (app.jsx:2085), reset (2134), and botShoot hit-detection (2291/2302/2321) — never inside the targeting functions (2173-2285). | closed |
| T-06-02 | Tampering | `bs_botTier` localStorage value | mitigate | `loadBotTier()` (app.jsx:391) whitelist-validates the stored value against `VALID_TIERS` and returns `"medium"` on any unknown/invalid/throwing read. `botPick` dispatch also defaults unknown tiers to `pickMedium` (defense in depth). Garbage-value path exercised in human-verify step 5. ASVS V5 input-validation gate. | closed |
| T-06-SC | Tampering | npm/pip/cargo installs | accept | No packages installed this phase — RESEARCH.md Package Legitimacy Audit confirms zero new dependencies. Verified: `git diff 45e40c1..HEAD -- package.json package-lock.json` shows zero changes. No supply-chain surface. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-SC | Zero new dependencies introduced this phase; no supply-chain attack surface to mitigate. | phuongvietnamlab | 2026-06-04 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-04 | 3 | 3 | 0 | gsd-secure-phase (register authored at plan time, mitigations verified in code) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-04
