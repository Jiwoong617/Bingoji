const serverUrl = process.env.BINGOJI_WORKER_URL ?? "ws://127.0.0.1:8787";
const timerMode = process.argv.includes("--timers");
const profile = (avatar, nickname) => ({
  avatar,
  nickname,
  pool: { sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 },
});

function connect(path) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${serverUrl}${path}`);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", () => reject(new Error(`WebSocket 연결 실패: ${path}`)), { once: true });
  });
}

function request(socket, type, payload) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${type} 응답 시간 초과`)), 5_000);
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.requestId !== requestId) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      if (message.type === "error") reject(new Error(`${message.payload.code}: ${message.payload.message}`));
      else resolve(message);
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ protocolVersion: 1, requestId, type, payload }));
  });
}

function nextMessageOfType(socket, type, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${type} Broadcast 시간 초과`)), timeoutMs);
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type !== type) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
  });
}

const host = await connect("/api/rooms/socket");
const created = await request(host, "room.create", { profile: profile("🙂", "호스트") });
if (created.type !== "room.created") throw new Error("room.created 응답이 아닙니다.");

const { roomCode } = created.payload.room;
const hostToken = created.payload.sessionToken;
const guest = await connect(`/api/rooms/${roomCode}/socket`);
const joined = await request(guest, "room.join", { roomCode, profile: profile("😎", "게스트") });
if (joined.type !== "room.joined") throw new Error("room.joined 응답이 아닙니다.");

await request(host, "room.ready.set", { sessionToken: hostToken, ready: true });
const hostStartedPromise = nextMessageOfType(host, "match.started", 8_000);
const guestStartedPromise = nextMessageOfType(guest, "match.started", 8_000);
const guestReady = await request(guest, "room.ready.set", {
  sessionToken: joined.payload.sessionToken,
  ready: true,
});
if (guestReady.type !== "room.updated" || guestReady.payload.room.status !== "starting") {
  throw new Error("양쪽 준비 후 starting 상태가 오지 않았습니다.");
}
const hostStarted = await hostStartedPromise;
const guestStarted = await guestStartedPromise;
if (guestStarted.type !== "match.started") throw new Error("Countdown 후 match.started가 오지 않았습니다.");

const activeSeat = guestStarted.payload.match.activeSeat;
const activeSocket = activeSeat === "host" ? host : guest;
const activeToken = activeSeat === "host" ? hostToken : joined.payload.sessionToken;
const activeSnapshot = activeSeat === "host" ? hostStarted.payload.match : guestStarted.payload.match;
if (activeSnapshot.privateState.draw.length !== 3) throw new Error("선공의 비공개 Draw가 없습니다.");

if (timerMode) {
  const automatic = await nextMessageOfType(host, "match.updated", 20_000);
  if (automatic.payload.match.revision !== 1 || automatic.payload.match.deadlineAt === null) {
    throw new Error("15초 자동 배치가 적용되지 않았습니다.");
  }
  const disconnectedPromise = nextMessageOfType(host, "match.finished", 35_000);
  guest.close();
  const disconnected = await disconnectedPromise;
  if (
    disconnected.payload.result.reason !== "disconnect"
    || disconnected.payload.result.winnerSeat !== "host"
  ) {
    throw new Error("30초 재접속 유예 후 Disconnect 결과가 올바르지 않습니다.");
  }
  host.close();
  console.log(`timer-flow-ok ${roomCode} autoRevision=${automatic.payload.match.revision} result=${disconnected.payload.result.reason}`);
} else {
  const placed = await request(activeSocket, "match.place", {
    sessionToken: activeToken,
    matchId: activeSnapshot.matchId,
    expectedRevision: activeSnapshot.revision,
    turn: activeSnapshot.turn,
    drawIndex: 0,
    cellIndex: 0,
  });
  if (placed.type !== "match.updated" || placed.payload.match.revision !== 1) {
    throw new Error("첫 PvP 배치가 적용되지 않았습니다.");
  }

  const forfeited = await request(guest, "room.leave", {
    sessionToken: joined.payload.sessionToken,
  });
  if (
    forfeited.type !== "match.finished"
    || forfeited.payload.result.reason !== "forfeit"
    || forfeited.payload.result.winnerSeat !== "host"
  ) {
    throw new Error("Guest 기권 결과가 올바르지 않습니다.");
  }

  host.close();
  guest.close();
  console.log(`match-flow-ok ${roomCode} active=${activeSeat} result=${forfeited.payload.result.reason}`);
}
