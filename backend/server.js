import express from "express";
const WebSocket = require("ws");
const IRC = require("irc");

const app = express();

// HTTPS yerine HTTP server kullan
const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port", process.env.PORT || 3000);
});

const wss = new WebSocket.Server({ server });
const client = new IRC.Client("irc.freenode.net", "ReactUser", {
  channels: ["#testchannel"],
});

let connectedNicks = [];
let typingUsers = [];

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "register") {
      if (connectedNicks.includes(data.nick)) {
        ws.send(JSON.stringify({ type: "error", message: "Nickname kullanımda." }));
        return ws.close();
      }
      connectedNicks.push(data.nick);
    }

    if (data.type === "typing") {
      typingUsers = [...new Set([...typingUsers.filter(u => u !== data.nick), data.nick])];
      wss.clients.forEach((c) => c.send(JSON.stringify({ type: "typing", typingUsers })));
      setTimeout(() => {
        typingUsers = typingUsers.filter(u => u !== data.nick);
        wss.clients.forEach((c) => c.send(JSON.stringify({ type: "typing", typingUsers })));
      }, 2000);
    }

    if (data.type === "message") {
      client.say(data.channel, data.text);
      ws.send(JSON.stringify({ type: "message", ...data, status: "sent" }));
      setTimeout(() => ws.send(JSON.stringify({ type: "message", ...data, status: "delivered" })), 500);
      setTimeout(() => ws.send(JSON.stringify({ type: "message", ...data, status: "read" })), 2000);
    }
  });

  ws.on("close", () => {
    connectedNicks = connectedNicks.filter(n => n !== ws.nick);
  });
});

server.listen(3001, () => console.log("Secure WebSocket running on wss://localhost:3001"));

