const express = require("express");
const WebSocket = require("ws");

const app = express();
const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port", process.env.PORT || 3000);
});

const wss = new WebSocket.Server({ server });

let connectedNicks = [];
let typingUsers = [];

// ✅ Kullanıcı listesini herkese ilet
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
      broadcastUsers();
      return;
    }

    // ✅ "who" isteği
    if (data.type === "who") {
      ws.send(
        JSON.stringify({
          type: "users",
          list: connectedNicks,
        })
      );
      return;
    }

    // ✅ Yazıyor bildirimi
    if (data.type === "typing") {
      typingUsers.push(data.nick);
      typingUsers = [...new Set(typingUsers)];

      wss.clients.forEach((clientSocket) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify({ type: "typing", typingUsers }));
        }
      });

      setTimeout(() => {
        typingUsers = typingUsers.filter((u) => u !== data.nick);
        wss.clients.forEach((clientSocket) => {
          if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(JSON.stringify({ type: "typing", typingUsers }));
          }
        });
      }, 2000);

      return;
    }

    // ✅ ✅ MESAJ GÖNDERME (IRC YOK!)
    if (data.type === "message") {
      // Tüm açık socketlerde dolaş
      wss.clients.forEach((clientSocket) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(
            JSON.stringify({
              type: "message",
              ...data,
              status: "delivered",
            })
          );
        }
      });

      // Test amaçlı read gecikmesi
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

  // ✅ Kullanıcı ayrıldığında listeden sil
  ws.on("close", () => {
    connectedNicks = connectedNicks.filter((n) => n !== ws.nick);
    broadcastUsers();
  });
});
