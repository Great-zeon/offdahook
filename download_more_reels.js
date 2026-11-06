const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');

const candidateUrls = [
    { name: 'reel_braids_fresh', url: 'https://www.instagram.com/offdahookhairsalon/reel/DWotOtUERtB/', dest: 'assets/videos/reel7.mp4', poster: 'assets/daimage/reel7_poster.jpg' },
    { name: 'reel_silkpress_smooth', url: 'https://www.instagram.com/offdahookhairsalon/reel/Davwjfkh0bV/', dest: 'assets/videos/reel8.mp4', poster: 'assets/daimage/reel8_poster.jpg' },
    { name: 'reel_loc_artistry', url: 'https://www.instagram.com/offdahookhairsalon/reel/DbHt6sEwgXW/', dest: 'assets/videos/reel9.mp4', poster: 'assets/daimage/reel9_poster.jpg' },
    { name: 'reel_weave_melt', url: 'https://www.instagram.com/offdahookhairsalon/reel/DbWzPbrNHzL/', dest: 'assets/videos/reel10.mp4', poster: 'assets/daimage/reel10_poster.jpg' },
    { name: 'reel_blonding_balayage', url: 'https://www.instagram.com/offdahookhairsalon/reel/Ddh84IgzlOj/', dest: 'assets/videos/reel11.mp4', poster: 'assets/daimage/reel11_poster.jpg' },
    { name: 'reel_curl_definition', url: 'https://www.instagram.com/offdahookhairsalon/reel/DdxMv6nJOcp/', dest: 'assets/videos/reel12.mp4', poster: 'assets/daimage/reel12_poster.jpg' }
];

function download(url, dest) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return download(res.headers.location, dest).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error('Status: ' + res.statusCode));
            }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', reject);
    });
}

async function main() {
    const port = 9777;
    const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        '--headless=new',
        '--disable-gpu',
        `--remote-debugging-port=${port}`,
        '--user-data-dir=/tmp/chrome_ig_fetch_more'
    ]);

    await new Promise(r => setTimeout(r, 2000));

    try {
        const res = await fetch(`http://127.0.0.1:${port}/json`);
        const tabs = await res.json();
        const tab = tabs.find(t => t.type === 'page');
        const ws = new WebSocket(tab.webSocketDebuggerUrl);

        let id = 1;
        const pending = new Map();
        ws.onmessage = (e) => {
            const d = JSON.parse(e.data);
            if (d.id && pending.has(d.id)) {
                pending.get(d.id)(d);
                pending.delete(d.id);
            }
        };

        await new Promise(r => ws.onopen = r);

        function send(method, params = {}) {
            return new Promise(r => {
                const msgId = id++;
                pending.set(msgId, r);
                ws.send(JSON.stringify({ id: msgId, method, params }));
            });
        }

        await send('Network.enable');

        for (const item of candidateUrls) {
            console.log(`Checking ${item.name} (${item.url})...`);
            let streams = [];
            let posters = [];

            const listener = (e) => {
                const d = JSON.parse(e.data);
                if (d.method === 'Network.responseReceived') {
                    const u = d.params?.response?.url || '';
                    const headers = d.params?.response?.headers || {};
                    const mime = d.params?.response?.mimeType || '';
                    const cl = parseInt(headers['content-length'] || headers['Content-Length'] || '0', 10);
                    const byteEndMatch = u.match(/byteend=(\d+)/);
                    const byteEnd = byteEndMatch ? parseInt(byteEndMatch[1], 10) : 0;
                    if (u.includes('.mp4') || mime.includes('video/mp4')) {
                        const clean = u.replace(/&bytestart=\d+&byteend=\d+/g, '');
                        streams.push({ clean, cl, byteEnd, url: u });
                    }
                    if (mime.includes('image/jpeg') && (u.includes('cdninstagram') || u.includes('fbcdn')) && cl > 20000) {
                        posters.push({ url: u, cl });
                    }
                }
            };

            ws.addEventListener('message', listener);
            await send('Page.navigate', { url: item.url });
            await new Promise(r => setTimeout(r, 6000));
            ws.removeEventListener('message', listener);

            streams.sort((a, b) => Math.max(b.byteEnd, b.cl) - Math.max(a.byteEnd, a.cl));
            posters.sort((a, b) => b.cl - a.cl);

            const bestStream = streams[0];
            const bestPoster = posters[0];

            if (bestStream && Math.max(bestStream.byteEnd, bestStream.cl) > 150000) {
                console.log(`Downloading video for ${item.name}...`);
                try {
                    await download(bestStream.clean, item.dest);
                    console.log(`SAVED ${item.dest} (${(fs.statSync(item.dest).size / 1024 / 1024).toFixed(2)} MB)`);
                } catch(e) {
                    console.error('Video dl err:', e.message);
                }
            } else {
                console.log(`No large stream found for ${item.name}`);
            }

            if (bestPoster) {
                console.log(`Downloading poster for ${item.name}...`);
                try {
                    await download(bestPoster.url, item.poster);
                    console.log(`SAVED ${item.poster} (${(fs.statSync(item.poster).size / 1024).toFixed(1)} KB)`);
                } catch(e) {
                    console.error('Poster dl err:', e.message);
                }
            }
        }

        ws.close();
    } finally {
        chrome.kill();
    }
}

main();
