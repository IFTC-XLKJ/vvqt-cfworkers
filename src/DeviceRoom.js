export class DeviceRoom {
  constructor(state, env) {
    this.state = state;
    this.connections = new Map(); // 替代原来的 connects
    this.state.blockConcurrencyWhile(() => {
      // 初始化逻辑
    });
  }

  // 处理 WebSocket 连接
  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Expected Upgrade: websocket", {
        status: 426
      });
    }

    const webSocketPair = new WebSocketPair();
    const [client,
      server] = Object.values(webSocketPair);

    server.accept();

    // 将连接存入 Durable Object 的内存中（这是安全的，因为 DO 是有状态的）
    const url = new URL(request.url);
    const EID = url.searchParams.get("eid");
    this.connections.set(EID, server);

    // 监听消息
    server.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "upload_file") {
        // 广播给其他设备
        for (let [id, conn] of this.connections) {
          if (id !== EID) {
            // 排除自己
            conn.send(JSON.stringify(data));
          }
        }
      }
    });

    return new Response(null,
      {
        status: 101,
        webSocket: client
      });
  }
}