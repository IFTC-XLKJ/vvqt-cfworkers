/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

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
			const [client, server] = webSocketPair;
			const EID = pathnames[2];
			return new Response(null, {
				status: 101,
				webSocket: client,
			});
		}
	},
};
