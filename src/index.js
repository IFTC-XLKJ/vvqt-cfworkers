/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { createClient } from "@supabase/supabase-js";

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const pathname = url.pathname;
		const method = request.method;
		const pathnames = pathname.split('/');
		const upgradeHeader = request.headers.get('Upgrade');
		console.log("收到请求:", method, pathname);
		if (pathnames[1] == "equipment") {
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				return new Response('Expected Upgrade: websocket', { status: 426 });
			}
			const webSocketPair = new WebSocketPair();
			const [client, server] = Object.values(webSocketPair);
			server.accept();
			server.nativeSend = server.send;
			server.send = function (...args) {
				console.log("发送消息", ...args);
				server.nativeSend(args);
			}
			const EID = pathnames[2];
			server.addEventListener('message', (event) => {
				try {
					const data = JSON.parse(event.data);
					console.log("收到消息:", event.data);
				} catch (e) {
					console.error(e);
					console.error("错误的消息:", event.data);
				}
			});
			if (!EID) {
				server.send(JSON.stringify({
					code: 400,
					bcode: 10102,
					msg: "缺少设备ID",
					timestamp: Date.now()
				}));
				server.close();
				return;
			}
			console.log("连接成功:", EID);
			server.send(JSON.stringify({
				code: 200,
				bcode: 10100,
				msg: "连接成功",
				timestamp: Date.now()
			}));
			return new Response(null, {
				status: 101,
				webSocket: client,
			});
		}
		return new Response("404 Not Found", { status: 404 });
	},
};
