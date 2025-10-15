// server.js — kanal bazlı WS sohbet sunucusu
// Özellikler:
// - register (kanal + nick)
// - who (kanal bazlı kullanıcı listesi)
// - message (sent/delivered, read client'tan tetiklenir)
// - error (gönderim hatası geri dönüşü)
// - çoklu kanal desteği
// - basit typing yayını (opsiyonel)
// - bağlantı kapanınca kullanıcı listesi güncellenir

const express = require("express");
const WebSocket = require("ws");

const app = express();
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

const wss = new WebSocket.Server({ server });

// --- Yardımcılar ---

/** Güvenli gönderim (tek client) */
function safeSend(ws, obj) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  } catch (err) {
    // sessizce geç
  }
}

/** Aynı kanaldaki herkese yayın */
function broadcastToChannel(channel, obj) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.channel === channel) {
      safeSend(client, obj);
    }
  });
}

/** Kanal bazlı kullanıcıları listele (tekilleştir) */
function getUsersInChannel(channel) {
  const set = new Set();
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN && c.channel === channel && c.nick) {
      set.add(c.nick);
    }
  });
  return Array.from(set);
}

/** Kanal için kullanıcı listesini yayınla */
function broadcastUsers(channel) {
  const list = getUsersInChannel(channel);
  broadcastToChannel(channel, { type: "users", list });
}

// --- Bağlantı ---

wss.on("connection", (ws) => {
  // Heartbeat (opsiyonel)
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return safeSend(ws, { type: "error", code: "BAD_JSON", message: "Geçersiz JSON." });
    }

    const t = data?.type;

    // --- KAYIT / KANALA GİRİŞ ---
    if (t === "register") {
      const nick = String(data.nick || "").trim();
      const channel = String(data.channel || "").replace(/^#*/, "").trim();

      if (!nick || !channel) {
        return safeSend(ws, { type: "error", code: "BAD_REGISTER", message: "nick ve channel zorunludur." });
      }

      // Eğer daha önce başka kanala kayıtlıysa, eski kanaldan düşür
      const oldChannel = ws.channel;
      ws.nick = nick;
      ws.channel = channel;

      // Önce kendisine users listesi
      safeSend(ws, { type: "users", list: getUsersInChannel(channel) });
      // Sonra kanala duyur
      broadcastUsers(channel);

      // Kanal değiştiyse eski kanala da users yayını yap
      if (oldChannel && oldChannel !== channel) {
        broadcastUsers(oldChannel);
      }

      return;
    }

    // --- KİMLER VAR? ---
    if (t === "who") {
      const channel = String(data.channel || ws.channel || "").replace(/^#*/, "");
      if (!channel) return safeSend(ws, { type: "error", code: "NO_CHANNEL", message: "channel gerekli." });
      return safeSend(ws, { type: "users", list: getUsersInChannel(channel) });
    }

    // --- TYPING (opsiyonel) ---
    if (t === "typing") {
      const channel = ws.channel;
      if (!channel) return;
      broadcastToChannel(channel, {
        type: "typing",
        typingUsers: [ws.nick], // basit örnek
      });
      return;
    }

    // --- MESAJ GÖNDERME ---
    if (t === "message") {
      const channel = String(data.channel || ws.channel || "").replace(/^#*/, "");
      const nick = String(data.nick || ws.nick || "").trim();
      const text = String(data.text ?? "");
      const cid = data.cid || null;
      const ts = Date.now();

      if (!channel || !nick) {
        return safeSend(ws, { type: "error", code: "BAD_MESSAGE", message: "nick ve channel zorunludur." });
      }

      // 1) Gönderene 'sent'
      safeSend(ws, {
        type: "message",
        cid,
        id: cid, // client tarafında eşleştirme kolaylığı için id=cid
        nick,
        channel,
        text,
        ts,
        status: "sent",
      });

      // 2) Aynı kanaldaki diğer client'lara 'delivered'
      wss.clients.forEach((client) => {
        if (
          client !== ws &&
          client.readyState === WebSocket.OPEN &&
          client.channel === channel
        ) {
          safeSend(client, {
            type: "message",
            cid,
            id: cid,
            nick,
            channel,
            text,
            ts,
            status: "delivered",
          });
        }
      });

      // Not: read bilgisi client'tan gelecek (aşağıdaki 'read' bloğuna bak)
      return;
    }

    // --- OKUNDU BİLGİSİ ---
    // Frontend, mesaj UI'da görünür görünmez şunu gönderir:
    // { type: "read", cid: "123", channel: "genel", nick: "Veli" }
    if (t === "read") {
      const channel = String(data.channel || ws.channel || "").replace(/^#*/, "");
      const cid = data.cid;
      if (!channel || !cid) {
        return safeSend(ws, { type: "error", code: "BAD_READ", message: "channel ve cid gerekli." });
      }

      // Aynı kanaldaki herkese 'read' durumu yay
      broadcastToChannel(channel, {
        type: "message",
        cid,
        id: cid,
        status: "read",
      });
      return;
    }

    // --- BİLİNMEYEN TİP ---
    safeSend(ws, { type: "error", code: "UNKNOWN_TYPE", message: `Bilinmeyen type: ${t}` });
  });

  ws.on("close", () => {
    const ch = ws.channel;
    // Kullanıcı ayrıldı → kanaldaki listeyi güncelle
    if (ch) broadcastUsers(ch);
  });
});

// Heartbeat - ölü bağlantıları kapat (opsiyonel ama faydalı)
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 30000);

wss.on("close", () => clearInterval(interval));
