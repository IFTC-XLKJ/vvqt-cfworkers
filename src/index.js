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
import path from "path";
import fs from "fs/promises";
import mime from "mime";
import * as process from "node:process";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const database = supabase.from("qtfile");
const storage = supabase.storage.from("qtfiles");

const fileCache = {};
const connects = {};

function cleanExpiredCache() {
	const now = Date.now();
	for (let key in fileCache) {
		if (fileCache[key].timestamp && now - fileCache[key].timestamp > 1000 * 60 * 60) {
			delete fileCache[key];
		}
	}
}

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
						const currentConnects = Object.keys(connects[EID]);
						for (let i = 0; i < currentConnects.length; i++) {
							const connect = connects[EID][currentConnects[i]];
							connect.socket.send(JSON.stringify({
								code: 200,
								bcode: 10103,
								msg: "接收文件",
								data: {},
							}));
						}
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
			connects[EID] = {};
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
		if (pathnames[1] == "connect") {
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				return new Response('Expected Upgrade: websocket', { status: 426 });
			}
			const webSocketPair = new WebSocketPair();
			const [client, server] = Object.values(webSocketPair);
			server.accept();
			const EID = pathnames[2];
			const UUID = genUUID();
			server.addEventListener('message', (event) => {
			});
			server.addEventListener('close', async () => {
				console.log("设备断开连接:", EID);
			});
			if (!EID) {
				server.send(JSON.stringify({
					code: 400,
					bcode: 10102,
					msg: "缺少设备ID",
					timestamp: Date.now()
				}));
				return server.close();
			}
			if (!connects[EID]) {
				server.send(JSON.stringify({
					code: 400,
					bcode: 10104,
					msg: "目标设备未连接",
					timestamp: Date.now()
				}));
				return server.close();
			}
			connects[EID][UUID] = {
				socket: server,
				uuid: UUID,
			};
			server.send(JSON.stringify({
				code: 200,
				bcode: 10100,
				msg: "连接成功",
				timestamp: Date.now(),
				uuid: UUID,
			}));
			return new Response(null, {
				status: 101,
				webSocket: client,
			});
		}
		if (pathnames[1] == "download") {
			const EID = pathnames[2];
			const timestamp = pathnames[3];
			const filename = pathnames[4];
			if (!EID || !timestamp || !filename) {
				return new Response("缺少参数", { status: 400 });
			}
			const filePath = path.join(EID, timestamp, filename);
			if (fileCache[filePath]) {
				console.log("命中临时文件缓存:", filePath);
				return new Response(fileCache[filePath].blob, { // 注意这里取 .blob
					headers: {
						'Content-Type': getMIMEType(filename) || 'application/octet-stream',
						'Content-Disposition': `attachment; filename="${filename}"`,
						'Content-Length': fileCache[filePath].blob.size.toString(), // 注意这里取 .blob.size
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
						'Accept-Ranges': 'bytes',
					}
				});
			}
			console.log("未命中临时文件缓存:", filePath);
			console.log("下载文件:", filePath);
			const j = await storage
				.list(filePath, {
					limit: 1000000,
					offset: 0,
				});
			if (j.error) {
				console.error(j.error);
				return new Response("文件不存在", { status: 404 });
			}
			const data = j.data;
			console.log("文件列表:", data);
			if (data.length > 10) {
				return new Response("文件超过100MB，无法下载预览", { status: 400 });
			}
			if (data.length == 0) {
				return new Response("文件不存在", { status: 404 });
			}
			const fileBlobs = [];
			data.sort((a, b) => {
				return parseInt(a.name.replace("part", "")) - parseInt(b.name.replace("part", ""));
			});
			for (let i = 0; i < data.length; i++) {
				const file = data[i];
				console.log("下载文件:", path.join(filePath, file.name));
				const k = await storage.download(path.join(filePath, file.name));
				if (k.error) {
					console.error(k.error);
					return new Response("文件不存在", { status: 404 });
				}
				const blob = k.data;
				fileBlobs[i] = blob;
				console.log("下载完成:", file.name);
			}
			console.log("文件列表:", fileBlobs);
			console.log("MIME类型:", getMIMEType(filename));
			const combinedBlob = new Blob(fileBlobs, { type: getMIMEType(filename) || 'application/octet-stream' });
			fileCache[filePath] = {
				blob: combinedBlob,
				timestamp: Date.now()
			};
			return new Response(combinedBlob, {
				headers: {
					'Content-Type': getMIMEType(filename) || 'application/octet-stream',
					'Content-Disposition': `attachment; filename="${filename}"`,
					'Content-Length': combinedBlob.size.toString(),
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
					'Accept-Ranges': 'bytes',
				}
			});
		}
		if (pathnames[1] == "listfile") {
			const EID = pathnames[2];
			if (!EID) {
				return new Response("缺少设备ID", { status: 400 });
			}
			const searchParams = url.searchParams;
			const page = parseInt(searchParams.get("page") || "1");
			const pageSize = parseInt(searchParams.get("pageSize") || "100"); // 建议增大 pageSize，因为 list API 不支持 offset 分页
			let subPath = pathnames.slice(3).join('/');
			if (subPath && !subPath.endsWith('/')) {
				subPath += '/';
			}
			const prefix = EID + (subPath ? '/' + subPath : '');
			try {
				const { data, error } = await storage.list(prefix, {
					limit: pageSize,
					offset: 0,
					search: '',
				});
				if (error) {
					console.error("列出文件失败:", error);
					return new Response(JSON.stringify({ code: 500, msg: "列出文件失败" }), {
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					});
				}
				const formattedData = (data || []).map(item => {
					const isDir = item.name.endsWith('/') || !item.id;
					const cleanName = item.name.replace(/\/$/, '');
					if (cleanName === '.emptyFolderPlaceholder') {
						return null;
					}
					return cleanName;
				}).filter(item => item !== null);
				formattedData.sort((a, b) => {
					return parseInt(a) - parseInt(b);
				});
				return new Response(JSON.stringify({
					code: 200,
					data: formattedData,
					page,
					pageSize,
					total: formattedData.length
				}), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			} catch (e) {
				console.error("列出文件异常:", e);
				return new Response(JSON.stringify({ code: 500, msg: "服务器内部错误" }), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}
		return new Response("404 Not Found", { status: 404 });
	},
	async scheduled(event, env, ctx) {
		console.log("定时任务触发:", event.cron);
		try {
			cleanExpiredCache(env);
		} catch (error) {
			console.error("定时任务执行失败:", error);
		}
	},
};

function genUUID() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

function getMIMEType(filename) {
	return mime.getType(filename);
}

async function isFileExists(filePath) {
	try {
		const stat = await fs.stat(path.join(filePath));
		return stat.isFile();
	} catch (e) {
		return false;
	}
}