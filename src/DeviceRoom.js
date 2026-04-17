class DeviceRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.connections = new Map();
    this.ctx.blockConcurrencyWhile(() => {
      // 初始化逻辑
      console.log('初始化');
    });
  }

  // 处理 WebSocket 连接
  async fetch(request, env, ctx) {
    console.log('请求', request);
    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname;
    const pathnames = pathname.split('/');
    const upgradeHeader = request.headers.get("Upgrade");
    console.log("收到请求:", method, pathname);
    // const stub = env.DEVICE_ROOM.getByName(EID);
    if (pathname === '/') {
      return new Response('Hello World!');
    }
    if (pathnames[1] == "equipment" || pathnames[1] == "connect") {
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Expected Upgrade: websocket", {
          status: 426
        });
      }
      const EID = pathnames[2];
      if (!EID) {
        return new Response('Missing EID', { status: 400 });
      }
      console.log('EID:', EID);
      if (this.connections.has(EID)) {
        return new Response('EID already connected', { status: 400 });
      }
      if (pathnames[1] == "equipment") return this.handleEquipmentConnection(request, EID);
      if (pathnames[1] == "connect") return this.handleClientConnection(request, EID);
    }

    // const webSocketPair = new WebSocketPair();
    // const [client,
    //   server] = Object.values(webSocketPair);

    // server.accept();

    // // 将连接存入 Durable Object 的内存中（这是安全的，因为 DO 是有状态的）
    // // const url = new URL(request.url);
    // const EID = pathnames[2];
    // this.connections.set(EID, server);

    // // 监听消息
    // server.addEventListener("message", (event) => {
    //   const data = JSON.parse(event.data);
    //   if (data.type === "upload_file") {
    //     // 广播给其他设备
    //     for (let [id, conn] of this.connections) {
    //       if (id !== EID) {
    //         // 排除自己
    //         conn.send(JSON.stringify(data));
    //       }
    //     }
    //   }
    // });

    // return new Response(null,
    //   {
    //     status: 101,
    //     webSocket: client
    //   });
    return new Response('Hello World!');
  }
  async handleEquipmentConnection(request, EID) {
    console.log('处理设备连接');
    const { socket, response } = await request.acceptUpgrade();
    this.connections.set(EID, socket);
    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "upload_file") {
        // 广播给其他设备
        for (let [id, conn] of this.connections) {
        }
      }
    });
    return response;
  }
  async handleClientConnection(request, EID) {
    console.log('处理客户端连接');
    const { socket, response } = await request.acceptUpgrade();
    this.connections.set(EID, socket);
    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "upload_file") {
        // 广播给其他设备
        for (let [id, conn] of this.connections) {
        }
      }
    });
    return response;
  }
}

export default DeviceRoom;