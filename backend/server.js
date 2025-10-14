import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const irc = require("irc");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Basit test endpoint
app.get("/", (req, res) => {
  res.send("✅ SMessage backend running successfully on Render!");
});

// --- IRC Client setup ---
let clients = {};

function createIRCClient(nickname, channel, onMessage) {
  const client = new irc.Client("irc.libera.chat", nickname, {
    channels: [channel],
  });

  client.addListener("message", (from, to, message) => {
    if (onMessage) onMessage({ from, to, message });
  });

  client.addListener("error", (message) => {
    console.error("IRC Error:", message);
  });

  return client;
}

// --- WebSocket Setup ---
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "connect") {
        const { nickname, channel } = data;
        clients[ws] = createIRCClient(nickname, channel, (ircMsg) => {
          ws.send(JSON.stringify({ type: "ircMessage", ...ircMsg }));
        });
        ws.send(JSON.stringify({ type: "status", message: "Connected to IRC" }));
      }

      if (data.type === "send") {
        const { text } = data;
        const client = clients[ws];
        if (client) {
          client.say(client.opt.channels[0], text);
          ws.send(JSON.stringify({ type: "sent", text }));
        }
      }
    } catch (err) {
      console.error("WebSocket error:", err);
      ws.send(JSON.stringify({ type: "error", message: err.message }));
    }
  });

  ws.on("close", () => {
    if (clients[ws]) {
      clients[ws].disconnect("Goodbye");
      delete clients[ws];
    }
  });
});

// --- HTTP server ---
const server = app.listen(PORT, () => {
  console.log(`🚀 SMessage backend running on port ${PORT}`);
});

// WebSocket upgrade
server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
