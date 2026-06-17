import React from "react";
import * as ReactDOM from "react-dom/client";
import { createPortal } from "react-dom";
import { io } from "socket.io-client";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
const { useState, useEffect, useRef, useCallback } = React;

const BOARD = 11;
const COLS = ["1","2","3","4","5","6","7","8","9","10","11"];
const ROWS = ["A","B","C","D","E","F","G","H","I","J","K"];

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
    "common.or": "OR", "common.copied": "Copied ✓", "common.ok": "OK",
    "common.tapToCopy": "Tap the code to copy", "common.bot": "Bot", "common.opponent": "Opponent",
    "common.exit": "Exit", "common.leaveRoom": "Leave", "common.roomCodeLabel": "Room code:", "common.vsBotFull": "🤖 Play vs Bot",
    "topbar.tagline": "Online · Sea Battle", "topbar.soundToggle": "Toggle sound",
    "lobby.title": "Sea Battle", "lobby.sub": "Play vs the bot, or create a room and send the code to a friend.",
    "lobby.playBot": "🤖 Play vs Bot", "lobby.createRoom": "⚓ Create new room", "lobby.enterCodeLabel": "Enter room code", "lobby.joinBtn": "Join room",
    "mode.classic": "Classic", "mode.classicDesc": "Classic, no power-ups",
    "ship.carrier": "Carrier", "ship.battleship": "Battleship", "ship.cruiser": "Cruiser", "ship.submarine": "Submarine", "ship.destroyer": "Destroyer",
    "pw.scatter": "Scatter Blast", "pw.cross": "Cross Missile", "pw.double": "Extra Turn", "pw.reveal": "Reveal Cell", "pw.mine": "Sea Mine", "pw.sonar": "Sonar Ping", "pw.decoy": "Decoy",
    "pw.sonarDesc": "Scan a row or column — YES/NO if ships are there. Costs your turn.", "pw.crossDesc": "Fire in a cross pattern (5 cells). Costs your turn.", "pw.decoyDesc": "Place a fake target. Enemy hits it thinking it's a ship.", "pw.scatterDesc": "Fire 2-3 random cells. Costs your turn.",
    "shop.maxHint": "max 2",
    "shop.capReached": "Max (2/2)", "decoy.place": "Tap an empty cell to place your decoy", "decoy.onShip": "Cannot place decoy on a ship", "decoy.invalidated": "Decoy position invalidated — place it again",
    "log.sonarYes": "🔊 Sonar scanned {target} — YES! Ships detected.", "log.sonarNo": "🔊 Sonar scanned {target} — NO ships.",
    "log.scatterBoom": "🌠 Scatter Blast!", "log.crossFire": "➕ Cross Missile at {cell}!",
    "battle.aimingSonar": "Pick a row or column to scan (tap button to cancel).",
    "battle.aimingCross": "Aiming Cross Missile — tap enemy waters to fire (tap button to cancel).",
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
    "premiumEmoji.title": "Premium ✨", "premiumEmoji.free": "Free", "premiumEmoji.pts": "coin", "premiumEmoji.signIn": "Sign in to use", "premiumEmoji.needBattle": "Only in battle",
    "help.open": "❓ How to play", "help.title": "How to play", "help.close": "Got it",
    "help.objTitle": "🎯 Goal", "help.objBody": "Be the first to sink all 5 of your opponent's ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).",
    "help.setupTitle": "⚓ Place your fleet", "help.setupBody": "Your fleet starts placed at random on an 11×11 grid. Drag a ship to move it, double-tap to rotate, or tap 🎲 Random for a new layout — then hit Ready.",
    "help.turnTitle": "💥 Taking turns", "help.turnBody": "Tap enemy waters to fire. A hit lets you fire again; a miss passes the turn. Each turn has a 20s timer — miss 3 turns in a row and you forfeit the match.",
    "help.powerTitle": "⚡ Power-ups", "help.powerBody": "In wagered matches, you can buy power-ups during placement (max 2 per match, costs 10% of the stake each): Sonar Ping (scan a row or column — reveals if ships are there, costs your turn), Cross Missile (fire in a + pattern hitting 5 cells, costs your turn), Scatter Blast (fire 2-3 random enemy cells, costs your turn), Decoy (place a fake ship cell on your grid — enemy hits it thinking it's real).",
    "help.modesTitle": "🏁 Wagered matches", "help.modesBody": "You can play free matches or bet coin — winner takes the pot. Wagered matches unlock the power-up shop during placement phase.",
    "help.chatTitle": "💬 Chat", "help.chatBody": "Tap 💬 to send a quick emoji or message — it pops as a bubble over your avatar for a few seconds (no chat log).",
    "help.reconnectTitle": "📡 Reconnect", "help.reconnectBody": "If you disconnect or background the app, your seat is held for 3 minutes. Re-open to resume the match.",
    "footer": "Battleship Online · share the room code to invite friends",
    "shell.powersToggle": "⚡ Powers", "shell.about": "About",
    "about.desc": "Battleship Online (Sea Battle / cờ hải chiến / bắn tàu) is a free browser game — no download, no sign-up. Create a room and share the 5-letter code to play a friend (2-player), or battle the bot. Classic and power-up modes. Desktop & mobile, EN & VI.",
    "about.faqTitle": "FAQ",
    "about.q1": "Is Battleship online free?", "about.a1": "Yes — 100% free, no download and no sign-up. It runs in your browser on desktop and mobile.",
    "about.q2": "Can I play with a friend?", "about.a2": "Create a room, share the 5-letter room code, and your friend joins for a real-time 2-player match.",
    "about.q3": "Can I play against the computer?", "about.a3": "Yes — choose Play vs Bot for a single-player game against the computer, no opponent needed.",
    "history.open": "📋 History", "history.title": "Match History", "history.empty": "No battles yet. ⚓", "history.back": "← Back",
    "history.all": "All", "history.win": "Won", "history.loss": "Lost", "history.wager": "Wagered", "history.free": "Free",
    "history.classic": "Classic", "history.advance": "Advance", "history.pts": "coin", "history.total": "{n} matches",
    "stats.winRate": "{n}% wins", "stats.totalGames": "{n} games",
    "h2h.title": "Head to Head", "h2h.winRate": "wins", "h2h.totalGames": "games", "h2h.games": "games", "h2h.streakMe": "You", "h2h.streakThem": "Them",
    "friends.add": "Add Friend", "friends.already": "Friends", "friends.pendingSent": "Request sent",
    "friends.list": "Friends", "friends.title": "Friends", "friends.search": "Search player...", "friends.online": "Online", "friends.inGame": "In Game", "friends.offline": "Offline",
    "friends.pending": "Pending Requests", "friends.accept": "Accept", "friends.decline": "Decline", "friends.remove": "Unfriend",
    "friends.none": "No friends yet. Play and add opponents!", "friends.searchHint": "Min 2 chars", "friends.added": "Sent ✓",
    "challenge.title": "Challenge {name}", "challenge.send": "Send Challenge", "challenge.received": "{name} challenges you!",
    "challenge.accept": "Accept", "challenge.decline": "Decline", "challenge.waiting": "Waiting...",
    "challenge.expired": "Challenge expired", "challenge.declined": "Declined", "challenge.notAvailable": "Not available",
    "postmatch.addFriend": "Add {name} as friend",
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
    "log.revealed": "Revealed an enemy ship cell at {cell}!",
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
    "profile.nameError": "Failed to save name.",
    "profile.notFound": "Player not found. Return to lobby.",
    "account.linkEmailTitle": "Link Email",
    "account.linkEmailDesc": "Add an email to sign in on other devices",
    "account.linkBtn": "Link",
    "account.emailInUse": "Email already in use",
    "account.invalidEmail": "Invalid email format",
    "account.alreadyHasEmail": "Email already linked",
    "account.linkError": "Could not link email",
    "account.emailLinked": "Email linked",
    "account.setPasswordDesc": "Set a password for email sign-in",
    "account.passwordPlaceholder": "Password (min 8 chars)",
    "account.setPasswordBtn": "Set Password",
    "account.passwordTooShort": "Min 8 characters",
    "account.passwordError": "Could not set password",
    "account.allSet": "Email + password set! You can now sign in on any device.",
    "account.currentEmail": "Email",
    "queue.quickMatch": "⚡ Quick Match",
    "queue.titleCasual": "Quick Match",
    "queue.sub": "Searching for an opponent…",
    "queue.searching": "Searching…",
    "queue.elapsed": "Time waiting",
    "queue.cancel": "Leave Queue",
    "err.ALREADY_IN_QUEUE": "You're already in a queue",
    "err.ALREADY_IN_ROOM": "You're already in a match",
    "err.RATE_LIMITED": "Too many attempts — wait a moment",
    "err.INSUFFICIENT_BALANCE": "Not enough coin",
    "err.GUEST_NO_WALLET": "Sign in to purchase power-ups",
    "err.WAGERED_REQUIRES_ACCOUNT": "Sign in to play wagered matches",
    "wallet.balance": "Coin",
    "wallet.free": "Free play",
    "wallet.wager": "Wager",
    "wallet.stakeLabel": "Stake",
    "wallet.yourStake": "Your wager: {n} coin",
    "wallet.insufficientBalance": "Not enough coin",
    "wallet.zeroBalance": "Play free games or win wagers to earn coin!",
    "queue.freeMatch": "⚡ Quick Match",
    "queue.wageredMatch": "💰 Wagered Match",
    "queue.stakeSelect": "Select stake",
    "queue.stake0": "Free (0 coin)",
    "queue.stake10": "10 coin",
    "queue.stake25": "25 coin",
    "queue.stake50": "50 coin",
    "queue.stake100": "100 coin",
    "queue.titleFree": "Free Match",
    "queue.titleWagered": "Wagered Match",
    "shop.buy": "Buy",
    "shop.title": "Power-up Shop",
    "shop.price": "{n} coin",
    "shop.remaining": "{n} left",
    "shop.confirm": "Buy {type} for {price} coin?",
    "shop.oppBought": "Opponent purchased a power-up!",
    "game.pot": "Pot: {n} coin",
    "game.won": "+{n} coin won!",
    "game.lost": "-{n} coin wagered",

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
    "common.or": "HOẶC", "common.copied": "Đã chép ✓", "common.ok": "OK",
    "common.tapToCopy": "Chạm vào mã để chép", "common.bot": "Máy", "common.opponent": "Đối thủ",
    "common.exit": "Thoát", "common.leaveRoom": "Rời phòng", "common.roomCodeLabel": "Mã phòng:", "common.vsBotFull": "🤖 Chơi với máy",
    "topbar.tagline": "Online · Hải chiến", "topbar.soundToggle": "Bật/tắt âm thanh",
    "lobby.title": "Trận hải chiến", "lobby.sub": "Chơi với máy, hoặc tạo phòng rồi gửi mã cho bạn bè.",
    "lobby.playBot": "🤖 Chơi với máy", "lobby.createRoom": "⚓ Tạo phòng mới", "lobby.enterCodeLabel": "Nhập mã phòng", "lobby.joinBtn": "Vào phòng",
    "mode.classic": "Cổ điển", "mode.classicDesc": "Cổ điển, không power-up",
    "ship.carrier": "Tàu sân bay", "ship.battleship": "Thiết giáp hạm", "ship.cruiser": "Tàu tuần dương", "ship.submarine": "Tàu ngầm", "ship.destroyer": "Khu trục hạm",
    "pw.scatter": "Nổ ngẫu nhiên", "pw.cross": "Tên lửa chữ thập", "pw.double": "Thêm lượt", "pw.reveal": "Lộ ô thuyền", "pw.mine": "Mìn nước", "pw.sonar": "Dò sóng", "pw.decoy": "Mồi nhử",
    "pw.sonarDesc": "Dò 1 hàng/cột — CÓ/KHÔNG có tàu. Mất lượt.", "pw.crossDesc": "Bắn chữ thập (5 ô). Mất lượt.", "pw.decoyDesc": "Đặt mục tiêu giả. Địch bắn trúng tưởng là tàu.", "pw.scatterDesc": "Bắn 2-3 ô ngẫu nhiên. Mất lượt.",
    "shop.maxHint": "tối đa 2",
    "shop.capReached": "Tối đa (2/2)", "decoy.place": "Chạm vào ô trống để đặt mồi nhử", "decoy.onShip": "Không đặt được mồi nhử lên thuyền", "decoy.invalidated": "Vị trí mồi nhử bị vô hiệu — đặt lại",
    "log.sonarYes": "🔊 Dò sóng {target} — CÓ tàu!", "log.sonarNo": "🔊 Dò sóng {target} — KHÔNG có tàu.",
    "log.scatterBoom": "🌠 Nổ ngẫu nhiên!", "log.crossFire": "➕ Tên lửa chữ thập tại {cell}!",
    "battle.aimingSonar": "Chọn hàng hoặc cột để dò (chạm lại nút để hủy).",
    "battle.aimingCross": "Đang ngắm Tên lửa chữ thập — chạm biển địch để bắn (chạm lại nút để hủy).",
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
    "premiumEmoji.title": "Đặc biệt ✨", "premiumEmoji.free": "Miễn phí", "premiumEmoji.pts": "coin", "premiumEmoji.signIn": "Đăng nhập để dùng", "premiumEmoji.needBattle": "Chỉ dùng trong trận",
    "help.open": "❓ Cách chơi", "help.title": "Cách chơi", "help.close": "Đã hiểu",
    "help.objTitle": "🎯 Mục tiêu", "help.objBody": "Đánh chìm cả 5 thuyền của đối thủ trước là thắng: Tàu sân bay (5 ô), Thiết giáp hạm (4 ô), Tàu tuần dương (3 ô), Tàu ngầm (3 ô), Khu trục hạm (2 ô).",
    "help.setupTitle": "⚓ Bố trí hạm đội", "help.setupBody": "Hạm đội được xếp ngẫu nhiên trên lưới 11×11. Kéo thuyền để di chuyển, chạm 2 lần để xoay, hoặc bấm 🎲 Ngẫu nhiên để xếp lại — rồi bấm Sẵn sàng.",
    "help.turnTitle": "💥 Lượt bắn", "help.turnBody": "Chạm vào biển địch để bắn. Trúng thì bắn tiếp; trượt thì chuyển lượt. Mỗi lượt có 20 giây — bỏ 3 lượt liên tiếp sẽ bị xử thua.",
    "help.powerTitle": "⚡ Power-up", "help.powerBody": "Trong trận có cược, bạn mua được power-up lúc bố trí (tối đa 2/trận, giá 10% tiền cược mỗi cái): Dò sóng (quét 1 hàng/cột — CÓ/KHÔNG có tàu, mất lượt), Tên lửa chữ thập (bắn 5 ô hình +, mất lượt), Nổ ngẫu nhiên (bắn 2-3 ô ngẫu nhiên bên địch, mất lượt), Mồi nhử (đặt ô giả trên lưới — địch bắn trúng tưởng là tàu).",
    "help.modesTitle": "🏁 Trận cược", "help.modesBody": "Bạn có thể chơi miễn phí hoặc đặt cược coin — người thắng lấy cả. Trận cược mở khóa cửa hàng power-up khi bố trí tàu.",
    "help.chatTitle": "💬 Trò chuyện", "help.chatBody": "Bấm 💬 để gửi emoji hoặc tin nhắn nhanh — nó hiện thành bong bóng trên avatar bạn vài giây (không có khung chat).",
    "help.reconnectTitle": "📡 Kết nối lại", "help.reconnectBody": "Nếu mất kết nối hoặc thoát nền app, ghế của bạn được giữ 3 phút. Mở lại để chơi tiếp.",
    "footer": "Battleship Online · chia sẻ mã phòng để mời bạn bè",
    "shell.powersToggle": "⚡ Vũ khí", "shell.about": "Giới thiệu",
    "about.desc": "Battleship Online (cờ hải chiến / bắn tàu) là game trình duyệt miễn phí — không tải, không đăng ký. Tạo phòng, gửi mã 5 ký tự để đấu 2 người với bạn, hoặc chơi với máy. Có chế độ cổ điển và power-up. Máy tính & điện thoại, song ngữ Anh/Việt.",
    "about.faqTitle": "Câu hỏi thường gặp",
    "about.q1": "Có miễn phí không?", "about.a1": "Có — miễn phí 100%, không tải, không đăng ký. Chơi ngay trên trình duyệt, máy tính lẫn điện thoại.",
    "about.q2": "Chơi với bạn được không?", "about.a2": "Tạo phòng, gửi mã 5 ký tự, bạn bè vào là đấu 2 người thời gian thực.",
    "about.q3": "Đấu với máy được không?", "about.a3": "Được — chọn Chơi với Máy để chơi một mình, không cần đối thủ.",
    "history.open": "📋 Lịch sử", "history.title": "Lịch sử trận đấu", "history.empty": "Chưa có trận đấu nào. ⚓", "history.back": "← Quay lại",
    "history.all": "Tất cả", "history.win": "Thắng", "history.loss": "Thua", "history.wager": "Có cược", "history.free": "Không cược",
    "history.classic": "Classic", "history.advance": "Advance", "history.pts": "coin", "history.total": "{n} trận",
    "stats.winRate": "{n}% thắng", "stats.totalGames": "{n} trận",
    "h2h.title": "Đối đầu", "h2h.winRate": "thắng", "h2h.totalGames": "trận", "h2h.games": "trận", "h2h.streakMe": "Bạn", "h2h.streakThem": "Họ",
    "friends.add": "Kết bạn", "friends.already": "Bạn bè", "friends.pendingSent": "Đã gửi lời mời",
    "friends.list": "Bạn bè", "friends.title": "Bạn bè", "friends.search": "Tìm người chơi...", "friends.online": "Đang online", "friends.inGame": "Đang chơi", "friends.offline": "Offline",
    "friends.pending": "Lời mời kết bạn", "friends.accept": "Chấp nhận", "friends.decline": "Từ chối", "friends.remove": "Hủy kết bạn",
    "friends.none": "Chưa có bạn bè. Chơi và thêm đối thủ!", "friends.searchHint": "Tối thiểu 2 ký tự", "friends.added": "Đã gửi ✓",
    "challenge.title": "Thách đấu {name}", "challenge.send": "Gửi thách đấu", "challenge.received": "{name} thách đấu bạn!",
    "challenge.accept": "Chấp nhận", "challenge.decline": "Từ chối", "challenge.waiting": "Đang chờ...",
    "challenge.expired": "Hết hạn", "challenge.declined": "Đã từ chối", "challenge.notAvailable": "Không khả dụng",
    "postmatch.addFriend": "Kết bạn với {name}",
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
    "log.revealed": "Lộ 1 ô thuyền địch tại {cell}!",
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
    "profile.nameError": "Không lưu được tên.",
    "profile.notFound": "Không tìm thấy người chơi. Quay lại sảnh.",
    "account.linkEmailTitle": "Liên kết Email",
    "account.linkEmailDesc": "Thêm email để đăng nhập trên thiết bị khác",
    "account.linkBtn": "Liên kết",
    "account.emailInUse": "Email đã được sử dụng",
    "account.invalidEmail": "Email không hợp lệ",
    "account.alreadyHasEmail": "Đã có email liên kết",
    "account.linkError": "Không thể liên kết email",
    "account.emailLinked": "Đã liên kết email",
    "account.setPasswordDesc": "Đặt mật khẩu để đăng nhập bằng email",
    "account.passwordPlaceholder": "Mật khẩu (tối thiểu 8 ký tự)",
    "account.setPasswordBtn": "Đặt mật khẩu",
    "account.passwordTooShort": "Tối thiểu 8 ký tự",
    "account.passwordError": "Không thể đặt mật khẩu",
    "account.allSet": "Email + mật khẩu đã sẵn sàng! Bạn có thể đăng nhập trên mọi thiết bị.",
    "account.currentEmail": "Email",
    "queue.quickMatch": "⚡ Ghép trận nhanh",
    "queue.titleCasual": "Ghép trận nhanh",
    "queue.sub": "Đang tìm đối thủ…",
    "queue.searching": "Đang tìm…",
    "queue.elapsed": "Thời gian chờ",
    "queue.cancel": "Rời hàng chờ",
    "err.ALREADY_IN_QUEUE": "Bạn đang trong hàng chờ rồi",
    "err.ALREADY_IN_ROOM": "Bạn đang trong trận rồi",
    "err.RATE_LIMITED": "Quá nhiều lần thử — chờ một lát",
    "err.INSUFFICIENT_BALANCE": "Không đủ coin",
    "err.GUEST_NO_WALLET": "Đăng nhập để mua power-up",
    "err.WAGERED_REQUIRES_ACCOUNT": "Đăng nhập để chơi trận cá cược",
    "wallet.balance": "Coin",
    "wallet.free": "Chơi miễn phí",
    "wallet.wager": "Cá cược",
    "wallet.stakeLabel": "Mức cược",
    "wallet.yourStake": "Cược của bạn: {n} coin",
    "wallet.insufficientBalance": "Không đủ coin",
    "wallet.zeroBalance": "Chơi miễn phí hoặc thắng cược để kiếm coin!",
    "queue.freeMatch": "⚡ Ghép trận nhanh",
    "queue.wageredMatch": "💰 Trận cá cược",
    "queue.stakeSelect": "Chọn mức cược",
    "queue.stake0": "Miễn phí (0 đ)",
    "queue.stake10": "10 coin",
    "queue.stake25": "25 coin",
    "queue.stake50": "50 coin",
    "queue.stake100": "100 coin",
    "queue.titleFree": "Ghép trận nhanh",
    "queue.titleWagered": "Trận cá cược",
    "shop.buy": "Mua",
    "shop.title": "Cửa hàng Power-up",
    "shop.price": "{n} coin",
    "shop.remaining": "Còn {n} lượt",
    "shop.confirm": "Mua {type} với {price} coin?",
    "shop.oppBought": "Đối thủ đã mua power-up!",
    "game.pot": "Thưởng: {n} coin",
    "game.won": "+{n} coin thắng!",
    "game.lost": "-{n} coin đã cược",

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
const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnectionDelay: 2000,      // start at 2s (default 1s)
  reconnectionDelayMax: 15000,  // cap at 15s (default 5s) — saves mobile radio while staying responsive
  reconnectionAttempts: 50,     // give up after 50 (~10min) instead of Infinity
});

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
    // Premium emoji impact sounds
    emojiExplosion() { noise(0.4, 0.55); tone(150, 0.35, "sawtooth", 0.4, 45); setTimeout(() => { noise(0.25, 0.3); tone(70, 0.4, "sine", 0.3, 35); }, 50); },
    emojiShake() { noise(0.15, 0.5); tone(200, 0.1, "square", 0.35, 100); setTimeout(() => { noise(0.1, 0.35); tone(160, 0.08, "square", 0.3, 80); }, 60); },
    emojiSplash() { noise(0.35, 0.4); tone(400, 0.25, "sine", 0.25, 150); setTimeout(() => { noise(0.2, 0.3); tone(300, 0.15, "sine", 0.2, 100); }, 80); },
    emojiHearts() { [880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.15, "sine", 0.2), i * 100)); },
    emojiBounce() { tone(440, 0.08, "triangle", 0.25, 220); setTimeout(() => tone(550, 0.08, "triangle", 0.2, 330), 80); setTimeout(() => tone(660, 0.1, "triangle", 0.2, 440), 160); },
    // Emoji whoosh during flight
    emojiWhoosh() { tone(600, 0.3, "sine", 0.12, 200); noise(0.2, 0.1); },
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
// Phase 19: cells render at the responsive var(--cell), not a fixed 32px. Position
// ships/overlays via calc() off --cell instead of the old fixed PITCH math, which
// left ships drifting from their grid cells on mobile (ship one place, cell another).
// PAD/GAP are the grid's fixed padding/gap (.grid { padding:6px; gap:2px }).
const cellEdge = (i) => `calc(${PAD}px + ${i} * (var(--cell) + ${GAP}px))`;
const spanLen  = (n) => `calc(${n} * (var(--cell) + ${GAP}px) - ${GAP}px)`;
const CELLV = "var(--cell)";

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
// Rendered via createPortal into document.body (Phase 19 — Pitfall 3 /
// T-19-07): .bottom-sheet-overlay is position:fixed, but several call sites
// live inside a ScreenShell's .shell-main, which gains a `transform` during
// the screen-enter animation and would become the fixed element's containing
// block (trapping the sheet at the wrong position/size for ~220ms). Porting
// to <body> keeps it fixed to the viewport regardless of ancestor transforms.
function BottomSheet({ open, onClose, title, children }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    function handleKey(e) { if (e.key === "Escape") onCloseRef.current(); }
    document.addEventListener("keydown", handleKey);
    // Focus trap: focus first focusable element (only on initial open)
    const timer = setTimeout(() => {
      if (panelRef.current) {
        const el = panelRef.current.querySelector("input, button, [tabindex]");
        if (el) el.focus();
      }
    }, 100);
    return () => { document.removeEventListener("keydown", handleKey); clearTimeout(timer); };
  }, [open]);
  // Prevent overlay touch from closing sheet when tapping inside panel area on mobile
  const handleOverlayClick = useCallback((e) => {
    // Only close if the click is directly on the overlay, not bubbled from panel
    if (e.target === e.currentTarget) onCloseRef.current();
  }, []);
  return createPortal(
    <div className={"bottom-sheet-overlay" + (open ? " open" : "")} onClick={handleOverlayClick} onTouchEnd={handleOverlayClick} role="presentation">
      <div className="bottom-sheet-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
        <div className="bottom-sheet-title">{title}</div>
        <button className="bottom-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        {children}
      </div>
    </div>,
    document.body
  );
}

// ---------- useMainHeight (Phase 19 — app shell) ----------
// Measures .shell-main's rendered height via ResizeObserver and writes it to
// the --main-h CSS custom property, consumed by the --cell height-cap formula
// (MOBILE-03). Falls back to a one-shot measurement + window.resize listener
// when ResizeObserver is unavailable (graceful degradation per CLAUDE.md).
function useMainHeight(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Write --main-h on :root, NOT on the .shell-main element. --cell is
    // declared on :root and references var(--main-h); custom properties resolve
    // their var() at the element that DECLARES them, so a --main-h set on a
    // descendant (.shell-main) is invisible to :root's --cell and the height
    // cap silently fell back to 100vh — letting the board overflow / scroll on
    // shorter viewports. Setting it on documentElement makes the cap real.
    // clientHeight (border-box minus border = padding+content) is used in both
    // paths so the reserve constant in --cell is tuned against one definition.
    const root = document.documentElement;
    const write = () => root.style.setProperty("--main-h", el.clientHeight + "px");
    if (typeof ResizeObserver === "undefined") {
      write();
      window.addEventListener("resize", write);
      return () => window.removeEventListener("resize", write);
    }
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}

// ---------- useKeyboardInset (Phase 19 — MOBILE-12) ----------
// Keeps the chat composer (.chat-panel, position:fixed; bottom:0) visible
// above the on-screen keyboard by re-clamping it to window.visualViewport's
// resized height/offset. Graceful no-op when visualViewport is unavailable
// (CLAUDE.md: optional browser APIs degrade gracefully). Registers exactly
// one resize + one scroll listener with matching cleanup (T-19-08) — the
// listener writes inline styles on the panel element itself, never on the
// observed viewport, so it cannot re-trigger itself.
// `ready` (e.g. the composer's `open` state) re-runs the effect once the
// panel element actually exists in the DOM.
function useKeyboardInset(panelRef, ready) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !panelRef.current) return;
    function reposition() {
      const el = panelRef.current;
      if (!el) return;
      // Heuristic: keyboard is "open" when the visual viewport shrinks below
      // ~85% of the layout viewport height.
      if (vv.height < window.innerHeight * 0.85) {
        el.style.position = "fixed";
        el.style.top = (vv.offsetTop + vv.height - el.offsetHeight) + "px";
        el.style.bottom = "auto";
      } else {
        el.style.position = "";
        el.style.top = "";
        el.style.bottom = "";
      }
    }
    vv.addEventListener("resize", reposition);
    vv.addEventListener("scroll", reposition);
    reposition();
    return () => {
      vv.removeEventListener("resize", reposition);
      vv.removeEventListener("scroll", reposition);
    };
  }, [panelRef, ready]);
}

// ---------- ScreenShell (Phase 19 — app shell) ----------
// Wraps a screen's content in the 3-region shell: .shell-header (optional),
// .shell-main (scrollable content), .shell-footer (optional). `screenKey`/
// `direction` are plumbed through for Plan 04's screen-transition CSS classes
// (undefined-safe — no-op until that plan lands). `mainRef` is an optional
// callback ref forwarded to the .shell-main DOM node, so children can wire
// up scroll-container-relative APIs (e.g. IntersectionObserver root, MOBILE-10).
function ScreenShell({ header, footer, children, screenKey, direction, mainRef }) {
  const internalRef = useRef(null);
  useMainHeight(internalRef);
  const setRefs = (el) => {
    internalRef.current = el;
    if (typeof mainRef === "function") mainRef(el);
  };
  return (
    <>
      {header && <div className="shell-header">{header}</div>}
      <div className={"shell-main" + (direction ? " screen-enter-" + direction : "")} ref={setRefs} key={screenKey}>
        {children}
      </div>
      {footer && <div className="shell-footer">{footer}</div>}
    </>
  );
}

// ---------- LobbyFriendsWidget (Phase 17) ----------
// Inline widget showing online friends directly in the lobby
function LobbyFriendsWidget({ authUser, balance, onViewProfile, onRoomCreated }) {
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState(null);
  const [challengeStake, setChallengeStake] = useState(0);
  const [challengeWaiting, setChallengeWaiting] = useState(false);
  const [notice, setNotice] = useState(null);

  // Fetch friends on mount and re-fetch periodically for sync
  useEffect(() => {
    if (!authUser) return;
    function loadFriends() {
      fetch("/api/friends").then(r => r.ok ? r.json() : []).then(data => { setFriends(data); setLoaded(true); }).catch(() => setLoaded(true));
    }
    function loadPending() {
      fetch("/api/friends/pending").then(r => r.ok ? r.json() : []).then(setPending).catch(() => {});
    }
    loadFriends();
    loadPending();
    // Poll every 10s for sync (backup for missed socket events)
    const poll = setInterval(() => { loadFriends(); loadPending(); }, 10000);

    const onStatus = ({ userId, status }) => {
      setFriends(prev => prev.map(f => f.id === userId ? { ...f, status } : f));
    };
    const onList = (data) => setFriends(data);
    const onPendingUpdate = (data) => setPending(data);
    const onReq = (req) => { loadPending(); }; // re-fetch to get full data
    const onChallengeAccepted = () => { setChallengeWaiting(false); setChallengeTarget(null); };
    const onChallengeDeclined = () => { setChallengeWaiting(false); setChallengeTarget(null); showNotice(t("challenge.declined")); };
    const onChallengeExpired = () => { setChallengeWaiting(false); setChallengeTarget(null); showNotice(t("challenge.expired")); };
    socket.on("friend:status-change", onStatus);
    socket.on("friend:list", onList);
    socket.on("friend:pending", onPendingUpdate);
    socket.on("friend:request-received", onReq);
    socket.on("friend:challenge-accepted", onChallengeAccepted);
    socket.on("friend:challenge-declined", onChallengeDeclined);
    socket.on("friend:challenge-expired", onChallengeExpired);
    return () => {
      clearInterval(poll);
      socket.off("friend:status-change", onStatus);
      socket.off("friend:list", onList);
      socket.off("friend:pending", onPendingUpdate);
      socket.off("friend:request-received", onReq);
      socket.off("friend:challenge-accepted", onChallengeAccepted);
      socket.off("friend:challenge-declined", onChallengeDeclined);
      socket.off("friend:challenge-expired", onChallengeExpired);
    };
  }, [authUser]);

  function showNotice(msg) { setNotice(msg); setTimeout(() => setNotice(null), 3000); }

  function handleAccept(friendshipId) {
    socket.emit("friend:accept", { friendshipId }, (res) => {
      if (res.ok) {
        setPending(prev => prev.filter(p => p.friendship_id !== friendshipId));
        // Re-fetch friends list to show the new friend
        fetch("/api/friends").then(r => r.ok ? r.json() : []).then(setFriends).catch(() => {});
      }
    });
  }
  function handleReject(friendshipId) {
    socket.emit("friend:reject", { friendshipId }, (res) => {
      if (res.ok) setPending(prev => prev.filter(p => p.friendship_id !== friendshipId));
    });
  }

  function sendChallenge() {
    if (!challengeTarget) return;
    setChallengeWaiting(true);
    socket.emit("friend:challenge", { friendId: challengeTarget.id, stake: challengeStake }, (res) => {
      if (!res || !res.ok) {
        setChallengeWaiting(false);
        setChallengeTarget(null);
        showNotice(t("challenge.notAvailable"));
      } else {
        // Server created room and seated us — navigate to room screen
        setChallengeWaiting(false);
        setChallengeTarget(null);
        if (onRoomCreated) onRoomCreated(res.code, challengeStake);
      }
    });
  }

  const online = friends.filter(f => f.status === "online");
  const inGame = friends.filter(f => f.status === "in-game");
  const offline = friends.filter(f => !f.status || f.status === "offline");
  // Combine all friends in priority order: online > in-game > offline
  const allSorted = [...online, ...inGame, ...offline];
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 5;
  const visible = showAll ? allSorted : allSorted.slice(0, LIMIT);
  const hasMore = allSorted.length > LIMIT;

  if (!loaded) return null;

  return (
    <div className="lobby-friends-widget">
      <div className="lobby-friends-title">👥 {t("friends.title")}</div>
      {notice && <div className="notice-toast" style={{fontSize:"12px",padding:"4px 10px",marginBottom:6}}>{notice}</div>}
      {/* Empty state */}
      {friends.length === 0 && pending.length === 0 && (
        <div className="friends-empty-inline">{t("friends.none")}</div>
      )}
      {/* Pending requests */}
      {pending.length > 0 && (
        <div className="lobby-friends-pending">
          {pending.map(p => (
            <div key={p.friendship_id} className="lobby-friend-row pending">
              <span className="friend-name">{p.display_name || "?"}</span>
              <button className="btn-mini accept" onClick={() => handleAccept(p.friendship_id)}>✓</button>
              <button className="btn-mini reject" onClick={() => handleReject(p.friendship_id)}>✗</button>
            </div>
          ))}
        </div>
      )}
      {/* Friends list (max 5, show more on click) */}
      {visible.map(f => (
        <div key={f.id} className="lobby-friend-row">
          <span className={"status-dot " + (f.status === "online" ? "online" : f.status === "in-game" ? "ingame" : "offline")}></span>
          <span className="friend-name clickable" onClick={() => onViewProfile && onViewProfile(f.id)}>{f.display_name}</span>
          {f.status === "online" && (
            <button className="btn-mini challenge" onClick={() => { setChallengeTarget(f); setChallengeStake(0); }}>⚔️</button>
          )}
          {f.status === "in-game" && <span className="friend-status-label">🎮</span>}
        </div>
      ))}
      {hasMore && !showAll && (
        <button className="btn-mini" onClick={() => setShowAll(true)} style={{width:"100%",marginTop:4,textAlign:"center"}}>
          {LANG === "vi" ? `Xem thêm (${allSorted.length - LIMIT})` : `Show more (${allSorted.length - LIMIT})`}
        </button>
      )}
      {showAll && hasMore && (
        <button className="btn-mini" onClick={() => setShowAll(false)} style={{width:"100%",marginTop:4,textAlign:"center"}}>
          {LANG === "vi" ? "Thu gọn" : "Show less"}
        </button>
      )}
      {/* Challenge BottomSheet */}
      <BottomSheet open={!!challengeTarget && !challengeWaiting} onClose={() => setChallengeTarget(null)} title={t("challenge.title", { name: challengeTarget?.display_name || "" })}>
        <div className="wager-chips" style={{ justifyContent: "center", margin: "10px 0" }}>
          {[0, 10, 25, 50, 100].map(s => {
            const myOk = s === 0 || (balance != null && balance >= s);
            const theirOk = s === 0 || (challengeTarget?.balance != null && challengeTarget.balance >= s);
            return (
              <button key={s} className={"chip" + (challengeStake === s ? " active" : "")} onClick={() => setChallengeStake(s)} disabled={!myOk || !theirOk}>
                {s === 0 ? t("queue.stake0") : s}
              </button>
            );
          })}
        </div>
        <div style={{ textAlign: "center", marginBottom: 4, fontSize: "0.85em", color: "#7ab3e0" }}>
          💰 {LANG === "vi" ? "Bạn" : "You"}: {balance ?? 0} · {challengeTarget?.display_name}: {challengeTarget?.balance ?? 0}
        </div>
        <button className="btn primary" onClick={sendChallenge} style={{marginTop:10}}>⚔️ {t("challenge.send")}</button>
      </BottomSheet>
      {challengeWaiting && (
        <div className="challenge-waiting">⏳ {t("challenge.waiting")}</div>
      )}
    </div>
  );
}

// ---------- Lobby ----------
function Lobby({ onCreate, onJoin, onBot, onQuickMatch, onHelp, onHistory, onFriends, onChallenge, onViewProfile, onRoomCreated, error, authUser, authError, verifyNotice, clientId, signInDisabled, onSignInDisable, onEmailAuthSuccess, balance }) {
  const [code, setCode] = useState("");
  const [roomStake, setRoomStake] = useState(0);
  const [friendSheetOpen, setFriendSheetOpen] = useState(false);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [stakeSheetOpen, setStakeSheetOpen] = useState(false);
  const [sheetStake, setSheetStake] = useState(0);
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
      <button className={"btn primary hero-cta" + (showOnboarding ? " onboarding-pulse" : "")} onClick={() => { dismissOnboarding(); if (authUser) { setSheetStake(0); setStakeSheetOpen(true); } else { onQuickMatch(0); } }}>
        <span className="hero-icon">⚡</span>
        <span className="hero-text">
          <strong>{t("lobby.quickPlay")}</strong>
          <small>{t("lobby.quickPlaySub")}</small>
        </span>
      </button>
      {showOnboarding && <div className="onboarding-hint">{t("lobby.onboardingHint")}</div>}

      {/* Secondary cards row */}
      <div className="lobby-cards">
        <button className="lobby-card" onClick={() => { dismissOnboarding(); onBot(); }} aria-label={t("lobby.botCard") + " - " + t("lobby.botCardSub")}>
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

      {/* Inline Friends Widget (Phase 17) — shows above footer for auth users */}
      {authUser && (
        <LobbyFriendsWidget authUser={authUser} balance={balance} onViewProfile={onViewProfile} onRoomCreated={onRoomCreated} />
      )}

      {/* Footer utilities */}
      <div className="lobby-footer">
        <button className="btn ghost compact" onClick={onHelp}>{t("help.open")}</button>
        {authUser && (
          <button className="btn ghost compact" onClick={onHistory}>{t("history.open")}</button>
        )}
        {!authUser && (
          <button className="btn ghost compact" onClick={() => setAuthSheetOpen(true)}>{t("auth.signIn")}</button>
        )}
      </div>


      {/* Bottom Sheet: Friends / Room */}
      <BottomSheet open={friendSheetOpen} onClose={() => setFriendSheetOpen(false)} title={t("lobby.friendTitle")}>
        <button className="btn steel" onClick={() => { onCreate("classic", roomStake); setFriendSheetOpen(false); }}>{t("lobby.createRoom")}</button>
        {authUser && (
          <div className="wager-chips" style={{ justifyContent: "center", margin: "10px 0" }}>
            {[0, 10, 25, 50, 100].map((s) => (
              <button key={s} className={"chip" + (roomStake === s ? " active" : "")} onClick={() => setRoomStake(s)} disabled={s > 0 && (balance == null || balance < s)}>
                {s === 0 ? t("queue.stake0") : s}
              </button>
            ))}
          </div>
        )}
        <div className="divider">{t("common.or")}</div>
        <div className="field">
          <label>{t("lobby.enterCodeLabel")}</label>
          <input className="code-input" maxLength={5} placeholder="ABCDE"
            value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter" && code) { onJoin(code); setFriendSheetOpen(false); } }}
            autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck="false"
            inputMode="text" enterKeyHint="go" />
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

      {/* Bottom Sheet: Stake selection (for logged-in Quick Play) */}
      <BottomSheet open={stakeSheetOpen} onClose={() => setStakeSheetOpen(false)} title={t("queue.stakeSelect")}>
        <div style={{ textAlign: "center", marginBottom: 10, fontSize: "1.1em" }}>💰 {balance ?? 0}</div>
        <div className="wager-chips" style={{ justifyContent: "center", marginBottom: 14 }}>
          {[0, 10, 25, 50, 100].map((s) => (
            <button key={s} className={"chip" + (sheetStake === s ? " active" : "")} onClick={() => setSheetStake(s)} disabled={s > 0 && (balance == null || balance < s)}>
              {s === 0 ? t("queue.stake0") : s}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => { onQuickMatch(sheetStake); setStakeSheetOpen(false); }} disabled={sheetStake > 0 && (balance == null || balance < sheetStake)}>
          {t("queue.quickMatch")}
        </button>
      </BottomSheet>
    </div>
  );
}

// ---------- Grid ----------
function Grid({ enemy, occ, hits, incoming, onCellClick, hoverCells, onCellHover, shootable, sunk, flash, revealed, aimCells, placeable, sonarScan }) {
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
        if (revealed && revealed.has(k) && !(hits && hits.has(k))) cls += " revealed";
        if (aimCells && aimCells.has(k)) cls += " aim";
        if (hoverCells && hoverCells.has(k)) cls += " ship";
        // Sonar scan highlight (row or column glows red/pink)
        if (sonarScan) {
          if (sonarScan.axis === "row" && r === sonarScan.index) cls += " sonar-hl";
          if (sonarScan.axis === "col" && c === sonarScan.index) cls += " sonar-hl";
        }
      } else {
        if (occ && occ.has(k)) cls += " ship";
        if (incoming && incoming.has(k)) cls += incoming.get(k) ? " hit" : " miss";
        if (placeable && !(occ && occ.has(k)) && !(incoming && incoming.has(k))) cls += " selectable";
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

// ---------- Placement Shop (Phase 15 — power-up purchase during placement) ----------
function PlacementShop({ stake, balance, inventory, purchaseCount, onBuy, onRefund, disabled }) {
  const price = Math.round(stake * 0.10);
  const maxReached = purchaseCount >= 2;
  // balance=null means still loading; allow clicks (server validates anyway)
  const canAfford = balance == null || balance >= price;
  const balanceLoaded = balance != null;
  const [tooltip, setTooltip] = useState(null);
  const holdTimer = useRef(null);

  const POWER_DESC = {
    sonar: t("pw.sonarDesc"),
    cross: t("pw.crossDesc"),
    decoy: t("pw.decoyDesc"),
    scatter: t("pw.scatterDesc"),
  };

  function onHoldStart(type) {
    holdTimer.current = setTimeout(() => { setTooltip(type); }, 400);
  }
  function onHoldEnd() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    setTooltip(null);
  }

  return (
    <div className="placement-shop">
      <div className="shop-header">⚡ {t("shop.title")} · {price} 💰 <span className="shop-max">({t("shop.maxHint")})</span></div>
      <div className="shop-row">
        {[
          { type: "sonar", icon: "🔊", nameKey: "pw.sonar" },
          { type: "cross", icon: "➕", nameKey: "pw.cross" },
          { type: "decoy", icon: "🎭", nameKey: "pw.decoy" },
          { type: "scatter", icon: "🌠", nameKey: "pw.scatter" },
        ].map(({ type, icon, nameKey }) => {
          const owned = (inventory[type] || 0) > 0;
          const isDisabled = disabled || (!owned && (maxReached || !canAfford || (type === "decoy" && (inventory.decoy || 0) >= 1)));
          return (
            <button key={type} className={"shop-item" + (owned ? " selected" : "")}
              onClick={() => owned ? onRefund(type) : onBuy(type)}
              onPointerDown={() => onHoldStart(type)}
              onPointerUp={onHoldEnd}
              onPointerLeave={onHoldEnd}
              onMouseEnter={() => { if (window.matchMedia("(hover: hover)").matches) setTooltip(type); }}
              onMouseLeave={() => { if (window.matchMedia("(hover: hover)").matches) setTooltip(null); }}
              disabled={isDisabled}>
              <span className="shop-icon">{icon}</span>
              <span className="shop-name">{t(nameKey)}</span>
              {owned && <span className="shop-check">✓ {LANG === "vi" ? "bỏ" : "undo"}</span>}
            </button>
          );
        })}
      </div>
      {maxReached && <div className="shop-cap">{t("shop.capReached")}</div>}
      {!maxReached && balanceLoaded && !canAfford && <div className="shop-cap">{t("wallet.insufficientBalance")}</div>}
      {tooltip && (
        <div className="shop-tooltip" onClick={() => setTooltip(null)}>
          <div className="shop-tooltip-content">
            <strong>{t("pw." + tooltip)}</strong>
            <p>{POWER_DESC[tooltip]}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Placement screen (touch + mouse drag) ----------
function Placement({ onConfirm, onUnready, ready, waiting, stake, balance, authUser, vsBot, onBuyPowerup, onRefundPowerup, inventory, purchaseCount, decoyPending, decoyCell, onDecoyPlace, countdown, error, code, copied, copyCode, oppPresent, oppReady, onBack, direction }) {
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

  // Decoy invalidation: if ships now overlap the decoy cell, reset it
  useEffect(() => {
    if (!decoyCell) return;
    const occ = new Set();
    for (const [id, p] of Object.entries(placed)) {
      cellsFor(p.r, p.c, sizeOf(id), p.dir).forEach((x) => occ.add(key(x.r, x.c)));
    }
    if (occ.has(key(decoyCell.r, decoyCell.c))) {
      onDecoyPlace(null); // reset decoyCell in parent
      // Parent will set decoyPending back to true via the invalidation logic
    }
  }, [placed]);

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

  // Measured cell pitch (px) — cells render at the responsive var(--cell), so
  // hit-testing must use the actual rendered size, not the fixed 32px PITCH.
  function gridPitch() {
    const cellEl = gridRef.current && gridRef.current.querySelector(".cell");
    return (cellEl ? cellEl.getBoundingClientRect().width : CELL) + GAP;
  }
  // anchor cell (top-left of ship) from a screen point, given active drag
  function anchorFromPoint(cx, cy, d) {
    const rect = gridRef.current.getBoundingClientRect();
    const pitch = gridPitch();
    let c = Math.floor((cx - rect.left - PAD) / pitch);
    let r = Math.floor((cy - rect.top - PAD) / pitch);
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
    const offset = Math.min(sz - 1, Math.max(0, Math.floor(along / gridPitch())));
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
  let ghostAnchor = null;
  if (drag) {
    const { r, c } = anchorFromPoint(pos.x, pos.y, drag);
    const cells = cellsFor(r, c, drag.sz, drag.dir);
    const valid = validAt(cells, drag.id);
    const ks = cells.filter((x) => x.r >= 0 && x.r < BOARD && x.c >= 0 && x.c < BOARD).map((x) => key(x.r, x.c));
    if (valid) hoverKeys = new Set(ks); else hoverBad = new Set(ks);
    // The dragged ship renders INSIDE the grid at this anchor cell (same
    // cellEdge() coordinate system as the placed ships and the preview
    // highlight), so it always lines up exactly. It must NOT be a
    // position:fixed overlay: .shell-main keeps a (identity) transform from its
    // screen-enter animation (animation-fill-mode:both), which turns any fixed
    // descendant's coordinates into shell-main-relative ones — that was the
    // real cause of the ship drifting away from the blue/green target cells.
    ghostAnchor = { r, c, valid };
  }

  // build occupied cells set for decoy validation
  const allOccKeys = new Set();
  for (const [id, p] of Object.entries(placed)) {
    cellsFor(p.r, p.c, sizeOf(id), p.dir).forEach((x) => allOccKeys.add(key(x.r, x.c)));
  }

  // build 11x11 cells
  const gridCells = [];
  for (let r = 0; r < BOARD; r++) for (let c = 0; c < BOARD; c++) {
    const k = key(r, c);
    let cls = "cell";
    if (hoverKeys.has(k)) cls += " preview-ok";
    if (hoverBad.has(k)) cls += " preview-bad";
    if (decoyPending && !allOccKeys.has(k)) cls += " placeable";
    const handleDecoyClick = decoyPending ? () => {
      if (allOccKeys.has(k)) { /* can't place on ship */ return; }
      onDecoyPlace({ r, c });
    } : undefined;
    gridCells.push(<div key={k} className={cls} onClick={handleDecoyClick} />);
  }

  const showShop = stake > 0 && authUser && !vsBot;

  // Header: back button (routes through leaveRoom() -> confirmLeave, T-19-03)
  // + the existing .room-banner content (room code / vs-bot label + status pill).
  const header = (
    <>
      <button className="btn ghost compact" onClick={onBack}>{t("history.back")}</button>
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
    </>
  );

  // Footer: existing .place-actions controls row (Random + Confirm/Cancel-ready)
  // relocated into the shell footer (UI-SPEC explicit).
  const footer = (
    <div className="controls place-actions">
      <button className="btn ghost" onClick={randomize} disabled={ready}>{t("place.random")}</button>
      {!ready && (
        <button className="btn primary" disabled={!allPlaced || decoyPending} onClick={confirm}>
          {t("place.ready")}
        </button>
      )}
      {ready && (
        <button className="btn ghost" onClick={() => onUnready && onUnready()} style={{color:"#ff6b6b"}}>
          {countdown != null ? `⏱️ ${countdown}s — ${LANG === "vi" ? "Hủy" : "Cancel"}` : (waiting ? t("place.waitingOpp") : `✓ ${LANG === "vi" ? "Hủy sẵn sàng" : "Cancel Ready"}`)}
        </button>
      )}
    </div>
  );

  return (
    <ScreenShell header={header} footer={footer} screenKey="placement" direction={direction}>
      <div className="place-wrap">
        {error && <div className="error">{error}</div>}
        <p className="hint place-hint">{t("place.hint")}</p>

        {showShop && (
          <PlacementShop stake={stake} balance={balance} inventory={inventory}
            purchaseCount={purchaseCount} onBuy={onBuyPowerup} onRefund={onRefundPowerup} disabled={ready} />
        )}

        {decoyPending && <p className="hint decoy-hint">{t("decoy.place")}</p>}

        <div className="board-wrap">
          <div className="grid-outer">
            <div className="grid own" ref={gridRef}
              style={{ gridTemplateColumns: `repeat(${BOARD}, var(--cell))`, position: "relative" }}>
              {gridCells}
              {Object.entries(placed).map(([id, p]) => {
                if (drag && drag.id === id) return null; // hide while dragging
                const sz = sizeOf(id);
                const box = p.dir === "h"
                  ? { left: cellEdge(p.c), top: cellEdge(p.r), width: spanLen(sz), height: CELLV }
                  : { left: cellEdge(p.c), top: cellEdge(p.r), width: CELLV, height: spanLen(sz) };
                return (
                  <div key={id} className="ship-overlay" style={box}
                    onPointerDown={(e) => startDrag(e, id, true)}
                    onDoubleClick={() => rotatePlaced(id)}
                    title={t("place.shipTitle")}>
                    <div className={"ship-fig " + p.dir} style={{ width: spanLen(sz), height: CELLV }}>
                      <ShipSVG len={sz} />
                    </div>
                  </div>
                );
              })}
              {/* Dragged-ship ghost: rendered IN-GRID (absolute, cellEdge math)
                  so it shares the cells' coordinate system and always lines up
                  with the preview highlight. */}
              {drag && ghostAnchor && (
                <div className={"ship-overlay ghost" + (ghostAnchor.valid ? "" : " invalid")} style={
                  drag.dir === "h"
                    ? { left: cellEdge(ghostAnchor.c), top: cellEdge(ghostAnchor.r), width: spanLen(drag.sz), height: CELLV }
                    : { left: cellEdge(ghostAnchor.c), top: cellEdge(ghostAnchor.r), width: CELLV, height: spanLen(drag.sz) }
                }>
                  <div className={"ship-fig " + drag.dir} style={{ width: spanLen(drag.sz), height: CELLV }}>
                    <ShipSVG len={drag.sz} />
                  </div>
                </div>
              )}
              {/* Decoy marker */}
              {decoyCell && (
                <div className="decoy-marker" style={{ left: cellEdge(decoyCell.c), top: cellEdge(decoyCell.r), width: CELLV, height: CELLV }}>
                  🎭
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ScreenShell>
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
// Player card: avatar + name + score, used on both sides of the scoreboard.
function PlayerCard({ profile, fallbackName, score, active, isBot, side, bubble, onClick }) {
  const name = (profile && profile.name) || fallbackName;
  const photo = profile && profile.photo;
  return (
    <div className={"pcard " + side + (active ? " active" : "")} onClick={onClick} style={onClick ? {cursor:"pointer"} : undefined}>
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
  if (!show) return null;
  const R = 22, C = 2 * Math.PI * R;
  const isNum = typeof secs === "number";
  const low = isNum && secs <= 10;
  const color = low ? "#ff6b78" : (myTurn ? "#7ff0aa" : "#9fb6cc");
  return (
    <div className={"turn-ring" + (low ? " low" : "")}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5" />
        <circle cx="28" cy="28" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={isNum ? C * (1 - frac) : 0} transform="rotate(-90 28 28)"
          style={{ transition: isNum ? "stroke-dashoffset 1s linear" : "none" }} />
      </svg>
      <span className="turn-ring-sec" style={{ color, fontSize: isNum ? "18px" : "22px" }}>{secs}</span>
    </div>
  );
}

// ---------- Power-up Icons (Phase 15-05) ----------
const POWER_ICON = { sonar: "🔊", cross: "➕", decoy: "🎭", scatter: "🌠" };

// ---------- PowerBar (battle phase — shows only purchased power-ups) ----------
function PowerBar({ inv, aim, onPower, myTurn }) {
  const items = [
    { type: "sonar", icon: POWER_ICON.sonar, name: t("pw.sonar") },
    { type: "cross", icon: POWER_ICON.cross, name: t("pw.cross") },
    { type: "scatter", icon: POWER_ICON.scatter, name: t("pw.scatter") },
  ].filter(({ type }) => (inv[type] || 0) > 0);

  if (items.length === 0) return null;

  return (
    <div className="power-bar">
      {items.map(({ type, icon, name }) => (
        <button key={type} disabled={!myTurn}
          className={"power-btn" + (aim === type ? " aiming" : "")}
          onClick={() => onPower(type)}>
          <span className="pi">{icon}</span>
          <span className="pn">{name}</span>
          <span className="pc">×{inv[type]}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Sonar Drag (tap-to-select: choose Row/Col then tap grid) ----------
function SonarDrag({ onDrop, onCancel }) {
  const [axis, setAxis] = useState(null); // null | "row" | "col"

  // When axis is selected, grid cells become clickable for sonar
  // The parent Battle component routes grid clicks here via onDrop
  useEffect(() => {
    if (!axis) return;
    // Add a click handler on the enemy grid cells
    function handleGridClick(e) {
      const cell = e.target.closest(".cell");
      if (!cell) return;
      const gridEl = cell.closest(".grid.enemy");
      if (!gridEl) return;
      const rect = gridEl.getBoundingClientRect();
      const PAD = 2;
      const pitch = (rect.width - PAD * 2) / BOARD;
      const col = Math.floor((e.clientX - rect.left - PAD) / pitch);
      const row = Math.floor((e.clientY - rect.top - PAD) / pitch);
      if (row >= 0 && row < BOARD && col >= 0 && col < BOARD) {
        const index = axis === "row" ? row : col;
        onDrop(axis, index);
      }
    }
    const gridEl = document.querySelector(".grid.enemy");
    if (gridEl) gridEl.addEventListener("click", handleGridClick);
    return () => { if (gridEl) gridEl.removeEventListener("click", handleGridClick); };
  }, [axis]);

  return (
    <div className="sonar-drag">
      <div className="sonar-drag-blocks">
        <div className={"sonar-block" + (axis === "row" ? " active" : "")}
          onClick={() => setAxis(axis === "row" ? null : "row")}>
          <span className="sonar-block-cells">■ ■ ■</span>
          <span className="sonar-block-label">{LANG === "vi" ? "Hàng" : "Row"}</span>
        </div>
        <div className={"sonar-block" + (axis === "col" ? " active" : "")}
          onClick={() => setAxis(axis === "col" ? null : "col")}>
          <span className="sonar-block-cells sonar-col-cells">■<br/>■<br/>■</span>
          <span className="sonar-block-label">{LANG === "vi" ? "Cột" : "Col"}</span>
        </div>
      </div>
      {axis && <div className="sonar-tap-hint">{LANG === "vi" ? "Chạm vào biển địch để dò " + (axis === "row" ? "hàng" : "cột") : "Tap enemy grid to scan " + axis}</div>}
      <button className="btn ghost sonar-cancel-btn" onClick={onCancel}>{LANG === "vi" ? "Hủy" : "Cancel"}</button>
    </div>
  );
}

function Battle({ myTurn, vsBot, occ, incoming, myShots, onFire, log, sunkOpp, sunkMine, sunkEnemyCells, sunkMyCells, myScore, oppScore, oppLabel, myProfile, oppProfile, myBubble, oppBubble, flashEnemy, flashMine, turnDeadline, turnDur, shake, inv, aim, onPower, onCrossHover, hoverCells, sonarScan, authUser, onAddFriend, decoyCell, direction, stake }) {
  const [tab, setTab] = useState("enemy"); // enemy | own (mobile)
  const [oppStats, setOppStats] = useState(null); // { winRate, gamesPlayed, myWins, theirWins, ... }
  const [oppStatsOpen, setOppStatsOpen] = useState(false);
  const [friendStatus, setFriendStatus] = useState(null); // 'none' | 'pending' | 'accepted'
  const [friendReqSent, setFriendReqSent] = useState(false);
  const oppStatsCache = useRef(null);

  // Fetch opponent stats + H2H on avatar click
  function handleOppClick() {
    if (vsBot || !oppProfile) return;
    if (oppStatsCache.current) {
      setOppStats(oppStatsCache.current);
      setOppStatsOpen(true);
    } else {
      // Fetch both profile stats and H2H in parallel
      const profileP = oppProfile.id ? fetch("/api/profile/" + oppProfile.id).then(r => r.ok ? r.json() : null) : Promise.resolve(null);
      const h2hP = (authUser && oppProfile.id) ? fetch("/api/friends/h2h/" + oppProfile.id).then(r => r.ok ? r.json() : null) : Promise.resolve(null);
      Promise.all([profileP, h2hP]).then(([profile, h2h]) => {
        const combined = {
          winRate: profile?.stats?.winRate ?? 0,
          gamesPlayed: profile?.stats?.gamesPlayed ?? 0,
          myWins: h2h?.myWins ?? 0,
          theirWins: h2h?.theirWins ?? 0,
          totalGames: h2h?.totalGames ?? 0,
          streak: h2h?.streak ?? null,
        };
        oppStatsCache.current = combined;
        setOppStats(combined);
        setFriendStatus(h2h?.friendshipStatus ?? "none");
        setOppStatsOpen(true);
      }).catch(() => {});
    }
  }

  function handleAddFriend() {
    if (!oppProfile?.id) return;
    fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: oppProfile.id }),
    }).then(r => {
      if (r.ok) { setFriendReqSent(true); setFriendStatus("pending"); }
    }).catch(() => {});
    if (onAddFriend) onAddFriend(oppProfile.id);
  }

  function handleUnfriend() {
    if (!oppProfile?.id) return;
    fetch("/api/friends/" + oppProfile.id, { method: "DELETE" }).then(r => {
      if (r.ok) setFriendStatus("none");
    }).catch(() => {});
  }

  // Close popup on outside click (delay to avoid same-event-bubble close)
  useEffect(() => {
    if (!oppStatsOpen) return;
    let active = false;
    const timer = setTimeout(() => { active = true; }, 50);
    function handleClick(e) {
      if (!active) return;
      if (!e.target.closest(".opp-stats-popup")) setOppStatsOpen(false);
    }
    document.addEventListener("click", handleClick);
    return () => { clearTimeout(timer); document.removeEventListener("click", handleClick); };
  }, [oppStatsOpen]);

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
    const t = setTimeout(() => setTab(myTurn ? "enemy" : "own"), 1300);
    return () => clearTimeout(t);
  }, [myTurn]);
  // Always render the ring so the scoreboard never collapses to an empty gap
  // (the two player cards would otherwise spread to the edges). At the very
  // start of a match turnDeadline is briefly null — between gameStart and the
  // first turnTimer — so we show a neutral placeholder ("·") instead of hiding
  // the whole ring. Bot mode has no server deadline and shows ⚡/⏳.
  const showRing = true;
  const botFrac = vsBot ? (myTurn ? 1 : 0) : frac;
  const botSecs = vsBot ? (myTurn ? "⚡" : "⏳") : secs;
  const ringActive = turnDeadline != null;
  const ringSecs = ringActive ? secs : (vsBot ? botSecs : "·");
  const ringFrac = ringActive ? frac : (vsBot ? botFrac : 1);
  // Powers footer chip (D-05): only show when at least one purchasable
  // power-up is in inventory — mirrors PowerBar's own items.filter (Phase 19).
  const [powersOpen, setPowersOpen] = useState(false);
  const hasUsablePower = ["sonar", "cross", "scatter"].some((type) => (inv[type] || 0) > 0);

  const header = (
    <div className="scoreboard">
      <div className="pcard-wrap">
        <PlayerCard side="me" profile={myProfile} fallbackName={t("battle.you")} score={myScore} active={myTurn} bubble={myBubble} />
      </div>
      <TurnRing secs={ringSecs} frac={ringFrac} show={showRing} myTurn={myTurn} />
      <div className="pcard-wrap" style={{position:"relative"}}>
        <PlayerCard side="opp" profile={oppProfile} fallbackName={oppLabel} score={oppScore} active={!myTurn} isBot={vsBot} bubble={oppBubble} onClick={handleOppClick} />
        {oppStatsOpen && oppStats && (
          <div className="opp-stats-popup expanded" onClick={(e) => e.stopPropagation()}>
            <div className="opp-stats-header">
              <span className="opp-stats-name">{oppProfile?.name || oppLabel}</span>
              <button className="opp-stats-close" onClick={() => setOppStatsOpen(false)}>✕</button>
            </div>
            <div className="stat-row"><span className="stat-value">{oppStats.winRate}%</span> {t("h2h.winRate")}</div>
            <div className="stat-row"><span className="stat-value">{oppStats.gamesPlayed}</span> {t("h2h.totalGames")}</div>
            {oppStats.totalGames > 0 && (
              <>
                <div className="h2h-divider">⚔️ {t("h2h.title")}</div>
                <div className="h2h-record">
                  <span className="h2h-me">{oppStats.myWins}</span>
                  <span className="h2h-sep">-</span>
                  <span className="h2h-them">{oppStats.theirWins}</span>
                </div>
                <div className="h2h-meta">
                  {oppStats.totalGames} {t("h2h.games")}
                  {oppStats.streak && oppStats.streak.count > 1 && (
                    <span> · {oppStats.streak.holder === "me" ? t("h2h.streakMe") : t("h2h.streakThem")} +{oppStats.streak.count}</span>
                  )}
                </div>
              </>
            )}
            {authUser && oppProfile?.id && friendStatus === "none" && !friendReqSent && (
              <button className="btn compact primary opp-add-friend" onClick={handleAddFriend}>➕ {t("friends.add")}</button>
            )}
            {friendStatus === "accepted" && (
              <div className="friendship-badge">👥 {t("friends.already")} <button className="btn-mini reject" onClick={handleUnfriend} style={{marginLeft:8,fontSize:11}}>{t("friends.remove")}</button></div>
            )}
            {(friendStatus === "pending" || friendReqSent) && (
              <div className="friendship-badge">⏳ {t("friends.pendingSent")}</div>
            )}
            {!oppProfile?.id && authUser && (
              <div className="friendship-badge" style={{color:"#555"}}>{LANG === "vi" ? "Khách — không thể kết bạn" : "Guest — can't add"}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const footer = hasUsablePower ? (
    <button className="btn ghost compact" onClick={() => setPowersOpen(true)}>{t("shell.powersToggle")}</button>
  ) : null;

  return (
    <ScreenShell header={header} footer={footer} screenKey="battle" direction={direction}>
      {stake > 0 && !vsBot && (
        <div className="battle-pot" style={{ textAlign: "center", color: "#ffd700", fontWeight: "bold" }}>
          💰 {t("game.pot", { n: stake * 2 })}
        </div>
      )}
      <div className={"boards tab-" + tab + (shake ? " shake" : "")}>
        <div className="board-wrap wrap-enemy">
          <div className="board-title enemy">{t("battle.enemyWaters")} {myTurn && !aim ? t("battle.fireSuffix") : ""}</div>
          {aim === "sonar" && <SonarDrag onDrop={(axis, index) => onPower("sonar-fire", { axis, index })} onCancel={() => onPower("sonar")} />}
          <Grid enemy hits={myShots} shootable={myTurn && aim !== "sonar"} sunk={sunkEnemyCells} flash={flashEnemy}
            aimCells={aim === "cross" ? hoverCells : null}
            sonarScan={sonarScan}
            onCellClick={(r, c) => myTurn && onFire(r, c)}
            onCellHover={(r, c) => onCrossHover && onCrossHover(r, c)} />
          <Counter label={t("counter.sunkEnemy")} value={sunkOpp} cls="enemy" />
        </div>
        <div className="board-wrap wrap-own">
          <div className="board-title own">{t("board.yourFleet")}</div>
          <div style={{position:"relative"}}>
            <Grid occ={occ} incoming={incoming} sunk={sunkMyCells} flash={flashMine}
              onCellClick={() => {}} />
            {decoyCell && (
              <div className="battle-decoy-marker" style={{
                position:"absolute",
                left: `calc(${decoyCell.c} * (100% / ${BOARD}))`,
                top: `calc(${decoyCell.r} * (100% / ${BOARD}))`,
                width: `calc(100% / ${BOARD})`,
                height: `calc(100% / ${BOARD})`,
              }}>🎭</div>
            )}
          </div>
          <Counter label={t("counter.sunkOwn")} value={sunkMine} cls="own" />
        </div>
      </div>
      {aim === "cross" && <div className="aim-hint">{t("battle.aimingCross")}</div>}
      <BottomSheet open={powersOpen} onClose={() => setPowersOpen(false)} title={t("shell.powersToggle")}>
        {/* Selecting a power closes the sheet so the board underneath becomes
            reachable for targeting (sonar axis / cross aim). Without this the
            sheet stayed open over the board and the power "hung" un-applied. */}
        <PowerBar inv={inv} aim={aim} onPower={(type, payload) => { onPower(type, payload); setPowersOpen(false); }} myTurn={myTurn} />
      </BottomSheet>
    </ScreenShell>
  );
}

// ---------- How-to-play (manual, opened from the lobby) ----------
function HelpModal({ open, onClose }) {
  if (!open) return null;
  const section = (title, body) => (
    <div className="help-sec"><h4>{title}</h4><p>{body}</p></div>
  );
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("help.title")}</h2>
        <div className="help-body">
          {section(t("help.objTitle"), t("help.objBody"))}
          {section(t("help.setupTitle"), t("help.setupBody"))}
          {section(t("help.turnTitle"), t("help.turnBody"))}
          {section(t("help.powerTitle"), t("help.powerBody"))}
          {section(t("help.modesTitle"), t("help.modesBody"))}
          {section(t("help.chatTitle"), t("help.chatBody"))}
          {section(t("help.reconnectTitle"), t("help.reconnectBody"))}
        </div>
        <button className="btn primary" onClick={onClose}>{t("help.close")}</button>
      </div>
    </div>
  );
}

// ---------- Chat (in-room, ephemeral) ----------
// ─── Premium Emoji Animation (Phase 14) ──────────────────────────────────────
// Full-screen overlay that animates a premium emoji from sender avatar → receiver avatar.
// Uses actual DOM positions of avatars for accurate flight path.
// Each impactType has unique ending effect at the receiver avatar.
function PremiumEmojiAnimation({ event, myClientId, onComplete }) {
  const isFromMe = event.senderId === myClientId;
  const ref = useRef(null);
  const [coords, setCoords] = useState(null);
  const impact = event.impactType || "explosion";

  useEffect(() => {
    const meAvatar = document.querySelector('.pcard.me .pc-avatar');
    const oppAvatar = document.querySelector('.pcard.opp .pc-avatar');
    if (!meAvatar || !oppAvatar) { setTimeout(onComplete, 100); return; }

    const from = isFromMe ? meAvatar.getBoundingClientRect() : oppAvatar.getBoundingClientRect();
    const to = isFromMe ? oppAvatar.getBoundingClientRect() : meAvatar.getBoundingClientRect();

    setCoords({
      startX: from.left + from.width / 2,
      startY: from.top + from.height / 2,
      endX: to.left + to.width / 2,
      endY: to.top + to.height / 2,
    });

    // Play whoosh on launch
    Sound.emojiWhoosh();
    // Play impact sound when emoji arrives (~850ms for normal, ~1100ms for hearts)
    const impactDelay = impact === "hearts" ? 1050 : 830;
    const impactSoundTimer = setTimeout(() => {
      if (impact === "explosion") Sound.emojiExplosion();
      else if (impact === "shake") Sound.emojiShake();
      else if (impact === "splash") Sound.emojiSplash();
      else if (impact === "hearts") Sound.emojiHearts();
      else if (impact === "bounce") Sound.emojiBounce();
    }, impactDelay);

    const timer = setTimeout(onComplete, 2200);
    return () => { clearTimeout(timer); clearTimeout(impactSoundTimer); };
  }, []);

  if (!coords) return null;

  const dx = coords.endX - coords.startX;
  const arcPeak = impact === "hearts" ? 70 : Math.min(60, Math.abs(dx) * 0.3 + 20);

  const style = {
    '--start-x': coords.startX + 'px',
    '--start-y': coords.startY + 'px',
    '--end-x': coords.endX + 'px',
    '--end-y': coords.endY + 'px',
    '--mid-x': (coords.startX + dx * 0.5) + 'px',
    '--mid-y': (Math.min(coords.startY, coords.endY) - arcPeak) + 'px',
  };

  // Per-type impact elements
  let impactEl = null;
  if (impact === "explosion") {
    impactEl = (
      <>
        <div className="pe-fx pe-explosion-flash" />
        <div className="pe-fx pe-explosion-ring" />
        <div className="pe-fx pe-explosion-ring r2" />
        <div className="pe-fx pe-debris d1" />
        <div className="pe-fx pe-debris d2" />
        <div className="pe-fx pe-debris d3" />
        <div className="pe-fx pe-debris d4" />
        <div className="pe-fx pe-debris d5" />
      </>
    );
  } else if (impact === "shake") {
    impactEl = (
      <>
        <div className="pe-fx pe-shake-star s1">✦</div>
        <div className="pe-fx pe-shake-star s2">✦</div>
        <div className="pe-fx pe-shake-star s3">✦</div>
        <div className="pe-fx pe-shake-mark" />
      </>
    );
  } else if (impact === "splash") {
    impactEl = (
      <>
        <div className="pe-fx pe-splash-burst" />
        <div className="pe-fx pe-splash-ring" />
        <div className="pe-fx pe-splash-drop dr1" />
        <div className="pe-fx pe-splash-drop dr2" />
        <div className="pe-fx pe-splash-drop dr3" />
        <div className="pe-fx pe-splash-drop dr4" />
        <div className="pe-fx pe-splash-drop dr5" />
        <div className="pe-fx pe-splash-drop dr6" />
        <div className="pe-fx pe-splash-drop dr7" />
      </>
    );
  } else if (impact === "hearts") {
    impactEl = (
      <>
        <div className="pe-fx pe-heart h1">❤️</div>
        <div className="pe-fx pe-heart h2">💕</div>
        <div className="pe-fx pe-heart h3">💗</div>
        <div className="pe-fx pe-heart h4">❤️</div>
        <div className="pe-fx pe-heart h5">💖</div>
      </>
    );
  } else if (impact === "bounce") {
    impactEl = (
      <>
        <div className="pe-fx pe-bounce-face">
          <img src={"/emojis/" + event.slug + ".svg"} alt="" className="pe-bounce-img" />
        </div>
      </>
    );
  }

  // Direction class for directional effects (splash)
  const dirClass = dx > 0 ? " from-left" : " from-right";

  return (
    <div className={"pe-anim impact-" + impact + dirClass} ref={ref} style={style}>
      <div className="pe-anim-emoji">
        <img src={"/emojis/" + event.slug + ".svg"} alt="" className="pe-anim-img" />
      </div>
      <div className="pe-impact-zone">
        {impactEl}
      </div>
    </div>
  );
}

// Messages are NOT logged — each one pops as a 3s speech bubble over the sender's
// avatar (see PlayerCard `bubble`). This composer only sends.
// Expressive taunt / mock / praise / challenge set — more fun than plain reactions.
const CHAT_EMOJIS = ["😏", "😈", "💪", "🫵", "🥱", "🤡", "💀", "🤣", "👏", "🫡", "👑", "🔥", "🎯", "🤝"];
function ChatComposer({ open, onSend, onToggle, premiumEmojis, balance, isGuest, emojiCooldown, onSendPremium, inBattle }) {
  const [text, setText] = useState("");
  const [tab, setTab] = useState("free"); // "free" | "premium"
  const panelRef = useRef(null);
  useKeyboardInset(panelRef, open);
  if (!open) return null;
  function submit(e) { if (e) e.preventDefault(); const tx = text.trim(); if (!tx) return; onSend(tx); setText(""); }
  return (
    <div className="chat-panel" ref={panelRef}>
      <div className="chat-head">
        <b>{t("chat.title")}</b>
        <button className="btn ghost" onClick={onToggle} style={{ width: "auto", padding: "2px 10px" }}>✕</button>
      </div>
      {/* Tab toggle */}
      <div className="chat-tabs">
        <button className={"chat-tab" + (tab === "free" ? " active" : "")} onClick={() => setTab("free")}>
          {t("premiumEmoji.free") || "Free"}
        </button>
        <button className={"chat-tab" + (tab === "premium" ? " active" : "")} onClick={() => setTab("premium")}>
          {t("premiumEmoji.title") || "Premium ✨"}
        </button>
      </div>
      {tab === "free" && (
        <div className="chat-emojis">
          {CHAT_EMOJIS.map((e) => <button key={e} className="chat-emoji" onClick={() => onSend(e)}>{e}</button>)}
        </div>
      )}
      {tab === "premium" && (
        <div className="premium-emoji-section">
          {isGuest ? (
            <div className="premium-emoji-locked">{t("premiumEmoji.signIn") || "Đăng nhập để dùng"}</div>
          ) : !inBattle ? (
            <div className="premium-emoji-locked">{t("premiumEmoji.needBattle") || "Chỉ dùng trong trận"}</div>
          ) : (
            <>
              <div className="premium-balance">{balance ?? 0} {t("premiumEmoji.pts") || "coin"}</div>
              <div className="premium-emoji-grid">
                {premiumEmojis.map(em => (
                  <button
                    key={em.id}
                    className={"premium-emoji-btn" + ((balance < em.cost || emojiCooldown) ? " disabled" : "")}
                    disabled={balance < em.cost || emojiCooldown}
                    onClick={() => onSendPremium(em.id)}
                    title={LANG === "vi" ? em.description_vi : em.description_en}
                  >
                    <img src={"/emojis/" + em.animation_file} alt={em.name} className="pe-img" />
                    <span className="pe-cost">{em.cost}{t("premiumEmoji.pts") || "coin"}</span>
                    {emojiCooldown && <span className="pe-cooldown">⏳</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
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
  // Check server on mount to decide if this device has a passkey.
  // If yes → show "Đăng nhập" (login). If no → show "Tạo Passkey" (register).
  // This avoids the iOS native sign-in prompt on new devices that don't have a credential.
  const [isReturning, setIsReturning] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/auth/webauthn/has-passkey?clientId=${encodeURIComponent(clientId || "")}`);
        const data = await res.json();
        if (!cancelled) {
          setIsReturning(!!data.hasPasskey);
          setChecked(true);
        }
      } catch {
        // On error, default to register mode (safer for new devices)
        if (!cancelled) {
          setIsReturning(false);
          setChecked(true);
        }
      }
    })();
    return () => { cancelled = true; };
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
      if (e.name === "NotAllowedError") {
        // User cancelled biometric OR no discoverable credential on device — switch to register mode
        if (isReturning) setIsReturning(false);
      } else if (e.name === "AbortError") {
        // Could be user cancel from biometric OR fetch timeout — show error
        setError(t("auth.errPasskeyFailed"));
      } else if (e.name === "InvalidStateError") {
        // Device already has passkey for this RP — switch to login
        setIsReturning(true);
        try { await doLogin(); } catch (_) {}
      } else if (e.name === "SyntaxError" || (e.message && e.message.includes("did not match"))) {
        // iOS Safari: WebAuthn freebie exhausted in SPA — reload to reset
        window.location.reload();
      } else {
        console.error("[passkey]", e.message || e);
        setError(t("auth.errPasskeyFailed"));
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

    // Use AbortController timeout to prevent hanging forever if server doesn't respond
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let verRes;
    try {
      verRes = await fetch("/auth/webauthn/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ credential: assertion, challengeToken: optData.challengeToken }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const verData = await verRes.json();
    if (!verData.ok) throw new Error(verData.code || "WEBAUTHN_FAILED");

    // Reload page to hydrate auth state cleanly via /api/me (avoids SPA state issues)
    if (verData.user && onAuthSuccess) onAuthSuccess(verData.user);
    window.location.reload();
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
    window.location.reload();
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
function AvatarMenu({ open, user, onViewProfile, onSignOut, onCancel, onAbout, setViewProfileId }) {
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

  return (
    <div className="avatar-menu" ref={menuRef} role="menu">
      <button className="avatar-menu-item" role="menuitem" onClick={() => { onViewProfile(); onCancel(); }}>
        👤 {t("auth.viewProfile")}
      </button>
      <button className="avatar-menu-item" role="menuitem" onClick={() => { onAbout(); onCancel(); }}>
        ℹ️ {t("shell.about")}
      </button>
      <button className="avatar-menu-item" role="menuitem" onClick={() => { onSignOut(); onCancel(); }}>
        🚪 {t("auth.signOut")}
      </button>
    </div>
  );
}

// ---------- AboutModal ----------
// App-level so it is reachable by everyone (guests included) via the topbar
// ℹ️ button, plus the signed-in avatar menu. Carries the visible product copy +
// FAQ that used to live in the page-bottom footer (relocated for the viewport
// lock); the crawlable SEO copy still lives statically in index.html.
function AboutModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 22 }}>{t("shell.about")}</h2>
        <div className="about-body" style={{ maxHeight: "55dvh", overflowY: "auto", textAlign: "left" }}>
          <p>{t("about.desc")}</p>
          <h3 style={{ margin: "14px 0 6px" }}>{t("about.faqTitle")}</h3>
          <dl style={{ margin: 0 }}>
            <dt style={{ fontWeight: 700 }}>{t("about.q1")}</dt>
            <dd style={{ margin: "2px 0 10px" }}>{t("about.a1")}</dd>
            <dt style={{ fontWeight: 700 }}>{t("about.q2")}</dt>
            <dd style={{ margin: "2px 0 10px" }}>{t("about.a2")}</dd>
            <dt style={{ fontWeight: 700 }}>{t("about.q3")}</dt>
            <dd style={{ margin: "2px 0 0" }}>{t("about.a3")}</dd>
          </dl>
          <p style={{ marginTop: 14, opacity: .7, fontSize: 13 }}>{t("footer")}</p>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="btn primary" onClick={onClose}>{t("common.ok")}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- FriendsList (Phase 17) ----------
function FriendsList({ authUser, onBack, socket, balance, onChallenge, direction }) {
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [challengeTarget, setChallengeTarget] = useState(null);
  const [challengeStake, setChallengeStake] = useState(0);
  const [challengeWaiting, setChallengeWaiting] = useState(false);
  const [notice, setNotice] = useState(null);
  const searchTimer = useRef(null);

  useEffect(() => {
    fetch("/api/friends").then(r => r.ok ? r.json() : []).then(setFriends).catch(() => {});
    fetch("/api/friends/pending").then(r => r.ok ? r.json() : []).then(setPending).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onStatusChange = ({ userId, status }) => {
      setFriends(prev => prev.map(f => f.id === userId ? { ...f, status } : f));
    };
    const onList = (data) => setFriends(data);
    const onPending = (data) => setPending(data);
    const onReqReceived = (req) => setPending(prev => [...prev, req]);
    const onChallengeAccepted = () => { setChallengeWaiting(false); setChallengeTarget(null); };
    const onChallengeDeclined = () => { setChallengeWaiting(false); setChallengeTarget(null); showNotice(t("challenge.declined")); };
    const onChallengeExpired = () => { setChallengeWaiting(false); setChallengeTarget(null); showNotice(t("challenge.expired")); };
    socket.on("friend:status-change", onStatusChange);
    socket.on("friend:list", onList);
    socket.on("friend:pending", onPending);
    socket.on("friend:request-received", onReqReceived);
    socket.on("friend:challenge-accepted", onChallengeAccepted);
    socket.on("friend:challenge-declined", onChallengeDeclined);
    socket.on("friend:challenge-expired", onChallengeExpired);
    return () => {
      socket.off("friend:status-change", onStatusChange);
      socket.off("friend:list", onList);
      socket.off("friend:pending", onPending);
      socket.off("friend:request-received", onReqReceived);
      socket.off("friend:challenge-accepted", onChallengeAccepted);
      socket.off("friend:challenge-declined", onChallengeDeclined);
      socket.off("friend:challenge-expired", onChallengeExpired);
    };
  }, [socket]);

  function showNotice(msg) { setNotice(msg); setTimeout(() => setNotice(null), 3000); }

  function handleSearch(q) {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetch("/api/friends/search?q=" + encodeURIComponent(q)).then(r => r.ok ? r.json() : []).then(setSearchResults).catch(() => {});
    }, 300);
  }

  function handleAddFriend(targetId) {
    fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId: targetId }) })
      .then(r => { if (r.ok) showNotice(t("friends.added")); })
      .catch(() => {});
  }

  function handleAccept(friendshipId) {
    socket.emit("friend:accept", { friendshipId }, (res) => {
      if (res.ok) setPending(prev => prev.filter(p => p.friendship_id !== friendshipId));
    });
  }

  function handleReject(friendshipId) {
    socket.emit("friend:reject", { friendshipId }, (res) => {
      if (res.ok) setPending(prev => prev.filter(p => p.friendship_id !== friendshipId));
    });
  }

  function handleChallenge(friend) {
    setChallengeTarget(friend);
    setChallengeStake(0);
  }

  function sendChallenge() {
    if (!challengeTarget) return;
    setChallengeWaiting(true);
    socket.emit("friend:challenge", { friendId: challengeTarget.id, stake: challengeStake }, (res) => {
      if (!res.ok) { setChallengeWaiting(false); showNotice(t("challenge.notAvailable")); }
    });
  }

  const online = friends.filter(f => f.status === "online");
  const inGame = friends.filter(f => f.status === "in-game");
  const offline = friends.filter(f => !f.status || f.status === "offline");

  const friendsHeader = (
    <>
      <button className="btn ghost compact" onClick={onBack}>{t("history.back")}</button>
      <h2>👥 {t("friends.title")} ({friends.length})</h2>
    </>
  );

  return (
    <ScreenShell header={friendsHeader} screenKey="friends" direction={direction}>
    <div className="friends-screen">
      {notice && <div className="notice-toast">{notice}</div>}
      <div className="friends-search">
        <input type="text" placeholder={t("friends.search")} value={searchQuery} onChange={e => handleSearch(e.target.value)} className="code-input" />
      </div>
      {searchQuery.length >= 2 && searchResults.length > 0 && (
        <div className="friends-search-results">
          {searchResults.map(u => (
            <div key={u.id} className="friend-row">
              <span className="friend-name">{u.display_name}</span>
              <button className="btn compact primary" onClick={() => handleAddFriend(u.id)}>➕</button>
            </div>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="friends-section">
          <div className="friends-section-title">📬 {t("friends.pending")} ({pending.length})</div>
          {pending.map(p => (
            <div key={p.friendship_id} className="friend-row pending-row">
              <span className="friend-name">{p.display_name}</span>
              <div className="friend-actions">
                <button className="btn compact primary" onClick={() => handleAccept(p.friendship_id)}>✓</button>
                <button className="btn compact ghost" onClick={() => handleReject(p.friendship_id)}>✗</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {online.length > 0 && (
        <div className="friends-section">
          <div className="friends-section-title">🟢 {t("friends.online")} ({online.length})</div>
          {online.map(f => (
            <div key={f.id} className="friend-row">
              <span className="status-dot online"></span>
              <span className="friend-name">{f.display_name}</span>
              <span className="friend-h2h">{f.h2h ? `${f.h2h.myWins}-${f.h2h.theirWins}` : ""}</span>
              <button className="btn compact primary" onClick={() => handleChallenge(f)}>⚔️</button>
            </div>
          ))}
        </div>
      )}
      {inGame.length > 0 && (
        <div className="friends-section">
          <div className="friends-section-title">🎮 {t("friends.inGame")} ({inGame.length})</div>
          {inGame.map(f => (
            <div key={f.id} className="friend-row">
              <span className="status-dot ingame"></span>
              <span className="friend-name">{f.display_name}</span>
              <span className="friend-h2h">{f.h2h ? `${f.h2h.myWins}-${f.h2h.theirWins}` : ""}</span>
            </div>
          ))}
        </div>
      )}
      {offline.length > 0 && (
        <div className="friends-section">
          <div className="friends-section-title">⚫ {t("friends.offline")} ({offline.length})</div>
          {offline.map(f => (
            <div key={f.id} className="friend-row">
              <span className="status-dot offline"></span>
              <span className="friend-name">{f.display_name}</span>
              <span className="friend-h2h">{f.h2h ? `${f.h2h.myWins}-${f.h2h.theirWins}` : ""}</span>
            </div>
          ))}
        </div>
      )}
      {friends.length === 0 && pending.length === 0 && !searchQuery && (
        <div className="friends-empty">{t("friends.none")}</div>
      )}
      {/* Challenge BottomSheet */}
      <BottomSheet open={!!challengeTarget && !challengeWaiting} onClose={() => setChallengeTarget(null)} title={t("challenge.title", { name: challengeTarget?.display_name || "" })}>
        <div className="wager-chips" style={{ justifyContent: "center", margin: "10px 0" }}>
          {[0, 10, 25, 50, 100].map(s => (
            <button key={s} className={"chip" + (challengeStake === s ? " active" : "")} onClick={() => setChallengeStake(s)} disabled={s > 0 && (balance == null || balance < s)}>
              {s === 0 ? t("queue.stake0") : s}
            </button>
          ))}
        </div>
        <div style={{ textAlign: "center", marginBottom: 10, fontSize: "1.1em" }}>💰 {balance ?? 0}</div>
        <button className="btn primary" onClick={sendChallenge}>⚔️ {t("challenge.send")}</button>
      </BottomSheet>
      {/* Waiting state */}
      {challengeWaiting && (
        <div className="challenge-waiting">
          <div className="challenge-waiting-text">⏳ {t("challenge.waiting")}</div>
        </div>
      )}
    </div>
    </ScreenShell>
  );
}

// ---------- ChallengePopup (Phase 17) ----------
function ChallengePopup({ challenge, onAccept, onDecline }) {
  const [timeLeft, setTimeLeft] = useState(60);
  useEffect(() => {
    if (!challenge) return;
    const iv = setInterval(() => {
      const rem = Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000));
      setTimeLeft(rem);
      if (rem <= 0) { onDecline(); clearInterval(iv); }
    }, 1000);
    return () => clearInterval(iv);
  }, [challenge]);
  if (!challenge) return null;
  return (
    <div className="challenge-overlay">
      <div className="challenge-popup">
        <div className="challenge-popup-icon">⚔️</div>
        <div className="challenge-popup-text">{t("challenge.received", { name: challenge.from.displayName })}</div>
        {challenge.stake > 0 && <div className="challenge-popup-stake">💰 {challenge.stake} coin</div>}
        <div className="challenge-popup-timer">⏱️ {timeLeft}s</div>
        <div className="challenge-popup-actions">
          <button className="btn primary" onClick={onAccept}>✓ {t("challenge.accept")}</button>
          <button className="btn ghost" onClick={onDecline}>✗ {t("challenge.decline")}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- MatchHistory (Phase 13) ----------
// Paginated, filterable match history screen for authenticated users.
function MatchHistory({ authUser, onBack, direction }) {
  const [matches, setMatches] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const sentinelRef = useRef(null);
  const abortRef = useRef(null);
  // .shell-main DOM node (Phase 19 MOBILE-10) — IntersectionObserver root must
  // be the new scroll container, not the document viewport. Stored in state
  // (not just a ref) so the observer effect re-runs once the node is attached.
  const [mainEl, setMainEl] = useState(null);

  function formatMatchTime(isoStr) {
    const d = new Date(isoStr);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 60) return LANG === "vi" ? `${diffMin} phút trước` : `${diffMin}m ago`;
    if (diffHr < 24) return LANG === "vi" ? `${diffHr} giờ trước` : `${diffHr}h ago`;
    if (diffDay < 7) return LANG === "vi" ? `${diffDay} ngày trước` : `${diffDay}d ago`;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
  }

  const loadPage = useCallback(async (p) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 20 });
      const res = await fetch("/api/matches?" + params, { signal: ctrl.signal });
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setMatches(prev => p === 1 ? data.matches : [...prev, ...data.matches]);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (e) {
      if (e.name !== "AbortError") console.error("[history] load failed:", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on page change
  useEffect(() => { loadPage(page); }, [page, loadPage]);

  // IntersectionObserver for infinite scroll.
  // MOBILE-10: root must be .shell-main (mainEl), not the document viewport —
  // .shell-main is the scroll container now that the page itself never
  // scrolls. Guard for mainEl being null on first render; the effect re-runs
  // once ScreenShell's mainRef callback attaches the node (setMainEl).
  useEffect(() => {
    if (!sentinelRef.current || !mainEl || !hasMore || loading) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        setPage(p => p + 1);
      }
    }, { root: mainEl, threshold: 0.1 });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [mainEl, hasMore, loading]);

  const historyHeader = (
    <>
      <button className="btn ghost compact" onClick={onBack}>{t("history.back")}</button>
      <div className="history-header-text">
        <h2 className="history-title">{t("history.title")}</h2>
        <span className="history-total">{total} {LANG === "vi" ? "trận đấu" : "matches"}</span>
      </div>
    </>
  );

  return (
    <ScreenShell header={historyHeader} screenKey="history" mainRef={setMainEl} direction={direction}>
      <div className="history-list">
        {matches.map(m => (
          <div key={m.id} className={"match-card " + m.result}>
            <div className="match-avatar">{m.opponent.displayName ? m.opponent.displayName.charAt(0).toUpperCase() : "?"}</div>
            <div className="match-info">
              <div className="match-opponent">{m.opponent.displayName || (LANG === "vi" ? "Khách" : "Guest")}</div>
              <div className="match-meta">
                <span className={"match-result-badge " + m.result}>{m.result === "win" ? (LANG === "vi" ? "Thắng" : "Won") : (LANG === "vi" ? "Thua" : "Lost")}</span>
                {m.stake > 0 && (
                  <span className={"match-points " + (m.pointsDelta >= 0 ? "positive" : "negative")}>
                    {m.pointsDelta > 0 ? "+" : ""}{m.pointsDelta} {t("history.pts")}
                  </span>
                )}
                <span className="match-mode-chip">{m.mode === "classic" ? "Classic" : "Advance"}</span>
              </div>
            </div>
            <div className="match-time">{formatMatchTime(m.endedAt)}</div>
          </div>
        ))}
        <div ref={sentinelRef} className="history-sentinel" />
        {loading && <div className="history-loading">⏳</div>}
      </div>
      {!loading && matches.length === 0 && (
        <div className="history-empty">
          <p>{t("history.empty")}</p>
        </div>
      )}
    </ScreenShell>
  );
}

// ---------- ProfileView ----------
// Renders own or another player's public zero-state profile.
// PROF-01: own profile shows sign-out shortcut + member-since + 0/0/0 stats.
// PROF-02: other player shows disabled Challenge placeholder, no sign-out.
function ProfileView({ userId, currentUserId, onBack, onSignOut, onChallengeFriend, onUnfriend, direction }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [friendStatus, setFriendStatus] = useState("none"); // none, pending, accepted
  const [notFound, setNotFound] = React.useState(false);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameNotice, setNameNotice] = useState("");

  // Link Email state (Phase 11: LINK-01)
  const [linkEmail, setLinkEmail] = useState("");
  const [linkEmailStatus, setLinkEmailStatus] = useState("idle");
  const [linkEmailError, setLinkEmailError] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("idle");
  const [passwordError, setPasswordError] = useState("");

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
    // Fetch friendship status if viewing another user
    if (currentUserId && userId !== currentUserId) {
      fetch("/api/friends/h2h/" + userId).then(r => r.ok ? r.json() : null).then(d => {
        if (d) setFriendStatus(d.friendshipStatus || "none");
      }).catch(() => {});
    }
  }, [userId]);

  const isOwn = userId != null && currentUserId != null && String(userId) === String(currentUserId);
  const isPasskeyOnly = isOwn && data && !data.email;
  const hasEmail = isOwn && data && !!data.email;

  // Format memberSince date into {month} {year}
  function formatMemberSince(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return t("profile.memberSince", { month, year });
  }

  const allZero = data && data.stats && data.stats.wins === 0 && data.stats.losses === 0 && data.stats.gamesPlayed === 0;

  const profileHeader = (
    <>
      <button className="btn ghost compact" onClick={onBack}>{t("history.back")}</button>
      {data && <h2>{data.displayName || "—"}</h2>}
    </>
  );

  if (notFound) {
    return (
      <ScreenShell header={profileHeader} screenKey="profile" direction={direction}>
        <div className="profile-view" role="main">
          <div className="error" style={{ textAlign: "center", marginBottom: 20 }}>
            {t("profile.notFound")}
          </div>
          <div style={{ textAlign: "center" }}>
            <button className="btn ghost" style={{ padding: "8px 20px" }} onClick={onBack}>{t("profile.back")}</button>
          </div>
        </div>
      </ScreenShell>
    );
  }

  if (loading) {
    return (
      <ScreenShell header={profileHeader} screenKey="profile" direction={direction}>
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
      </ScreenShell>
    );
  }

  if (!data) return null;

  const avatarLetter = data.displayName ? data.displayName.slice(0, 1).toUpperCase() : "?";

  function startEdit() {
    setNameInput(data.displayName || "");
    setEditing(true);
    setNameNotice("");
  }

  async function saveName() {
    if (nameSaving || !nameInput.trim()) return;
    setNameSaving(true);
    setNameNotice("");
    try {
      const res = await fetch("/api/profile/update-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        setData({ ...data, displayName: json.displayName });
        setEditing(false);
        setNameNotice(t("profile.nameSaved"));
        setTimeout(() => setNameNotice(""), 3000);
      } else {
        setNameNotice(json.code === "NOT_AUTHENTICATED" ? t("auth.errFailed") : (t("profile.nameError") || "Lỗi"));
      }
    } catch (e) {
      console.error("[profile] saveName failed:", e);
      setNameNotice(t("profile.nameError") || "Lỗi kết nối");
    } finally {
      setNameSaving(false);
    }
  }

  async function handleLinkEmail() {
    if (!linkEmail.trim()) return;
    setLinkEmailStatus("saving");
    setLinkEmailError("");
    try {
      const res = await fetch("/api/account/link-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: linkEmail.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        setLinkEmailStatus("done");
        setData({ ...data, email: linkEmail.trim() });
      } else {
        setLinkEmailStatus("error");
        setLinkEmailError(json.code === "EMAIL_IN_USE" ? t("account.emailInUse") :
                          json.code === "INVALID_EMAIL" ? t("account.invalidEmail") :
                          json.code === "ALREADY_HAS_EMAIL" ? t("account.alreadyHasEmail") :
                          t("account.linkError"));
      }
    } catch (e) {
      setLinkEmailStatus("error");
      setLinkEmailError(t("account.linkError"));
    }
  }

  async function handleSetPassword() {
    if (!passwordInput || passwordInput.length < 8) {
      setPasswordError(t("account.passwordTooShort"));
      return;
    }
    setPasswordStatus("saving");
    setPasswordError("");
    try {
      const res = await fetch("/api/account/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password: passwordInput }),
      });
      const json = await res.json();
      if (json.ok) {
        setPasswordStatus("done");
        setPasswordInput("");
        setData({ ...data, hasPassword: true });
      } else {
        setPasswordStatus("error");
        setPasswordError(json.code === "WEAK_PASSWORD" ? t("account.passwordTooShort") : t("account.passwordError"));
      }
    } catch (e) {
      setPasswordStatus("error");
      setPasswordError(t("account.passwordError"));
    }
  }

  const profileActions = (
    <div className="profile-actions">
      {isOwn && onSignOut && (
        <button className="btn ghost" style={{ padding: "8px 20px" }} onClick={onSignOut}>{t("auth.signOut")}</button>
      )}
      {!isOwn && friendStatus === "accepted" && (
        <button className="btn primary" style={{ padding: "8px 20px" }} onClick={() => onChallengeFriend && onChallengeFriend(userId)}>
          ⚔️ {t("challenge.send")}
        </button>
      )}
      {!isOwn && friendStatus === "accepted" && (
        <button className="btn ghost" style={{ padding: "8px 20px", color: "#ff6b6b" }} onClick={() => {
          if (onUnfriend) onUnfriend(userId);
          setFriendStatus("none");
        }}>
          {t("friends.remove")}
        </button>
      )}
      {!isOwn && friendStatus === "none" && currentUserId && (
        <button className="btn primary" style={{ padding: "8px 20px" }} onClick={() => {
          fetch("/api/friends/request", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({targetUserId: userId}) })
            .then(r => { if (r.ok) setFriendStatus("pending"); });
        }}>
          ➕ {t("friends.add")}
        </button>
      )}
      {!isOwn && friendStatus === "pending" && (
        <button className="btn ghost" style={{ padding: "8px 20px", opacity: 0.6 }} disabled>
          ⏳ {t("friends.pendingSent")}
        </button>
      )}
      <button className="btn ghost" style={{ padding: "8px 20px" }} onClick={onBack}>{t("profile.back")}</button>
    </div>
  );

  return (
    <ScreenShell header={profileHeader} footer={profileActions} screenKey="profile" direction={direction}>
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
              <span className="profile-name-text">{data.displayName || "—"}</span>
              {isOwn && (
                <button
                  onClick={startEdit}
                  style={{ background: "none", border: "none", color: "#a9ccec", cursor: "pointer", fontSize: 13, padding: "2px 6px", flexShrink: 0 }}
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

      {/* Link Email section — Phase 11 */}
      {isOwn && (
        <div className="profile-link-email" style={{ margin: "20px 0", padding: "16px", background: "rgba(255,255,255,.05)", borderRadius: 12 }}>
          {isPasskeyOnly && linkEmailStatus !== "done" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#a9ccec" }}>
                {t("account.linkEmailTitle")}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginBottom: 12 }}>
                {t("account.linkEmailDesc")}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="email"
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                  placeholder="email@example.com"
                  style={{ flex: 1, fontSize: 14, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(150,200,255,.3)", background: "rgba(255,255,255,.08)", color: "#fff" }}
                  onKeyDown={(e) => e.key === "Enter" && handleLinkEmail()}
                />
                <button className="btn steel" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }} onClick={handleLinkEmail} disabled={linkEmailStatus === "saving"}>
                  {linkEmailStatus === "saving" ? "..." : t("account.linkBtn")}
                </button>
              </div>
              {linkEmailError && <div style={{ fontSize: 12, color: "#ff6b6b", marginTop: 6 }}>{linkEmailError}</div>}
            </>
          )}

          {(hasEmail || linkEmailStatus === "done") && passwordStatus !== "done" && !data.hasPassword && (
            <>
              <div style={{ fontSize: 13, color: "#7ff0aa", marginBottom: 8 }}>
                ✓ {t("account.emailLinked")}: {data.email}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginBottom: 10 }}>
                {t("account.setPasswordDesc")}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder={t("account.passwordPlaceholder")}
                  minLength={8}
                  style={{ flex: 1, fontSize: 14, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(150,200,255,.3)", background: "rgba(255,255,255,.08)", color: "#fff" }}
                  onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
                />
                <button className="btn steel" style={{ padding: "8px 14px", fontSize: 13, width: "auto" }} onClick={handleSetPassword} disabled={passwordStatus === "saving"}>
                  {passwordStatus === "saving" ? "..." : t("account.setPasswordBtn")}
                </button>
              </div>
              {passwordError && <div style={{ fontSize: 12, color: "#ff6b6b", marginTop: 6 }}>{passwordError}</div>}
            </>
          )}

          {passwordStatus === "done" && (
            <div style={{ fontSize: 13, color: "#7ff0aa" }}>
              ✓ {t("account.allSet")}
            </div>
          )}

          {hasEmail && linkEmailStatus === "idle" && passwordStatus === "idle" && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>
              {t("account.currentEmail")}: {data.email}
            </div>
          )}
        </div>
      )}

    </div>
    </ScreenShell>
  );
}

// ---------- App ----------
function App() {
  // dev/test-only screen hook (Phase 19 — Playwright drives static screens via ?screen=<name>)
  const devScreen = (typeof location !== "undefined" && new URLSearchParams(location.search).get("screen")) || null;
  const [screen, setScreen] = useState(devScreen || "lobby"); // lobby | room | placement | battle | profile | queue

  // ---------- Screen transition direction (Phase 19 — MOBILE-06) ----------
  // Derive forward/back from the previous screen vs the current one by
  // comparing positions in a fixed hierarchy order, instead of rewriting
  // every setScreen() call site (CLAUDE.md minimal-abstraction convention).
  // Primary flow: lobby -> queue -> room -> placement -> battle (increasing
  // index = forward). Secondary screens (profile/history/friends) are
  // lobby-rooted leaves: navigating TO one of them from lobby = forward,
  // and back to lobby = back. Any transition INTO "lobby" (or to a lower
  // hierarchy index) is "back"; everything else is "forward".
  const prevScreenRef = useRef(screen);
  const screenDirection = (() => {
    const HIERARCHY = ["lobby", "queue", "room", "placement", "battle"];
    const SECONDARY = ["profile", "history", "friends"];
    const prev = prevScreenRef.current;
    const next = screen;
    let dir;
    if (prev === next) {
      dir = "forward"; // no-op (same screen) — direction irrelevant, default forward
    } else if (next === "lobby") {
      dir = "back";
    } else if (SECONDARY.includes(next)) {
      dir = SECONDARY.includes(prev) ? "forward" : "forward"; // lobby -> secondary = forward
    } else if (SECONDARY.includes(prev) && HIERARCHY.includes(next)) {
      dir = "forward"; // secondary -> primary (e.g. profile -> lobby handled above)
    } else {
      const prevIdx = HIERARCHY.indexOf(prev);
      const nextIdx = HIERARCHY.indexOf(next);
      dir = (prevIdx !== -1 && nextIdx !== -1 && nextIdx < prevIdx) ? "back" : "forward";
    }
    prevScreenRef.current = next;
    return dir;
  })();

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
  // Sync profile from authUser so it gets sent to server in joinQueue/createRoom
  useEffect(() => {
    if (authUser) {
      setProfile({ name: authUser.displayName || null, photo: authUser.avatarUrl || null, id: authUser.id });
    }
  }, [authUser]);
  const [authError, setAuthError] = useState(null);   // 'failed' | 'rateLimited'
  const [verifyNotice, setVerifyNotice] = useState(null); // 'success' | 'error' (AUTH-07)
  const [signInDisabled, setSignInDisabled] = useState(false); // during OAuth redirect
  // Password-reset state (AUTH-08 / Plan 09)
  const [resetToken, setResetToken] = useState(null);   // string when ?reset=<token> in URL (set-new mode)
  const [resetMode, setResetMode] = useState(false);    // true when "Forgot password?" clicked (request mode)
  // Avatar dropdown state (Plan 03)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false); // app-level About modal (reachable by guests too)
  // Profile screen state (Plan 04)
  const [viewProfileId, setViewProfileId] = useState(null); // opaque users.id to view
  const [profileReturn, setProfileReturn] = useState("lobby"); // screen to return to from ProfileView (e.g. battle when opened in-game)
  const [profileData, setProfileData] = useState(null);     // loaded profile JSON
  const [profileLoading, setProfileLoading] = useState(false); // skeleton while fetching
  const [myBubble, setMyBubble] = useState(null);   // {id, text} — speech bubble over my avatar
  const [oppBubble, setOppBubble] = useState(null); // {id, text} — over opponent avatar
  // Queue state (Phase 5 — 05-01)
  const [queueType, setQueueType]               = useState(null);   // "free" | "wagered" | null
  const [queueSince, setQueueSince]             = useState(null);   // Date.now() when enqueued
  const [queueWindow, setQueueWindow]           = useState(null);   // (legacy — unused, kept for state cleanup)
  const [elapsedSec, setElapsedSec]             = useState(0);      // re-render tick for elapsed timer
  // Points economy (Phase 7)
  const [balance, setBalance]                   = useState(null);   // null = guest/unknown, number = signed-in
  const [stake, setStake]                       = useState(0);      // current match stake (0 = free)
  const [queueStake, setQueueStake]             = useState(0);      // stake shown on queue wait screen
  // Power-up shop (Phase 15)
  const [placementInv, setPlacementInv]         = useState({ sonar: 0, cross: 0, decoy: 0, scatter: 0 });
  const [placementPurchases, setPlacementPurchases] = useState(0);
  const [decoyPending, setDecoyPending]         = useState(false);
  // Friends & Challenge state (Phase 17)
  const [incomingChallenge, setIncomingChallenge] = useState(null); // { challengeId, from, stake, expiresAt }
  const [pendingFriendCount, setPendingFriendCount] = useState(0);
  const [decoyCell, setDecoyCell]               = useState(null);   // {r,c} or null
  const [countdown, setCountdown]               = useState(null);   // null or seconds remaining
  // PWA install prompt
  const [installPrompt, setInstallPrompt]       = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  // If running standalone, mark as installed permanently
  if (isStandalone) { try { localStorage.setItem("pwa_installed", "1"); } catch {} }
  const isInstalled = isStandalone || (() => { try { return localStorage.getItem("pwa_installed") === "1"; } catch { return false; } })();
  const [dismissedInstall, setDismissedInstall] = useState(() => {
    if (isInstalled) return true;
    try {
      const ts = localStorage.getItem("pwa_dismissed_at");
      if (!ts) return false;
      return (Date.now() - parseInt(ts, 10)) < 7 * 24 * 60 * 60 * 1000;
    } catch { return false; }
  });
  useEffect(() => {
    if (isInstalled || dismissedInstall) return;
    function handleBIP(e) { e.preventDefault(); setInstallPrompt(e); setShowInstallBanner(true); }
    window.addEventListener("beforeinstallprompt", handleBIP);
    if (isIOS && isSafari) {
      const t = setTimeout(() => setShowInstallBanner(true), 2000);
      return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", handleBIP); };
    }
    return () => window.removeEventListener("beforeinstallprompt", handleBIP);
  }, []);
  // Battle-phase power-up state (Phase 15-05)
  const [inv, setInv]                           = useState({ sonar: 0, cross: 0, decoy: 0, scatter: 0 });
  const [aim, setAim]                           = useState(null);   // null | "sonar" | "cross"
  const [crossHover, setCrossHover]             = useState(null);   // Set of "r,c" for cross preview
  const [sonarScan, setSonarScan]               = useState(null);   // { axis, index } — highlight during scan animation
  // Premium emoji (Phase 14)
  const [premiumEmojis, setPremiumEmojis]       = useState([]);     // emoji catalog from API
  const [emojiCooldown, setEmojiCooldown]       = useState(false);  // 5s cooldown between sends
  const [emojiAnimQueue, setEmojiAnimQueue]     = useState([]);     // animation queue
  const myBubbleTimer = useRef(null);
  const oppBubbleTimer = useRef(null);
  const graceTimerRef = useRef(null);
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
  const myShotsRef = useRef(new Set());         // ô ta đã bắn (đồng bộ tức thời cho bot)

  const addLog = useCallback((s) => setLog((l) => [s, ...l].slice(0, 40)), []);
  const showNotice = useCallback((s) => { setNotice(s); setTimeout(() => setNotice((n) => (n === s ? null : n)), 6000); }, []);

  // Power-up purchase flow (Phase 15)
  function handlePlacementBuy(type) {
    socket.emit("buyPlacementPowerup", { type }, (res) => {
      if (res && res.ok) {
        setPlacementInv(prev => ({ ...prev, [type]: (prev[type] || 0) + 1 }));
        setPlacementPurchases(n => n + 1);
        if (type === "decoy") setDecoyPending(true);
        // Update balance immediately from callback (don't rely solely on balanceUpdate event)
        if (typeof res.newBalance === "number") setBalance(res.newBalance);
      } else {
        showNotice(t("err." + (res?.code || "UNKNOWN")));
      }
    });
  }
  function handleRefundPowerup(type) {
    socket.emit("refundPlacementPowerup", { type }, (res) => {
      if (res && res.ok) {
        setPlacementInv(prev => ({ ...prev, [type]: Math.max(0, (prev[type] || 0) - 1) }));
        setPlacementPurchases(n => Math.max(0, n - 1));
        if (type === "decoy") { setDecoyPending(false); setDecoyCell(null); }
        if (typeof res.newBalance === "number") setBalance(res.newBalance);
      } else {
        showNotice(t("err." + (res?.code || "UNKNOWN")));
      }
    });
  }
  function handleUnready() {
    socket.emit("unready", (res) => {
      if (res && res.ok) {
        setIReady(false);
        setCountdown(null);
      }
    });
  }
  function handleDecoyPlace(cell) {
    if (cell === null) {
      // Decoy invalidated by ship overlap — re-enter pending mode
      setDecoyCell(null);
      setDecoyPending(true);
      showNotice(t("decoy.invalidated"));
    } else {
      setDecoyCell(cell);
      setDecoyPending(false);
    }
  }

  // ---------- Battle-phase power-up activation (Phase 15-05) ----------
  function activatePower(type, payload) {
    // Sonar fire (from SonarDrag tap)
    if (type === "sonar-fire" && payload) {
      const { axis, index } = payload;
      Sound.fire();
      // Highlight the scanned row/col immediately
      setSonarScan({ axis, index });
      setAim(null);
      // Prevent scroll jump when sonar UI disappears
      const scrollY = window.scrollY;
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
      socket.emit("useAbility", { type: "sonar", axis, index }, (res) => {
        if (!res || !res.ok) { addLog(errText(res)); setSonarScan(null); return; }
        // Show result after a brief highlight animation
        setTimeout(() => {
          const found = res.result === "YES";
          showNotice(found
            ? ("🔊 ✅ " + (LANG === "vi" ? "CÓ TÀU!" : "SHIPS DETECTED!"))
            : ("🔊 ❌ " + (LANG === "vi" ? "KHÔNG CÓ TÀU" : "NO SHIPS")));
          addLog(found ? t("log.sonarYes", { target: "" }) : t("log.sonarNo", { target: "" }));
          // Keep highlight a bit longer then clear
          setTimeout(() => setSonarScan(null), 1500);
        }, 600);
      });
      return;
    }
    if (!myTurn || (inv[type] || 0) <= 0) {
      // If toggling off current aim
      if (aim === type) { setAim(null); setCrossHover(null); return; }
      return;
    }
    if (type === "sonar") {
      setAim(a => a === "sonar" ? null : "sonar");
      setCrossHover(null);
      return;
    }
    if (type === "cross") {
      setAim(a => { setCrossHover(null); return a === "cross" ? null : "cross"; });
      return;
    }
    if (type === "scatter") {
      Sound.explode();
      socket.emit("useAbility", { type: "scatter" }, (res) => {
        if (!res || !res.ok) { addLog(errText(res)); return; }
        addLog(t("log.scatterBoom"));
        applyShotResult(res, t("pw.scatter"), true);
        setAim(null);
      });
      return;
    }
  }

  // Cross Missile: hover preview (shows cross pattern on enemy grid)
  function handleCrossHover(r, c) {
    if (aim !== "cross") { setCrossHover(null); return; }
    if (r < 0 || c < 0) { setCrossHover(null); return; }
    const cells = new Set();
    cells.add(key(r, c));
    if (r > 0) cells.add(key(r - 1, c));
    if (r < BOARD - 1) cells.add(key(r + 1, c));
    if (c > 0) cells.add(key(r, c - 1));
    if (c < BOARD - 1) cells.add(key(r, c + 1));
    setCrossHover(cells);
  }

  // Sign-out: destroy current session, revert UI to guest.
  // Force page reload after signout so Safari's WebAuthn "freebie" counter resets —
  // without reload, iOS Safari blocks navigator.credentials.get() on the second call
  // in SPAs (see: simplewebauthn.dev/docs/advanced/browser-quirks).
  function handleSignOut() {
    fetch("/auth/signout", { method: "POST", credentials: "same-origin" })
      .then(() => {
        window.location.reload();
      })
      .catch(() => {
        window.location.reload();
      });
  }

  function handleViewProfile(userId) {
    // Navigate to profile screen; userId defaults to own id when viewing self
    const id = userId != null ? userId : (authUser ? authUser.id : null);
    setViewProfileId(id);
    setProfileData(null);  // clear any prior loaded profile
    // Remember where we came from so Back returns there (e.g. opened mid-game
    // → return to battle, not the lobby). Guard against profile→profile.
    setProfileReturn(screen === "profile" ? "lobby" : screen);
    setScreen("profile");
    setAvatarMenuOpen(false);
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

  // Prevent pinch-zoom and horizontal pan on battle screen (Phase 15)
  // Allow normal vertical scroll but block zoom/horizontal movement
  useEffect(() => {
    if (screen === "battle") {
      document.body.style.overflowX = "hidden";
      document.body.style.overscrollBehavior = "none";
    } else {
      document.body.style.overflowX = "";
      document.body.style.overscrollBehavior = "";
    }
    return () => {
      document.body.style.overflowX = "";
      document.body.style.overscrollBehavior = "";
    };
  }, [screen]);

  useEffect(() => {
    socket.on("opponentJoined", () => {
      setOppPresent(true); addLog(t("log.oppJoined"));
      setScreen((s) => (s === "room" ? "placement" : s));
    });
    socket.on("roomUpdate", (r) => {
      const has = r.playerCount >= 2;
      setOppPresent(has);
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
      setTurnDeadline(st.started ? (st.turnDeadline || null) : null);
      if (st.turnDur) setTurnDur(st.turnDur);
      if (st.oppProfile !== undefined) setOppProfile(st.oppProfile || null);
      if (typeof st.stake === "number") setStake(st.stake);
      // Restore power-up inventory on reconnect
      if (st.inv) setInv(st.inv);
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
    socket.on("gameStart", ({ yourTurn }) => {
      setScreen("battle"); setMyTurn(yourTurn); setTurnDeadline(null);
      setCountdown(null);
      // Transfer placement inventory to battle-phase state
      setInv(prev => ({ ...prev })); // will be overridden below
      setPlacementInv(pi => { setInv({ ...pi }); return pi; });
      setAim(null); setCrossHover(null);
      addLog(yourTurn ? t("log.youFirst") : t("log.oppFirst"));
    });
    socket.on("countdown", ({ seconds }) => {
      setCountdown(seconds);
      // Tick down each second
      let remaining = seconds;
      const iv = setInterval(() => {
        remaining--;
        if (remaining <= 0) { clearInterval(iv); setCountdown(null); }
        else setCountdown(remaining);
      }, 1000);
      // Store interval so countdownCancel can clear it
      socket._countdownIv = iv;
    });
    socket.on("countdownCancel", () => {
      setCountdown(null);
      if (socket._countdownIv) { clearInterval(socket._countdownIv); socket._countdownIv = null; }
    });
    socket.on("opponentUnready", () => {
      setOppReady(false);
      setCountdown(null);
      if (socket._countdownIv) { clearInterval(socket._countdownIv); socket._countdownIv = null; }
    });
    socket.on("invUpdate", ({ inv: newInv }) => { setInv(newInv); });
    socket.on("turnUpdate", ({ yourTurn }) => { setMyTurn(yourTurn); if (!yourTurn) { setAim(null); setCrossHover(null); } });
    socket.on("turnTimer", ({ deadline, dur, yourTurn }) => { setTurnDeadline(deadline || null); if (dur) setTurnDur(dur); if (typeof yourTurn === "boolean") setMyTurn(yourTurn); });
    socket.on("oppProfile", (p) => setOppProfile(p || null));
    socket.on("turnSkipped", ({ you }) => {
      if (you) { addLog(t("log.youTimeout")); showNotice(t("notice.youTimeout")); }
      else addLog(t("log.oppTimeout"));
    });
    socket.on("incoming", ({ cells, sunkCells, sunkMineCount, newSunk }) => {
      const list = cells || [];
      setIncoming((m) => { const n = new Map(m); list.forEach((s) => n.set(key(s.r, s.c), s.hit)); return n; });
      if (list.length) setFlashMine(key(list[list.length - 1].r, list[list.length - 1].c));
      if (typeof sunkMineCount === "number") setSunkMine(sunkMineCount);
      if (sunkCells) setSunkMyCells((s) => { const n = new Set(s); sunkCells.forEach((k) => n.add(k)); return n; });
      const anyHit = list.some((s) => s.hit);
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
    // Phase 17: friend/challenge listeners
    socket.on("friend:challenge-received", (data) => {
      // Only show if not in a game
      setIncomingChallenge(data);
    });
    socket.on("friend:challenge-expired", () => {
      setIncomingChallenge(null);
      // Sender: if waiting in room for opponent, go back to lobby
      setScreen(s => { if (s === "room") { showNotice(t("challenge.expired")); return "lobby"; } return s; });
    });
    socket.on("friend:challenge-declined", () => {
      // Sender: opponent declined, go back to lobby
      setScreen(s => { if (s === "room") { showNotice(t("challenge.declined")); return "lobby"; } return s; });
    });
    socket.on("friend:challenge-accepted", () => {
      // Sender is already in room, opponentJoined will handle transition to placement
    });
    socket.on("friend:pending", (data) => setPendingFriendCount(data.length));
    socket.on("friend:request-received", () => setPendingFriendCount(prev => prev + 1));
    socket.on("premiumEmoji", (data) => {
      setEmojiAnimQueue(prev => [...prev, { ...data, key: data.ts + "_" + data.slug }]);
    });
    socket.on("gameOver", ({ win, reason }) => { setOver({ win, reason }); setTurnDeadline(null); win ? Sound.win() : Sound.lose(); });
    socket.on("opponentLeft", () => {
      addLog(t("log.oppLeft")); setOppLeft(true);
      setOppOffline(false); setGraceLeft(0);
      if (graceTimerRef.current) { clearInterval(graceTimerRef.current); graceTimerRef.current = null; }
      // Re-fetch balance immediately (server may have refunded wager + power-ups)
      fetch("/api/wallet").then(r => r.json()).then(d => setBalance(d.balance)).catch(() => {});
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
      setPlacementInv({ sonar: 0, cross: 0, decoy: 0, scatter: 0 }); setPlacementPurchases(0);
      setDecoyPending(false); setDecoyCell(null);
      setInv({ sonar: 0, cross: 0, decoy: 0, scatter: 0 }); setAim(null); setCrossHover(null);
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

  // Elapsed timer + navigate-away leaveQueue cleanup.
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
    return () => {
      if (queueTimerRef.current) { clearInterval(queueTimerRef.current); queueTimerRef.current = null; }
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
    setVsBot(false);
    const stakeVal = roomStakeVal || 0;
    setStake(stakeVal);
    socket.emit("createRoom", { clientId, stake: stakeVal, profile }, (res) => {
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
  function handleQuickMatch(stake = 0, queueMode = "classic") {
    setError(null);
    if (stake > 0) {
      socket.emit("joinQueue", { type: "wagered", stake, clientId, profile }, (res) => {
        if (res && res.ok) {
          setQueueType("wagered");
          setQueueSince(Date.now());
          setElapsedSec(0);
          setQueueStake(stake);
          setStake(stake);
          setScreen("queue");
        } else {
          setError(t("err." + (res && res.code)) || errText(res));
        }
      });
    } else {
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
  }
  function handleLeaveQueue() {
    socket.emit("leaveQueue", {}, () => {});
    setQueueType(null);
    setQueueSince(null);
    setQueueWindow(null);
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
      // Transfer placement inventory to battle inv (bot mode — no server invUpdate)
      setInv({ ...placementInv }); setAim(null); setCrossHover(null);
      setScreen("battle");
      addLog(youFirst ? t("log.youFirst") : t("log.botFirst"));
      if (youFirst) setMyTurn(true);
      else { setMyTurn(false); setTimeout(botShoot, 2000); }
      return;
    }
    const payload = decoyCell ? { ships, decoyCell } : ships;
    socket.emit("placeShips", payload, (res) => {
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
  function startBot(keepScore) {
    setError(null); setVsBot(true); persistRoom(null); setCode(null); setTurnDeadline(null);
    setOppPresent(true); setOppReady(false); setIReady(false); setMyTurn(false);
    setOcc(new Set()); setIncoming(new Map()); setMyShots(new Map());
    setLog([]); setOver(null); setSunkOpp(0); setSunkMine(0);
    setSunkEnemyCells(new Set()); setSunkMyCells(new Set());
    if (!keepScore) { setMyScore(0); setOppScore(0); }
    botData.current = null; myShipsRef.current = []; botShotsRef.current = new Set();
    myShotsRef.current = new Set();
    setPlacementInv({ sonar: 0, cross: 0, decoy: 0, scatter: 0 });
    setPlacementPurchases(0); setDecoyPending(false); setDecoyCell(null);
    setInv({ sonar: 0, cross: 0, decoy: 0, scatter: 0 }); setAim(null); setCrossHover(null);
    setScreen("placement");
  }
  function rematchAction() {
    if (vsBot) { startBot(true); return; } // giữ tỉ số
    socket.emit("rematch");
  }
  // handleBot: Lobby bot button handler — starts single-player with random bot
  function handleBot() { startBot(false); }
  // ── Bot targeting: pure random for fairness ────────────────────────────────
  // botPick: picks a random unshot cell (no strategy, no hunting)
  function botPick() {
    const pool = [];
    for (let r = 0; r < BOARD; r++)
      for (let c = 0; c < BOARD; c++) {
        const k = key(r, c);
        if (!botShotsRef.current.has(k)) pool.push(k);
      }
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  function botShoot() {
    const k = botPick();
    if (k == null) return;
    botShotsRef.current.add(k);
    const [r, c] = k.split(",").map(Number);
    const hit = myShipsRef.current.some((ship) => ship.has(k));
    setIncoming((m) => new Map(m).set(k, hit));
    setFlashMine(k);
    if (hit) {
      let sunk = null;
      for (const ship of myShipsRef.current) {
        if (!ship.has(k)) continue;
        if ([...ship].every((kk) => botShotsRef.current.has(kk))) { sunk = ship; break; }
      }
      if (sunk) {
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
    if (hit) setTimeout(botShoot, 2000);   // trúng -> máy bắn tiếp
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
      setTimeout(botShoot, 2000);
    }
  }

  // áp dụng kết quả một loạt bắn (dùng chung cho fire)
  function applyShotResult(res, label, isPower) {
    const cells = res.cells || [];
    if (isPower) { Sound.explode(); triggerShake(); }
    setMyShots((m) => { const n = new Map(m); cells.forEach((s) => n.set(key(s.r, s.c), s.hit)); return n; });
    if (cells.length) setFlashEnemy(key(cells[cells.length - 1].r, cells[cells.length - 1].c));
    if (typeof res.sunkCount === "number") setSunkOpp(res.sunkCount);
    if (res.sunkCells) setSunkEnemyCells((s) => { const n = new Set(s); res.sunkCells.forEach((k) => n.add(k)); return n; });
    const anyHit = cells.some((s) => s.hit);
    if (res.newSunk > 0) { addLog(t("log.youSunkN", { n: res.newSunk })); Sound.sunk(); triggerShake(); }
    else { addLog(anyHit ? t("log.labelHit", { label }) : t("log.labelMiss", { label })); if (anyHit) { Sound.hit(); triggerShake(); } else Sound.miss(); }
    // Power-ups always end turn (server sends turnUpdate) — don't optimistically keep turn
    if (!isPower && anyHit && !res.win) setMyTurn(true);
  }

  function fire(r, c) {
    if (vsBot) { if (myTurn) fireLocal(r, c); return; }
    if (!myTurn) return;
    // Sonar aim mode: grid clicks are ignored (use the panel buttons)
    if (aim === "sonar") return;
    // Cross Missile aim mode: fire cross pattern instead of single shot
    if (aim === "cross") {
      Sound.explode();
      socket.emit("useAbility", { type: "cross", r, c }, (res) => {
        if (!res || !res.ok) { addLog(errText(res)); setAim(null); setCrossHover(null); return; }
        addLog(t("log.crossFire", { cell: cellLabel(r, c) }));
        applyShotResult(res, t("pw.cross"), true);
        setAim(null); setCrossHover(null);
      });
      return;
    }
    if (myShots.has(key(r, c))) return;
    Sound.fire();
    socket.emit("fire", { r, c }, (res) => {
      if (!res.ok) { if (res.code || res.error) addLog(errText(res)); return; }
      const label = t("label.youFire", { cell: cellLabel(r, c) });
      applyShotResult(res, label, false);
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
    setOppLeft(false); setOppOffline(false); setGraceLeft(0); setConfirmLeave(false);
    setOppProfile(null);
    setChatOpen(false); setMyBubble(null); setOppBubble(null);
    setStake(0);
    setPlacementInv({ sonar: 0, cross: 0, decoy: 0, scatter: 0 });
    setPlacementPurchases(0); setDecoyPending(false); setDecoyCell(null);
    setInv({ sonar: 0, cross: 0, decoy: 0, scatter: 0 }); setAim(null); setCrossHover(null);
    if (myBubbleTimer.current) { clearTimeout(myBubbleTimer.current); myBubbleTimer.current = null; }
    if (oppBubbleTimer.current) { clearTimeout(oppBubbleTimer.current); oppBubbleTimer.current = null; }
    if (graceTimerRef.current) { clearInterval(graceTimerRef.current); graceTimerRef.current = null; }
    // Re-fetch wallet balance so refunded points show immediately
    if (authUser) fetch("/api/wallet").then(r => r.json()).then(d => setBalance(d.balance)).catch(() => {});
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
  function toggleChat() {
    setChatOpen((o) => {
      if (o) setTimeout(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, 120);
      return !o;
    });
  }
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
    // Fix iOS/Android: bàn phím đẩy viewport xuống, scroll lại top sau khi đóng
    setTimeout(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, 120);
  }

  // ─── Premium Emoji (Phase 14) ───────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/emojis").then(r => r.json()).then(d => setPremiumEmojis(d.emojis || [])).catch(() => {});
  }, []);

  function sendPremiumEmoji(emojiId) {
    if (emojiCooldown || vsBot) return;
    socket.emit("sendPremiumEmoji", { emojiId }, (res) => {
      if (res && res.ok) {
        setEmojiCooldown(true);
        setTimeout(() => setEmojiCooldown(false), 5000);
      }
    });
    setChatOpen(false); // đóng popup sau khi gửi emoji
  }

  function handleEmojiAnimComplete(key) {
    setEmojiAnimQueue(prev => prev.filter(e => e.key !== key));
  }

  // Phase 19: the existing .topbar block becomes the lobby screen's
  // ScreenShell header (MOBILE-02). For room/placement/queue, each screen
  // renders its own shell-header (title + back button per UI-SPEC); for
  // screens not yet refactored (profile/history/friends/battle) the topbar
  // continues to render as a plain sibling, unchanged from prior behavior.
  const topbarContent = (
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
              onToggle={() => { setAvatarMenuOpen((v) => !v); }}
              active={avatarMenuOpen}
            />
            {balance !== null && <span className="topbar-balance" title="Coin">💰 {balance}</span>}
            <AvatarMenu
              open={avatarMenuOpen}
              user={authUser}
              onViewProfile={handleViewProfile}
              onSignOut={handleSignOut}
              onAbout={() => setAboutOpen(true)}
              onCancel={() => { setAvatarMenuOpen(false); }}
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
  );
  // Screens that render their own shell-header (lobby uses topbarContent as
  // its header; room/placement/queue build a title+back-button header below).
  const SHELL_HEADER_SCREENS = ["lobby", "queue", "room", "placement"];

  return (
    <div className="app">
      <div className="ocean-bg"><div className="wave"></div><div className="wave w2"></div><div className="wave w3"></div></div>
      {!SHELL_HEADER_SCREENS.includes(screen) && topbarContent}

      {!SHELL_HEADER_SCREENS.includes(screen) && screen !== "lobby" && (code || vsBot) && (
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

      {/* PWA Install Banner */}
      {showInstallBanner && screen === "lobby" && (
        <div className="pwa-install-banner">
          {isIOS ? (
            <>
              <span>📲 {LANG === "vi" ? "Bấm Chia sẻ ⬆ → Thêm vào MH chính" : "Tap Share ⬆ → Add to Home Screen"}</span>
              <button className="btn-mini reject" onClick={() => { setShowInstallBanner(false); setDismissedInstall(true); try { localStorage.setItem("pwa_dismissed_at",String(Date.now())); } catch {} }}>✕</button>
            </>
          ) : (
            <>
              <span>📲 {LANG === "vi" ? "Cài lên màn hình chính" : "Add to Home Screen"}</span>
              <button className="btn-mini" onClick={() => {
                if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.then(() => setShowInstallBanner(false)); }
                else setShowInstallBanner(false);
              }}>{LANG === "vi" ? "Cài" : "Install"}</button>
              <button className="btn-mini reject" onClick={() => { setShowInstallBanner(false); setDismissedInstall(true); try { localStorage.setItem("pwa_dismissed_at",String(Date.now())); } catch {} }}>✕</button>
            </>
          )}
        </div>
      )}

      {screen === "lobby" && (
        <ScreenShell header={topbarContent} screenKey="lobby" direction={screenDirection}>
          <Lobby onCreate={createRoom} onJoin={joinRoom} onBot={handleBot} onQuickMatch={handleQuickMatch} onHelp={() => setHelpOpen(true)} onHistory={() => setScreen("history")} onFriends={() => setScreen("friends")} onChallenge={() => setScreen("friends")} onViewProfile={(id) => handleViewProfile(id)} onRoomCreated={(code, stake) => { setCode(code); setStake(stake || 0); setScreen("room"); }} error={error} authUser={authUser} authError={authError} verifyNotice={verifyNotice} clientId={clientId} signInDisabled={signInDisabled} onSignInDisable={() => setSignInDisabled(true)} onEmailAuthSuccess={setAuthUser} balance={balance} />
        </ScreenShell>
      )}

      {screen === "queue" && (
        <ScreenShell
          header={<h2>{queueType === "wagered" ? t("queue.titleWagered") : t("queue.titleFree")}</h2>}
          footer={<button className="btn ghost" onClick={handleLeaveQueue}>{t("queue.cancel")}</button>}
          screenKey="queue"
          direction={screenDirection}
        >
          <div className="lobby">
            <p className="sub">{t("queue.sub")}</p>
            {queueType === "wagered" && queueStake > 0 && (
              <div style={{ textAlign: "center", margin: "6px 0", fontWeight: "bold" }}>💰 {queueStake} coin</div>
            )}
            <div className="queue-timer">
              <span className="queue-elapsed" aria-live="polite" aria-atomic="true">{String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:{String(elapsedSec % 60).padStart(2, "0")}</span>
              <span className="queue-label">{t("queue.elapsed")}</span>
            </div>
            <div style={{ height: 12 }} />
            <span className="status-pill pill-wait">{t("queue.searching")}</span>
          </div>
        </ScreenShell>
      )}

      {screen === "profile" && (
        <ProfileView
          userId={viewProfileId}
          currentUserId={authUser ? authUser.id : null}
          onBack={() => setScreen(profileReturn)}
          onSignOut={handleSignOut}
          onChallengeFriend={(friendId) => { setScreen("friends"); }}
          onUnfriend={(friendId) => { socket.emit("friend:remove", { friendId }); }}
          direction={screenDirection}
        />
      )}

      {screen === "history" && (
        <MatchHistory authUser={authUser} onBack={() => setScreen("lobby")} direction={screenDirection} />
      )}

      {screen === "friends" && (
        <FriendsList authUser={authUser} onBack={() => setScreen("lobby")} socket={socket} balance={balance} direction={screenDirection} />
      )}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {screen === "room" && (
        <ScreenShell
          header={
            <>
              <button className="btn ghost compact" onClick={leaveRoom}>{t("history.back")}</button>
              <h2>{t("room.title")}</h2>
            </>
          }
          screenKey="room"
          direction={screenDirection}
        >
          <div className="lobby">
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
        </ScreenShell>
      )}

      {screen === "placement" && (
        <Placement onConfirm={confirmPlacement} onUnready={handleUnready} ready={iReady} waiting={iReady && !oppReady}
          stake={stake} balance={balance} authUser={authUser} vsBot={vsBot}
          onBuyPowerup={handlePlacementBuy} onRefundPowerup={handleRefundPowerup} inventory={placementInv}
          purchaseCount={placementPurchases} decoyPending={decoyPending}
          decoyCell={decoyCell} onDecoyPlace={handleDecoyPlace} countdown={countdown}
          error={error} code={code} copied={copied} copyCode={copyCode}
          oppPresent={oppPresent} oppReady={oppReady} onBack={leaveRoom} direction={screenDirection} />
      )}

      {screen === "battle" && (
        // Battle renders ScreenShell directly, whose header/main/footer become
        // direct flex children of .app (so .shell-main fills the viewport and
        // .shell-footer sits flush at the bottom). The pot/reward chip now lives
        // inside .shell-main (was a stray sibling that rendered under the notch).
        <Battle myTurn={myTurn} vsBot={vsBot} occ={occ} incoming={incoming} myShots={myShots} onFire={fire} log={log} sunkOpp={sunkOpp} sunkMine={sunkMine} sunkEnemyCells={sunkEnemyCells} sunkMyCells={sunkMyCells} myScore={myScore} oppScore={oppScore} oppLabel={vsBot ? t("common.bot") : t("common.opponent")} myProfile={profile} oppProfile={vsBot ? null : oppProfile} myBubble={myBubble} oppBubble={vsBot ? null : oppBubble} flashEnemy={flashEnemy} flashMine={flashMine} turnDeadline={vsBot ? null : turnDeadline} turnDur={turnDur} shake={shake} inv={inv} aim={aim} onPower={activatePower} onCrossHover={handleCrossHover} hoverCells={crossHover} sonarScan={sonarScan} authUser={authUser} decoyCell={decoyCell} direction={screenDirection} stake={stake} />
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

      {/* Phase 17: Incoming challenge popup */}
      {incomingChallenge && screen !== "battle" && screen !== "placement" && (
        <ChallengePopup
          challenge={incomingChallenge}
          onAccept={() => {
            socket.emit("friend:challenge-accept", { challengeId: incomingChallenge.challengeId }, (res) => {
              if (res.ok) { setIncomingChallenge(null); setCode(res.code); setStake(res.stake || 0); setOppPresent(true); setScreen("placement"); }
              else setIncomingChallenge(null);
            });
          }}
          onDecline={() => {
            socket.emit("friend:challenge-decline", { challengeId: incomingChallenge.challengeId });
            setIncomingChallenge(null);
          }}
        />
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

      {!vsBot && <ChatComposer open={chatOpen} onSend={sendChat} onToggle={toggleChat} premiumEmojis={premiumEmojis} balance={balance} isGuest={!authUser} emojiCooldown={emojiCooldown} onSendPremium={sendPremiumEmoji} inBattle={!!screen && screen === "battle" && !over} />}

      {/* Premium emoji animations (Phase 14) */}
      {emojiAnimQueue.map(ev => (
        <PremiumEmojiAnimation key={ev.key} event={ev} myClientId={clientId} onComplete={() => handleEmojiAnimComplete(ev.key)} />
      ))}

    </div>
  );
}

let _booted = false;
function boot() {
  if (_booted) return;
  _booted = true;
  try { document.title = t("lobby.title") + " · Battleship"; } catch (e) {}
  // Register Service Worker for PWA install support
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  // NB: do NOT socket.connect() here — the App effect connects only after it has
  // attached the "connect"/"sync" listeners, otherwise a fast connect event can
  // fire before anyone is listening and auto-resume is silently missed.
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
}

boot();
