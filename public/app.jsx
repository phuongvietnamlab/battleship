import React from "react";
import * as ReactDOM from "react-dom/client";
import { io } from "socket.io-client";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
const { useState, useEffect, useRef, useCallback } = React;

const BOARD = 11;
const COLS = ["1","2","3","4","5","6","7","8","9","10","11"];
const ROWS = ["A","B","C","D","E","F","G","H","I","J","K"];

// D-09: delay before bot offer appears on the queue wait screen (mirrors server BOT_OFFER_DELAY_MS)
const BOT_OFFER_DELAY_MS = 30000;
// Bot difficulty tier whitelist — used for localStorage validation (T-06-02)
const VALID_TIERS = ["easy", "medium", "hard", "insane"];

// ---------- i18n (English primary, Vietnamese secondary) ----------
// Locale auto-detected once at load: Vietnamese device -> vi, everything else -> en.
// t(key, params) interpolates {name} placeholders. Missing keys fall back to en.
function detectLocale() {
  let loc = "";
  try { loc = navigator.language || ""; } catch (e) {}
  return /^vi/i.test(loc) ? "vi" : "en";
}
const LANG = detectLocale();
const I18N = {
  en: {
    "common.or": "OR", "common.copied": "Copied ✓",
    "common.tapToCopy": "Tap the code to copy", "common.bot": "Bot", "common.opponent": "Opponent",
    "common.exit": "Exit", "common.leaveRoom": "Leave", "common.roomCodeLabel": "Room code:", "common.vsBotFull": "🤖 Play vs Bot",
    "topbar.tagline": "Online · Sea Battle", "topbar.soundToggle": "Toggle sound",
    "lobby.title": "Sea Battle", "lobby.sub": "Play vs the bot, or create a room and send the code to a friend.",
    "lobby.playBot": "🤖 Play vs Bot", "lobby.createRoom": "⚓ Create new room", "lobby.enterCodeLabel": "Enter room code", "lobby.joinBtn": "Join room",
    "mode.classic": "Classic", "mode.advance": "Advance ⚡", "mode.classicDesc": "Classic, no power-ups", "mode.advanceDesc": "Collect & use power-ups",
    "ship.carrier": "Carrier", "ship.battleship": "Battleship", "ship.cruiser": "Cruiser", "ship.submarine": "Submarine", "ship.destroyer": "Destroyer",
    "pw.scatter": "Scatter Blast", "pw.cross": "Cross Missile", "pw.double": "Extra Turn", "pw.reveal": "Reveal Cell", "pw.mine": "Sea Mine",
    "board.yourFleet": "Your fleet",
    "place.shipTitle": "Drag to move · double-tap to rotate",
    "place.hint": "Your fleet starts placed at random. Drag a ship to move it, double-tap to rotate, or tap 🎲 Random for a new layout.",
    "place.random": "🎲 Random", "place.ready": "⚓ Ready for battle", "place.readyMark": "Ready ✓", "place.waitingOpp": "Waiting for opponent...",
    "place.botReady": "✓ Bot is ready", "place.oppReady": "Opponent is ready", "place.oppPlacing": "Opponent is placing...", "place.waitOpp": "Waiting for opponent...",
    "counter.sunkEnemy": "Sunk", "counter.sunkOwn": "Lost", "counter.ships": "ships",
    "battle.you": "You",
    "battle.aiming": "Aiming {name} — tap enemy waters to fire (tap the button again to cancel).",
    "battle.aimingMine": "Placing Sea Mine — tap an empty cell on your fleet to place it (tap the button again to cancel).",
    "battle.yourTurn": "🎯 Your turn", "battle.botTurn": "⏳ Bot's turn", "battle.oppTurn": "⏳ Opponent's turn",
    "battle.enemyWaters": "Enemy waters", "battle.fireSuffix": "— FIRE!", "battle.logStart": "Battle begins...",
    "room.title": "Invite a friend", "room.sub": "Send this room code to a friend. The match starts automatically when they join.",
    "room.shareHint": "📩 Or send the code via Messenger / Zalo — they enter it on the home screen to join.", "room.waiting": "⏳ Waiting for opponent to join...", "room.startPlacement": "Start placing your fleet",
    "room.inviteLink": "🔗 Invite by link", "room.linkCopied": "Link copied ✓",
    "share.invite": "📨 Invite via Messenger", "share.inviteShort": "📨 Invite via Messenger", "share.opening": "Opening Messenger…", "share.openingShort": "Opening…",
    "share.imgTitle": "SEA BATTLE", "share.imgCode": "Room code", "share.text": "Come play Sea Battle with me! Room code: {code}",
    "over.win": "VICTORY!", "over.lose": "DEFEAT", "over.winTimeout": "Opponent stalled too long — you win.", "over.loseTimeout": "You stalled too long and forfeited.",
    "over.winNormal": "You sank the entire enemy fleet.", "over.loseNormal": "Your entire fleet was sunk.", "over.rematch": "Play again",
    "left.title": "Opponent left the room", "left.body": "The match has ended. Return to the lobby to create a new room or play the bot.", "left.toLobby": "Back to lobby",
    "offline.banner": "📡 Opponent disconnected. Waiting to reconnect",
    "leave.titleBot": "Quit match?", "leave.titleRoom": "Leave room?", "leave.bodyBot": "You'll quit the match vs the bot and return to the lobby.",
    "leave.bodyRoom": "You'll leave the room and return to the lobby. Your opponent will be notified.", "leave.stay": "Stay",
    "roombar.vsBot": "🤖 vs Bot", "roombar.room": "Room",
    "chat.title": "Chat", "chat.placeholder": "Type a message…", "chat.send": "Send",
    "help.open": "❓ How to play", "help.title": "How to play", "help.close": "Got it",
    "help.objTitle": "🎯 Goal", "help.objBody": "Be the first to sink all 5 of your opponent's ships.",
    "help.setupTitle": "⚓ Place your fleet", "help.setupBody": "Your fleet starts placed at random. Drag a ship to move it, double-tap to rotate, or tap 🎲 Random for a new layout — then hit Ready.",
    "help.turnTitle": "💥 Taking turns", "help.turnBody": "Tap enemy waters to fire. A hit lets you fire again; a miss passes the turn. Each turn has a 20s timer — stall too long and you forfeit.",
    "help.modesTitle": "🕹️ Modes", "help.modesBody": "Classic: pure battleship. Advance: power-ups appear on the enemy sea — hit them to collect, then use them on your turn.",
    "help.powerTitle": "⚡ Power-ups (Advance mode)",
    "help.pwScatter": "Blasts 3–5 random enemy cells.", "help.pwCross": "Fires in a plus shape (center + 4 neighbors).",
    "help.pwDouble": "Your next miss still keeps the turn.", "help.pwReveal": "Reveals one hidden enemy ship cell.",
    "help.pwMine": "Place on your own sea — if the enemy hits it, they lose their next turn.",
    "help.chatTitle": "💬 Chat", "help.chatBody": "Tap 💬 to send a quick emoji or message — it pops as a bubble over your avatar for a few seconds (no chat log).",
    "help.reconnectTitle": "📡 Reconnect", "help.reconnectBody": "If you disconnect or background the app, your seat is held for 3 minutes. Re-open to resume the match.",
    "footer": "Battleship Online · share the room code to invite friends",
    "log.oppJoined": "Opponent joined the room.", "log.oppReady": "Opponent is ready.", "log.oppOffline": "Opponent disconnected, waiting to reconnect...", "log.oppReconnect": "Opponent reconnected.",
    "log.youFirst": "You go first. Open fire!", "log.oppFirst": "Opponent goes first.", "log.botFirst": "Bot goes first.",
    "log.youTimeout": "You ran out of time — turn passes to the opponent.", "log.oppTimeout": "Opponent ran out of time — your turn.",
    "log.enemyHitMine": "Enemy hit YOUR mine — they lose their next turn!", "log.enemySunk": "Enemy SANK {n} of your ships!",
    "log.enemyPowerHit": "Enemy used a power-up — HIT your ship!", "log.enemyPowerMiss": "Enemy used a power-up — missed.",
    "log.enemyFireHit": "Enemy fired {cell} — HIT your ship!", "log.enemyFireMiss": "Enemy fired {cell} — missed.",
    "log.oppLeft": "Opponent left.", "log.fleetReady": "Fleet ready. Waiting for opponent...",
    "log.botSunk": "Bot SANK your {n}-cell ship!", "log.botFireHit": "Bot fired {cell} — HIT your ship!", "log.botFireMiss": "Bot fired {cell} — missed.",
    "log.youSunkOne": "You SANK a ship ({n} cells)! Fire again!", "log.youFireHit": "You fired {cell} — HIT! Fire again!", "log.youFireMiss": "You fired {cell} — missed.",
    "log.collected": "You collected a power-up: {list}!", "log.youSunkN": "You SANK {n} ships! Fire again!",
    "log.labelHit": "{label} — HIT! Fire again!", "log.labelMiss": "{label} — missed.", "log.youHitMine": "You hit the ENEMY's mine — you lose your next turn!",
    "log.minePlaced": "Mine placed at {cell}. If the enemy hits it they lose a turn!", "log.doubleActivated": "Extra Turn activated — your next miss still keeps the turn!",
    "log.revealed": "Revealed an enemy ship cell at {cell}!", "log.scatterBoom": "💥 Scatter Blast!",
    "notice.youTimeout": "⏱️ Time's up! You lost your turn.", "notice.enemyHitMine": "💥 Enemy stepped on YOUR mine! They lose their next turn.",
    "notice.youHitMine": "💥 You stepped on the ENEMY's mine! You lose your next turn.", "notice.shareFail": "Couldn't open Messenger — send the room code manually.",
    "label.power": "Power-up {name}", "label.youFire": "You fired {cell}",
    "err.ROOM_NOT_FOUND": "Room not found", "err.ROOM_FULL": "Room is full", "err.GAME_STARTED": "The match already started", "err.NO_ROOM": "No room",
    "err.BAD_PLACEMENT": "Invalid ship placement", "err.NOT_YOUR_TURN": "Not your turn yet", "err.BAD_CELL": "Invalid cell", "err.NO_POWERUP": "No power-up",
    "err.NO_REVEAL": "No cells left to reveal", "err.MINE_ON_SHIP": "Can't place a mine on a ship", "err.CELL_SHOT": "This cell was already shot",
    "err.MINE_EXISTS": "There's already a mine here", "err.NO_CELLS": "No cells left to shoot",
    "auth.signInPasskey": "🔐 Sign in with Passkey",
    "auth.createPasskey": "🔐 Create Passkey",
    "auth.addPasskey": "Add Passkey",
    "auth.passkeyRegistered": "Passkey registered!",
    "auth.errPasskeyFailed": "Passkey authentication failed. Please try again.",
    "auth.errFailed": "Sign-in failed. Please try again.",
    "auth.errExpired": "Your session has expired. Please sign in again.",
    "auth.errRateLimited": "Too many sign-in attempts. Please wait a moment.",
    "auth.continueEmail": "or continue with email",
    "auth.emailLabel": "Email",
    "auth.passwordLabel": "Password",
    "auth.loginBtn": "Log in",
    "auth.signupBtn": "Sign up",
    "auth.toggleToSignup": "Need an account? Sign up",
    "auth.toggleToLogin": "Have an account? Log in",
    "auth.forgotPassword": "Forgot password?",
    "auth.errEmailInUse": "That email is already registered.",
    "auth.errWeakPassword": "Password must be at least 8 characters.",
    "auth.errAuthFailed": "Incorrect email or password.",
    "auth.viewProfile": "View profile",
    "auth.signOut": "Sign out",
    "auth.signOutAll": "Sign out all devices",
    "auth.signOutAllConfirmTitle": "Sign out everywhere?",
    "auth.signOutAllConfirmBody": "You will be signed out on all devices, including this one.",
    "auth.signOutAllConfirmBtn": "Sign out all devices",
    "auth.keepSignedIn": "Keep me signed in",
    "auth.verifySuccess": "Email verified. Thanks!",
    "auth.verifyError": "That verification link is invalid or expired.",
    "auth.unverifiedHint": "Your email isn't verified yet — check your inbox.",
    "auth.resetRequest": "Reset your password",
    "auth.resetRequestBtn": "Send reset link",
    "auth.resetSent": "If that email is registered, a reset link is on its way.",
    "auth.resetNewPassword": "Choose a new password",
    "auth.resetSetBtn": "Set new password",
    "auth.resetSuccess": "Password updated. You can now log in.",
    "auth.resetBadToken": "That reset link is invalid or expired.",
    "profile.memberSince": "Member since {month} {year}",
    "profile.wins": "Wins",
    "profile.losses": "Losses",
    "profile.games": "Games",
    "profile.noGamesYet": "No games yet. Play some matches to see your record here.",
    "profile.back": "Back to lobby",
    "profile.challengeSoon": "Challenge (coming soon)",
    "profile.editName": "✏️ Edit name",
    "profile.saveName": "Save",
    "profile.nameSaved": "Name updated!",
    "profile.notFound": "Player not found. Return to lobby.",
    "queue.quickMatch": "⚡ Quick Match",
    "queue.titleCasual": "Quick Match",
    "queue.sub": "Searching for an opponent…",
    "queue.searching": "Searching…",
    "queue.elapsed": "Time waiting",
    "queue.cancel": "Leave Queue",
    "queue.botOfferBody": "No opponent yet. Play against the bot instead?",
    "queue.botOfferBtn": "🤖 Play vs Bot",
    "err.ALREADY_IN_QUEUE": "You're already in a queue",
    "err.ALREADY_IN_ROOM": "You're already in a match",
    "err.RATE_LIMITED": "Too many attempts — wait a moment",
    "err.INSUFFICIENT_BALANCE": "Not enough points",
    "err.PURCHASE_CAP_REACHED": "Purchase limit reached (3/match)",
    "err.NOT_ADVANCE_MODE": "Power-ups can only be purchased in advance mode",
    "err.GUEST_NO_WALLET": "Sign in to purchase power-ups",
    "err.WAGERED_REQUIRES_ACCOUNT": "Sign in to play wagered matches",
    "wallet.balance": "Points",
    "wallet.free": "Free play",
    "wallet.wager": "Wager",
    "wallet.stakeLabel": "Stake",
    "wallet.yourStake": "Your wager: {n} pts",
    "wallet.insufficientBalance": "Not enough points",
    "wallet.zeroBalance": "Play free games or win wagers to earn points!",
    "queue.freeMatch": "⚡ Quick Match",
    "queue.wageredMatch": "🪙 Wagered Match",
    "queue.stakeSelect": "Select stake",
    "queue.stake0": "Free (0 pts)",
    "queue.stake10": "10 pts",
    "queue.stake25": "25 pts",
    "queue.stake50": "50 pts",
    "queue.stake100": "100 pts",
    "queue.titleFree": "Free Match",
    "queue.titleWagered": "Wagered Match",
    "shop.buy": "Buy",
    "shop.title": "Power-up Shop",
    "shop.price": "{n} pts",
    "shop.remaining": "{n} left",
    "shop.capReached": "Limit reached",
    "shop.confirm": "Buy {type} for {price} pts?",
    "shop.oppBought": "Opponent purchased a power-up!",
    "game.pot": "Pot: {n} pts",
    "game.won": "+{n} pts won!",
    "game.lost": "-{n} pts wagered",
    "bot.easy": "Easy",
    "bot.medium": "Medium",
    "bot.hard": "Hard",
    "bot.insane": "Insane",
    "bot.selectTier": "Select difficulty",
    "bot.easyDesc": "Bot fires randomly",
    "bot.mediumDesc": "Bot hunts near hits",
    "bot.hardDesc": "Smart targeting AI",
    "bot.insaneDesc": "Near-perfect strategy",
    "lobby.quickPlay": "Quick Play",
    "lobby.quickPlaySub": "Find a random opponent",
    "lobby.botCard": "Bot",
    "lobby.botCardSub": "Practice",
    "lobby.friendCard": "Friends",
    "lobby.friendCardSub": "Room code",
    "lobby.friendTitle": "Play with friends",
    "lobby.onboardingHint": "Tap here to start playing!",
    "auth.signIn": "Sign in",
    "auth.signInTitle": "Sign in or create account",
  },
  vi: {
    "common.or": "HOẶC", "common.copied": "Đã chép ✓",
    "common.tapToCopy": "Chạm vào mã để chép", "common.bot": "Máy", "common.opponent": "Đối thủ",
    "common.exit": "Thoát", "common.leaveRoom": "Rời phòng", "common.roomCodeLabel": "Mã phòng:", "common.vsBotFull": "🤖 Chơi với máy",
    "topbar.tagline": "Online · Hải chiến", "topbar.soundToggle": "Bật/tắt âm thanh",
    "lobby.title": "Trận hải chiến", "lobby.sub": "Chơi với máy, hoặc tạo phòng rồi gửi mã cho bạn bè.",
    "lobby.playBot": "🤖 Chơi với máy", "lobby.createRoom": "⚓ Tạo phòng mới", "lobby.enterCodeLabel": "Nhập mã phòng", "lobby.joinBtn": "Vào phòng",
    "mode.classic": "Cổ điển", "mode.advance": "Nâng cao ⚡", "mode.classicDesc": "Cổ điển, không power-up", "mode.advanceDesc": "Nhặt & dùng power-up",
    "ship.carrier": "Tàu sân bay", "ship.battleship": "Thiết giáp hạm", "ship.cruiser": "Tàu tuần dương", "ship.submarine": "Tàu ngầm", "ship.destroyer": "Khu trục hạm",
    "pw.scatter": "Nổ ngẫu nhiên", "pw.cross": "Tên lửa chữ thập", "pw.double": "Thêm lượt", "pw.reveal": "Lộ ô thuyền", "pw.mine": "Mìn nước",
    "board.yourFleet": "Hạm đội của bạn",
    "place.shipTitle": "Kéo để di chuyển · chạm 2 lần để xoay",
    "place.hint": "Hạm đội được xếp ngẫu nhiên sẵn. Kéo thuyền để di chuyển, chạm 2 lần để xoay, hoặc bấm 🎲 Ngẫu nhiên để xếp lại.",
    "place.random": "🎲 Ngẫu nhiên", "place.ready": "⚓ Sẵn sàng chiến đấu", "place.readyMark": "Sẵn sàng ✓", "place.waitingOpp": "Đang chờ đối thủ...",
    "place.botReady": "✓ Máy đã sẵn sàng", "place.oppReady": "Đối thủ đã sẵn sàng", "place.oppPlacing": "Đối thủ đang bố trí...", "place.waitOpp": "Chờ đối thủ vào...",
    "counter.sunkEnemy": "Đã đánh chìm", "counter.sunkOwn": "Thuyền bị chìm", "counter.ships": "thuyền",
    "battle.you": "Bạn",
    "battle.aiming": "Đang ngắm {name} — chạm vào biển địch để khai hỏa (chạm lại nút để hủy).",
    "battle.aimingMine": "Đang đặt Mìn nước — chạm vào ô trống trên hạm đội của bạn để đặt (chạm lại nút để hủy).",
    "battle.yourTurn": "🎯 Lượt của bạn", "battle.botTurn": "⏳ Lượt của máy", "battle.oppTurn": "⏳ Lượt đối thủ",
    "battle.enemyWaters": "Vùng biển địch", "battle.fireSuffix": "— BẮN!", "battle.logStart": "Trận đấu bắt đầu...",
    "room.title": "Mời bạn bè", "room.sub": "Gửi mã phòng này cho bạn. Khi họ vào, ván đấu sẽ tự bắt đầu.",
    "room.shareHint": "📩 Hoặc gửi mã qua Messenger / Zalo — bạn nhập mã ở màn hình chính là vào.", "room.waiting": "⏳ Đang chờ đối thủ vào phòng...", "room.startPlacement": "Bắt đầu bố trí hạm đội",
    "room.inviteLink": "🔗 Mời bằng link", "room.linkCopied": "Đã chép link ✓",
    "share.invite": "📨 Mời bạn qua Messenger", "share.inviteShort": "📨 Mời qua Messenger", "share.opening": "Đang mở Messenger…", "share.openingShort": "Đang mở…",
    "share.imgTitle": "HẢI CHIẾN", "share.imgCode": "Mã phòng", "share.text": "Vào đấu Hải chiến với mình! Mã phòng: {code}",
    "over.win": "CHIẾN THẮNG!", "over.lose": "THẤT BẠI", "over.winTimeout": "Đối thủ bỏ lượt quá lâu — bạn thắng.", "over.loseTimeout": "Bạn bỏ lượt quá lâu nên bị xử thua.",
    "over.winNormal": "Bạn đã đánh chìm toàn bộ hạm đội địch.", "over.loseNormal": "Toàn bộ hạm đội của bạn đã bị đánh chìm.", "over.rematch": "Chơi lại",
    "left.title": "Đối thủ đã rời phòng", "left.body": "Ván đấu đã kết thúc. Quay lại sảnh để tạo phòng mới hoặc đấu với máy.", "left.toLobby": "Về sảnh",
    "offline.banner": "📡 Đối thủ tạm mất kết nối. Đang chờ kết nối lại",
    "leave.titleBot": "Thoát trận?", "leave.titleRoom": "Rời phòng?", "leave.bodyBot": "Bạn sẽ thoát trận đấu với máy và quay lại sảnh.",
    "leave.bodyRoom": "Bạn sẽ rời phòng và quay lại sảnh. Đối thủ sẽ được thông báo.", "leave.stay": "Ở lại",
    "roombar.vsBot": "🤖 Với máy", "roombar.room": "Phòng",
    "chat.title": "Trò chuyện", "chat.placeholder": "Nhập tin nhắn…", "chat.send": "Gửi",
    "help.open": "❓ Cách chơi", "help.title": "Cách chơi", "help.close": "Đã hiểu",
    "help.objTitle": "🎯 Mục tiêu", "help.objBody": "Đánh chìm cả 5 thuyền của đối thủ trước là thắng.",
    "help.setupTitle": "⚓ Bố trí hạm đội", "help.setupBody": "Hạm đội được xếp ngẫu nhiên sẵn. Kéo thuyền để di chuyển, chạm 2 lần để xoay, hoặc bấm 🎲 Ngẫu nhiên để xếp lại — rồi bấm Sẵn sàng.",
    "help.turnTitle": "💥 Lượt bắn", "help.turnBody": "Chạm vào biển địch để bắn. Trúng thì bắn tiếp; trượt thì chuyển lượt. Mỗi lượt có 20 giây — chần chừ quá lâu sẽ bị xử thua.",
    "help.modesTitle": "🕹️ Chế độ", "help.modesBody": "Classic: hải chiến thuần. Advance: power-up xuất hiện trên biển địch — bắn trúng để nhặt, rồi dùng trong lượt của bạn.",
    "help.powerTitle": "⚡ Power-up (chế độ Advance)",
    "help.pwScatter": "Nổ 3–5 ô ngẫu nhiên trên biển địch.", "help.pwCross": "Bắn theo hình chữ thập (tâm + 4 ô kề).",
    "help.pwDouble": "Phát trượt kế tiếp vẫn giữ lượt.", "help.pwReveal": "Lộ 1 ô thuyền địch đang ẩn.",
    "help.pwMine": "Đặt lên biển của mình — địch bắn trúng sẽ mất lượt kế tiếp.",
    "help.chatTitle": "💬 Trò chuyện", "help.chatBody": "Bấm 💬 để gửi emoji hoặc tin nhắn nhanh — nó hiện thành bong bóng trên avatar bạn vài giây (không có khung chat).",
    "help.reconnectTitle": "📡 Kết nối lại", "help.reconnectBody": "Nếu mất kết nối hoặc thoát nền app, ghế của bạn được giữ 3 phút. Mở lại để chơi tiếp.",
    "footer": "Battleship Online · chia sẻ mã phòng để mời bạn bè",
    "log.oppJoined": "Đối thủ đã vào phòng.", "log.oppReady": "Đối thủ đã sẵn sàng.", "log.oppOffline": "Đối thủ tạm mất kết nối, đang chờ kết nối lại...", "log.oppReconnect": "Đối thủ đã kết nối lại.",
    "log.youFirst": "Bạn đi trước. Khai hỏa!", "log.oppFirst": "Đối thủ đi trước.", "log.botFirst": "Máy đi trước.",
    "log.youTimeout": "Bạn bỏ lượt (hết giờ) — chuyển lượt cho đối thủ.", "log.oppTimeout": "Đối thủ hết giờ — tới lượt bạn.",
    "log.enemyHitMine": "Địch bắn trúng MÌN của bạn — địch mất lượt kế tiếp!", "log.enemySunk": "Địch ĐÁNH CHÌM {n} thuyền của bạn!",
    "log.enemyPowerHit": "Địch dùng power-up — TRÚNG tàu bạn!", "log.enemyPowerMiss": "Địch dùng power-up — trượt.",
    "log.enemyFireHit": "Địch bắn {cell} — TRÚNG tàu bạn!", "log.enemyFireMiss": "Địch bắn {cell} — trượt.",
    "log.oppLeft": "Đối thủ đã rời đi.", "log.fleetReady": "Hạm đội đã sẵn sàng. Chờ đối thủ...",
    "log.botSunk": "Máy ĐÁNH CHÌM thuyền {n} ô của bạn!", "log.botFireHit": "Máy bắn {cell} — TRÚNG tàu bạn!", "log.botFireMiss": "Máy bắn {cell} — trượt.",
    "log.youSunkOne": "Bạn ĐÁNH CHÌM 1 thuyền ({n} ô)! Bắn tiếp!", "log.youFireHit": "Bạn bắn {cell} — TRÚNG! Bắn tiếp!", "log.youFireMiss": "Bạn bắn {cell} — trượt.",
    "log.collected": "Bạn nhặt được power-up: {list}!", "log.youSunkN": "Bạn ĐÁNH CHÌM {n} thuyền! Bắn tiếp!",
    "log.labelHit": "{label} — TRÚNG! Bắn tiếp!", "log.labelMiss": "{label} — trượt.", "log.youHitMine": "Bạn bắn trúng MÌN của địch — bạn mất lượt kế tiếp!",
    "log.minePlaced": "Đã đặt mìn tại {cell}. Địch bắn trúng sẽ mất lượt!", "log.doubleActivated": "Kích hoạt Thêm lượt — phát trượt kế tiếp vẫn giữ lượt!",
    "log.revealed": "Lộ 1 ô thuyền địch tại {cell}!", "log.scatterBoom": "💥 Nổ ngẫu nhiên!",
    "notice.youTimeout": "⏱️ Hết giờ! Bạn mất lượt.", "notice.enemyHitMine": "💥 Địch dẫm phải MÌN của bạn! Địch mất lượt kế tiếp.",
    "notice.youHitMine": "💥 Bạn dẫm phải MÌN của địch! Bạn mất lượt kế tiếp.", "notice.shareFail": "Không mở được Messenger — hãy gửi mã phòng thủ công.",
    "label.power": "Power-up {name}", "label.youFire": "Bạn bắn {cell}",
    "err.ROOM_NOT_FOUND": "Phòng không tồn tại", "err.ROOM_FULL": "Phòng đã đủ người", "err.GAME_STARTED": "Ván đấu đã bắt đầu", "err.NO_ROOM": "Không có phòng",
    "err.BAD_PLACEMENT": "Sắp xếp thuyền không hợp lệ", "err.NOT_YOUR_TURN": "Chưa tới lượt bạn", "err.BAD_CELL": "Ô không hợp lệ", "err.NO_POWERUP": "Không có power-up",
    "err.NO_REVEAL": "Không còn ô để lộ", "err.MINE_ON_SHIP": "Không đặt mìn lên thuyền", "err.CELL_SHOT": "Ô này đã bị bắn",
    "err.MINE_EXISTS": "Đã có mìn ở đây", "err.NO_CELLS": "Hết ô để bắn",
    "auth.signInPasskey": "🔐 Đăng nhập Passkey",
    "auth.createPasskey": "🔐 Tạo Passkey",
    "auth.addPasskey": "Thêm Passkey",
    "auth.passkeyRegistered": "Đã đăng ký Passkey!",
    "auth.errPasskeyFailed": "Xác thực Passkey thất bại. Vui lòng thử lại.",
    "auth.errFailed": "Đăng nhập thất bại. Vui lòng thử lại.",
    "auth.errExpired": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    "auth.errRateLimited": "Quá nhiều lần thử. Vui lòng chờ một chút.",
    "auth.continueEmail": "hoặc tiếp tục bằng email",
    "auth.emailLabel": "Email",
    "auth.passwordLabel": "Mật khẩu",
    "auth.loginBtn": "Đăng nhập",
    "auth.signupBtn": "Đăng ký",
    "auth.toggleToSignup": "Chưa có tài khoản? Đăng ký",
    "auth.toggleToLogin": "Đã có tài khoản? Đăng nhập",
    "auth.forgotPassword": "Quên mật khẩu?",
    "auth.errEmailInUse": "Email này đã được đăng ký.",
    "auth.errWeakPassword": "Mật khẩu phải có ít nhất 8 ký tự.",
    "auth.errAuthFailed": "Email hoặc mật khẩu không đúng.",
    "auth.viewProfile": "Xem hồ sơ",
    "auth.signOut": "Đăng xuất",
    "auth.signOutAll": "Đăng xuất tất cả thiết bị",
    "auth.signOutAllConfirmTitle": "Đăng xuất khỏi tất cả thiết bị?",
    "auth.signOutAllConfirmBody": "Bạn sẽ bị đăng xuất khỏi tất cả thiết bị, kể cả thiết bị này.",
    "auth.signOutAllConfirmBtn": "Đăng xuất tất cả",
    "auth.keepSignedIn": "Giữ đăng nhập",
    "auth.verifySuccess": "Đã xác minh email. Cảm ơn bạn!",
    "auth.verifyError": "Liên kết xác minh không hợp lệ hoặc đã hết hạn.",
    "auth.unverifiedHint": "Email của bạn chưa được xác minh — vui lòng kiểm tra hộp thư.",
    "auth.resetRequest": "Đặt lại mật khẩu",
    "auth.resetRequestBtn": "Gửi liên kết đặt lại",
    "auth.resetSent": "Nếu email đã đăng ký, liên kết đặt lại sẽ được gửi tới.",
    "auth.resetNewPassword": "Chọn mật khẩu mới",
    "auth.resetSetBtn": "Đặt mật khẩu mới",
    "auth.resetSuccess": "Đã cập nhật mật khẩu. Bạn có thể đăng nhập.",
    "auth.resetBadToken": "Liên kết đặt lại không hợp lệ hoặc đã hết hạn.",
    "profile.memberSince": "Thành viên từ tháng {month} năm {year}",
    "profile.wins": "Chiến thắng",
    "profile.losses": "Thất bại",
    "profile.games": "Ván đấu",
    "profile.noGamesYet": "Chưa có ván nào. Hãy chơi vài trận để xem thành tích tại đây.",
    "profile.back": "Quay lại sảnh",
    "profile.challengeSoon": "Thách đấu (sắp có)",
    "profile.editName": "✏️ Sửa tên",
    "profile.saveName": "Lưu",
    "profile.nameSaved": "Đã cập nhật tên!",
    "profile.notFound": "Không tìm thấy người chơi. Quay lại sảnh.",
    "queue.quickMatch": "⚡ Ghép trận nhanh",
    "queue.titleCasual": "Ghép trận nhanh",
    "queue.sub": "Đang tìm đối thủ…",
    "queue.searching": "Đang tìm…",
    "queue.elapsed": "Thời gian chờ",
    "queue.cancel": "Rời hàng chờ",
    "queue.botOfferBody": "Chưa tìm được đối thủ. Chơi với máy thay vào?",
    "queue.botOfferBtn": "🤖 Chơi với máy",
    "err.ALREADY_IN_QUEUE": "Bạn đang trong hàng chờ rồi",
    "err.ALREADY_IN_ROOM": "Bạn đang trong trận rồi",
    "err.RATE_LIMITED": "Quá nhiều lần thử — chờ một lát",
    "err.INSUFFICIENT_BALANCE": "Không đủ điểm",
    "err.PURCHASE_CAP_REACHED": "Đã đạt giới hạn mua (3/trận)",
    "err.NOT_ADVANCE_MODE": "Chỉ mua được power-up ở chế độ nâng cao",
    "err.GUEST_NO_WALLET": "Đăng nhập để mua power-up",
    "err.WAGERED_REQUIRES_ACCOUNT": "Đăng nhập để chơi trận cá cược",
    "wallet.balance": "Điểm",
    "wallet.free": "Chơi miễn phí",
    "wallet.wager": "Cá cược",
    "wallet.stakeLabel": "Mức cược",
    "wallet.yourStake": "Cược của bạn: {n} điểm",
    "wallet.insufficientBalance": "Không đủ điểm",
    "wallet.zeroBalance": "Chơi miễn phí hoặc thắng cược để kiếm điểm!",
    "queue.freeMatch": "⚡ Ghép trận nhanh",
    "queue.wageredMatch": "🪙 Trận cá cược",
    "queue.stakeSelect": "Chọn mức cược",
    "queue.stake0": "Miễn phí (0 đ)",
    "queue.stake10": "10 điểm",
    "queue.stake25": "25 điểm",
    "queue.stake50": "50 điểm",
    "queue.stake100": "100 điểm",
    "queue.titleFree": "Ghép trận nhanh",
    "queue.titleWagered": "Trận cá cược",
    "shop.buy": "Mua",
    "shop.title": "Cửa hàng Power-up",
    "shop.price": "{n} điểm",
    "shop.remaining": "Còn {n} lượt",
    "shop.capReached": "Đã hết lượt mua",
    "shop.confirm": "Mua {type} với {price} điểm?",
    "shop.oppBought": "Đối thủ đã mua power-up!",
    "game.pot": "Thưởng: {n} điểm",
    "game.won": "+{n} điểm thắng!",
    "game.lost": "-{n} điểm đã cược",
    "bot.easy": "Dễ",
    "bot.medium": "Trung bình",
    "bot.hard": "Khó",
    "bot.insane": "Cực khó",
    "bot.selectTier": "Chọn độ khó",
    "bot.easyDesc": "Bot bắn ngẫu nhiên",
    "bot.mediumDesc": "Bot săn gần điểm trúng",
    "bot.hardDesc": "AI nhắm mục tiêu thông minh",
    "bot.insaneDesc": "Chiến thuật gần hoàn hảo",
    "lobby.quickPlay": "Chơi nhanh",
    "lobby.quickPlaySub": "Tìm đối thủ ngẫu nhiên",
    "lobby.botCard": "Bot",
    "lobby.botCardSub": "Luyện tập",
    "lobby.friendCard": "Bạn bè",
    "lobby.friendCardSub": "Mã phòng",
    "lobby.friendTitle": "Chơi với bạn bè",
    "lobby.onboardingHint": "Bấm vào đây để bắt đầu chơi!",
    "auth.signIn": "Đăng nhập",
    "auth.signInTitle": "Đăng nhập hoặc tạo tài khoản",
  },
};
function t(k, p) {
  let s = (I18N[LANG] && I18N[LANG][k] != null) ? I18N[LANG][k] : I18N.en[k];
  if (s == null) return k;
  if (p) for (const key in p) s = s.replace(new RegExp("\\{" + key + "\\}", "g"), p[key]);
  return s;
}
const cellLabel = (r, c) => ROWS[r] + (c + 1);              // "B7" style coordinate
const shipName = (id) => t("ship." + id);
const errText = (res) => (res && res.code ? t("err." + res.code) : (res && res.error) || "");

// fleet definitions (names resolved via i18n)
const FLEET_DEF = [
  { id: "carrier", name: shipName("carrier"), size: 5 },
  { id: "battleship", name: shipName("battleship"), size: 4 },
  { id: "cruiser", name: shipName("cruiser"), size: 3 },
  { id: "submarine", name: shipName("submarine"), size: 3 },
  { id: "destroyer", name: shipName("destroyer"), size: 2 },
];

// Same-origin when SERVER_URL is empty (server serves the client too); an
// absolute wss:// can be injected at build time to point at a remote server.
const SOCKET_URL = process.env.SERVER_URL || undefined;
// autoConnect:false — connect only after the App effect attaches its listeners,
// so the first "resume" isn't missed by a fast connect event.
const socket = io(SOCKET_URL, { autoConnect: false });

// ---------- âm thanh (Web Audio, không cần file) ----------
const Sound = (function () {
  let ctx = null, enabled = true;
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  // mở khóa âm thanh sau cú chạm đầu tiên (bắt buộc trên iOS Safari)
  function unlock() { const c = ac(); if (c) { const o = c.createOscillator(); const g = c.createGain(); g.gain.value = 0; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.01); } }
  window.addEventListener("pointerdown", unlock, { once: true });

  function tone(freq, dur, type, vol, slideTo) {
    const c = ac(); if (!c || !enabled) return;
    const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol) {
    const c = ac(); if (!c || !enabled) return;
    const t = c.currentTime;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = vol || 0.4;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1200;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t);
  }
  return {
    setEnabled(v) { enabled = v; },
    isEnabled() { return enabled; },
    hit() { tone(180, 0.18, "square", 0.35, 90); noise(0.18, 0.25); },
    miss() { tone(320, 0.12, "sine", 0.18, 160); },
    sunk() { noise(0.5, 0.5); tone(120, 0.5, "sawtooth", 0.35, 50); },
    fire() { tone(220, 0.08, "triangle", 0.2, 120); },
    // power-up detonation: a punchy boom (initial crack + low rumble)
    explode() { noise(0.5, 0.6); tone(180, 0.45, "sawtooth", 0.4, 50); setTimeout(() => { noise(0.3, 0.35); tone(80, 0.5, "sine", 0.35, 38); }, 40); },
    powerup() { tone(660, 0.1, "sine", 0.3); setTimeout(() => tone(990, 0.12, "sine", 0.3), 90); },
    mine() { noise(0.6, 0.6); tone(90, 0.6, "sawtooth", 0.45, 40); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, "triangle", 0.3), i * 130)); },
    lose() { [400, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.28, "sawtooth", 0.25), i * 150)); },
  };
})();

// Persistent client identity so reconnects keep our seat. Resolution order:
//   1. localStorage random id — survives reloads when storage works.
//   2. fresh random id — last resort (no persistence; rely on manual code).
let clientId = (function () {
  try {
    let id = localStorage.getItem("bs_clientId");
    if (!id) { id = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("bs_clientId", id); }
    return id;
  } catch (e) { return "c" + Math.random().toString(36).slice(2) + Date.now().toString(36); }
})();
function saveRoom(c) { try { c ? localStorage.setItem("bs_room", c) : localStorage.removeItem("bs_room"); } catch (e) {} }
function loadRoom() { try { return localStorage.getItem("bs_room"); } catch (e) { return null; } }
function saveBotTier(tier) { try { localStorage.setItem("bs_botTier", tier); } catch (e) {} }
function loadBotTier() { try { const stored = localStorage.getItem("bs_botTier"); return VALID_TIERS.includes(stored) ? stored : "medium"; } catch (e) { return "medium"; } }
// Invite-by-link: a shared URL like https://site/?room=ABCDE lets a friend join
// directly. roomFromUrl reads the code; clearRoomUrl strips it after joining so a
// reload doesn't re-trigger (reconnect is handled by resume/localStorage instead).
function roomFromUrl() {
  try {
    const r = new URL(window.location.href).searchParams.get("room");
    return r ? r.toUpperCase().trim().slice(0, 5) : null;
  } catch (e) { return null; }
}
function clearRoomUrl() {
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.has("room")) { u.searchParams.delete("room"); window.history.replaceState({}, "", u.pathname + u.search + u.hash); }
  } catch (e) {}
}
function roomLink(code) { try { return window.location.origin + "/?room=" + code; } catch (e) { return code; } }
// Persist the current room code in localStorage so a reload can auto-rejoin.
function persistRoom(code) { saveRoom(code); }


// App-like: block iOS pinch-zoom (Safari/WKWebView ignore user-scalable=no for
// gestures) and double-tap-to-zoom. touch-action:manipulation in CSS handles
// most; these guards cover the rest. Passive:false so preventDefault works.
(function lockZoom() {
  try {
    ["gesturestart", "gesturechange", "gestureend"].forEach((ev) =>
      document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
    let lastTouch = 0;
    document.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTouch <= 300) e.preventDefault(); // double-tap zoom
      lastTouch = now;
    }, { passive: false });
  } catch (e) {}
})();

// pixel geometry of a grid cell (must match style.css)
const CELL = 32, GAP = 2, PAD = 6, PITCH = CELL + GAP; // 34

// ---------- realistic warship SVG ----------
function ShipSVG({ len }) {
  const W = len * PITCH - GAP; // px length
  const H = CELL;
  const bow = 16; // pointed bow length
  const hull = `M2,${H*0.30} L${W-bow},${H*0.22} L${W-3},${H*0.5} L${W-bow},${H*0.78} L2,${H*0.70} Q-1,${H*0.5} 2,${H*0.30} Z`;
  // turrets + superstructure scaled to length
  const turrets = [];
  const n = Math.max(1, len - 2);
  for (let i = 0; i < n; i++) {
    const x = (W * (0.18 + 0.62 * (n === 1 ? 0.5 : i / (n - 1))));
    turrets.push(x);
  }
  return (
    <svg className="ship-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      width={W} height={H} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`hg${len}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9aa6b0" />
          <stop offset="0.5" stopColor="#69757f" />
          <stop offset="1" stopColor="#3c454d" />
        </linearGradient>
      </defs>
      <path d={hull} fill={`url(#hg${len})`} stroke="#2a3138" strokeWidth="1.2" />
      {/* deck stripe */}
      <path d={`M6,${H*0.42} L${W-bow-2},${H*0.37} L${W-bow-2},${H*0.63} L6,${H*0.58} Z`}
        fill="#586671" opacity="0.7" />
      {/* bridge / superstructure */}
      <rect x={W*0.34} y={H*0.30} width={Math.max(7, W*0.10)} height={H*0.40} rx="2"
        fill="#7d8893" stroke="#2a3138" strokeWidth="0.8" />
      <rect x={W*0.37} y={H*0.18} width="4" height={H*0.22} rx="1" fill="#46505a" />
      {/* gun turrets */}
      {turrets.map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={H*0.5} r={H*0.13} fill="#48535d" stroke="#222a30" strokeWidth="0.8" />
          <rect x={x} y={H*0.46} width={H*0.30} height={H*0.08} fill="#2c343b" rx="1" />
        </g>
      ))}
    </svg>
  );
}

// ---------- helpers ----------
function key(r, c) { return r + "," + c; }
function cellsFor(r, c, size, dir) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    cells.push(dir === "h" ? { r, c: c + i } : { r: r + i, c });
  }
  return cells;
}
function inBounds(cells) {
  return cells.every((x) => x.r >= 0 && x.r < BOARD && x.c >= 0 && x.c < BOARD);
}

// ---------- PasswordResetForm (AUTH-08 / D-19) ----------
// Two modes controlled by the `resetToken` prop:
//   - request mode (resetToken===null): email input + "Send reset link" button.
//     On submit: POST /auth/reset-request; ALWAYS shows the same enumeration-safe
//     confirmation regardless of response (mirrors server's T-02-44 behavior).
//   - set-new mode (resetToken is a string): password input + "Set new password" button.
//     On submit: POST /auth/reset {token,password}; on {ok:true} calls onSuccess();
//     on BAD_TOKEN/WEAK_PASSWORD/RATE_LIMITED maps to localized error strings.
//
// Opened from the Plan 07 "Forgot password?" link (request mode) or the
// App mount effect's ?reset= URL param parse (set-new mode).
function PasswordResetForm({ resetToken, onSuccess, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);   // request mode: confirmation shown
  const [success, setSuccess] = useState(false); // set-new mode: success shown
  const [loading, setLoading] = useState(false);

  const isSetNew = resetToken != null;

  function mapResetCode(code) {
    if (code === "BAD_TOKEN") return t("auth.resetBadToken");
    if (code === "WEAK_PASSWORD") return t("auth.errWeakPassword");
    if (code === "RATE_LIMITED") return t("auth.errRateLimited");
    return t("auth.errFailed");
  }

  async function handleRequest(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await fetch("/auth/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      // ALWAYS show the same confirmation — never reveal whether the email exists (T-02-44)
      setSent(true);
    } catch (_) {
      // Even on network error, show the same confirmation (enumeration-safe UI)
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetNew(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token: resetToken, password }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(true);
        if (onSuccess) onSuccess();
      } else {
        setError(mapResetCode(data.code));
      }
    } catch (_) {
      setError(t("auth.errFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (!isSetNew) {
    // Request mode
    if (sent) {
      return (
        <div className="email-auth-form">
          <div className="notice">{t("auth.resetSent")}</div>
          {onBack && (
            <button type="button" className="email-auth-link" onClick={onBack}>
              {t("auth.toggleToLogin")}
            </button>
          )}
        </div>
      );
    }
    return (
      <form className="email-auth-form" onSubmit={handleRequest} noValidate>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>{t("auth.resetRequest")}</h3>
        {error && <div className="error">{error}</div>}
        <label>{t("auth.emailLabel")}
          <input
            type="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <button type="submit" className="btn primary" disabled={loading}>
          {t("auth.resetRequestBtn")}
        </button>
        {onBack && (
          <div className="email-auth-links">
            <button type="button" className="email-auth-link" onClick={onBack}>
              {t("auth.toggleToLogin")}
            </button>
          </div>
        )}
      </form>
    );
  }

  // Set-new mode
  if (success) {
    return (
      <div className="email-auth-form">
        <div className="notice">{t("auth.resetSuccess")}</div>
        {onBack && (
          <button type="button" className="email-auth-link" onClick={onBack}>
            {t("auth.toggleToLogin")}
          </button>
        )}
      </div>
    );
  }
  return (
    <form className="email-auth-form" onSubmit={handleSetNew} noValidate>
      <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>{t("auth.resetNewPassword")}</h3>
      {error && <div className="error">{error}</div>}
      <label>{t("auth.passwordLabel")}
        <input
          type="password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          autoComplete="new-password"
          required
        />
      </label>
      <button type="submit" className="btn primary" disabled={loading}>
        {t("auth.resetSetBtn")}
      </button>
    </form>
  );
}

// ---------- EmailAuthForm (D-21) ----------
// Collapsible login/signup form below the Google + Facebook buttons.
// Only rendered when !authUser (guests only). Collapsed by default.
// On success calls onAuthSuccess(user) so App sets authUser.
// onForgotPassword: callback from App/Lobby to open PasswordResetForm (Plan 09).
function EmailAuthForm({ onAuthSuccess, clientId: cid }) {
  const [collapsed, setCollapsed] = useState(true);
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function mapCode(code) {
    if (code === "EMAIL_IN_USE") return t("auth.errEmailInUse");
    if (code === "WEAK_PASSWORD") return t("auth.errWeakPassword");
    if (code === "AUTH_FAILED") return t("auth.errAuthFailed");
    if (code === "RATE_LIMITED") return t("auth.errRateLimited");
    return t("auth.errFailed");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const endpoint = mode === "login" ? "/auth/login" : "/auth/signup";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password, clientId: cid }),
      });
      const data = await res.json();
      if (data.ok) {
        setEmail("");
        setPassword("");
        setCollapsed(true);
        onAuthSuccess(data.user);
      } else {
        setError(mapCode(data.code));
      }
    } catch (_) {
      setError(t("auth.errFailed"));
    } finally {
      setLoading(false);
    }
  }

  // "Forgot password?" link wires to PasswordResetForm (Plan 09)
  function handleForgotPassword(e) {
    e.preventDefault();
    if (onForgotPassword) onForgotPassword();
  }

  return (
    <div className="email-auth-wrap">
      <button
        type="button"
        className="email-auth-toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        {t("auth.continueEmail")}
      </button>
      {!collapsed && (
        <form className="email-auth-form" onSubmit={handleSubmit} noValidate>
          {error && <div className="error">{error}</div>}
          <label>{t("auth.emailLabel")}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>{t("auth.passwordLabel")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>
          <button type="submit" className="btn primary" disabled={loading}>
            {mode === "login" ? t("auth.loginBtn") : t("auth.signupBtn")}
          </button>
          <div className="email-auth-links">
            <button
              type="button"
              className="email-auth-link"
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
            >
              {mode === "login" ? t("auth.toggleToSignup") : t("auth.toggleToLogin")}
            </button>
            {mode === "login" && null}
          </div>
        </form>
      )}
    </div>
  );
}

// ---------- BottomSheet ----------
function BottomSheet({ open, onClose, title, children }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    // Focus trap: focus first focusable element
    setTimeout(() => {
      if (panelRef.current) {
        const el = panelRef.current.querySelector("button, input, [tabindex]");
        if (el) el.focus();
      }
    }, 100);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);
  return (
    <div className={"bottom-sheet-overlay" + (open ? " open" : "")} onClick={onClose} role="presentation">
      <div className="bottom-sheet-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="bottom-sheet-title">{title}</div>
        <button className="bottom-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        {children}
      </div>
    </div>
  );
}

// ---------- Lobby ----------
function Lobby({ onCreate, onJoin, onBot, onQuickMatch, onWageredMatch, onHelp, error, authUser, authError, verifyNotice, clientId, signInDisabled, onSignInDisable, onEmailAuthSuccess, balance }) {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("classic");
  const [selectedTier, setSelectedTier] = useState(loadBotTier);
  const [selectedStake, setSelectedStake] = useState(10);
  const [roomStake, setRoomStake] = useState(0);
  const [botSheetOpen, setBotSheetOpen] = useState(false);
  const [friendSheetOpen, setFriendSheetOpen] = useState(false);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [hasPlatformAuth, setHasPlatformAuth] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem("lobby_onboarded"); } catch { return true; }
  });

  function dismissOnboarding() {
    setShowOnboarding(false);
    try { localStorage.setItem("lobby_onboarded", "1"); } catch {}
  }
  // Feature-detect WebAuthn support (passkeys).
  useEffect(() => {
    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
        window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
          .then(available => setHasPlatformAuth(available))
          .catch(() => setHasPlatformAuth(true));
      } else {
        setHasPlatformAuth(true);
      }
      if (typeof window.PublicKeyCredential.isConditionalMediationAvailable === "function") {
        window.PublicKeyCredential.isConditionalMediationAvailable()
          .then(available => { if (available) setHasPlatformAuth(true); })
          .catch(() => {});
      }
    }
  }, []);

  return (
    <div className="lobby">
      <h2>{t("lobby.title")}</h2>
      {error && <div className="error">{error}</div>}
      {verifyNotice === "success" && <div className="notice verify-notice">{t("auth.verifySuccess")}</div>}
      {verifyNotice === "error" && <div className="error verify-notice">{t("auth.verifyError")}</div>}

      {/* Hero CTA — Quick Play */}
      <button className={"btn primary hero-cta" + (showOnboarding ? " onboarding-pulse" : "")} onClick={() => { dismissOnboarding(); onQuickMatch(); }}>
        <span className="hero-icon">⚡</span>
        <span className="hero-text">
          <strong>{t("lobby.quickPlay")}</strong>
          <small>{t("lobby.quickPlaySub")}</small>
        </span>
      </button>
      {showOnboarding && <div className="onboarding-hint">{t("lobby.onboardingHint")}</div>}

      {/* Secondary cards row */}
      <div className="lobby-cards">
        <button className="lobby-card" onClick={() => { dismissOnboarding(); setBotSheetOpen(true); }} aria-label={t("lobby.botCard") + " - " + t("lobby.botCardSub")}>
          <span className="card-icon">🤖</span>
          <strong>{t("lobby.botCard")}</strong>
          <small>{t("lobby.botCardSub")}</small>
        </button>
        <button className="lobby-card" onClick={() => { dismissOnboarding(); setFriendSheetOpen(true); }} aria-label={t("lobby.friendCard") + " - " + t("lobby.friendCardSub")}>
          <span className="card-icon">👥</span>
          <strong>{t("lobby.friendCard")}</strong>
          <small>{t("lobby.friendCardSub")}</small>
        </button>
      </div>

      {/* Mode toggle — compact segmented control */}
      <div className="mode-toggle-compact" role="radiogroup" aria-label="Game mode">
        <button className={mode === "classic" ? "active" : ""} role="radio" aria-checked={mode === "classic"} onClick={() => setMode("classic")}>
          {t("mode.classic")}
        </button>
        <button className={mode === "advance" ? "active" : ""} role="radio" aria-checked={mode === "advance"} onClick={() => setMode("advance")}>
          {t("mode.advance")}
        </button>
      </div>

      {/* Wager section — only for logged-in users */}
      {authUser && balance !== null && (
        <div className="wager-strip">
          <span className="wager-balance">🪙 {balance}</span>
          <div className="wager-chips">
            {[10, 25, 50, 100].map((s) => (
              <button key={s} className={"chip" + (selectedStake === s ? " active" : "")} onClick={() => setSelectedStake(s)} disabled={balance < s}>{s}</button>
            ))}
          </div>
          <button className="btn steel compact" onClick={() => { dismissOnboarding(); onWageredMatch(selectedStake); }} disabled={balance < selectedStake}>
            {t("queue.wageredMatch")}
          </button>
        </div>
      )}

      {/* Footer utilities */}
      <div className="lobby-footer">
        <button className="btn ghost compact" onClick={onHelp}>{t("help.open")}</button>
        {!authUser && (
          <button className="btn ghost compact" onClick={() => setAuthSheetOpen(true)}>{t("auth.signIn")}</button>
        )}
      </div>

      {/* Bottom Sheet: Bot difficulty */}
      <BottomSheet open={botSheetOpen} onClose={() => setBotSheetOpen(false)} title={t("bot.selectTier")}>
        <div className="sheet-options">
          {VALID_TIERS.map((tier) => (
            <button key={tier} className="sheet-option" onClick={() => { saveBotTier(tier); setSelectedTier(tier); onBot(tier); setBotSheetOpen(false); }}>
              <strong>{t("bot." + tier)}</strong>
              <small>{t("bot." + tier + "Desc")}</small>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Bottom Sheet: Friends / Room */}
      <BottomSheet open={friendSheetOpen} onClose={() => setFriendSheetOpen(false)} title={t("lobby.friendTitle")}>
        <button className="btn steel" onClick={() => { onCreate(mode, roomStake); setFriendSheetOpen(false); }}>{t("lobby.createRoom")}</button>
        {authUser && (
          <div style={{ margin: "8px 0", textAlign: "center" }}>
            <select value={roomStake} onChange={(e) => setRoomStake(Number(e.target.value))} style={{ padding: "4px 8px", fontSize: "0.9em", background: "rgba(255,255,255,.08)", color: "#cfe8ff", border: "1px solid rgba(150,200,255,.2)", borderRadius: "6px" }}>
              <option value={0}>{t("queue.stake0")}</option>
              {[10, 25, 50, 100].map((s) => (
                <option key={s} value={s} disabled={balance < s}>{s} pts</option>
              ))}
            </select>
          </div>
        )}
        <div className="divider">{t("common.or")}</div>
        <div className="field">
          <label>{t("lobby.enterCodeLabel")}</label>
          <input className="code-input" maxLength={5} placeholder="ABCDE"
            value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter" && code) { onJoin(code); setFriendSheetOpen(false); } }} />
        </div>
        <button className="btn steel" disabled={code.length < 4} onClick={() => { onJoin(code); setFriendSheetOpen(false); }}>{t("lobby.joinBtn")}</button>
      </BottomSheet>

      {/* Bottom Sheet: Auth (for guests) */}
      <BottomSheet open={authSheetOpen} onClose={() => setAuthSheetOpen(false)} title={t("auth.signInTitle")}>
        {authError && (
          <div className="error" style={{ marginBottom: 12 }}>
            {authError === "rateLimited" ? t("auth.errRateLimited") : t("auth.errFailed")}
          </div>
        )}
        {hasPlatformAuth && (
          <PasskeyButton clientId={clientId} onAuthSuccess={(u) => { onEmailAuthSuccess(u); setAuthSheetOpen(false); }} />
        )}
        <EmailAuthForm onAuthSuccess={(u) => { onEmailAuthSuccess(u); setAuthSheetOpen(false); }} clientId={clientId} />
      </BottomSheet>
    </div>
  );
}

// ---------- Grid ----------
const POWER_ICON = { scatter: "\u{1F320}", cross: "➕", double: "\u{1F501}", reveal: "\u{1F50D}", mine: "\u{1F6A7}" };
const POWER_NAME = { scatter: t("pw.scatter"), cross: t("pw.cross"), double: t("pw.double"), reveal: t("pw.reveal"), mine: t("pw.mine") };
function Grid({ enemy, occ, hits, incoming, onCellClick, hoverCells, onCellHover, shootable, sunk, flash, powerups, revealed, aimCells, mines, placeable }) {
  // occ: Set of "r,c" your ships (own board)
  // hits: Set of "r,c" shots you fired at enemy (enemy board)
  // incoming: Map "r,c" -> hit boolean (shots enemy fired at you, own board)
  const cells = [];
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      const k = key(r, c);
      let cls = "cell";
      let content = null;
      if (enemy) {
        if (hits && hits.has(k)) {
          cls += hits.get(k) ? " hit" : " miss";
        } else if (shootable) {
          cls += " shootable";
        }
        if (powerups && powerups.has(k) && !(hits && hits.has(k))) {
          cls += " powerup"; content = POWER_ICON[powerups.get(k)] || "⭐";
        }
        if (revealed && revealed.has(k) && !(hits && hits.has(k))) cls += " revealed";
        if (aimCells && aimCells.has(k)) cls += " aim";
        if (hoverCells && hoverCells.has(k)) cls += " ship";
      } else {
        if (occ && occ.has(k)) cls += " ship";
        if (incoming && incoming.has(k)) cls += incoming.get(k) ? " hit" : " miss";
        if (mines && mines.has(k)) { cls += " mine"; content = POWER_ICON.mine; }
        if (placeable && !(occ && occ.has(k)) && !(incoming && incoming.has(k)) && !(mines && mines.has(k))) cls += " selectable";
        if (hoverCells && hoverCells.has(k)) cls += " ship";
      }
      if (sunk && sunk.has(k)) cls += " sunk";
      if (flash && flash === k) cls += " flash";
      cells.push(
        <div key={k} className={cls}
          onClick={() => onCellClick && onCellClick(r, c)}
          onMouseEnter={() => onCellHover && onCellHover(r, c)}
          onMouseLeave={() => onCellHover && onCellHover(-1, -1)}>{content}</div>
      );
    }
  }
  return (
    <div className="grid-outer">
      <div className={"grid " + (enemy ? "enemy" : "own")}
        style={{ gridTemplateColumns: `repeat(${BOARD}, var(--cell))` }}>
        {cells}
      </div>
    </div>
  );
}

// ---------- Placement screen (touch + mouse drag) ----------
function Placement({ onConfirm, ready, waiting }) {
  // placed: id -> {r, c, dir}
  const [placed, setPlaced] = useState({});
  const [drag, setDrag] = useState(null);    // {id, dir, offset, dx, dy, sz, fromBoard}
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const gridRef = useRef(null);
  const movedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  // Start with a random fleet already on the board (no dragging from an
  // off-screen dock). The player can still drag/rotate to rearrange, or hit
  // Random/Clear. Only seeds on a fresh placement screen (not after confirm).
  useEffect(() => { if (!ready && Object.keys(placed).length === 0) randomize(); }, []);

  const sizeOf = (id) => FLEET_DEF.find((f) => f.id === id).size;

  function occExcept(exceptId) {
    const occ = new Set();
    for (const [id, p] of Object.entries(placed)) {
      if (id === exceptId) continue;
      cellsFor(p.r, p.c, sizeOf(id), p.dir).forEach((x) => occ.add(key(x.r, x.c)));
    }
    return occ;
  }
  function validAt(cells, exceptId) {
    if (!inBounds(cells)) return false;
    const occ = occExcept(exceptId);
    return cells.every((x) => !occ.has(key(x.r, x.c)));
  }

  // anchor cell (top-left of ship) from a screen point, given active drag
  function anchorFromPoint(cx, cy, d) {
    const rect = gridRef.current.getBoundingClientRect();
    let c = Math.floor((cx - rect.left - PAD) / PITCH);
    let r = Math.floor((cy - rect.top - PAD) / PITCH);
    if (d.dir === "h") c -= d.offset; else r -= d.offset;
    return { r, c };
  }

  // start dragging (works for pointer = mouse, touch, pen)
  function startDrag(e, id, fromBoard) {
    e.preventDefault();
    const sz = sizeOf(id);
    const useDir = placed[id].dir;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    const along = useDir === "h" ? dx : dy;
    const offset = Math.min(sz - 1, Math.max(0, Math.floor(along / PITCH)));
    movedRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ id, dir: useDir, offset, dx, dy, sz, fromBoard });
    setPos({ x: e.clientX, y: e.clientY });
  }

  // attach window listeners while dragging
  useEffect(() => {
    if (!drag) return;
    function move(e) {
      if (e.cancelable) e.preventDefault();
      const dxm = e.clientX - startRef.current.x, dym = e.clientY - startRef.current.y;
      if (Math.abs(dxm) > 8 || Math.abs(dym) > 8) movedRef.current = true;
      setPos({ x: e.clientX, y: e.clientY });
    }
    function up(e) {
      const d = drag;
      // a tap (barely moved) rotates the ship instead of dropping it
      if (!movedRef.current) { rotatePlaced(d.id); setDrag(null); return; }
      const { r, c } = anchorFromPoint(e.clientX, e.clientY, d);
      const cells = cellsFor(r, c, d.sz, d.dir);
      if (validAt(cells, d.id)) setPlaced((p) => ({ ...p, [d.id]: { r, c, dir: d.dir } }));
      setDrag(null);
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", () => setDrag(null));
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, placed]); // eslint-disable-line

  function rotatePlaced(id) {
    const p = placed[id];
    const nd = p.dir === "h" ? "v" : "h";
    const cells = cellsFor(p.r, p.c, sizeOf(id), nd);
    if (validAt(cells, id)) setPlaced((pl) => ({ ...pl, [id]: { ...p, dir: nd } }));
  }
  function randomize() {
    const np = {}, taken = new Set();
    for (const f of FLEET_DEF) {
      let ok = false, t = 0;
      while (!ok && t++ < 800) {
        const d = Math.random() < 0.5 ? "h" : "v";
        const r = Math.floor(Math.random() * BOARD), c = Math.floor(Math.random() * BOARD);
        const cells = cellsFor(r, c, f.size, d);
        if (inBounds(cells) && cells.every((x) => !taken.has(key(x.r, x.c)))) {
          cells.forEach((x) => taken.add(key(x.r, x.c)));
          np[f.id] = { r, c, dir: d }; ok = true;
        }
      }
    }
    setPlaced(np);
  }

  const allPlaced = FLEET_DEF.every((f) => placed[f.id]);
  function confirm() {
    const ships = FLEET_DEF.map((f) => ({
      size: f.size, dir: placed[f.id].dir,
      cells: cellsFor(placed[f.id].r, placed[f.id].c, f.size, placed[f.id].dir),
    }));
    onConfirm(ships);
  }

  // live preview while dragging
  let hoverKeys = new Set(), hoverBad = new Set();
  if (drag) {
    const { r, c } = anchorFromPoint(pos.x, pos.y, drag);
    const cells = cellsFor(r, c, drag.sz, drag.dir);
    const valid = validAt(cells, drag.id);
    const ks = cells.filter((x) => x.r >= 0 && x.r < BOARD && x.c >= 0 && x.c < BOARD).map((x) => key(x.r, x.c));
    if (valid) hoverKeys = new Set(ks); else hoverBad = new Set(ks);
  }

  // build 10x10 cells
  const gridCells = [];
  for (let r = 0; r < BOARD; r++) for (let c = 0; c < BOARD; c++) {
    const k = key(r, c);
    let cls = "cell";
    if (hoverKeys.has(k)) cls += " preview-ok";
    if (hoverBad.has(k)) cls += " preview-bad";
    gridCells.push(<div key={k} className={cls} />);
  }

  function ghostBox(d) {
    return d.dir === "h"
      ? { width: d.sz * PITCH - GAP, height: CELL }
      : { width: CELL, height: d.sz * PITCH - GAP };
  }

  return (
    <div className="place-wrap">
      <p className="hint place-hint">{t("place.hint")}</p>
      <div className="controls place-actions">
        <button className="btn ghost" onClick={randomize}>{t("place.random")}</button>
        <button className="btn primary" disabled={!allPlaced || ready} onClick={confirm}>
          {ready ? (waiting ? t("place.waitingOpp") : t("place.readyMark")) : t("place.ready")}
        </button>
      </div>

      <div className="board-wrap">
        <div className="grid-outer">
          <div className="grid own" ref={gridRef}
            style={{ gridTemplateColumns: `repeat(${BOARD}, var(--cell))`, position: "relative" }}>
            {gridCells}
            {/* placed ships overlay */}
            {Object.entries(placed).map(([id, p]) => {
              if (drag && drag.id === id) return null; // hide while dragging
              const sz = sizeOf(id);
              const box = p.dir === "h"
                ? { left: PAD + p.c * PITCH, top: PAD + p.r * PITCH, width: sz * PITCH - GAP, height: CELL }
                : { left: PAD + p.c * PITCH, top: PAD + p.r * PITCH, width: CELL, height: sz * PITCH - GAP };
              return (
                <div key={id} className="ship-overlay" style={box}
                  onPointerDown={(e) => startDrag(e, id, true)}
                  onDoubleClick={() => rotatePlaced(id)}
                  title={t("place.shipTitle")}>
                  <div className={"ship-fig " + p.dir} style={{ width: sz * PITCH - GAP, height: CELL }}>
                    <ShipSVG len={sz} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* floating ghost following the finger / cursor */}
      {drag && (
        <div className="drag-ghost" style={Object.assign(
          { left: pos.x - drag.dx, top: pos.y - drag.dy }, ghostBox(drag))}>
          <div className={"ship-fig " + drag.dir} style={{ width: drag.sz * PITCH - GAP, height: CELL }}>
            <ShipSVG len={drag.sz} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Battle screen ----------
const TOTAL_SHIPS = FLEET_DEF.length; // 5
function Counter({ label, value, cls }) {
  const pct = Math.round((value / TOTAL_SHIPS) * 100);
  return (
    <div className="counter">
      <span>{label} {value}/{TOTAL_SHIPS} {t("counter.ships")}</span>
      <div className="bar"><div className={"fill " + cls} style={{ width: pct + "%" }} /></div>
    </div>
  );
}
function PowerBar({ inv, aim, onPower, myTurn }) {
  const items = ["scatter", "cross", "double", "reveal", "mine"];
  return (
    <div className="powerbar">
      {items.map((t) => (
        <button key={t} disabled={!myTurn || (inv[t] || 0) <= 0}
          className={"power-btn" + (aim === t ? " aiming" : "")} onClick={() => onPower(t)}>
          <span className="pi">{POWER_ICON[t]}</span>
          <span className="pn">{POWER_NAME[t]}</span>
          <span className="pc">{inv[t] || 0}</span>
        </button>
      ))}
    </div>
  );
}
// Player card: avatar + name + score, used on both sides of the scoreboard.
function PlayerCard({ profile, fallbackName, score, active, isBot, side, bubble }) {
  const name = (profile && profile.name) || fallbackName;
  const photo = profile && profile.photo;
  return (
    <div className={"pcard " + side + (active ? " active" : "")}>
      <div className="pc-avatar-wrap">
        {photo
          ? <img className="pc-avatar" src={photo} alt="" referrerPolicy="no-referrer" />
          : <span className="pc-avatar pc-fallback">{isBot ? "🤖" : (name ? name.slice(0, 1) : "?")}</span>}
        {bubble && <div className={"chat-bubble " + side + (/^\p{Extended_Pictographic}{1,3}$/u.test((bubble.text || "").trim()) ? " emoji" : "")} key={bubble.id}>{bubble.text}</div>}
      </div>
      <div className="pc-meta">
        <span className="pc-name" title={name}>{name}</span>
        <span className="pc-score">{score}</span>
      </div>
    </div>
  );
}
// Circular countdown ring in the center of the scoreboard.
function TurnRing({ secs, frac, show, myTurn }) {
  if (!show || secs == null) return null;
  const R = 22, C = 2 * Math.PI * R;
  const low = secs <= 10;
  const color = low ? "#ff6b78" : (myTurn ? "#7ff0aa" : "#9fb6cc");
  return (
    <div className={"turn-ring" + (low ? " low" : "")}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5" />
        <circle cx="28" cy="28" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 28 28)"
          style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <span className="turn-ring-sec" style={{ color }}>{secs}</span>
    </div>
  );
}
function Battle({ myTurn, vsBot, occ, incoming, myShots, onFire, log, sunkOpp, sunkMine, sunkEnemyCells, sunkMyCells, myScore, oppScore, oppLabel, myProfile, oppProfile, myBubble, oppBubble, flashEnemy, flashMine, mode, inv, powerups, revealedEnemy, aim, onPower, myMines, onPlaceMine, turnDeadline, turnDur, shake }) {
  const [tab, setTab] = useState("enemy"); // enemy | own (mobile)
  // đếm ngược lượt từ deadline server gửi (null = không giới hạn, vd đấu máy)
  const [secs, setSecs] = useState(null);
  const [frac, setFrac] = useState(1);
  useEffect(() => {
    if (!turnDeadline) { setSecs(null); setFrac(1); return; }
    const dur = turnDur || 20000;
    const tick = () => {
      const rem = Math.max(0, turnDeadline - Date.now());
      const newSecs = Math.ceil(rem / 1000);
      const newFrac = Math.max(0, Math.min(1, rem / dur));
      setSecs(newSecs);
      setFrac(newFrac);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [turnDeadline, turnDur]);
  // tự động chuyển tab theo lượt, delay ~2s để kịp nhìn địch bắn vào đâu rồi mới đổi bản đồ
  useEffect(() => {
    if (aim === "mine") { setTab("own"); return; }
    const t = setTimeout(() => setTab(myTurn ? "enemy" : "own"), 1300);
    return () => clearTimeout(t);
  }, [myTurn, aim]);
  return (
    <div>
      <div className="scoreboard">
        <PlayerCard side="me" profile={myProfile} fallbackName={t("battle.you")} score={myScore} active={myTurn && turnDeadline != null} bubble={myBubble} />
        <TurnRing secs={secs} frac={frac} show={turnDeadline != null} myTurn={myTurn} />
        <PlayerCard side="opp" profile={oppProfile} fallbackName={oppLabel} score={oppScore} active={!myTurn && turnDeadline != null} isBot={vsBot} bubble={oppBubble} />
      </div>
      {mode === "advance" && (
        <PowerBar inv={inv} aim={aim} onPower={onPower} myTurn={myTurn} />
      )}
      {aim && aim !== "mine" && (
        <div className="aim-banner">{t("battle.aiming", { name: POWER_NAME[aim] })}</div>
      )}
      {aim === "mine" && (
        <div className="aim-banner">{t("battle.aimingMine")}</div>
      )}
      <div className={"boards tab-" + tab + (shake ? " shake" : "")}>
        <div className="board-wrap wrap-enemy">
          <div className="board-title enemy">{t("battle.enemyWaters")} {myTurn ? t("battle.fireSuffix") : ""}</div>
          <Grid enemy hits={myShots} shootable={myTurn} sunk={sunkEnemyCells} flash={flashEnemy}
            powerups={powerups} revealed={revealedEnemy}
            onCellClick={(r, c) => myTurn && onFire(r, c)} />
          <Counter label={t("counter.sunkEnemy")} value={sunkOpp} cls="enemy" />
        </div>
        <div className="board-wrap wrap-own">
          <div className="board-title own">{t("board.yourFleet")}</div>
          <Grid occ={occ} incoming={incoming} sunk={sunkMyCells} flash={flashMine}
            mines={myMines} placeable={aim === "mine"}
            onCellClick={(r, c) => aim === "mine" && onPlaceMine(r, c)} />
          <Counter label={t("counter.sunkOwn")} value={sunkMine} cls="own" />
        </div>
      </div>
      <div className="log">
        {log.length === 0 && <div>{t("battle.logStart")}</div>}
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}

// ---------- How-to-play (manual, opened from the lobby) ----------
function HelpModal({ open, onClose }) {
  if (!open) return null;
  const section = (title, body) => (
    <div className="help-sec"><h4>{title}</h4><p>{body}</p></div>
  );
  const pw = (icon, name, desc) => (
    <div className="help-pw"><span className="help-pw-i">{icon}</span><div><b>{name}</b><span>{desc}</span></div></div>
  );
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("help.title")}</h2>
        <div className="help-body">
          {section(t("help.objTitle"), t("help.objBody"))}
          {section(t("help.setupTitle"), t("help.setupBody"))}
          {section(t("help.turnTitle"), t("help.turnBody"))}
          {section(t("help.modesTitle"), t("help.modesBody"))}
          <div className="help-sec">
            <h4>{t("help.powerTitle")}</h4>
            {pw(POWER_ICON.scatter, POWER_NAME.scatter, t("help.pwScatter"))}
            {pw(POWER_ICON.cross, POWER_NAME.cross, t("help.pwCross"))}
            {pw(POWER_ICON.double, POWER_NAME.double, t("help.pwDouble"))}
            {pw(POWER_ICON.reveal, POWER_NAME.reveal, t("help.pwReveal"))}
            {pw(POWER_ICON.mine, POWER_NAME.mine, t("help.pwMine"))}
          </div>
          {section(t("help.chatTitle"), t("help.chatBody"))}
          {section(t("help.reconnectTitle"), t("help.reconnectBody"))}
        </div>
        <button className="btn primary" onClick={onClose}>{t("help.close")}</button>
      </div>
    </div>
  );
}

// ---------- Chat (in-room, ephemeral) ----------
// Messages are NOT logged — each one pops as a 3s speech bubble over the sender's
// avatar (see PlayerCard `bubble`). This composer only sends.
// Expressive taunt / mock / praise / challenge set — more fun than plain reactions.
const CHAT_EMOJIS = ["😏", "😈", "💪", "🫵", "🥱", "🤡", "💀", "🤣", "👏", "🫡", "👑", "🔥", "🎯", "🤝"];
function ChatComposer({ open, onSend, onToggle }) {
  const [text, setText] = useState("");
  if (!open) return null;
  function submit(e) { if (e) e.preventDefault(); const tx = text.trim(); if (!tx) return; onSend(tx); setText(""); }
  return (
    <div className="chat-panel">
      <div className="chat-head">
        <b>{t("chat.title")}</b>
        <button className="btn ghost" onClick={onToggle} style={{ width: "auto", padding: "2px 10px" }}>✕</button>
      </div>
      <div className="chat-emojis">
        {CHAT_EMOJIS.map((e) => <button key={e} className="chat-emoji" onClick={() => onSend(e)}>{e}</button>)}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder={t("chat.placeholder")} />
        <button className="btn primary" type="submit" style={{ width: "auto" }}>{t("chat.send")}</button>
      </form>
    </div>
  );
}

// ---------- PasskeyButton ----------
// Smart single button for passkey auth.
// Checks SERVER (not localStorage) if this device's clientId already has a passkey.
// If yes → shows "Đăng nhập" (login flow). If no → shows "Tạo Passkey" (register flow).
// Once registered, button permanently switches to login mode for this device.
function PasskeyButton({ clientId, onAuthSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isReturning, setIsReturning] = useState(false);
  const [checked, setChecked] = useState(false);

  // On mount: ask server if this clientId already has a passkey
  useEffect(() => {
    if (!clientId) { setChecked(true); return; }
    fetch("/auth/webauthn/has-passkey?clientId=" + encodeURIComponent(clientId))
      .then(r => r.json())
      .then(data => {
        setIsReturning(data.hasPasskey === true);
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, [clientId]);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      if (isReturning) {
        await doLogin();
      } else {
        await doRegister();
      }
    } catch (e) {
      if (e.name === "NotAllowedError" || e.name === "AbortError") {
        // User cancelled biometric prompt — do nothing
      } else if (e.name === "InvalidStateError") {
        // Device already has passkey for this RP — switch to login
        setIsReturning(true);
        try { await doLogin(); } catch (_) {}
      } else {
        console.error("[passkey]", e.message || e);
        setError(e.message || t("auth.errPasskeyFailed"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function doLogin() {
    const optRes = await fetch("/auth/webauthn/login-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    });
    const optData = await optRes.json();
    if (!optData.ok) throw new Error("login-options failed");

    const assertion = await startAuthentication({ optionsJSON: optData.options });

    const verRes = await fetch("/auth/webauthn/login-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ credential: assertion, challengeToken: optData.challengeToken }),
    });
    const verData = await verRes.json();
    if (!verData.ok) throw new Error(verData.debug || verData.code || "WEBAUTHN_FAILED");

    if (onAuthSuccess) onAuthSuccess(verData.user);
  }

  async function doRegister() {
    const optRes = await fetch("/auth/webauthn/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ clientId }),
    });
    const optData = await optRes.json();
    if (!optData.ok) {
      if (optData.code === "ALREADY_HAS_PASSKEY") {
        // Server confirms passkey exists → switch to login
        setIsReturning(true);
        await doLogin();
        return;
      }
      throw new Error("register-options failed");
    }

    const attestation = await startRegistration({ optionsJSON: optData.options });

    const verRes = await fetch("/auth/webauthn/register-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        credential: attestation,
        challengeToken: optData.challengeToken,
        _pendingClientId: optData._pendingClientId,
        _existingUserId: optData._existingUserId,
      }),
    });
    const verData = await verRes.json();
    if (!verData.ok) throw new Error(verData.code || "WEBAUTHN_FAILED");

    // Now this device has a passkey — switch to login mode permanently
    setIsReturning(true);
    if (verData.user && onAuthSuccess) onAuthSuccess(verData.user);
  }

  if (!checked) return null; // don't render until server check is done

  return (
    <div style={{ marginBottom: 8 }}>
      {error && <div className="error" style={{ marginBottom: 8 }}>{error}</div>}
      <button
        className="btn passkey-signin"
        disabled={loading}
        onClick={handleClick}
      >
        {loading ? "..." : (isReturning ? t("auth.signInPasskey") : t("auth.createPasskey"))}
      </button>
    </div>
  );
}

// ---------- ProfileChip ----------
// Renders the signed-in avatar chip in the topbar. Clickable; opens the dropdown.
function ProfileChip({ user, onToggle, active }) {
  const initial = (user.displayName || "?").slice(0, 1).toUpperCase();
  return (
    <div
      className={"profile-chip" + (active ? " active" : "")}
      title={user.displayName || ""}
      onClick={onToggle}
      role="button"
      aria-haspopup="menu"
      aria-expanded={active}
      style={{ cursor: "pointer" }}
    >
      {user.avatarUrl
        ? <img className="avatar" src={user.avatarUrl} alt={user.displayName || ""} referrerPolicy="no-referrer" />
        : <span className="avatar avatar-fallback" aria-label={user.displayName || ""}>{initial}</span>}
      <span className="pname">{user.displayName}</span>
    </div>
  );
}

// ---------- AvatarMenu ----------
// Dropdown menu for the signed-in user. Opens on chip click.
// Closes on Escape, outside click, or item selection.
// confirmMode shows an inline sign-out-all confirmation.
function AvatarMenu({ open, user, onViewProfile, onSignOut, onSignOutAll, confirmMode, onConfirm, onCancel, setViewProfileId }) {
  const menuRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onCancel();
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open, onCancel]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  if (confirmMode) {
    return (
      <div className="avatar-menu" ref={menuRef} role="menu">
        <div role="alert" style={{ padding: "12px 16px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: "#eaf2ff" }}>{t("auth.signOutAllConfirmTitle")}</div>
          <div style={{ fontSize: 12, color: "#a9ccec", marginBottom: 12 }}>{t("auth.signOutAllConfirmBody")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{ flex: 1, padding: "8px 0", fontSize: 12, background: "var(--hit)", color: "#fff", fontFamily: "Be Vietnam Pro", textTransform: "none", letterSpacing: 0, height: "auto", minHeight: 36 }}
              onClick={onConfirm}
            >
              {t("auth.signOutAllConfirmBtn")}
            </button>
            <button
              className="btn ghost"
              style={{ flex: 1, padding: "8px 0", fontSize: 12, fontFamily: "Be Vietnam Pro", textTransform: "none", letterSpacing: 0, height: "auto", minHeight: 36 }}
              onClick={onCancel}
            >
              {t("auth.keepSignedIn")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="avatar-menu" ref={menuRef} role="menu">
      <button className="avatar-menu-item" role="menuitem" onClick={() => { onViewProfile(); onCancel(); }}>
        👤 {t("auth.viewProfile")}
      </button>
      <button className="avatar-menu-item" role="menuitem" onClick={() => { onSignOut(); onCancel(); }}>
        🚪 {t("auth.signOut")}
      </button>
      <div className="avatar-menu-sep" />
      <button className="avatar-menu-item destructive" role="menuitem" onClick={onSignOutAll}>
        ⚠️ {t("auth.signOutAll")}
      </button>
    </div>
  );
}

// ---------- ProfileView ----------
// Renders own or another player's public zero-state profile.
// PROF-01: own profile shows sign-out shortcut + member-since + 0/0/0 stats.
// PROF-02: other player shows disabled Challenge placeholder, no sign-out.
function ProfileView({ userId, currentUserId, onBack, onSignOut }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    if (!userId) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setNotFound(false);
    setData(null);
    fetch("/api/profile/" + userId)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((json) => {
        if (json) { setData(json); }
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [userId]);

  const isOwn = userId != null && currentUserId != null && String(userId) === String(currentUserId);

  // Format memberSince date into {month} {year}
  function formatMemberSince(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return t("profile.memberSince", { month, year });
  }

  const allZero = data && data.stats && data.stats.wins === 0 && data.stats.losses === 0 && data.stats.gamesPlayed === 0;

  if (notFound) {
    return (
      <div className="profile-view" role="main">
        <div className="error" style={{ textAlign: "center", marginBottom: 20 }}>
          {t("profile.notFound")}
        </div>
        <div style={{ textAlign: "center" }}>
          <button className="btn ghost" style={{ padding: "8px 20px" }} onClick={onBack}>{t("profile.back")}</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="profile-view" role="main" aria-busy="true">
        <div className="profile-header profile-skeleton">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar-skel skeleton-pulse" aria-hidden="true" />
          </div>
          <div className="profile-meta-skel">
            <div className="skeleton-pulse profile-name-skel" aria-hidden="true" />
            <div className="skeleton-pulse profile-since-skel" aria-hidden="true" />
          </div>
        </div>
        <div className="profile-stats profile-skeleton" aria-hidden="true">
          <div className="stat-cell">
            <div className="skeleton-pulse stat-label-skel" />
            <div className="skeleton-pulse stat-fig-skel" />
          </div>
          <div className="stat-cell">
            <div className="skeleton-pulse stat-label-skel" />
            <div className="skeleton-pulse stat-fig-skel" />
          </div>
          <div className="stat-cell">
            <div className="skeleton-pulse stat-label-skel" />
            <div className="skeleton-pulse stat-fig-skel" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const avatarLetter = data.displayName ? data.displayName.slice(0, 1).toUpperCase() : "?";
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameNotice, setNameNotice] = useState("");

  function startEdit() {
    setNameInput(data.displayName || "");
    setEditing(true);
    setNameNotice("");
  }

  async function saveName() {
    if (nameSaving || !nameInput.trim()) return;
    setNameSaving(true);
    try {
      const res = await fetch("/api/profile/update-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        setData({ ...data, displayName: json.displayName });
        setEditing(false);
        setNameNotice(t("profile.nameSaved"));
        setTimeout(() => setNameNotice(""), 3000);
      }
    } catch (e) {
      console.error("[profile] saveName failed:", e);
    } finally {
      setNameSaving(false);
    }
  }

  return (
    <div className="profile-view" role="main">
      <div className="profile-header">
        <div className="profile-avatar-wrap">
          {data.avatarUrl
            ? <img className="profile-avatar" src={data.avatarUrl} alt={data.displayName || ""} referrerPolicy="no-referrer" />
            : <span className="profile-avatar profile-avatar-fallback">{avatarLetter}</span>}
        </div>
        <div className="profile-meta">
          {editing ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={40}
                style={{ fontSize: 16, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(150,200,255,.3)", background: "rgba(255,255,255,.08)", color: "#fff", width: 160 }}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && saveName()}
              />
              <button className="btn steel" style={{ padding: "6px 12px", fontSize: 13, width: "auto" }} onClick={saveName} disabled={nameSaving}>
                {t("profile.saveName")}
              </button>
            </div>
          ) : (
            <div className="profile-name">
              {data.displayName || "—"}
              {isOwn && (
                <button
                  onClick={startEdit}
                  style={{ background: "none", border: "none", color: "#a9ccec", cursor: "pointer", fontSize: 13, marginLeft: 8, padding: "2px 6px" }}
                  title={t("profile.editName")}
                >
                  ✏️
                </button>
              )}
            </div>
          )}
          {nameNotice && <div style={{ fontSize: 12, color: "#7ff0aa", marginTop: 4 }}>{nameNotice}</div>}
          <div className="profile-since">{formatMemberSince(data.memberSince)}</div>
        </div>
      </div>

      <div className="profile-stats">
        <div className="stat-cell">
          <div className="stat-label">{t("profile.wins")}</div>
          <div className="stat-fig">{data.stats.wins}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">{t("profile.losses")}</div>
          <div className="stat-fig">{data.stats.losses}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">{t("profile.games")}</div>
          <div className="stat-fig">{data.stats.gamesPlayed}</div>
        </div>
      </div>

      {allZero && (
        <div className="profile-no-games">{t("profile.noGamesYet")}</div>
      )}

      <div className="profile-actions">
        {isOwn && onSignOut && (
          <button className="btn ghost" style={{ padding: "8px 20px" }} onClick={onSignOut}>{t("auth.signOut")}</button>
        )}
        {!isOwn && (
          <button className="btn ghost" style={{ padding: "8px 20px", opacity: 0.4, cursor: "not-allowed" }} disabled aria-disabled="true">
            {t("profile.challengeSoon")}
          </button>
        )}
        <button className="btn ghost" style={{ padding: "8px 20px" }} onClick={onBack}>{t("profile.back")}</button>
      </div>
    </div>
  );
}

// ---------- App ----------
function App() {
  const [screen, setScreen] = useState("lobby"); // lobby | room | placement | battle | profile | queue
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const [oppPresent, setOppPresent] = useState(false);
  const [oppReady, setOppReady] = useState(false);
  const [iReady, setIReady] = useState(false);
  const [myTurn, setMyTurn] = useState(false);
  const [turnDeadline, setTurnDeadline] = useState(null); // mốc hết giờ lượt (ms) từ server
  const [turnDur, setTurnDur] = useState(20000);          // độ dài 1 lượt (ms) cho vòng đếm
  const [oppProfile, setOppProfile] = useState(null);     // {name, photo} đối thủ
  const [occ, setOcc] = useState(new Set());
  const [incoming, setIncoming] = useState(new Map()); // shots on me
  const [myShots, setMyShots] = useState(new Map());   // shots I fired -> hit bool
  const [log, setLog] = useState([]);
  const [over, setOver] = useState(null); // {win}
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sunkOpp, setSunkOpp] = useState(0);   // địch bị ta đánh chìm
  const [sunkMine, setSunkMine] = useState(0); // thuyền của ta bị chìm
  const [mode, setMode] = useState("classic"); // classic | advance
  const [inv, setInv] = useState({ scatter: 0, cross: 0, double: 0, reveal: 0, mine: 0 });
  const [myMines, setMyMines] = useState(new Set()); // mìn ta đã đặt trên hạm đội mình
  const [powerups, setPowerups] = useState(new Map()); // ô power-up trên biển địch: key->type
  const [revealedEnemy, setRevealedEnemy] = useState(new Set()); // ô thuyền địch đã bị lộ
  const [aim, setAim] = useState(null); // power-up đang ngắm: null | "cluster" | "cross"
  const [flashEnemy, setFlashEnemy] = useState(null); // ô mình vừa bắn (biển địch)
  const [flashMine, setFlashMine] = useState(null);   // ô địch vừa bắn (hạm đội mình)
  const [shake, setShake] = useState(false);          // board recoil khi trúng/nổ
  const [sunkEnemyCells, setSunkEnemyCells] = useState(new Set()); // ô thuyền địch đã chìm
  const [sunkMyCells, setSunkMyCells] = useState(new Set());       // ô thuyền ta đã chìm
  const [myScore, setMyScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [notice, setNotice] = useState(null); // thông báo nổi (vd: dẫm mìn)
  const [oppLeft, setOppLeft] = useState(false); // đối thủ rời phòng -> hiện modal + về sảnh
  const [oppOffline, setOppOffline] = useState(false); // đối thủ tạm mất kết nối
  const [graceLeft, setGraceLeft] = useState(0);        // đếm ngược giây chờ kết nối lại
  const [confirmLeave, setConfirmLeave] = useState(false); // hỏi xác nhận trước khi rời
  const [profile, setProfile] = useState({ name: null, photo: null });
  const [helpOpen, setHelpOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Auth state: null = guest; {id, displayName, avatarUrl} = signed-in (D-12)
  const [authUser, setAuthUser] = useState(null);
  const [authError, setAuthError] = useState(null);   // 'failed' | 'rateLimited'
  const [verifyNotice, setVerifyNotice] = useState(null); // 'success' | 'error' (AUTH-07)
  const [signInDisabled, setSignInDisabled] = useState(false); // during OAuth redirect
  // Password-reset state (AUTH-08 / Plan 09)
  const [resetToken, setResetToken] = useState(null);   // string when ?reset=<token> in URL (set-new mode)
  const [resetMode, setResetMode] = useState(false);    // true when "Forgot password?" clicked (request mode)
  // Avatar dropdown state (Plan 03)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [signOutAllConfirm, setSignOutAllConfirm] = useState(false);
  // Profile screen state (Plan 04)
  const [viewProfileId, setViewProfileId] = useState(null); // opaque users.id to view
  const [profileData, setProfileData] = useState(null);     // loaded profile JSON
  const [profileLoading, setProfileLoading] = useState(false); // skeleton while fetching
  const [myBubble, setMyBubble] = useState(null);   // {id, text} — speech bubble over my avatar
  const [oppBubble, setOppBubble] = useState(null); // {id, text} — over opponent avatar
  // Queue state (Phase 5 — 05-01)
  const [queueType, setQueueType]               = useState(null);   // "free" | "wagered" | null
  const [queueSince, setQueueSince]             = useState(null);   // Date.now() when enqueued
  const [queueWindow, setQueueWindow]           = useState(null);   // (legacy — unused, kept for state cleanup)
  const [botOfferVisible, setBotOfferVisible]   = useState(false);  // D-09 delayed bot prompt
  const [elapsedSec, setElapsedSec]             = useState(0);      // re-render tick for elapsed timer
  // Points economy (Phase 7)
  const [balance, setBalance]                   = useState(null);   // null = guest/unknown, number = signed-in
  const [stake, setStake]                       = useState(0);      // current match stake (0 = free)
  const [purchasesRemaining, setPurchasesRemaining] = useState(0);  // power-up buys left this match
  const [powerupPrice, setPowerupPrice]         = useState(5);      // price per power-up (from sync)
  const [showShop, setShowShop]                 = useState(false);  // shop panel visible
  const [oppBoughtNotice, setOppBoughtNotice]   = useState(false);  // brief "opp bought" toast
  const [queueStake, setQueueStake]             = useState(0);      // stake shown on queue wait screen
  const myBubbleTimer = useRef(null);
  const oppBubbleTimer = useRef(null);
  const graceTimerRef = useRef(null);
  const botOfferTimerRef = useRef(null);
  const queueTimerRef    = useRef(null);
  const queueTypeRef     = useRef(null); // mirrors queueType for cleanup closures (D-12)
  const joinedUrlRef = useRef(false);   // chỉ auto-join từ link mời 1 lần
  const shakeTimer = useRef(null);
  const triggerShake = useCallback(() => {
    setShake(true);
    if (shakeTimer.current) clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => setShake(false), 380);
  }, []);
  const [soundOn, setSoundOn] = useState(true);
  function toggleSound() { const v = !soundOn; setSoundOn(v); Sound.setEnabled(v); }
  const [vsBot, setVsBot] = useState(false);   // chế độ chơi với máy
  const botData = useRef(null);                // {occ:Set, ships:[Set]}
  const myShipsRef = useRef([]);               // [Set] thuyền của ta (để máy dò chìm)
  const botShotsRef = useRef(new Set());       // ô máy đã bắn
  const botQueueRef = useRef([]);              // hàng đợi ô mục tiêu của máy
  const myShotsRef = useRef(new Set());         // ô ta đã bắn (đồng bộ tức thời cho bot)
  const botTierRef = useRef("medium");         // tier hiện tại ("easy"|"medium"|"hard"|"insane")
  const botHitsRef = useRef(new Set());        // ô máy đã trúng (cho density/axis inference)
  const botRemainingRef = useRef([]);          // kích thước tàu còn lại (chưa chìm)

  const addLog = useCallback((s) => setLog((l) => [s, ...l].slice(0, 40)), []);
  const showNotice = useCallback((s) => { setNotice(s); setTimeout(() => setNotice((n) => (n === s ? null : n)), 4000); }, []);

  // Sign-out: destroy current session, revert UI to guest.
  // Await the server response so the Set-Cookie (clear) header is processed by the
  // browser before any subsequent auth request — prevents stale-cookie race on mobile.
  function handleSignOut() {
    fetch("/auth/signout", { method: "POST", credentials: "same-origin" })
      .catch(() => { /* non-fatal — UI already reverted */ });
    setAuthUser(null);
    setBalance(null);
    setAvatarMenuOpen(false);
    setSignOutAllConfirm(false);
  }

  // Sign-out-all: after inline confirmation, delete all sessions for user_id
  function handleSignOutAllConfirm() {
    fetch("/auth/signout-all", { method: "POST", credentials: "same-origin" })
      .catch(() => { /* non-fatal — UI already reverted */ });
    setAuthUser(null);
    setBalance(null);
    setAvatarMenuOpen(false);
    setSignOutAllConfirm(false);
  }

  function handleViewProfile(userId) {
    // Navigate to profile screen; userId defaults to own id when viewing self
    const id = userId != null ? userId : (authUser ? authUser.id : null);
    setViewProfileId(id);
    setProfileData(null);  // clear any prior loaded profile
    setScreen("profile");
    setAvatarMenuOpen(false);
    setSignOutAllConfirm(false);
  }

  // Auth hydration: fetch signed-in user on mount; handle ?authError, ?verified, ?verifyError, ?reset.
  useEffect(() => {
    // Hydrate auth state from server session (D-12)
    fetch("/api/me").then((r) => r.json()).then((d) => {
      setAuthUser(d.user || null);
    }).catch(() => { /* non-fatal — guest play continues */ });

    // Parse redirect flags from OAuth, email-verification, and password-reset callbacks.
    // Strip params from URL after reading so they do not persist across refreshes.
    try {
      const params = new URLSearchParams(window.location.search);
      // ?authError from OAuth redirect (T-02-05 / T-02-09)
      if (params.get("authError")) {
        const code = params.get("authError");
        setAuthError(code === "1" ? "failed" : code);
        params.delete("authError");
        const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState(null, "", clean);
      }
      // ?verified=1 from GET /auth/verify success (AUTH-07)
      if (params.get("verified")) {
        setVerifyNotice("success");
        params.delete("verified");
        const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState(null, "", clean);
      }
      // ?verifyError=1 from GET /auth/verify failure (AUTH-07)
      if (params.get("verifyError")) {
        setVerifyNotice("error");
        params.delete("verifyError");
        const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState(null, "", clean);
      }
      // ?reset=<token> from emailed password-reset link (AUTH-08 / D-19)
      // Opens PasswordResetForm in set-new mode with the token pre-filled.
      const tok = params.get("reset");
      if (tok) {
        setResetToken(tok);
        params.delete("reset");
        const clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState(null, "", clean);
      }
    } catch (e) { /* ignore — localStorage-like optional feature */ }
  }, []);

  // Fetch wallet balance on auth state change (Phase 7)
  useEffect(() => {
    if (authUser) {
      fetch("/api/wallet").then((r) => r.json()).then((d) => setBalance(d.balance)).catch(() => {});
    } else {
      setBalance(null);
    }
  }, [authUser]);

  useEffect(() => {
    socket.on("opponentJoined", () => {
      setOppPresent(true); addLog(t("log.oppJoined"));
      setScreen((s) => (s === "room" ? "placement" : s));
    });
    socket.on("roomUpdate", (r) => {
      const has = r.playerCount >= 2;
      setOppPresent(has);
      if (r.mode) setMode(r.mode);
      if (has) setScreen((s) => (s === "room" ? "placement" : s));
    });
    socket.on("opponentReady", () => { setOppReady(true); addLog(t("log.oppReady")); });
    socket.on("opponentOffline", () => {
      addLog(t("log.oppOffline"));
      setOppOffline(true); setGraceLeft(180);
      if (graceTimerRef.current) clearInterval(graceTimerRef.current);
      graceTimerRef.current = setInterval(() => {
        setGraceLeft((s) => { if (s <= 1) { clearInterval(graceTimerRef.current); graceTimerRef.current = null; return 0; } return s - 1; });
      }, 1000);
    });
    socket.on("opponentOnline", () => {
      setOppPresent(true); addLog(t("log.oppReconnect"));
      setOppOffline(false); setGraceLeft(0);
      if (graceTimerRef.current) { clearInterval(graceTimerRef.current); graceTimerRef.current = null; }
    });
    socket.on("sync", (st) => {
      setCode(st.code); persistRoom(st.code);
      setOppPresent(st.oppPresent);
      setOppReady(st.oppReady);
      setOcc(new Set(st.occ || []));
      const ms = new Map(); (st.myShots || []).forEach((s) => ms.set(key(s.r, s.c), s.hit));
      setMyShots(ms);
      const inc = new Map(); (st.incoming || []).forEach((s) => inc.set(key(s.r, s.c), s.hit));
      setIncoming(inc);
      setSunkOpp(st.sunkOpp || 0); setSunkMine(st.sunkMine || 0);
      setSunkEnemyCells(new Set(st.sunkOppCells || []));
      setSunkMyCells(new Set(st.sunkMyCells || []));
      setMyScore(st.myScore || 0); setOppScore(st.oppScore || 0);
      setMode(st.mode || "classic");
      if (st.inv) setInv(st.inv);
      setMyMines(new Set(st.myMines || []));
      setPowerups(new Map((st.powerups || []).map((p) => [key(p.r, p.c), p.type])));
      setTurnDeadline(st.started ? (st.turnDeadline || null) : null);
      if (st.turnDur) setTurnDur(st.turnDur);
      if (st.oppProfile !== undefined) setOppProfile(st.oppProfile || null);
      if (typeof st.stake === "number") setStake(st.stake);
      if (typeof st.purchasesRemaining === "number") setPurchasesRemaining(st.purchasesRemaining);
      if (typeof st.powerupPrice === "number") setPowerupPrice(st.powerupPrice);
      if (st.started) { setMyTurn(st.yourTurn); setScreen("battle"); }
      else if (st.youReady) { setIReady(true); setScreen("placement"); }
      else { setScreen(st.oppPresent ? "placement" : "room"); }
    });
    // on (re)connect, try to resume any in-progress game automatically.
    socket.on("connect", () => {
      // 1) Ask the server if our clientId already holds a seat in any room.
      //    Needs no locally-stored code, so it resumes even if the room code
      //    was lost — as long as clientId survived in localStorage.
      socket.emit("resume", { clientId }, (res) => {
        if (res && res.ok) { setCode(res.code); persistRoom(res.code); return; }
        // 2) Invite link: ?room=CODE → join that room directly (once).
        const urlRoom = roomFromUrl();
        if (urlRoom && !joinedUrlRef.current) { joinedUrlRef.current = true; joinRoom(urlRoom); clearRoomUrl(); return; }
        // 3) Fallback: rejoin a room code we stored locally.
        const r = loadRoom();
        if (r) { socket.emit("rejoin", { code: r, clientId }, (rr) => { if (!rr || !rr.ok) persistRoom(null); }); }
      });
    });
    socket.on("gameStart", ({ yourTurn, mode: m }) => {
      setScreen("battle"); setMyTurn(yourTurn); setTurnDeadline(null);
      setMode(m || "classic");
      setInv({ scatter: 0, cross: 0, double: 0, reveal: 0, mine: 0 });
      setPowerups(new Map()); setRevealedEnemy(new Set()); setAim(null); setMyMines(new Set());
      addLog(yourTurn ? t("log.youFirst") : t("log.oppFirst"));
    });
    socket.on("inventory", (i) => setInv(i));
    socket.on("powerups", (list) => setPowerups(new Map((list || []).map((p) => [key(p.r, p.c), p.type]))));
    socket.on("turnUpdate", ({ yourTurn }) => setMyTurn(yourTurn));
    socket.on("turnTimer", ({ deadline, dur, yourTurn }) => { setTurnDeadline(deadline || null); if (dur) setTurnDur(dur); if (typeof yourTurn === "boolean") setMyTurn(yourTurn); });
    socket.on("oppProfile", (p) => setOppProfile(p || null));
    socket.on("turnSkipped", ({ you }) => {
      if (you) { addLog(t("log.youTimeout")); showNotice(t("notice.youTimeout")); }
      else addLog(t("log.oppTimeout"));
    });
    socket.on("incoming", ({ cells, sunkCells, sunkMineCount, newSunk, mineHit }) => {
      const list = cells || [];
      setIncoming((m) => { const n = new Map(m); list.forEach((s) => n.set(key(s.r, s.c), s.hit)); return n; });
      if (list.length) setFlashMine(key(list[list.length - 1].r, list[list.length - 1].c));
      if (typeof sunkMineCount === "number") setSunkMine(sunkMineCount);
      if (sunkCells) setSunkMyCells((s) => { const n = new Set(s); sunkCells.forEach((k) => n.add(k)); return n; });
      if (mineHit) setMyMines((s) => { const n = new Set(s); list.forEach((c) => n.delete(key(c.r, c.c))); return n; });
      const anyHit = list.some((s) => s.hit);
      if (mineHit) { addLog(t("log.enemyHitMine")); showNotice(t("notice.enemyHitMine")); Sound.mine(); }
      if (newSunk > 0) addLog(t("log.enemySunk", { n: newSunk }));
      else if (list.length > 1) addLog(anyHit ? t("log.enemyPowerHit") : t("log.enemyPowerMiss"));
      else if (list.length === 1) addLog(anyHit ? t("log.enemyFireHit", { cell: cellLabel(list[0].r, list[0].c) }) : t("log.enemyFireMiss", { cell: cellLabel(list[0].r, list[0].c) }));
      if (newSunk > 0) Sound.sunk(); else if (anyHit) Sound.hit(); else if (list.length) Sound.miss();
      if (newSunk > 0 || anyHit) triggerShake();
    });
    socket.on("chat", ({ text }) => {
      const id = Date.now() + Math.random();
      setOppBubble({ id, text });
      if (oppBubbleTimer.current) clearTimeout(oppBubbleTimer.current);
      oppBubbleTimer.current = setTimeout(() => setOppBubble((b) => (b && b.id === id ? null : b)), 3000);
      Sound.miss && Sound.miss();
    });
    socket.on("scoreUpdate", ({ you, opp }) => { setMyScore(you); setOppScore(opp); });
    socket.on("balanceUpdate", (data) => setBalance(data.balance));
    socket.on("oppBoughtPowerup", () => {
      setOppBoughtNotice(true);
      setTimeout(() => setOppBoughtNotice(false), 2500);
    });
    socket.on("gameOver", ({ win, reason }) => { setOver({ win, reason }); setTurnDeadline(null); win ? Sound.win() : Sound.lose(); });
    socket.on("opponentLeft", () => {
      addLog(t("log.oppLeft")); setOppLeft(true);
      setOppOffline(false); setGraceLeft(0);
      if (graceTimerRef.current) { clearInterval(graceTimerRef.current); graceTimerRef.current = null; }
      // Clear persisted room immediately so F5 before clicking "return to lobby"
      // does not auto-rejoin the dead room (BUG-FIX: stale room on refresh).
      persistRoom(null);
      Sound.lose && Sound.lose();
    });
    socket.on("rematchStart", () => {
      setScreen("placement"); setIReady(false); setOppReady(false); setMyTurn(false); setTurnDeadline(null);
      setOcc(new Set()); setIncoming(new Map()); setMyShots(new Map()); setOver(null); setLog([]);
      setSunkOpp(0); setSunkMine(0);
      setSunkEnemyCells(new Set()); setSunkMyCells(new Set()); // giữ nguyên tỉ số
      setInv({ scatter: 0, cross: 0, double: 0, reveal: 0, mine: 0 });
      setPowerups(new Map()); setRevealedEnemy(new Set()); setAim(null); setMyMines(new Set());
    });
    // matchFound: server has paired this socket into a room — drop straight to placement (D-10).
    // Does NOT guard on s === "queue" — matchFound can arrive even if the player is on the lobby
    // (e.g. connection lag) and must always route to placement (Pitfall 4 from 05-RESEARCH.md).
    socket.on("matchFound", ({ code: matchCode, stake: matchStake }) => {
      setCode(matchCode);
      persistRoom(matchCode);
      if (typeof matchStake === "number") setStake(matchStake);
      setQueueType(null);
      setQueueSince(null);
      setQueueWindow(null);
      setBotOfferVisible(false);
      if (botOfferTimerRef.current) { clearTimeout(botOfferTimerRef.current); botOfferTimerRef.current = null; }
      if (queueTimerRef.current) { clearInterval(queueTimerRef.current); queueTimerRef.current = null; }
      setElapsedSec(0);
      setScreen("placement");
    });
    // D-11: partner disconnected before game started — server re-queued this player at front.
    // Reset queue state and return to the queue wait screen so search resumes.
    socket.on("requeued", ({ type }) => {
      setQueueType(type || "free");
      setQueueSince(Date.now());
      setQueueWindow(null);
      setBotOfferVisible(false);
      if (botOfferTimerRef.current) { clearTimeout(botOfferTimerRef.current); botOfferTimerRef.current = null; }
      setCode(null);
      persistRoom(null);
      setScreen("queue");
    });
    // Connect now that all listeners are attached. If the socket somehow already
    // connected (hot remount), run resume immediately instead.
    if (!socket.connected) socket.connect();
    else if (socket.connected) {
      socket.emit("resume", { clientId }, (res) => {
        if (res && res.ok) { setCode(res.code); persistRoom(res.code); return; }
        const r = loadRoom();
        if (r) socket.emit("rejoin", { code: r, clientId }, (rr) => { if (!rr || !rr.ok) persistRoom(null); });
      });
    }
    return () => socket.off();
  }, [addLog]);

  // Keep queueTypeRef in sync with queueType state for cleanup closures (D-12).
  // Effect closures capture the value at render time; using a mutable ref lets
  // the leaveQueue guard read the LATEST value even when batched state updates
  // (e.g. matchFound: setQueueType(null) + setScreen) change both atomically.
  useEffect(() => { queueTypeRef.current = queueType; }, [queueType]);

  // Elapsed timer + bot-offer timer + navigate-away leaveQueue cleanup.
  // Gated on screen === "queue": all timers start on mount, all cleared on unmount.
  useEffect(() => {
    if (screen !== "queue") {
      if (queueTimerRef.current) { clearInterval(queueTimerRef.current); queueTimerRef.current = null; }
      return;
    }
    setElapsedSec(queueSince ? Math.floor((Date.now() - queueSince) / 1000) : 0);
    queueTimerRef.current = setInterval(() => {
      setElapsedSec(queueSince ? Math.floor((Date.now() - queueSince) / 1000) : 0);
    }, 1000);
    // D-09: show bot offer after delay if still waiting
    if (botOfferTimerRef.current) clearTimeout(botOfferTimerRef.current);
    botOfferTimerRef.current = setTimeout(() => setBotOfferVisible(true), BOT_OFFER_DELAY_MS);
    return () => {
      if (queueTimerRef.current) { clearInterval(queueTimerRef.current); queueTimerRef.current = null; }
      if (botOfferTimerRef.current) { clearTimeout(botOfferTimerRef.current); botOfferTimerRef.current = null; }
      // D-12: navigate-away / unmount while still queued → drop the entry immediately.
      // Use queueTypeRef (not closed-over queueType) to read the LATEST value at cleanup
      // time — avoids firing leaveQueue on the matchFound transition where React batches
      // setQueueType(null) + setScreen("placement") atomically before the cleanup runs (T-5-12).
      if (queueTypeRef.current) {
        socket.emit("leaveQueue", {}, () => {});
      }
    };
  }, [screen, queueSince]);

  function createRoom(mode, roomStakeVal) {
    setError(null);
    setMyScore(0); setOppScore(0); setOppProfile(null); // phòng mới: tỉ số về 0-0
    setVsBot(false); setMode(mode === "advance" ? "advance" : "classic");
    const stakeVal = roomStakeVal || 0;
    setStake(stakeVal);
    socket.emit("createRoom", { clientId, mode, stake: stakeVal, profile }, (res) => {
      if (res.ok) { setCode(res.code); persistRoom(res.code); setScreen("room"); }
      else if (res.code) { setError(errText(res)); }
    });
  }
  function joinRoom(c) {
    setError(null);
    socket.emit("joinRoom", { code: c, clientId, profile }, (res) => {
      if (!res.ok) { setError(errText(res)); return; }
      // If the room has a stake, confirm before committing (Phase 7 Task 5)
      if (res.stake > 0) {
        if (!confirm(t("wallet.yourStake", { n: res.stake }))) {
          // Player declined — leave the room
          socket.emit("leaveRoom", () => {});
          return;
        }
      }
      setCode(res.code); persistRoom(res.code);
      if (typeof res.stake === "number") setStake(res.stake);
      // reclaimed = took over a seat in an in-progress game (reconnect by code);
      // the server's "sync" event restores the correct screen/state. New seats
      // go straight to placement.
      if (!res.reclaimed) { setOppPresent(true); setScreen("placement"); }
    });
  }
  function handleQuickMatch() {
    setError(null);
    socket.emit("joinQueue", { type: "free", clientId, profile }, (res) => {
      if (res && res.ok) {
        setQueueType("free");
        setQueueSince(Date.now());
        setElapsedSec(0);
        setQueueStake(0);
        setScreen("queue");
      } else {
        setError(errText(res));
      }
    });
  }
  function handleWageredMatch(wagerStake) {
    setError(null);
    socket.emit("joinQueue", { type: "wagered", stake: wagerStake, clientId, profile }, (res) => {
      if (res && res.ok) {
        setQueueType("wagered");
        setQueueSince(Date.now());
        setElapsedSec(0);
        setQueueStake(wagerStake);
        setStake(wagerStake);
        setScreen("queue");
      } else {
        setError(t("err." + (res && res.code)) || errText(res));
      }
    });
  }
  function handleLeaveQueue() {
    socket.emit("leaveQueue", {}, () => {});
    setQueueType(null);
    setQueueSince(null);
    setQueueWindow(null);
    setBotOfferVisible(false);
    if (botOfferTimerRef.current) { clearTimeout(botOfferTimerRef.current); botOfferTimerRef.current = null; }
    if (queueTimerRef.current) { clearInterval(queueTimerRef.current); queueTimerRef.current = null; }
    setElapsedSec(0);
    setScreen("lobby");
  }
  function confirmPlacement(ships) {
    if (vsBot) {
      const s = new Set();
      myShipsRef.current = ships.map((sh) => {
        const set = new Set();
        sh.cells.forEach((x) => { const k = key(x.r, x.c); s.add(k); set.add(k); });
        return set;
      });
      setOcc(s);
      setIReady(true);
      botData.current = genFleet();
      const youFirst = Math.random() < 0.5;
      setScreen("battle");
      addLog(youFirst ? t("log.youFirst") : t("log.botFirst"));
      if (youFirst) setMyTurn(true);
      else { setMyTurn(false); setTimeout(botShoot, 700); }
      return;
    }
    socket.emit("placeShips", ships, (res) => {
      if (res.ok) {
        setIReady(true);
        const s = new Set();
        ships.forEach((sh) => sh.cells.forEach((x) => s.add(key(x.r, x.c))));
        setOcc(s);
        addLog(t("log.fleetReady"));
      } else setError(errText(res));
    });
  }
  // ----- chế độ chơi với máy (toàn bộ ở client) -----
  function genFleet() {
    const occ = new Set(), ships = [];
    for (const f of FLEET_DEF) {
      let ok = false, t = 0;
      while (!ok && t++ < 800) {
        const d = Math.random() < 0.5 ? "h" : "v";
        const r = Math.floor(Math.random() * BOARD), c = Math.floor(Math.random() * BOARD);
        const cells = cellsFor(r, c, f.size, d);
        if (inBounds(cells) && cells.every((x) => !occ.has(key(x.r, x.c)))) {
          const set = new Set(); cells.forEach((x) => { const k = key(x.r, x.c); occ.add(k); set.add(k); });
          ships.push(set); ok = true;
        }
      }
    }
    return { occ, ships };
  }
  function startBot(keepScore, tier = "medium") {
    setError(null); setVsBot(true); persistRoom(null); setCode(null); setTurnDeadline(null);
    setOppPresent(true); setOppReady(false); setIReady(false); setMyTurn(false);
    setOcc(new Set()); setIncoming(new Map()); setMyShots(new Map());
    setLog([]); setOver(null); setSunkOpp(0); setSunkMine(0);
    setSunkEnemyCells(new Set()); setSunkMyCells(new Set());
    if (!keepScore) { setMyScore(0); setOppScore(0); }
    botData.current = null; myShipsRef.current = []; botShotsRef.current = new Set();
    botQueueRef.current = []; myShotsRef.current = new Set();
    botTierRef.current = tier;
    botHitsRef.current = new Set();
    botRemainingRef.current = FLEET_DEF.map((f) => f.size);
    setScreen("placement");
  }
  function rematchAction() {
    if (vsBot) { startBot(true); return; } // giữ tỉ số
    socket.emit("rematch");
  }
  // handleBot: Lobby tier-button handler — threads selected tier into startBot (D-07: classic single-player only)
  function handleBot(tier) { startBot(false, tier); }
  // ── Bot tier algorithm helpers ─────────────────────────────────────────────
  // pickEasy: pure random from unshot cells
  function pickEasy() {
    const pool = [];
    for (let r = 0; r < BOARD; r++)
      for (let c = 0; c < BOARD; c++) {
        const k = key(r, c);
        if (!botShotsRef.current.has(k)) pool.push(k);
      }
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  // pickMedium: verbatim copy of legacy botPick body (SC#3 anchor — must not change)
  function pickMedium() {
    while (botQueueRef.current.length) {
      const k = botQueueRef.current.pop();
      if (!botShotsRef.current.has(k)) return k;
    }
    const parity = [], any = [];
    for (let r = 0; r < BOARD; r++) for (let c = 0; c < BOARD; c++) {
      const k = key(r, c);
      if (botShotsRef.current.has(k)) continue;
      any.push(k); if ((r + c) % 2 === 0) parity.push(k);
    }
    const pool = parity.length ? parity : any;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  // buildDensityMap: enumerate valid placements for unsunk ships, reject miss cells (D-03)
  function buildDensityMap() {
    const shots = botShotsRef.current;
    const hits = botHitsRef.current;
    const remaining = botRemainingRef.current;
    // Miss set: shots that are not hits
    const misses = new Set();
    for (const k of shots) { if (!hits.has(k)) misses.add(k); }
    const density = {};
    for (let r = 0; r < BOARD; r++)
      for (let c = 0; c < BOARD; c++)
        density[key(r, c)] = 0;
    for (const size of remaining) {
      for (const dir of ["h", "v"]) {
        for (let r = 0; r < BOARD; r++) {
          for (let c = 0; c < BOARD; c++) {
            const cells = cellsFor(r, c, size, dir);
            if (!inBounds(cells)) continue;
            let valid = true;
            for (const cell of cells) {
              if (misses.has(key(cell.r, cell.c))) { valid = false; break; }
            }
            if (!valid) continue;
            for (const cell of cells) { density[key(cell.r, cell.c)]++; }
          }
        }
      }
    }
    return density;
  }
  // inferAxis: derive ship orientation from confirmed hit geometry (reads only botHitsRef — D-03)
  function inferAxis() {
    const hits = botHitsRef.current;
    if (hits.size < 2) return null;
    const hitArr = [...hits].map((k) => { const [r, c] = k.split(",").map(Number); return { r, c }; });
    const rows = new Set(hitArr.map((h) => h.r));
    const cols = new Set(hitArr.map((h) => h.c));
    if (rows.size === 1) return "h";
    if (cols.size === 1) return "v";
    return null;
  }
  // pickHard: drain queue by highest density, else global max-density hunt (D-03)
  function pickHard() {
    if (botQueueRef.current.length) {
      const density = buildDensityMap();
      const queueCandidates = botQueueRef.current.filter((k) => !botShotsRef.current.has(k));
      botQueueRef.current = [];
      if (queueCandidates.length) {
        queueCandidates.sort((a, b) => density[b] - density[a]);
        botQueueRef.current = queueCandidates.slice(1);
        return queueCandidates[0];
      }
    }
    const density = buildDensityMap();
    let bestKey = null, bestScore = -1;
    for (let r = 0; r < BOARD; r++)
      for (let c = 0; c < BOARD; c++) {
        const k = key(r, c);
        if (botShotsRef.current.has(k)) continue;
        if (density[k] > bestScore) { bestScore = density[k]; bestKey = k; }
      }
    return bestKey;
  }
  // pickInsane: axis-lock from hits + parity-masked density with unmasked fallback (D-03)
  function pickInsane() {
    const density = buildDensityMap();
    if (botQueueRef.current.length) {
      const validQueue = botQueueRef.current.filter((k) => !botShotsRef.current.has(k));
      const axis = inferAxis();
      let candidates = validQueue;
      if (axis) {
        const hitArr = [...botHitsRef.current].map((h) => { const [hr, hc] = h.split(",").map(Number); return { r: hr, c: hc }; });
        const axisFiltered = validQueue.filter((k) => {
          const [r, c] = k.split(",").map(Number);
          return axis === "h" ? hitArr.some((h) => h.r === r) : hitArr.some((h) => h.c === c);
        });
        if (axisFiltered.length) candidates = axisFiltered;
      }
      botQueueRef.current = [];
      if (candidates.length) {
        candidates.sort((a, b) => density[b] - density[a]);
        botQueueRef.current = candidates.slice(1);
        return candidates[0];
      }
    }
    // Hunt phase: parity-masked density
    let bestKey = null, bestScore = -1;
    for (let r = 0; r < BOARD; r++)
      for (let c = 0; c < BOARD; c++) {
        if ((r + c) % 2 !== 0) continue;
        const k = key(r, c);
        if (botShotsRef.current.has(k)) continue;
        if (density[k] > bestScore) { bestScore = density[k]; bestKey = k; }
      }
    // Fallback: lift parity mask when exhausted (Pitfall 7)
    if (!bestKey) {
      for (let r = 0; r < BOARD; r++)
        for (let c = 0; c < BOARD; c++) {
          const k = key(r, c);
          if (botShotsRef.current.has(k)) continue;
          if (density[k] > bestScore) { bestScore = density[k]; bestKey = k; }
        }
    }
    return bestKey;
  }
  // botPick: dispatches on botTierRef.current (guard-clause style per CLAUDE.md)
  function botPick() {
    const tier = botTierRef.current;
    if (tier === "easy")   return pickEasy();
    if (tier === "hard")   return pickHard();
    if (tier === "insane") return pickInsane();
    return pickMedium(); // default: covers "medium" + any unknown stored value
  }
  function botShoot() {
    const k = botPick();
    if (k == null) return;
    botShotsRef.current.add(k);
    const [r, c] = k.split(",").map(Number);
    const hit = myShipsRef.current.some((ship) => ship.has(k));
    if (hit) botHitsRef.current.add(k); // track hits for density/axis inference
    setIncoming((m) => new Map(m).set(k, hit));
    setFlashMine(k);
    if (hit) {
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr, nc]) => {
        if (nr >= 0 && nr < BOARD && nc >= 0 && nc < BOARD) {
          const nk = key(nr, nc); if (!botShotsRef.current.has(nk)) botQueueRef.current.push(nk);
        }
      });
      let sunk = null;
      for (const ship of myShipsRef.current) {
        if (!ship.has(k)) continue;
        if ([...ship].every((kk) => botShotsRef.current.has(kk))) { sunk = ship; break; }
      }
      if (sunk) {
        // Remove one entry of sunk.size from botRemainingRef (for density enumeration)
        const idx = botRemainingRef.current.indexOf(sunk.size);
        if (idx !== -1) botRemainingRef.current.splice(idx, 1);
        // Clear active-hit tracking — sunk ship resolved (Pitfall 4)
        botHitsRef.current = new Set();
        botQueueRef.current = [];
        setSunkMine((n) => n + 1);
        setSunkMyCells((s) => { const n = new Set(s); sunk.forEach((kk) => n.add(kk)); return n; });
        addLog(t("log.botSunk", { n: sunk.size })); Sound.sunk(); triggerShake();
      }
      else { addLog(t("log.botFireHit", { cell: cellLabel(r, c) })); Sound.hit(); triggerShake(); }
    } else {
      addLog(t("log.botFireMiss", { cell: cellLabel(r, c) })); Sound.miss();
    }
    const allMineSunk = myShipsRef.current.every((ship) => [...ship].every((kk) => botShotsRef.current.has(kk)));
    if (allMineSunk) { setOppScore((n) => n + 1); setOver({ win: false }); Sound.lose(); return; }
    if (hit) setTimeout(botShoot, 600);   // trúng -> máy bắn tiếp
    else setMyTurn(true);                  // trượt -> tới lượt bạn
  }
  function fireLocal(r, c) {
    const k = key(r, c);
    if (myShotsRef.current.has(k)) return;
    myShotsRef.current.add(k);
    const hit = botData.current.occ.has(k);
    setMyShots((m) => new Map(m).set(k, hit));
    setFlashEnemy(k); Sound.fire();
    if (hit) {
      let sunk = null;
      for (const ship of botData.current.ships) {
        if (!ship.has(k)) continue;
        if ([...ship].every((kk) => myShotsRef.current.has(kk))) { sunk = ship; break; }
      }
      const cnt = botData.current.ships.filter((ship) => [...ship].every((kk) => myShotsRef.current.has(kk))).length;
      setSunkOpp(cnt);
      if (sunk) {
        setSunkEnemyCells((s) => { const n = new Set(s); sunk.forEach((kk) => n.add(kk)); return n; });
        addLog(t("log.youSunkOne", { n: sunk.size })); Sound.sunk(); triggerShake();
      }
      else { addLog(t("log.youFireHit", { cell: cellLabel(r, c) })); Sound.hit(); triggerShake(); }
      if (cnt >= FLEET_DEF.length) { setMyScore((n) => n + 1); setOver({ win: true }); Sound.win(); return; }
      // trúng -> giữ lượt
    } else {
      addLog(t("log.youFireMiss", { cell: cellLabel(r, c) })); Sound.miss();
      setMyTurn(false);
      setTimeout(botShoot, 600);
    }
  }

  // áp dụng kết quả một loạt bắn (dùng chung cho fire + pháo kích)
  function applyShotResult(res, label, isPower) {
    const cells = res.cells || [];
    if (isPower) { Sound.explode(); triggerShake(); } // boom + recoil on power-up detonation
    setMyShots((m) => { const n = new Map(m); cells.forEach((s) => n.set(key(s.r, s.c), s.hit)); return n; });
    if (cells.length) setFlashEnemy(key(cells[cells.length - 1].r, cells[cells.length - 1].c));
    if (typeof res.sunkCount === "number") setSunkOpp(res.sunkCount);
    if (res.sunkCells) setSunkEnemyCells((s) => { const n = new Set(s); res.sunkCells.forEach((k) => n.add(k)); return n; });
    if (res.collected && res.collected.length) addLog(t("log.collected", { list: res.collected.map((p) => POWER_NAME[p]).join(", ") }));
    const anyHit = cells.some((s) => s.hit);
    if (res.newSunk > 0) { addLog(t("log.youSunkN", { n: res.newSunk })); Sound.sunk(); triggerShake(); }
    else { addLog(anyHit ? t("log.labelHit", { label }) : t("log.labelMiss", { label })); if (anyHit) { Sound.hit(); triggerShake(); } else Sound.miss(); }
    if (res.collected && res.collected.length) Sound.powerup();
    if (res.mineHit) { addLog(t("log.youHitMine")); showNotice(t("notice.youHitMine")); Sound.mine(); return; }
    if (anyHit && !res.win) setMyTurn(true);
  }

  function fire(r, c) {
    if (vsBot) { if (myTurn) fireLocal(r, c); return; }
    if (!myTurn) return;
    if (aim === "mine") { placeMine(r, c); return; }
    const power = aim; // null | "cluster" | "cross"
    if (!power && myShots.has(key(r, c))) return;
    Sound.fire();
    socket.emit("fire", { r, c, power }, (res) => {
      if (!res.ok) { if (res.code || res.error) addLog(errText(res)); return; }
      setAim(null);
      const label = power ? t("label.power", { name: POWER_NAME[power] }) : t("label.youFire", { cell: cellLabel(r, c) });
      applyShotResult(res, label, !!power);
    });
  }
  function placeMine(r, c) {
    socket.emit("useAbility", { type: "mine", r, c }, (res) => {
      if (!res.ok) { if (res.code || res.error) addLog(errText(res)); return; }
      setMyMines((s) => new Set(s).add(key(res.r, res.c)));
      setAim(null);
      addLog(t("log.minePlaced", { cell: cellLabel(res.r, res.c) }));
    });
  }
  // dùng power-up trong kho
  function activatePower(type) {
    if (!myTurn || (inv[type] || 0) <= 0) return;
    if (type === "cross" || type === "mine") { setAim((a) => (a === type ? null : type)); return; }
    if (type === "scatter") { Sound.fire(); }
    socket.emit("useAbility", { type }, (res) => {
      if (!res.ok) { if (res.code || res.error) addLog(errText(res)); return; }
      if (res.type === "double") addLog(t("log.doubleActivated"));
      else if (res.type === "reveal") {
        setRevealedEnemy((s) => new Set(s).add(key(res.r, res.c)));
        addLog(t("log.revealed", { cell: cellLabel(res.r, res.c) }));
      }
      else if (res.type === "scatter") {
        addLog(t("log.scatterBoom"));
        applyShotResult(res, POWER_NAME.scatter, true);
      }
    });
  }
  // Phase 7: Buy a power-up mid-match
  function handleBuyPowerup(type) {
    if (purchasesRemaining <= 0 || balance < powerupPrice) return;
    socket.emit("buyPowerup", { type }, (res) => {
      if (res && res.ok) {
        setPurchasesRemaining((n) => n - 1);
        // Balance will update via balanceUpdate event
      } else {
        const msg = res && res.code ? t("err." + res.code) : "";
        if (msg) showNotice(msg);
      }
    });
  }
  function resetToLobby() {
    persistRoom(null);
    // Emit leaveRoom so the server removes our seat — prevents resume from
    // pulling us back into the dead room on next page load (BUG-FIX).
    if (!vsBot && socket && socket.connected) socket.emit("leaveRoom", () => {});
    setCode(null); setError(null); setOppPresent(false); setOppReady(false);
    setIReady(false); setMyTurn(false); setTurnDeadline(null); setOcc(new Set());
    setIncoming(new Map()); setMyShots(new Map()); setLog([]); setOver(null);
    setSunkOpp(0); setSunkMine(0); setVsBot(false);
    setSunkEnemyCells(new Set()); setSunkMyCells(new Set());
    setMyScore(0); setOppScore(0);
    setMode("classic"); setInv({ scatter: 0, cross: 0, double: 0, reveal: 0, mine: 0 });
    setPowerups(new Map()); setRevealedEnemy(new Set()); setAim(null); setMyMines(new Set());
    setOppLeft(false); setOppOffline(false); setGraceLeft(0); setConfirmLeave(false);
    setOppProfile(null);
    setChatOpen(false); setMyBubble(null); setOppBubble(null);
    setStake(0); setPurchasesRemaining(0); setShowShop(false); setOppBoughtNotice(false);
    if (myBubbleTimer.current) { clearTimeout(myBubbleTimer.current); myBubbleTimer.current = null; }
    if (oppBubbleTimer.current) { clearTimeout(oppBubbleTimer.current); oppBubbleTimer.current = null; }
    if (graceTimerRef.current) { clearInterval(graceTimerRef.current); graceTimerRef.current = null; }
    setScreen("lobby");
  }
  // Ask first (window.confirm is blocked in the Instant Games iframe, so we use
  // an in-app modal instead). doLeave() performs the actual exit.
  function leaveRoom() { setConfirmLeave(true); }
  function doLeave() {
    setConfirmLeave(false);
    resetToLobby();
  }
  function copyCode() {
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).catch(() => {}); } catch (e) {}
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }
  // Invite by link: native share sheet on mobile (Messenger/Zalo/FB/SMS), else
  // copy the join URL to clipboard.
  function shareLink() {
    if (!code) return;
    const url = roomLink(code);
    const text = t("share.text", { code });
    if (navigator.share) {
      navigator.share({ title: "Sea Battle", text, url }).catch(() => {});
      return;
    }
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).catch(() => {}); } catch (e) {}
    setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800);
  }
  function toggleChat() { setChatOpen((o) => !o); }
  function sendChat(text) {
    text = (text || "").trim();
    if (!text || vsBot) return;
    const id = Date.now() + Math.random();
    setMyBubble({ id, text });
    if (myBubbleTimer.current) clearTimeout(myBubbleTimer.current);
    myBubbleTimer.current = setTimeout(() => setMyBubble((b) => (b && b.id === id ? null : b)), 3000);
    socket.emit("chat", { text });
    setChatOpen(false); // tự đóng ô soạn sau khi gửi
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
  }

  return (
    <div className="app">
      <div className="ocean-bg"><div className="wave"></div><div className="wave w2"></div><div className="wave w3"></div></div>
      <div className="topbar">
        <div className="logo">
          <div className="badge">⚓</div>
          <div><h1>BATTLESHIP</h1><small>{t("topbar.tagline")}</small></div>
        </div>
        <div className="topbar-right" style={{ position: "relative" }}>
          {authUser ? (
            <>
              <ProfileChip
                user={authUser}
                onToggle={() => { setAvatarMenuOpen((v) => !v); if (avatarMenuOpen) setSignOutAllConfirm(false); }}
                active={avatarMenuOpen}
              />
              <AvatarMenu
                open={avatarMenuOpen}
                user={authUser}
                onViewProfile={handleViewProfile}
                onSignOut={handleSignOut}
                onSignOutAll={() => setSignOutAllConfirm(true)}
                confirmMode={signOutAllConfirm}
                onConfirm={handleSignOutAllConfirm}
                onCancel={() => { setSignOutAllConfirm(false); setAvatarMenuOpen(false); }}
              />
            </>
          ) : (
            profile.name && (
              <div className="profile-chip" title={profile.name}>
                {profile.photo
                  ? <img className="avatar" src={profile.photo} alt="" referrerPolicy="no-referrer" />
                  : <span className="avatar avatar-fallback">{profile.name.slice(0, 1)}</span>}
                <span className="pname">{profile.name}</span>
              </div>
            )
          )}
          <button className="btn ghost topbar-sound" title={t("topbar.soundToggle")} onClick={toggleSound}>{soundOn ? "🔊" : "🔇"}</button>
        </div>
      </div>

      {screen !== "lobby" && (code || vsBot) && (
        <div className="roombar">
          <div className="roombar-info">{vsBot ? <b>{t("roombar.vsBot")}</b> : <span>{t("roombar.room")} <b className="roomcode">{code}</b></span>}</div>
          <div className="roombar-actions">
            {!vsBot && (
              <button className="btn ghost chat-toggle" onClick={toggleChat}>💬</button>
            )}
            <button className="btn ghost" onClick={leaveRoom}>{vsBot ? t("common.exit") : t("common.leaveRoom")}</button>
          </div>
        </div>
      )}

      {notice && <div className="notice-toast">{notice}</div>}

      {screen === "lobby" && <Lobby onCreate={createRoom} onJoin={joinRoom} onBot={handleBot} onQuickMatch={handleQuickMatch} onWageredMatch={handleWageredMatch} onHelp={() => setHelpOpen(true)} error={error} authUser={authUser} authError={authError} verifyNotice={verifyNotice} clientId={clientId} signInDisabled={signInDisabled} onSignInDisable={() => setSignInDisabled(true)} onEmailAuthSuccess={setAuthUser} balance={balance} />}

      {screen === "queue" && (
        <div className="lobby">
          <h2>{queueType === "wagered" ? t("queue.titleWagered") : t("queue.titleFree")}</h2>
          <p className="sub">{t("queue.sub")}</p>
          {queueType === "wagered" && queueStake > 0 && (
            <div style={{ textAlign: "center", margin: "6px 0", fontWeight: "bold" }}>🪙 {queueStake} pts</div>
          )}
          <div className="queue-timer">
            <span className="queue-elapsed" aria-live="polite" aria-atomic="true">{String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:{String(elapsedSec % 60).padStart(2, "0")}</span>
            <span className="queue-label">{t("queue.elapsed")}</span>
          </div>
          <div style={{ height: 12 }} />
          <span className="status-pill pill-wait">{t("queue.searching")}</span>
          <div style={{ height: 20 }} />
          <button className="btn ghost" onClick={handleLeaveQueue}>{t("queue.cancel")}</button>
          {botOfferVisible && (
            <div className="queue-bot-offer">
              <p className="sub">{t("queue.botOfferBody")}</p>
              <button className="btn ghost" onClick={() => {
                socket.emit("leaveQueue", {}, () => {});
                setQueueType(null);
                setQueueSince(null);
                setQueueWindow(null);
                setBotOfferVisible(false);
                if (botOfferTimerRef.current) { clearTimeout(botOfferTimerRef.current); botOfferTimerRef.current = null; }
                if (queueTimerRef.current) { clearInterval(queueTimerRef.current); queueTimerRef.current = null; }
                setElapsedSec(0);
                startBot();
              }}>{t("queue.botOfferBtn")}</button>
            </div>
          )}
        </div>
      )}

      {screen === "profile" && (
        <ProfileView
          userId={viewProfileId}
          currentUserId={authUser ? authUser.id : null}
          onBack={() => setScreen("lobby")}
          onSignOut={handleSignOut}
        />
      )}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      {screen === "room" && (
        <div className="lobby">
          <h2>{t("room.title")}</h2>
          <p className="sub">{t("room.sub")}</p>
          <div className="room-code-box" style={{justifyContent:"center",marginBottom:6}}>
            <div className="code code-copy" onClick={copyCode} title={t("common.tapToCopy")}>
              {code}{copied && <span className="copied-tag">✓</span>}
            </div>
          </div>
          <p className="sub copy-hint" style={{textAlign:"center",marginBottom:14}}>{copied ? t("common.copied") : t("common.tapToCopy")}</p>
          <button className="btn primary" style={{width:"100%",marginBottom:10}} onClick={shareLink}>
            {linkCopied ? t("room.linkCopied") : t("room.inviteLink")}
          </button>
          <p className="sub" style={{textAlign:"center",marginBottom:16}}>{t("room.shareHint")}</p>
          {!oppPresent
            ? <div className="status-pill pill-wait" style={{textAlign:"center"}}>{t("room.waiting")}</div>
            : null}
          {oppPresent && (
            <button className="btn primary" style={{marginTop:16}} onClick={() => setScreen("placement")}>{t("room.startPlacement")}</button>
          )}
        </div>
      )}

      {screen === "placement" && (
        <div>
          {error && <div className="error">{error}</div>}
          <div className="room-banner">
            {vsBot ? (
              <div className="room-code-box"><span>{t("common.vsBotFull")}</span></div>
            ) : (
              <div className="room-code-box">
                <span>{t("common.roomCodeLabel")}</span>
                <div className="code code-copy" style={{fontSize:24}} onClick={copyCode} title={t("common.tapToCopy")}>
                  {code}{copied && <span className="copied-tag">✓</span>}
                </div>
              </div>
            )}
            <div className={"status-pill " + (vsBot ? "pill-ready" : (oppReady ? "pill-ready" : "pill-wait"))}>
              {vsBot ? t("place.botReady") : (oppPresent ? (oppReady ? t("place.oppReady") : t("place.oppPlacing")) : t("place.waitOpp"))}
            </div>
          </div>
          <Placement onConfirm={confirmPlacement} ready={iReady} waiting={iReady && !oppReady} />
        </div>
      )}

      {screen === "battle" && (
        <div>
          {stake > 0 && !vsBot && (
            <div style={{ textAlign: "center", margin: "4px 0", fontSize: "0.85em", color: "#ffd700", fontWeight: "bold" }}>
              🪙 {t("game.pot", { n: stake * 2 })}
            </div>
          )}
          {mode === "advance" && authUser && !vsBot && (
            <div style={{ textAlign: "center", margin: "4px 0" }}>
              <button className="btn ghost" style={{ fontSize: "0.85em", padding: "3px 10px" }} onClick={() => setShowShop((v) => !v)}>
                🛒 {purchasesRemaining > 0 ? `(${purchasesRemaining})` : "—"}
              </button>
            </div>
          )}
          {showShop && mode === "advance" && authUser && !vsBot && (
            <div style={{ background: "rgba(0,0,0,0.85)", border: "1px solid #4a90d9", borderRadius: 8, padding: 12, margin: "6px auto", maxWidth: 320 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: "0.95em" }}>{t("shop.title")}</h3>
              <div style={{ fontSize: "0.8em", marginBottom: 8, color: "#aaa" }}>
                {t("shop.price", { n: powerupPrice })} · {purchasesRemaining > 0 ? t("shop.remaining", { n: purchasesRemaining }) : t("shop.capReached")}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {["scatter", "cross", "double", "reveal", "mine"].map((type) => (
                  <button key={type} className="btn ghost" style={{ fontSize: "0.8em", padding: "3px 8px" }}
                    onClick={() => handleBuyPowerup(type)}
                    disabled={purchasesRemaining <= 0 || balance < powerupPrice}>
                    {POWER_ICON[type]} {POWER_NAME[type]} — {powerupPrice} 🪙
                  </button>
                ))}
              </div>
              <button className="btn ghost" style={{ marginTop: 6, fontSize: "0.8em", padding: "2px 10px" }} onClick={() => setShowShop(false)}>✕</button>
            </div>
          )}
          {oppBoughtNotice && (
            <div style={{ textAlign: "center", margin: "4px 0", fontSize: "0.85em", color: "#ff9800", fontWeight: "bold" }}>
              {t("shop.oppBought")}
            </div>
          )}
          <Battle myTurn={myTurn} vsBot={vsBot} occ={occ} incoming={incoming} myShots={myShots} onFire={fire} log={log} sunkOpp={sunkOpp} sunkMine={sunkMine} sunkEnemyCells={sunkEnemyCells} sunkMyCells={sunkMyCells} myScore={myScore} oppScore={oppScore} oppLabel={vsBot ? t("common.bot") : t("common.opponent")} myProfile={profile} oppProfile={vsBot ? null : oppProfile} myBubble={myBubble} oppBubble={vsBot ? null : oppBubble} flashEnemy={flashEnemy} flashMine={flashMine} mode={vsBot ? "classic" : mode} inv={inv} powerups={powerups} revealedEnemy={revealedEnemy} aim={aim} onPower={activatePower} myMines={myMines} onPlaceMine={placeMine} turnDeadline={vsBot ? null : turnDeadline} turnDur={turnDur} shake={shake} />
        </div>
      )}

      {over && (
        <div className="overlay">
          <div className={"modal " + (over.win ? "win" : "lose")}>
            <h2>{over.win ? t("over.win") : t("over.lose")}</h2>
            <p>{over.reason === "timeout"
              ? (over.win ? t("over.winTimeout") : t("over.loseTimeout"))
              : (over.win ? t("over.winNormal") : t("over.loseNormal"))}</p>
            {stake > 0 && !vsBot && over.win && (
              <div style={{ fontSize: "1.1em", color: "#4caf50", fontWeight: "bold", margin: "8px 0" }}>
                {t("game.won", { n: Math.floor(stake * 2 * 0.9) })}
              </div>
            )}
            {stake > 0 && !vsBot && !over.win && (
              <div style={{ fontSize: "1.1em", color: "#ff6b78", fontWeight: "bold", margin: "8px 0" }}>
                {t("game.lost", { n: stake })}
              </div>
            )}
            <button className="btn primary" onClick={rematchAction}>{t("over.rematch")}</button>
          </div>
        </div>
      )}

      {oppLeft && !over && (
        <div className="overlay">
          <div className="modal lose">
            <h2>{t("left.title")}</h2>
            <p>{t("left.body")}</p>
            <button className="btn primary" onClick={() => { setOppLeft(false); resetToLobby(); }}>{t("left.toLobby")}</button>
          </div>
        </div>
      )}

      {/* đối thủ tạm mất kết nối — banner nổi, không chặn thao tác, có đếm ngược */}
      {oppOffline && !oppLeft && !over && !vsBot && (
        <div className="offline-banner">
          {t("offline.banner")}{graceLeft > 0 ? ` (${graceLeft}s)` : ""}…
        </div>
      )}

      {/* xác nhận rời phòng (window.confirm bị chặn trong iframe IG) */}
      {confirmLeave && (
        <div className="overlay">
          <div className="modal">
            <h2 style={{ fontSize: 26 }}>{vsBot ? t("leave.titleBot") : t("leave.titleRoom")}</h2>
            <p>{vsBot ? t("leave.bodyBot") : t("leave.bodyRoom")}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn ghost" onClick={() => setConfirmLeave(false)}>{t("leave.stay")}</button>
              <button className="btn primary" onClick={doLeave}>{vsBot ? t("common.exit") : t("common.leaveRoom")}</button>
            </div>
          </div>
        </div>
      )}

      {!vsBot && <ChatComposer open={chatOpen} onSend={sendChat} onToggle={toggleChat} />}

      <div className="footer-note">{t("footer")}</div>
    </div>
  );
}

let _booted = false;
function boot() {
  if (_booted) return;
  _booted = true;
  try { document.title = t("lobby.title") + " · Battleship"; } catch (e) {}
  // NB: do NOT socket.connect() here — the App effect connects only after it has
  // attached the "connect"/"sync" listeners, otherwise a fast connect event can
  // fire before anyone is listening and auto-resume is silently missed.
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
}

boot();
