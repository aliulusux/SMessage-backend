const express = require("express");
const WebSocket = require("ws");
const IKC = require("irc");

const app = express();
const server = app.listen(process.env.PORT || 3000, () => {
    console.log("Server running on port", process.env.PORT || 3000);
});

const wss = new WebSocket.Server({ server });

// Sadece IRC kullanıyorsan bu kalsın:
const client = new IKC.Client("irc.freenode.net", "ReactUser", {
    channels: ["Wrestchannel"],
});

// ✅ Kullanıcıları hem nick hem kanal bazlı tutuyoruz
let connectedUsers = []; // [{ nick: "Ali", channel: "genel" }]
let typingUsers = [];

// ✅ Belirli kanaldaki kullanıcıları herkese gönderen yardımcı fonksiyon
function broadcastUsers(channel) {
    const usersInChannel = connectedUsers
        .filter(u => u.channel === channel)
        .map(u => u.nick);

    wss.clients.forEach(client => {
        if (client.readyState === 1 && client.channel === channel) {
            client.send(JSON.stringify({
                type: "users",
                users: usersInChannel
            }));
        }
    });
}

wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        // ✅ Kullanıcı kaydı
        if (data.type === "register") {
            const { nick, channel } = data;

            // Aynı kanalda aynı nick varsa engelle
            if (connectedUsers.find(u => u.nick === nick && u.channel === channel)) {
                ws.send(JSON.stringify({ type: "error", message: "Nickname kullanımda." }));
                return ws.close();
            }

            connectedUsers.push({ nick, channel });
            ws.nick = nick;
            ws.channel = channel;

            // ✅ Kullanıcı listesini frontend'e yolla
            broadcastUsers(channel);
            return;
        }

        // ✅ Yazıyor bildirimi
        if (data.type === "typing") {
            if (!typingUsers.includes(ws.nick)) {
                typingUsers.push(ws.nick);
            }

            wss.clients.forEach(client => {
                if (client.readyState === 1 && client.channel === ws.channel) {
                    client.send(JSON.stringify({
                        type: "typing",
                        typingUsers
                    }));
                }
            });

            setTimeout(() => {
                typingUsers = typingUsers.filter(u => u !== ws.nick);
                wss.clients.forEach(client => {
                    if (client.readyState === 1 && client.channel === ws.channel) {
                        client.send(JSON.stringify({
                            type: "typing",
                            typingUsers
                        }));
                    }
                });
            }, 2000);

            return;
        }

        // ✅ Mesaj gönderimi
        if (data.type === "message") {
            const { channel, text } = data;

            // IRC'ye de gönderiyorsan bırak, istemiyorsan silebilirsin:
            client.say(channel, text);

            // Gönderen kişiye önce local onay verelim
            ws.send(JSON.stringify({
                type: "message",
                ...data,
                status: "sent"
            }));

            // ✅ Diğer kullanıcılara yay
            wss.clients.forEach(c => {
                if (c !== ws && c.readyState === 1 && c.channel === channel) {
                    c.send(JSON.stringify({
                        type: "message",
                        ...data,
                        status: "delivered"
                    }));
                }
            });

            // ✅ Okundu (örnek amaçlı 2 saniye sonra)
            setTimeout(() => {
                wss.clients.forEach(c => {
                    if (c.readyState === 1 && c.channel === channel) {
                        c.send(JSON.stringify({
                            type: "message",
                            ...data,
                            status: "read"
                        }));
                    }
                });
            }, 2000);

            return;
        }
    });

    // ✅ Bağlantı kopunca listeden çıkar
    ws.on("close", () => {
        if (ws.nick) {
            connectedUsers = connectedUsers.filter(u => u.nick !== ws.nick || u.channel !== ws.channel);
            broadcastUsers(ws.channel);
        }
    });
});
