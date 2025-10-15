const express = require("express");
const WebSocket = require("ws");
const IKC = require("irc");

const app = express();
const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port", process.env.PORT || 3000);
});

const wss = new WebSocket.Server({ server });
const client = new IKC.Client("irc.freenode.net", "ReactUser", {
  channels: ["Wrestchannel"],
});

// ✅ Kullanıcı listesi burada tutuluyor
let connectedNicks = [];
let typingUsers = [];

// ✅ Tüm client'lara güncel kullanıcı listesini ileten fonksiyon
function broadcastUsers() {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "users",
          list: connectedNicks,
        })
      );
    }
  });
}

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // ✅ Kullanıcı kayıt
    if (data.type === "register") {
      if (connectedNicks.includes(data.nick)) {
        ws.send(JSON.stringify({ type: "error", message: "Nickname kullanımda." }));
        return ws.close();
      }
      connectedNicks.push(data.nick);
      ws.nick = data.nick;

      // ✅ Tüm client'lara bildir
      broadcastUsers();
      return;
    }

    // ✅ "who" isteğine cevap
    if (data.type === "who") {
      ws.send(
        JSON.stringify({
          type: "users",
          list: connectedNicks,
        })
      );
      return;
    }

    // ✅ "typing" bildirimi
    if (data.type === "typing") {
      typingUsers.push(data.nick);
      typingUsers = [...new Set(typingUsers)];

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "typing", typingUsers }));
        }
      });

      setTimeout(() => {
        typingUsers = typingUsers.filter((u) => u !== data.nick);
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "typing", typingUsers }));
          }
        });
      }, 2000);

      return;
    }

    // ✅ Mesaj gönderme
    if (data.type === "message") {
      client.say(data.channel, data.text);

      // Gönderen kullanıcıya "sent"
      ws.send(
        JSON.stringify({
          type: "message",
          ...data,
          status: "sent",
        })
      );

      // Diğer kullanıcılara "delivered"
      setTimeout(() => {
        wss.clients.forEach((clientSocket) => {
          if (
            clientSocket !== ws &&
            clientSocket.readyState === WebSocket.OPEN
          ) {
            clientSocket.send(
              JSON.stringify({
                type: "message",
                ...data,
                status: "delivered",
              })
            );
          }
        });
      }, 500);

      // "read" simülasyonu
      setTimeout(() => {
        wss.clients.forEach((clientSocket) => {
          if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(
              JSON.stringify({
                type: "message",
                ...data,
                status: "read",
              })
            );
          }
        });
      }, 2000);

      return;
    }
  });

  // ✅ Bağlantı kapanınca listeden sil + herkese bildir
  ws.on("close", () => {
    connectedNicks = connectedNicks.filter((n) => n !== ws.nick);
    broadcastUsers();
  });
});
