const express = require("express");
const WebSocket = require("ws");

const app = express();
const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port", process.env.PORT || 3000);
});

const wss = new WebSocket.Server({ server });

let connectedNicks = [];
let typingUsers = [];

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

    if (data.type === "who") {
      ws.send(
        JSON.stringify({
          type: "users",
          list: connectedNicks,
        })
      );
      return;
    }

    if (data.type === "typing") {
      typingUsers.push(data.n
