# Phase 14: Premium Animated Emoji — Context

**Gathered:** 2026-06-06
**Status:** Ready for planning
**Source:** User direct description

<domain>
## Phase Boundary

This phase adds a premium animated emoji (sticker) system to the in-game battle chat. Users pay points to send GIF-based stickers that play a fly-and-impact animation from the sender's avatar to the receiver's avatar. Regular text chat and free emoji remain unchanged.

Key user vision: "khi user nào mua và ấn nó trong game, thì nó sẽ bay từ avatar của người gửi nhảy đập vào avatar của người nhận và nổ bùm 1 phát" — emoji flies from sender avatar, impacts receiver avatar with an explosion effect.

</domain>

<decisions>
## Implementation Decisions

### Emoji Catalog
- 6 initial animated emoji (expandable later)
- Each has: preview thumbnail, animation asset (GIF/spritesheet), impact effect, point cost
- Stored in a database table for easy future expansion
- Served via a public API endpoint (cacheable)

### Point Deduction
- Points deducted from user's wallet immediately on send (atomic, same debitWallet pattern as wagers)
- Server validates balance ≥ cost before broadcasting the animation event
- Uses existing wallets + transactions infrastructure from Phase 7

### Animation System
- Emoji flies from sender avatar position → receiver avatar position
- Each emoji has unique impact/arrival animation (explosion, shake, splash, etc.)
- CSS keyframes + JS for the flight path; GIF/spritesheet for impact effect
- Lightweight assets (< 100KB each)

### Access Control
- Only authenticated users can send premium emoji (guests see "sign in" prompt)
- Must be in active battle phase to send
- 5-second cooldown between sends (server-enforced, prevents spam)

### Claude's Discretion
- Exact animation easing curves and timing
- Whether to use CSS animations, Lottie, or sprite sheets for impact effects
- Exact asset file format (GIF vs WebP vs spritesheet)
- Sound effect implementation details (optional)
- Exact UI layout of emoji picker grid

</decisions>

<canonical_refs>
## Canonical References

### Points Economy
- `migrations/006_points_economy.sql` — Wallet + transactions schema
- `db.js` (getWalletBalance, debitWallet, creditWallet) — Wallet operations

### Chat System
- `server.js` line ~2115 — Existing chat socket handler with rate limiting
- `public/app.jsx` line ~1483 — ChatComposer component with CHAT_EMOJIS grid

### Rate Limiting Pattern
- `server.js` line ~137 — RateLimiterMemory pattern used for all limiters

</canonical_refs>

<specifics>
## Specific Ideas

The 6 emoji suggested by user (with point costs):
1. 💣 Bomb — flies + explodes on impact (5 pts)
2. 🚀 Rocket — launches across, blast on hit (5 pts)
3. 🥊 Boxing Glove — punches with knockback shake (3 pts)
4. 🌊 Tsunami Wave — wave crashes over opponent (5 pts)
5. ⚡ Lightning Strike — bolt zaps from above (3 pts)
6. 🔥 Fireball — hurls across + ignites (5 pts)

</specifics>

<deferred>
## Deferred Ideas

- Sound effects (optional, can add later)
- Additional emoji packs
- Gifting emoji to friends
- Emoji unlock via achievements
- Custom/user-created emoji

</deferred>

---

*Phase: 14-premium-animated-emoji*
*Context gathered: 2026-06-06 via user description*
