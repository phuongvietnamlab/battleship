import React from "react";
import * as ReactDOM from "react-dom/client";
import { io } from "socket.io-client";
const { useState, useEffect, useRef, useCallback } = React;

const BOARD = 11;
const COLS = ["1","2","3","4","5","6","7","8","9","10","11"];
const ROWS = ["A","B","C","D","E","F","G","H","I","J","K"];

// ---------- i18n (English primary, Vietnamese secondary) ----------
// Locale auto-detected once at load: Vietnamese device -> vi, everything else -> en.
// t(key, params) interpolates {name} placeholders. Missing keys fall back to en.
function detectLocale() {
  let loc = "";
  try { if (typeof FBInstant !== "undefined" && FBInstant.getLocale) loc = FBInstant.getLocale() || ""; } catch (e) {}
  if (!loc) { try { loc = navigator.language || ""; } catch (e) {} }
  return /^vi/i.test(loc) ? "vi" : "en";
}
const LANG = detectLocale();
const I18N = {
  en: {
    "common.or": "OR", "common.cancel": "Cancel", "common.copy": "Copy", "common.copied": "Copied ✓",
    "common.copyShort": "Copy", "common.copiedShort": "✓", "common.bot": "Bot", "common.opponent": "Opponent",
    "common.exit": "Exit", "common.leaveRoom": "Leave", "common.roomCodeLabel": "Room code:", "common.vsBotFull": "🤖 Play vs Bot",
    "topbar.tagline": "Online · Sea Battle", "topbar.soundToggle": "Toggle sound",
    "lobby.title": "Sea Battle", "lobby.sub": "Play vs the bot, or create a room and send the code to a friend.",
    "lobby.playBot": "🤖 Play vs Bot", "lobby.createRoom": "⚓ Create new room", "lobby.enterCodeLabel": "Enter room code", "lobby.joinBtn": "Join room",
    "mode.classicDesc": "Classic, no power-ups", "mode.advanceDesc": "Collect & use power-ups",
    "ship.carrier": "Carrier", "ship.battleship": "Battleship", "ship.cruiser": "Cruiser", "ship.submarine": "Submarine", "ship.destroyer": "Destroyer",
    "pw.scatter": "Scatter Blast", "pw.cross": "Cross Missile", "pw.double": "Extra Turn", "pw.reveal": "Reveal Cell", "pw.mine": "Sea Mine",
    "board.yourFleet": "Your fleet",
    "place.shipTitle": "Drag to move · double-tap to rotate", "place.heading": "Place your fleet",
    "place.hint": "Your fleet starts placed at random. Drag a ship to move it, double-tap to rotate, or tap 🎲 Random for a new layout.",
    "place.selected": "Selected: {name} — tap the grid to place.", "place.dockDir": "⟳ Dock orientation: {dir}",
    "place.horizontal": "Horizontal", "place.vertical": "Vertical", "place.cells": "{size} cells", "place.removeShip": "↩ Return to dock",
    "place.random": "🎲 Random", "place.clear": "Clear all", "place.ready": "⚓ Ready for battle", "place.readyMark": "Ready ✓", "place.waitingOpp": "Waiting for opponent...",
    "place.botReady": "✓ Bot is ready", "place.oppReady": "Opponent is ready", "place.oppPlacing": "Opponent is placing...", "place.waitOpp": "Waiting for opponent...",
    "counter.sunkEnemy": "Sunk", "counter.sunkOwn": "Lost", "counter.ships": "ships",
    "battle.you": "You", "battle.enemySea": "🎯 Enemy waters", "battle.fireTag": "· FIRE!", "battle.yourFleetTab": "⚓ Your fleet",
    "battle.aiming": "Aiming {name} — tap enemy waters to fire (tap the button again to cancel).",
    "battle.aimingMine": "Placing Sea Mine — tap an empty cell on your fleet to place it (tap the button again to cancel).",
    "battle.yourTurn": "🎯 Your turn", "battle.botTurn": "⏳ Bot's turn", "battle.oppTurn": "⏳ Opponent's turn",
    "battle.enemyWaters": "Enemy waters", "battle.fireSuffix": "— FIRE!", "battle.logStart": "Battle begins...",
    "room.title": "Invite a friend", "room.sub": "Send this room code to a friend. The match starts automatically when they join.",
    "room.shareHint": "📩 Send this code via Messenger / Zalo. They enter it on the home screen to join.", "room.waiting": "⏳ Waiting for opponent to join...", "room.startPlacement": "Start placing your fleet",
    "share.invite": "📨 Invite via Messenger", "share.inviteShort": "📨 Invite via Messenger", "share.opening": "Opening Messenger…", "share.openingShort": "Opening…",
    "share.imgTitle": "SEA BATTLE", "share.imgCode": "Room code", "share.text": "Come play Sea Battle with me! Room code: {code}",
    "over.win": "VICTORY!", "over.lose": "DEFEAT", "over.winTimeout": "Opponent stalled too long — you win.", "over.loseTimeout": "You stalled too long and forfeited.",
    "over.winNormal": "You sank the entire enemy fleet.", "over.loseNormal": "Your entire fleet was sunk.", "over.rematch": "Play again",
    "left.title": "Opponent left the room", "left.body": "The match has ended. Return to the lobby to create a new room or play the bot.", "left.toLobby": "Back to lobby",
    "offline.banner": "📡 Opponent disconnected. Waiting to reconnect",
    "leave.titleBot": "Quit match?", "leave.titleRoom": "Leave room?", "leave.bodyBot": "You'll quit the match vs the bot and return to the lobby.",
    "leave.bodyRoom": "You'll leave the room and return to the lobby. Your opponent will be notified.", "leave.stay": "Stay",
    "roombar.vsBot": "🤖 vs Bot", "roombar.room": "Room",
    "chat.title": "Chat", "chat.placeholder": "Type a message…", "chat.send": "Send", "chat.empty": "Say hi to your opponent 👋",
    "help.open": "❓ How to play", "help.title": "How to play", "help.close": "Got it",
    "help.objTitle": "🎯 Goal", "help.objBody": "Be the first to sink all 5 of your opponent's ships.",
    "help.setupTitle": "⚓ Place your fleet", "help.setupBody": "Drag ships onto the grid, or tap a ship then tap a cell. Double-tap a placed ship to rotate. Tap 🎲 Random for a quick layout.",
    "help.turnTitle": "💥 Taking turns", "help.turnBody": "Tap enemy waters to fire. A hit lets you fire again; a miss passes the turn. Each turn has a 20s timer — stall too long and you forfeit.",
    "help.modesTitle": "🕹️ Modes", "help.modesBody": "Classic: pure battleship. Advance: power-ups appear on the enemy sea — hit them to collect, then use them on your turn.",
    "help.powerTitle": "⚡ Power-ups (Advance mode)",
    "help.pwScatter": "Blasts 3–5 random enemy cells.", "help.pwCross": "Fires in a plus shape (center + 4 neighbors).",
    "help.pwDouble": "Your next miss still keeps the turn.", "help.pwReveal": "Reveals one hidden enemy ship cell.",
    "help.pwMine": "Place on your own sea — if the enemy hits it, they lose their next turn.",
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
  },
  vi: {
    "common.or": "HOẶC", "common.cancel": "Hủy", "common.copy": "Sao chép", "common.copied": "Đã chép ✓",
    "common.copyShort": "Chép", "common.copiedShort": "✓", "common.bot": "Máy", "common.opponent": "Đối thủ",
    "common.exit": "Thoát", "common.leaveRoom": "Rời phòng", "common.roomCodeLabel": "Mã phòng:", "common.vsBotFull": "🤖 Chơi với máy",
    "topbar.tagline": "Online · Hải chiến", "topbar.soundToggle": "Bật/tắt âm thanh",
    "lobby.title": "Trận hải chiến", "lobby.sub": "Chơi với máy, hoặc tạo phòng rồi gửi mã cho bạn bè.",
    "lobby.playBot": "🤖 Chơi với máy", "lobby.createRoom": "⚓ Tạo phòng mới", "lobby.enterCodeLabel": "Nhập mã phòng", "lobby.joinBtn": "Vào phòng",
    "mode.classicDesc": "Cổ điển, không power-up", "mode.advanceDesc": "Nhặt & dùng power-up",
    "ship.carrier": "Tàu sân bay", "ship.battleship": "Thiết giáp hạm", "ship.cruiser": "Tàu tuần dương", "ship.submarine": "Tàu ngầm", "ship.destroyer": "Khu trục hạm",
    "pw.scatter": "Nổ ngẫu nhiên", "pw.cross": "Tên lửa chữ thập", "pw.double": "Thêm lượt", "pw.reveal": "Lộ ô thuyền", "pw.mine": "Mìn nước",
    "board.yourFleet": "Hạm đội của bạn",
    "place.shipTitle": "Kéo để di chuyển · chạm 2 lần để xoay", "place.heading": "Bố trí hạm đội",
    "place.hint": "Hạm đội được xếp ngẫu nhiên sẵn. Kéo thuyền để di chuyển, chạm 2 lần để xoay, hoặc bấm 🎲 Ngẫu nhiên để xếp lại.",
    "place.selected": "Đã chọn: {name} — chạm vào lưới để đặt.", "place.dockDir": "⟳ Hướng kho: {dir}",
    "place.horizontal": "Ngang", "place.vertical": "Dọc", "place.cells": "{size} ô", "place.removeShip": "↩ Gỡ về kho",
    "place.random": "🎲 Ngẫu nhiên", "place.clear": "Xóa hết", "place.ready": "⚓ Sẵn sàng chiến đấu", "place.readyMark": "Sẵn sàng ✓", "place.waitingOpp": "Đang chờ đối thủ...",
    "place.botReady": "✓ Máy đã sẵn sàng", "place.oppReady": "Đối thủ đã sẵn sàng", "place.oppPlacing": "Đối thủ đang bố trí...", "place.waitOpp": "Chờ đối thủ vào...",
    "counter.sunkEnemy": "Đã đánh chìm", "counter.sunkOwn": "Thuyền bị chìm", "counter.ships": "thuyền",
    "battle.you": "Bạn", "battle.enemySea": "🎯 Biển địch", "battle.fireTag": "· BẮN!", "battle.yourFleetTab": "⚓ Hạm đội bạn",
    "battle.aiming": "Đang ngắm {name} — chạm vào biển địch để khai hỏa (chạm lại nút để hủy).",
    "battle.aimingMine": "Đang đặt Mìn nước — chạm vào ô trống trên hạm đội của bạn để đặt (chạm lại nút để hủy).",
    "battle.yourTurn": "🎯 Lượt của bạn", "battle.botTurn": "⏳ Lượt của máy", "battle.oppTurn": "⏳ Lượt đối thủ",
    "battle.enemyWaters": "Vùng biển địch", "battle.fireSuffix": "— BẮN!", "battle.logStart": "Trận đấu bắt đầu...",
    "room.title": "Mời bạn bè", "room.sub": "Gửi mã phòng này cho bạn. Khi họ vào, ván đấu sẽ tự bắt đầu.",
    "room.shareHint": "📩 Gửi mã này cho bạn qua Messenger / Zalo. Bạn nhập mã ở màn hình chính là vào.", "room.waiting": "⏳ Đang chờ đối thủ vào phòng...", "room.startPlacement": "Bắt đầu bố trí hạm đội",
    "share.invite": "📨 Mời bạn qua Messenger", "share.inviteShort": "📨 Mời qua Messenger", "share.opening": "Đang mở Messenger…", "share.openingShort": "Đang mở…",
    "share.imgTitle": "HẢI CHIẾN", "share.imgCode": "Mã phòng", "share.text": "Vào đấu Hải chiến với mình! Mã phòng: {code}",
    "over.win": "CHIẾN THẮNG!", "over.lose": "THẤT BẠI", "over.winTimeout": "Đối thủ bỏ lượt quá lâu — bạn thắng.", "over.loseTimeout": "Bạn bỏ lượt quá lâu nên bị xử thua.",
    "over.winNormal": "Bạn đã đánh chìm toàn bộ hạm đội địch.", "over.loseNormal": "Toàn bộ hạm đội của bạn đã bị đánh chìm.", "over.rematch": "Chơi lại",
    "left.title": "Đối thủ đã rời phòng", "left.body": "Ván đấu đã kết thúc. Quay lại sảnh để tạo phòng mới hoặc đấu với máy.", "left.toLobby": "Về sảnh",
    "offline.banner": "📡 Đối thủ tạm mất kết nối. Đang chờ kết nối lại",
    "leave.titleBot": "Thoát trận?", "leave.titleRoom": "Rời phòng?", "leave.bodyBot": "Bạn sẽ thoát trận đấu với máy và quay lại sảnh.",
    "leave.bodyRoom": "Bạn sẽ rời phòng và quay lại sảnh. Đối thủ sẽ được thông báo.", "leave.stay": "Ở lại",
    "roombar.vsBot": "🤖 Với máy", "roombar.room": "Phòng",
    "chat.title": "Trò chuyện", "chat.placeholder": "Nhập tin nhắn…", "chat.send": "Gửi", "chat.empty": "Chào đối thủ một câu 👋",
    "help.open": "❓ Cách chơi", "help.title": "Cách chơi", "help.close": "Đã hiểu",
    "help.objTitle": "🎯 Mục tiêu", "help.objBody": "Đánh chìm cả 5 thuyền của đối thủ trước là thắng.",
    "help.setupTitle": "⚓ Bố trí hạm đội", "help.setupBody": "Kéo thuyền vào lưới, hoặc chạm thuyền rồi chạm ô để đặt. Chạm 2 lần vào thuyền đã đặt để xoay. Bấm 🎲 Ngẫu nhiên để xếp nhanh.",
    "help.turnTitle": "💥 Lượt bắn", "help.turnBody": "Chạm vào biển địch để bắn. Trúng thì bắn tiếp; trượt thì chuyển lượt. Mỗi lượt có 20 giây — chần chừ quá lâu sẽ bị xử thua.",
    "help.modesTitle": "🕹️ Chế độ", "help.modesBody": "Classic: hải chiến thuần. Advance: power-up xuất hiện trên biển địch — bắn trúng để nhặt, rồi dùng trong lượt của bạn.",
    "help.powerTitle": "⚡ Power-up (chế độ Advance)",
    "help.pwScatter": "Nổ 3–5 ô ngẫu nhiên trên biển địch.", "help.pwCross": "Bắn theo hình chữ thập (tâm + 4 ô kề).",
    "help.pwDouble": "Phát trượt kế tiếp vẫn giữ lượt.", "help.pwReveal": "Lộ 1 ô thuyền địch đang ẩn.",
    "help.pwMine": "Đặt lên biển của mình — địch bắn trúng sẽ mất lượt kế tiếp.",
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

// Same-origin when SERVER_URL is empty (local dev served by this server);
// absolute wss:// when bundled for Facebook Instant Games (client hosted by FB).
const SOCKET_URL = process.env.SERVER_URL || undefined;
// autoConnect:false — we connect only after the boot chain finalizes clientId
// (so the very first "resume" uses the stable FB player id).
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
    powerup() { tone(660, 0.1, "sine", 0.3); setTimeout(() => tone(990, 0.12, "sine", 0.3), 90); },
    mine() { noise(0.6, 0.6); tone(90, 0.6, "sawtooth", 0.45, 40); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, "triangle", 0.3), i * 130)); },
    lose() { [400, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.28, "sawtooth", 0.25), i * 150)); },
  };
})();

// Persistent client identity so reconnects keep our seat. Resolution order:
//   1. FBInstant.player.getID() — stable across app restarts even when the
//      Instant Games iframe wipes localStorage; set later in the boot chain.
//   2. localStorage random id — survives reloads when storage works.
//   3. fresh random id — last resort (no persistence; rely on manual code).
// `let` so the boot chain can upgrade it to the FB player id before connecting.
let clientId = (function () {
  try {
    let id = localStorage.getItem("bs_clientId");
    if (!id) { id = "c" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("bs_clientId", id); }
    return id;
  } catch (e) { return "c" + Math.random().toString(36).slice(2) + Date.now().toString(36); }
})();
function saveRoom(c) { try { c ? localStorage.setItem("bs_room", c) : localStorage.removeItem("bs_room"); } catch (e) {} }
function loadRoom() { try { return localStorage.getItem("bs_room"); } catch (e) { return null; } }

// FB context id (the Messenger thread). Allowed under Zero Permissions and
// stable + shared between two players launching from the same thread, so the
// server can find/rejoin a room by it even when player id is null and the
// mobile FB webview wiped localStorage. null outside FB / solo launch.
function fbContextId() {
  try {
    if (typeof FBInstant !== "undefined" && FBInstant.context && FBInstant.context.getID) {
      return FBInstant.context.getID() || null;
    }
  } catch (e) {}
  return null;
}

// ---------- FB profile (auto-login: Instant Games authenticates the player for
// us — getName/getPhoto need no extra permission, available after startGameAsync).
let fbProfile = { name: null, photo: null };
function captureFbProfile() {
  try {
    if (typeof FBInstant !== "undefined" && FBInstant.player) {
      if (FBInstant.player.getName) fbProfile.name = FBInstant.player.getName() || fbProfile.name;
      if (FBInstant.player.getPhoto) fbProfile.photo = FBInstant.player.getPhoto() || fbProfile.photo;
    }
  } catch (e) {}
  return fbProfile;
}

// ---------- Mời qua Messenger (FBInstant.shareAsync) ----------
// Only meaningful inside FB Instant Games; the receiving side already auto-joins
// from getEntryPointData().roomCode on connect, so we just need to send.
function canShare() {
  return typeof FBInstant !== "undefined" && !!FBInstant.shareAsync;
}
// shareAsync requires a base64 image — draw a small branded card with the room
// code so the Messenger preview is informative (and a touch viral).
function makeShareImage(code) {
  try {
    const c = document.createElement("canvas");
    c.width = 480; c.height = 480;
    const x = c.getContext("2d");
    x.fillStyle = "#07182f"; x.fillRect(0, 0, 480, 480);
    x.textAlign = "center";
    x.fillStyle = "#6fc3f3"; x.font = "bold 120px Georgia, serif";
    x.fillText("⚓", 240, 170);
    x.fillStyle = "#f0c14b"; x.font = "bold 52px Georgia, serif";
    x.fillText(t("share.imgTitle"), 240, 260);
    x.fillStyle = "#cfe0f0"; x.font = "30px Georgia, serif";
    x.fillText(t("share.imgCode"), 240, 330);
    x.fillStyle = "#7ff0aa"; x.font = "bold 76px monospace";
    x.fillText(code, 240, 410);
    return c.toDataURL("image/png");
  } catch (e) { return null; }
}
function shareRoom(code) {
  if (!canShare()) return Promise.resolve(false);
  const image = makeShareImage(code);
  if (!image) return Promise.resolve(false);
  try {
    return FBInstant.shareAsync({
      intent: "INVITE",
      image,
      text: t("share.text", { code }),
      data: { roomCode: code },
    }).then(() => true).catch(() => false);
  } catch (e) { return Promise.resolve(false); }
}

// FB Cloud Save (player.setDataAsync/getDataAsync). Player-scoped, persists on
// FB's servers across app restarts, and does NOT require player.getID. This is
// the only durable anchor when the mobile webview wipes localStorage and both
// player id + context id are null. cloudReady flips true once a read/write works.
let cloudReady = false;
function fbHasCloud() {
  try { return typeof FBInstant !== "undefined" && FBInstant.player && FBInstant.player.setDataAsync && FBInstant.player.getDataAsync; }
  catch (e) { return false; }
}
function cloudSet(obj) {
  if (!fbHasCloud()) return Promise.resolve(false);
  try { return FBInstant.player.setDataAsync(obj).then(() => { cloudReady = true; return true; }).catch(() => false); }
  catch (e) { return Promise.resolve(false); }
}
// Persist current room everywhere we can: localStorage (fast) + FB cloud (durable).
function persistRoom(code) {
  saveRoom(code);
  cloudSet({ bs_room: code || "" });
}


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

// ---------- Lobby ----------
function Lobby({ onCreate, onJoin, onBot, onHelp, error }) {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("classic");
  return (
    <div className="lobby">
      <h2>{t("lobby.title")}</h2>
      <p className="sub">{t("lobby.sub")}</p>
      {error && <div className="error">{error}</div>}
      <button className="btn primary" onClick={onBot}>{t("lobby.playBot")}</button>
      <div style={{ height: 10 }} />
      <div className="mode-pick">
        <button className={"mode-opt" + (mode === "classic" ? " on" : "")} onClick={() => setMode("classic")}>
          <b>Classic</b><span>{t("mode.classicDesc")}</span>
        </button>
        <button className={"mode-opt" + (mode === "advance" ? " on" : "")} onClick={() => setMode("advance")}>
          <b>Advance ⚡</b><span>{t("mode.advanceDesc")}</span>
        </button>
      </div>
      <button className="btn steel" onClick={() => onCreate(mode)}>{t("lobby.createRoom")}</button>
      <div className="divider">{t("common.or")}</div>
      <div className="field">
        <label>{t("lobby.enterCodeLabel")}</label>
        <input className="code-input" maxLength={5} placeholder="ABCDE"
          value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && code && onJoin(code)} />
      </div>
      <button className="btn steel" disabled={code.length < 4} onClick={() => onJoin(code)}>{t("lobby.joinBtn")}</button>
      <button className="btn ghost help-link" onClick={onHelp}>{t("help.open")}</button>
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
  const [dir, setDir] = useState("h");      // orientation for ships dragged from the dock
  const [drag, setDrag] = useState(null);    // {id, dir, offset, dx, dy, sz, fromBoard}
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [sel, setSel] = useState(null);      // tap-to-place: {id, fromBoard}
  const gridRef = useRef(null);
  const movedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    function onKey(e) { if (e.key === "r" || e.key === "R") setDir((d) => (d === "h" ? "v" : "h")); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    const useDir = fromBoard ? placed[id].dir : dir;
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
      // a tap (barely moved): switch to tap-to-place / rotate instead of drop
      if (!movedRef.current) {
        if (d.fromBoard) rotatePlaced(d.id);
        else setSel({ id: d.id, fromBoard: false });
        setDrag(null);
        return;
      }
      const { r, c } = anchorFromPoint(e.clientX, e.clientY, d);
      const cells = cellsFor(r, c, d.sz, d.dir);
      if (validAt(cells, d.id)) {
        setPlaced((p) => ({ ...p, [d.id]: { r, c, dir: d.dir } }));
        setSel(null);
      }
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
  function removeShip(id) { setPlaced((p) => { const n = { ...p }; delete n[id]; return n; }); if (sel && sel.id === id) setSel(null); }

  // tap-to-place: clicked cell becomes the top-left anchor of the selected ship
  function placeSelectedAt(r, c) {
    if (!sel) return;
    const sz = sizeOf(sel.id);
    const useDir = sel.fromBoard ? placed[sel.id].dir : dir;
    const cells = cellsFor(r, c, sz, useDir);
    if (validAt(cells, sel.id)) {
      setPlaced((p) => ({ ...p, [sel.id]: { r, c, dir: useDir } }));
      setSel(null);
    }
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
    if (sel) cls += " selectable";
    gridCells.push(
      <div key={k} className={cls}
        onClick={() => placeSelectedAt(r, c)}
        onMouseEnter={() => {}} />
    );
  }

  function ghostBox(d) {
    return d.dir === "h"
      ? { width: d.sz * PITCH - GAP, height: CELL }
      : { width: CELL, height: d.sz * PITCH - GAP };
  }

  return (
    <div className="boards">
      <div className="board-wrap">
        <div className="board-title own">{t("board.yourFleet")}</div>
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

      <div className="place-panel">
        <h3>{t("place.heading")}</h3>
        <p className="hint">{t("place.hint")}</p>

        {sel && (
          <div className="sel-banner">
            {t("place.selected", { name: shipName(sel.id) })}
            <button className="btn ghost" style={{ width: "auto", padding: "3px 8px", fontSize: 11, marginLeft: 8 }} onClick={() => setSel(null)}>{t("common.cancel")}</button>
          </div>
        )}

        <div className="controls" style={{ marginBottom: 14 }}>
          <button className="btn steel" onClick={() => setDir(dir === "h" ? "v" : "h")}>{t("place.dockDir", { dir: dir === "h" ? t("place.horizontal") : t("place.vertical") })}</button>
        </div>

        <div className="dock">
          {FLEET_DEF.map((f) => {
            const isPlaced = !!placed[f.id];
            const dragging = drag && drag.id === f.id && !drag.fromBoard;
            return (
              <div key={f.id} className={"dock-item" + (isPlaced ? " placed" : "")}>
                <div className="dock-info">
                  <div className="ship-name">{f.name}</div>
                  <small>{t("place.cells", { size: f.size })}</small>
                </div>
                {isPlaced ? (
                  <button className="btn ghost" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }}
                    onClick={() => removeShip(f.id)}>{t("place.removeShip")}</button>
                ) : (
                  <div className={"dock-ship " + dir + (sel && sel.id === f.id ? " sel" : "")} onPointerDown={(e) => startDrag(e, f.id, false)}
                    style={Object.assign(
                      dir === "h"
                        ? { width: f.size * PITCH - GAP, height: CELL }
                        : { width: CELL, height: f.size * PITCH - GAP },
                      dragging ? { opacity: 0.25 } : null)}>
                    <div className={"ship-fig " + dir} style={{ width: f.size * PITCH - GAP, height: CELL }}>
                      <ShipSVG len={f.size} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="controls" style={{ marginBottom: 10 }}>
          <button className="btn ghost" onClick={randomize}>{t("place.random")}</button>
          <button className="btn ghost" onClick={() => setPlaced({})}>{t("place.clear")}</button>
        </div>
        <button className="btn primary" disabled={!allPlaced || ready} onClick={confirm}>
          {ready ? (waiting ? t("place.waitingOpp") : t("place.readyMark")) : t("place.ready")}
        </button>
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
        {bubble && <div className={"chat-bubble " + side} key={bubble.id}>{bubble.text}</div>}
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
          style={{ transition: "stroke-dashoffset .12s linear" }} />
      </svg>
      <span className="turn-ring-sec" style={{ color }}>{secs}</span>
    </div>
  );
}
function Battle({ myTurn, vsBot, occ, incoming, myShots, onFire, log, sunkOpp, sunkMine, sunkEnemyCells, sunkMyCells, myScore, oppScore, oppLabel, myProfile, oppProfile, myBubble, oppBubble, flashEnemy, flashMine, mode, inv, powerups, revealedEnemy, aim, onPower, myMines, onPlaceMine, turnDeadline, turnDur }) {
  const [tab, setTab] = useState("enemy"); // enemy | own (mobile)
  // đếm ngược lượt từ deadline server gửi (null = không giới hạn, vd đấu máy)
  const [secs, setSecs] = useState(null);
  const [frac, setFrac] = useState(1);
  useEffect(() => {
    if (!turnDeadline) { setSecs(null); setFrac(1); return; }
    const dur = turnDur || 20000;
    const tick = () => {
      const rem = Math.max(0, turnDeadline - Date.now());
      setSecs(Math.ceil(rem / 1000));
      setFrac(Math.max(0, Math.min(1, rem / dur)));
    };
    tick();
    const iv = setInterval(tick, 100);
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
      <div className={"boards tab-" + tab}>
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
const CHAT_EMOJIS = ["👍", "😀", "😂", "😮", "😡", "🔥", "⚓", "🎯"];
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

// ---------- App ----------
function App() {
  const [screen, setScreen] = useState("lobby"); // lobby | room | placement | battle
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
  const [sharing, setSharing] = useState(false); // đang mở hộp thoại share Messenger
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
  const [sunkEnemyCells, setSunkEnemyCells] = useState(new Set()); // ô thuyền địch đã chìm
  const [sunkMyCells, setSunkMyCells] = useState(new Set());       // ô thuyền ta đã chìm
  const [myScore, setMyScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [notice, setNotice] = useState(null); // thông báo nổi (vd: dẫm mìn)
  const [oppLeft, setOppLeft] = useState(false); // đối thủ rời phòng -> hiện modal + về sảnh
  const [oppOffline, setOppOffline] = useState(false); // đối thủ tạm mất kết nối
  const [graceLeft, setGraceLeft] = useState(0);        // đếm ngược giây chờ kết nối lại
  const [confirmLeave, setConfirmLeave] = useState(false); // hỏi xác nhận trước khi rời
  const [profile, setProfile] = useState({ name: fbProfile.name, photo: fbProfile.photo });
  const [helpOpen, setHelpOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [myBubble, setMyBubble] = useState(null);   // {id, text} — speech bubble over my avatar
  const [oppBubble, setOppBubble] = useState(null); // {id, text} — over opponent avatar
  const myBubbleTimer = useRef(null);
  const oppBubbleTimer = useRef(null);
  const graceTimerRef = useRef(null);
  const [soundOn, setSoundOn] = useState(true);
  function toggleSound() { const v = !soundOn; setSoundOn(v); Sound.setEnabled(v); }
  const [vsBot, setVsBot] = useState(false);   // chế độ chơi với máy
  const botData = useRef(null);                // {occ:Set, ships:[Set]}
  const myShipsRef = useRef([]);               // [Set] thuyền của ta (để máy dò chìm)
  const botShotsRef = useRef(new Set());       // ô máy đã bắn
  const botQueueRef = useRef([]);              // hàng đợi ô mục tiêu của máy
  const myShotsRef = useRef(new Set());         // ô ta đã bắn (đồng bộ tức thời cho bot)
  const joinedInviteRef = useRef(false);        // chỉ auto-join từ lời mời FB 1 lần

  const addLog = useCallback((s) => setLog((l) => [s, ...l].slice(0, 40)), []);
  const showNotice = useCallback((s) => { setNotice(s); setTimeout(() => setNotice((n) => (n === s ? null : n)), 4000); }, []);

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
      if (st.started) { setMyTurn(st.yourTurn); setScreen("battle"); }
      else if (st.youReady) { setIReady(true); setScreen("placement"); }
      else { setScreen(st.oppPresent ? "placement" : "room"); }
    });
    // on (re)connect, try to resume any in-progress game automatically.
    socket.on("connect", () => {
      // 1) Ask the server if our clientId already holds a seat in any room.
      //    This needs NO locally-stored code, so it works even when the IG
      //    iframe wiped localStorage — as long as clientId is the stable FB id.
      const ctx = fbContextId();
      socket.emit("resume", { clientId, contextId: ctx }, (res) => {
        if (res && res.ok) { setCode(res.code); persistRoom(res.code); return; }
        // 2) Fallback: rejoin a room code we stored locally (storage available).
        const r = loadRoom();
        if (r) { socket.emit("rejoin", { code: r, clientId }, (rr) => { if (!rr || !rr.ok) persistRoom(null); }); return; }
        // 3) Invite deep-link: auto-join from Messenger entry-point data.
        if (!joinedInviteRef.current && typeof FBInstant !== "undefined" && FBInstant.getEntryPointData) {
          let d = null; try { d = FBInstant.getEntryPointData(); } catch (e) {}
          if (d && d.roomCode) { joinedInviteRef.current = true; joinRoom(d.roomCode); }
        }
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
    });
    socket.on("chat", ({ text }) => {
      const id = Date.now() + Math.random();
      setOppBubble({ id, text });
      if (oppBubbleTimer.current) clearTimeout(oppBubbleTimer.current);
      oppBubbleTimer.current = setTimeout(() => setOppBubble((b) => (b && b.id === id ? null : b)), 3000);
      Sound.miss && Sound.miss();
    });
    socket.on("scoreUpdate", ({ you, opp }) => { setMyScore(you); setOppScore(opp); });
    socket.on("gameOver", ({ win, reason }) => { setOver({ win, reason }); setTurnDeadline(null); win ? Sound.win() : Sound.lose(); });
    socket.on("opponentLeft", () => {
      addLog(t("log.oppLeft")); setOppLeft(true);
      setOppOffline(false); setGraceLeft(0);
      if (graceTimerRef.current) { clearInterval(graceTimerRef.current); graceTimerRef.current = null; }
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
    // Connect now that all listeners are attached. If the socket somehow already
    // connected (hot remount), run resume immediately instead.
    if (!socket.connected) socket.connect();
    else if (socket.connected) {
      socket.emit("resume", { clientId, contextId: fbContextId() }, (res) => {
        if (res && res.ok) { setCode(res.code); persistRoom(res.code); return; }
        const r = loadRoom();
        if (r) socket.emit("rejoin", { code: r, clientId }, (rr) => { if (!rr || !rr.ok) persistRoom(null); });
      });
    }
    return () => socket.off();
  }, [addLog]);

  // Re-attempt resume shortly after mount in case the durable FB identity (ASID)
  // resolves after the fallback boot already connected the socket. Harmless if a
  // resume already succeeded (server just re-syncs).
  useEffect(() => {
    const t = setTimeout(() => {
      if (socket.connected && clientId.indexOf("fb_") === 0) {
        socket.emit("resume", { clientId, contextId: fbContextId() });
      }
    }, 3500);
    return () => clearTimeout(t);
  }, []);

  // Pick up the FB name/avatar (it may resolve after the fallback boot rendered).
  useEffect(() => {
    captureFbProfile();
    setProfile({ name: fbProfile.name, photo: fbProfile.photo });
    const t = setTimeout(() => {
      captureFbProfile();
      setProfile({ name: fbProfile.name, photo: fbProfile.photo });
    }, 3500);
    return () => clearTimeout(t);
  }, []);

  function myProfilePayload() {
    captureFbProfile();
    return (fbProfile.name || fbProfile.photo) ? { name: fbProfile.name, photo: fbProfile.photo } : null;
  }
  function createRoom(mode) {
    setError(null);
    setMyScore(0); setOppScore(0); setOppProfile(null); // phòng mới: tỉ số về 0-0
    setVsBot(false); setMode(mode === "advance" ? "advance" : "classic");
    socket.emit("createRoom", { clientId, mode, contextId: fbContextId(), profile: myProfilePayload() }, (res) => {
      if (res.ok) { setCode(res.code); persistRoom(res.code); setScreen("room"); }
    });
  }
  function joinRoom(c) {
    setError(null);
    socket.emit("joinRoom", { code: c, clientId, contextId: fbContextId(), profile: myProfilePayload() }, (res) => {
      if (!res.ok) { setError(errText(res)); return; }
      setCode(res.code); persistRoom(res.code);
      // reclaimed = took over a seat in an in-progress game (reconnect by code);
      // the server's "sync" event restores the correct screen/state. New seats
      // go straight to placement.
      if (!res.reclaimed) { setOppPresent(true); setScreen("placement"); }
    });
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
  function startBot(keepScore) {
    setError(null); setVsBot(true); persistRoom(null); setCode(null); setTurnDeadline(null);
    setOppPresent(true); setOppReady(false); setIReady(false); setMyTurn(false);
    setOcc(new Set()); setIncoming(new Map()); setMyShots(new Map());
    setLog([]); setOver(null); setSunkOpp(0); setSunkMine(0);
    setSunkEnemyCells(new Set()); setSunkMyCells(new Set());
    if (!keepScore) { setMyScore(0); setOppScore(0); }
    botData.current = null; myShipsRef.current = []; botShotsRef.current = new Set();
    botQueueRef.current = []; myShotsRef.current = new Set();
    setScreen("placement");
  }
  function rematchAction() {
    if (vsBot) { startBot(true); return; } // giữ tỉ số
    socket.emit("rematch");
  }
  function botPick() {
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
  function botShoot() {
    const k = botPick();
    if (k == null) return;
    botShotsRef.current.add(k);
    const [r, c] = k.split(",").map(Number);
    const hit = myShipsRef.current.some((ship) => ship.has(k));
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
        setSunkMine((n) => n + 1);
        setSunkMyCells((s) => { const n = new Set(s); sunk.forEach((kk) => n.add(kk)); return n; });
        addLog(t("log.botSunk", { n: sunk.size })); Sound.sunk();
      }
      else { addLog(t("log.botFireHit", { cell: cellLabel(r, c) })); Sound.hit(); }
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
        addLog(t("log.youSunkOne", { n: sunk.size })); Sound.sunk();
      }
      else { addLog(t("log.youFireHit", { cell: cellLabel(r, c) })); Sound.hit(); }
      if (cnt >= FLEET_DEF.length) { setMyScore((n) => n + 1); setOver({ win: true }); Sound.win(); return; }
      // trúng -> giữ lượt
    } else {
      addLog(t("log.youFireMiss", { cell: cellLabel(r, c) })); Sound.miss();
      setMyTurn(false);
      setTimeout(botShoot, 600);
    }
  }

  // áp dụng kết quả một loạt bắn (dùng chung cho fire + pháo kích)
  function applyShotResult(res, label) {
    const cells = res.cells || [];
    setMyShots((m) => { const n = new Map(m); cells.forEach((s) => n.set(key(s.r, s.c), s.hit)); return n; });
    if (cells.length) setFlashEnemy(key(cells[cells.length - 1].r, cells[cells.length - 1].c));
    if (typeof res.sunkCount === "number") setSunkOpp(res.sunkCount);
    if (res.sunkCells) setSunkEnemyCells((s) => { const n = new Set(s); res.sunkCells.forEach((k) => n.add(k)); return n; });
    if (res.collected && res.collected.length) addLog(t("log.collected", { list: res.collected.map((p) => POWER_NAME[p]).join(", ") }));
    const anyHit = cells.some((s) => s.hit);
    if (res.newSunk > 0) { addLog(t("log.youSunkN", { n: res.newSunk })); Sound.sunk(); }
    else { addLog(anyHit ? t("log.labelHit", { label }) : t("log.labelMiss", { label })); anyHit ? Sound.hit() : Sound.miss(); }
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
      applyShotResult(res, label);
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
        applyShotResult(res, POWER_NAME.scatter);
      }
    });
  }
  function resetToLobby() {
    persistRoom(null);
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
    if (!vsBot) socket.emit("leaveRoom", () => {});
    resetToLobby();
  }
  function copyCode() {
    // Clipboard API bị chặn (permissions policy) trong iframe Instant Games -> nuốt lỗi.
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).catch(() => {}); } catch (e) {}
    setCopied(true); setTimeout(() => setCopied(false), 1500);
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
  }
  function inviteMessenger() {
    if (!code || sharing) return;
    setSharing(true);
    shareRoom(code).then((ok) => {
      setSharing(false);
      if (!ok) showNotice(t("notice.shareFail"));
    });
  }

  return (
    <div className="app">
      <div className="ocean-bg"><div className="wave"></div><div className="wave w2"></div><div className="wave w3"></div></div>
      <div className="topbar">
        <div className="logo">
          <div className="badge">⚓</div>
          <div><h1>BATTLESHIP</h1><small>{t("topbar.tagline")}</small></div>
        </div>
        <div className="topbar-right">
          {profile.name && (
            <div className="profile-chip" title={profile.name}>
              {profile.photo
                ? <img className="avatar" src={profile.photo} alt="" referrerPolicy="no-referrer" />
                : <span className="avatar avatar-fallback">{profile.name.slice(0, 1)}</span>}
              <span className="pname">{profile.name}</span>
            </div>
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

      {screen === "lobby" && <Lobby onCreate={createRoom} onJoin={joinRoom} onBot={startBot} onHelp={() => setHelpOpen(true)} error={error} />}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      {screen === "room" && (
        <div className="lobby">
          <h2>{t("room.title")}</h2>
          <p className="sub">{t("room.sub")}</p>
          <div className="room-code-box" style={{justifyContent:"center",marginBottom:14}}>
            <div className="code">{code}</div>
            <button className="btn steel copy-btn" onClick={copyCode}>{copied ? t("common.copied") : t("common.copy")}</button>
          </div>
          {canShare() && (
            <button className="btn primary" style={{width:"100%",marginBottom:12}} onClick={inviteMessenger} disabled={sharing}>
              {sharing ? t("share.opening") : t("share.invite")}
            </button>
          )}
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
                <span>{t("common.roomCodeLabel")}</span><div className="code" style={{fontSize:24}}>{code}</div>
                <button className="btn steel copy-btn" onClick={copyCode}>{copied ? t("common.copiedShort") : t("common.copyShort")}</button>
              </div>
            )}
            <div className={"status-pill " + (vsBot ? "pill-ready" : (oppReady ? "pill-ready" : "pill-wait"))}>
              {vsBot ? t("place.botReady") : (oppPresent ? (oppReady ? t("place.oppReady") : t("place.oppPlacing")) : t("place.waitOpp"))}
            </div>
            {!vsBot && !oppPresent && canShare() && (
              <button className="btn steel" style={{marginTop:8}} onClick={inviteMessenger} disabled={sharing}>
                {sharing ? t("share.openingShort") : t("share.inviteShort")}
              </button>
            )}
          </div>
          <Placement onConfirm={confirmPlacement} ready={iReady} waiting={iReady && !oppReady} />
        </div>
      )}

      {screen === "battle" && (
        <div>
          <Battle myTurn={myTurn} vsBot={vsBot} occ={occ} incoming={incoming} myShots={myShots} onFire={fire} log={log} sunkOpp={sunkOpp} sunkMine={sunkMine} sunkEnemyCells={sunkEnemyCells} sunkMyCells={sunkMyCells} myScore={myScore} oppScore={oppScore} oppLabel={vsBot ? t("common.bot") : t("common.opponent")} myProfile={profile} oppProfile={vsBot ? null : oppProfile} myBubble={myBubble} oppBubble={vsBot ? null : oppBubble} flashEnemy={flashEnemy} flashMine={flashMine} mode={vsBot ? "classic" : mode} inv={inv} powerups={powerups} revealedEnemy={revealedEnemy} aim={aim} onPower={activatePower} myMines={myMines} onPlaceMine={placeMine} turnDeadline={vsBot ? null : turnDeadline} turnDur={turnDur} />
        </div>
      )}

      {over && (
        <div className="overlay">
          <div className={"modal " + (over.win ? "win" : "lose")}>
            <h2>{over.win ? t("over.win") : t("over.lose")}</h2>
            <p>{over.reason === "timeout"
              ? (over.win ? t("over.winTimeout") : t("over.loseTimeout"))
              : (over.win ? t("over.winNormal") : t("over.loseNormal"))}</p>
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

// Prefer the FB player id as our identity: it is stable across app restarts
// even when the Instant Games iframe wipes localStorage, which is what makes
// auto-resume work without the player re-typing the room code.
// Try the FB player id (legacy) as a durable identity. Often null under current
// Instant Games; getASIDAsync (below) is the preferred source.
function adoptFbIdentity() {
  try {
    if (typeof FBInstant !== "undefined" && FBInstant.player && FBInstant.player.getID) {
      const pid = FBInstant.player.getID();
      if (pid) { clientId = "fb_" + pid; try { localStorage.setItem("bs_clientId", clientId); } catch (e) {} }
    }
  } catch (e) {}
}

// Resolve the most durable identity available, then boot. Priority:
//   1. App-Scoped ID (player.getASIDAsync) — stable per (player, app), survives
//      app restarts. Becomes available once the app is provisioned / live.
//   2. signed ASID, 3. legacy player id, 4. localStorage/random clientId.
// Every FB call is best-effort: if the platform returns null/UNKNOWN (e.g. an
// unprovisioned dev build) we silently fall back so the game still works, and
// resume just relies on localStorage + manual room code instead.
async function resolveIdentityAndBoot() {
  const p = (typeof FBInstant !== "undefined" && FBInstant.player) ? FBInstant.player : null;
  try {
    if (p && typeof p.getASIDAsync === "function") {
      const asid = await p.getASIDAsync();
      if (asid) { clientId = "fb_" + asid; try { localStorage.setItem("bs_clientId", clientId); } catch (e) {} }
      else adoptFbIdentity();
    } else if (p && typeof p.getSignedASIDAsync === "function") {
      const s = await p.getSignedASIDAsync();
      const asid = s && (s.getASID ? s.getASID() : s.asid);
      if (asid) { clientId = "fb_" + asid; try { localStorage.setItem("bs_clientId", clientId); } catch (e) {} }
      else adoptFbIdentity();
    } else { adoptFbIdentity(); }
  } catch (e) { adoptFbIdentity(); }
  captureFbProfile(); // name + avatar for the top-right profile chip
  // Durable room pointer via cloud save (best-effort).
  try {
    if (fbHasCloud()) {
      const d = await FBInstant.player.getDataAsync(["bs_room"]);
      cloudReady = true;
      if (d && d.bs_room) saveRoom(d.bs_room);
    }
  } catch (e) {}
  boot();
}

// Facebook Instant Games lifecycle: must finish startGameAsync before showing
// the game. On the real platform the chain resolves fast -> boot via the chain.
// Outside FB (local dev / web preview) initializeAsync can hang, so a fallback
// timer boots anyway after 4s.
if (typeof FBInstant !== "undefined") {
  FBInstant.initializeAsync()
    .then(() => {
      FBInstant.setLoadingProgress(100);
      return FBInstant.startGameAsync();
    })
    .then(resolveIdentityAndBoot)
    .catch((e) => {
      console.error("FBInstant boot failed, booting anyway:", e);
      boot();
    });
  setTimeout(boot, 4000); // fallback if initializeAsync hangs (e.g. dev preview)
} else {
  boot();
}
