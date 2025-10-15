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

let connectedNicks = [];
let typingUsers = [];

// ✅ Tüm clientlara kullanıcı listesini gönder
function broadcastUsers() {
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(
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
      broadcastUsers();
      return;
    }

    // ✅ Kimler var isteği
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

      wss.clients.forEach((clientSocket) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(
            JSON.stringify({ type: "typing", typingUsers })
          );
        }
      });

      setTimeout(() => {
        typingUsers = typingUsers.filter((u) => u !== data.nick);
        wss.clients.forEach((clientSocket) => {
          if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(
              JSON.stringify({ type: "typing", typingUsers })
            );
          }
        });
      }, 2000);

      return;
    }

    // ✅ ✅ MESAJ GÖNDERME (DÜZELTİLEN KISIM)
    if (data.type === "message") {
      // IRC'ye iletmek istersen (zorunlu değil):
      client.say(data.channel, data.text);

      // 1️⃣ Tüm clientlara "delivered" olarak ilet
      wss.clients.forEach((clientSocket) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(
            JSON.stringify({
              type: "message",
              ...data,
              status: "delivered", // diğer kullanıcılar ilk bu şekilde alacak
            })
          );
        }
      });

      // 2️⃣ Sonra "read" statüsü gönder (simülasyon)
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

  // ✅ Bağlantı kapatıldığında kullanıcıyı sil
  ws.on("close", () => {
    connectedNicks = connectedNicks.filter((n) => n !== ws.nick);
    broadcastUsers();
  });
});
