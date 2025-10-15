const express = require("express");
const WebSocket = require("ws");

const app = express();
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

const wss = new WebSocket.Server({ server });

// Tek socket'e güvenli JSON gönder
function safeSend(ws, obj) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  } catch {}
}

// Belirli kanaldaki kullanıcılara yayın
function broadcastToChannel(channel, obj) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.channel === channel) {
      safeSend(client, obj);
    }
  });
}

// Kanal bazlı kullanıcı listesi
function getUsersInChannel(channel) {
  const set = new Set();
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && ws.channel === channel && ws.nick) {
      set.add(ws.nick);
    }
  });
  return Array.from(set);
}

// Kanal kullanıcılarını güncelle & yayınla
function broadcastUsers(channel) {
  const list = getUsersInChannel(channel);
  broadcastToChannel(channel, { type: "users", list });
}

// Yeni WS bağlantısı
wss.on("connection", (ws) => {
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return safeSend(ws, {
        type: "error",
        code: "BAD_JSON",
        message: "Geçersiz JSON formatı.",
      });
    }

    const type = data.type;

    // Kullanıcı kayıt
    if (type === "register") {
      const nick = String(data.nick || "").trim();
      const channel = String(data.channel || "").replace(/^#*/, "").trim();

      if (!nick || !channel) {
        return safeSend(ws, {
          type: "error",
          code: "BAD_REGISTER",
          message: "nick ve channel zorunludur.",
        });
      }

      const oldChannel = ws.channel;
      ws.nick = nick;
      ws.channel = channel;

      // Kendisine mevcut kullanıcıları gönder
      safeSend(ws, {
        type: "users",
        list: getUsersInChannel(channel),
      });

      // Kanal genelini güncelle
      broadcastUsers(channel);

      // Eski kanal varsa orada da güncelle
      if (oldChannel && oldChannel !== channel) {
        broadcastUsers(oldChannel);
      }
      return;
    }

    // Kanal kullanıcılarını getir
    if (type === "who") {
      const channel = String(data.channel || ws.channel || "").replace(/^#*/, "");
      if (!channel) {
        return safeSend(ws, {
          type: "error",
          code: "NO_CHANNEL",
          message: "channel gerekli.",
        });
      }
      return safeSend(ws, {
        type: "users",
        list: getUsersInChannel(channel),
      });
    }

    // Yazıyor bildirimi
    if (type === "typing") {
      const channel = ws.channel;
      if (!channel) return;
      broadcastToChannel(channel, {
        type: "typing",
        typingUsers: [ws.nick],
      });
      return;
    }

    // Mesaj gönderimi
    if (type === "message") {
      const channel = String(data.channel || ws.channel || "").replace(/^#*/, "");
      const nick = String(data.nick || ws.nick || "").trim();
      const text = String(data.text || "");
      const cid = data.cid || null;
      const ts = Date.now();

      if (!channel || !nick) {
        return safeSend(ws, {
          type: "error",
          code: "BAD_MESSAGE",
          message: "nick ve channel zorunludur.",
        });
      }

      // Gönderen tarafa "sent"
      safeSend(ws, {
        type: "message",
        cid,
        id: cid,
        nick,
        channel,
        text,
        ts,
        status: "sent",
      });

      // Diğer kullanıcılara "delivered"
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
      return;
    }

    // Okundu bilgisi
    if (type === "read") {
      const channel = String(data.channel || ws.channel || "").replace(/^#*/, "");
      const cid = data.cid;
      if (!channel || !cid) {
        return safeSend(ws, {
          type: "error",
          code: "BAD_READ",
          message: "channel ve cid zorunludur.",
        });
      }

      broadcastToChannel(channel, {
        type: "message",
        cid,
        id: cid,
        status: "read",
      });
      return;
    }

    // Bilinmeyen tip
    safeSend(ws, {
      type: "error",
      code: "UNKNOWN_TYPE",
      message: `Bilinmeyen type: ${type}`,
    });
  });

  ws.on("close", () => {
    const ch = ws.channel;
    if (ch) broadcastUsers(ch);
  });
});

// Heartbeat (ölü bağlantıları temizleme)
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  });
}, 30000);

wss.on("close", () => clearInterval(interval));
