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

const SUPABASE_URL = "https://dbmp-xbgmorqeur6oh81z.database.nocode.cn";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzQ2OTc5MjAwLCJleHAiOjE5MDQ3NDU2MDB9.11QbQ5OW_m10vblDXAlw1Qq7Dve5Swzn12ILo7-9IXY";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const database = supabase.from("qtfile");

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
					if (data.type == "upload_file") {
						const { name, path, size, part } = data;
						console.log("上传文件:", name, path, size, part);
					}
				} catch (e) {
					console.error(e);
					console.error("错误的消息:", event.data);
				}
			});
			server.addEventListener('close', async () => {
				const d = await database
					.delete()
					.eq('eid', EID)
					.select();
				console.log('删除记录', d);
				console.log("设备断开连接:", EID);
			});
			server.addEventListener('error', (event) => {
				console.error("出现错误", event);
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
			const d = await database
				.select('*')
				.eq('eid', EID);
			console.log(d);
			if (d.data.length == 0) {
				const d2 = await database
					.insert([{
						eid: EID,
						connects: {}
					}])
					.select();
				if (d2.status != 201) {
					console.log(d2);
					socket.send(JSON.stringify({
						code: 500,
						bcode: 10101,
						msg: '服务内部错误',
						timestamp: Date.now()
					}));
					return socket.close();
				}
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
