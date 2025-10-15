if (data.type === "message") {
  // 1 kez herkese mesajı gönder
  wss.clients.forEach((clientSocket) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(
        JSON.stringify({
          type: "message",
          nick: data.nick,
          text: data.text,
          ts: Date.now(),
          cid: data.cid,
          status: "delivered",
        })
      );
    }
  });
}
