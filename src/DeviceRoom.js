import {
  createClient
} from "@supabase/supabase-js";

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
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const database = supabase.from("qtfile");
    const storage = supabase.storage.from("qtfiles");
    console.log('请求', request);
    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname;
    const pathnames = pathname.split('/');
    const upgradeHeader = request.headers.get("Upgrade");
    console.log("DO 收到请求:", method, pathname);
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
      console.log('处理连接请求:', pathnames[1], 'EID:', EID);
      console.log('EID:', EID);
      console.log('当前连接数:', this.connections.size);
      if (this.connections.has(EID)) {
        return new Response('EID already connected', { status: 400 });
      }
      if (pathnames[1] == "equipment") return this.handleEquipmentConnection(request, EID);
      else if (pathnames[1] == "connect") return this.handleClientConnection(request, EID);
      else return new Response('Invalid path', { status: 400 });
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
    console.log('处理设备连接:', EID);
    if (this.connections.has(EID)) {
      console.log(`设备 ${EID} 已连接，关闭旧连接`);
      const oldConn = this.connections.get(EID);
      if (oldConn && oldConn.server) {
        oldConn.server.close(1000, "Replaced by new connection");
      }
    }
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    server.accept();
    const originalSend = server.send.bind(server);
    server.send = (data) => {
      console.log(`[DO-Server-${EID}] 发送消息:`, typeof data === 'string' ? data : '[Binary Data]');
      originalSend(data);
    };
    this.connections.set(EID, {
      server,
      clients: new Map(),
      connectedAt: Date.now()
    });
    server.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[DO-Server-${EID}] 收到消息:`, data);
        if (data.type == "upload_file") {
          const { name, path, size, part } = data;
          console.log("上传文件:", name, path, size, part);
          const clients = this.connections.get(EID).clients;
          const currentConnects = Object.keys(clients);
          console.log("当前连接数:", currentConnects.length);
          for (let i = 0; i < currentConnects.length; i++) {
            const connect = this.connections.get(currentConnects[i]);
            console.log('连接的UUID', currentConnects[i]);
            if (connect && connect.server) {
              connect.server.send(JSON.stringify({
                code: 200,
                bcode: 10103,
                msg: "接收文件",
                data: {},
              }));
            }
          }
        }
      } catch (e) {
        console.error(`[DO-Server-${EID}] 消息解析失败:`, e);
      }
    });
    server.addEventListener("close", () => {
      console.log(`[DO-Server-${EID}] 连接关闭`);
      this.connections.delete(EID);
    });
    server.addEventListener("error", (err) => {
      console.error(`[DO-Server-${EID}] 连接错误:`, err);
      this.connections.delete(EID);
    });
    console.log(`[DO-Server-${EID}] 连接成功`);
    server.send(JSON.stringify({
      code: 200,
      bcode: 10100,
      msg: "连接成功",
      timestamp: Date.now()
    }));
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async handleClientConnection(request, EID) {
    console.log('处理客户端连接:', EID);
    if (!this.connections.has(EID)) {
      return new Response(JSON.stringify({
        code: 400,
        msg: "目标设备未连接"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    server.accept();
    const clientId = crypto.randomUUID();
    const deviceConn = this.connections.get(EID);
    if (!deviceConn.clients) {
      deviceConn.clients = new Map();
    }
    deviceConn.clients.set(clientId, server);
    server.addEventListener("message", (event) => {
      console.log(`[DO-Client-${clientId}] 收到消息:`, event.data);
      if (deviceConn && deviceConn.server) {
        try {
          deviceConn.server.send(event.data);
        } catch (e) {
          console.error("转发给设备失败", e);
        }
      }
    });
    server.addEventListener("close", () => {
      console.log(`[DO-Client-${clientId}] 断开连接`);
      if (deviceConn && deviceConn.clients) {
        deviceConn.clients.delete(clientId);
      }
    });
    server.send(JSON.stringify({
      code: 200,
      msg: "连接成功",
      clientId: clientId
    }));
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
}

function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default DeviceRoom;