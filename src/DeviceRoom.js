class DeviceRoom {
  constructor(ctx, env) {
    super(ctx, env);
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
    console.log("收到请求:", method, pathname);
    const EID = pathnames[2];
    if (!EID) {
      return new Response('Missing EID', { status: 400 });
    }
    const stub = env.DEVICE_ROOM.getByName(EID);
    if (pathname === '/') {
      return new Response('Hello World!');
    }
    // const upgradeHeader = request.headers.get("Upgrade");
    // if (!upgradeHeader || upgradeHeader !== "websocket") {
    //   return new Response("Expected Upgrade: websocket", {
    //     status: 426
    //   });
    // }

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
}

export default DeviceRoom;