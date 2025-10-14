const express = require("express"); // = eklendi
const WebSocket = require("ws");    // ws modülü import edildi
const IKC = require("irc");

const app = express();
const server = app.listen(process.env.PORT || 3000, () => {
    console.log("Server running on port", process.env.PORT || 3000);
});

const wss = new WebSocket.Server({ server }); // "was" yerine "wss"
const client = new IKC.Client("irc.freenode.net", "ReactUser", {
    channels: ["Wrestchannel"],
});

let connectedNicks = []; // "connectemMicks" düzeltildi
let typingUsers = [];

wss.on("connection", (ws) => { // "was" -> "wss"
    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        if (data.type === "register") {
            if (connectedNicks.includes(data.nick)) {
                ws.send(JSON.stringify({ type: "error", message: "Nickname kullanımda." }));
                return ws.close();
            }
            connectedNicks.push(data.nick);
            ws.nick = data.nick; // Kullanıcıyı takip etmek için
        }

        if (data.type === "typing") {
            typingUsers.push(data.nick);
            typingUsers = [...new Set(typingUsers)]; // Tekilleştirme
            wss.clients.forEach((client) => { // "<" sembolü düzeltildi
                client.send(JSON.stringify({ type: "typing", typingUsers }));
            });
            setTimeout(() => {
                typingUsers = typingUsers.filter(u => u !== data.nick);
                wss.clients.forEach((client) => {
                    client.send(JSON.stringify({ type: "typing", typingUsers }));
                });
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
        connectedNicks = connectedNicks.filter(n => n !== ws.nick); // "connectemMicks" düzeltildi
    });
});

server.listen(3001, () => console.log("Secure WebSocket running on wss://localhost:3001"));



