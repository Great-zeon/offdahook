import subprocess
import time
import json
import urllib.request
import urllib.parse
import os
import websocket

candidate_reels = [
    ("reel7", "https://www.instagram.com/offdahookhairsalon/reel/DWotOtUERtB/"),
    ("reel8", "https://www.instagram.com/offdahookhairsalon/reel/Davwjfkh0bV/"),
    ("reel9", "https://www.instagram.com/offdahookhairsalon/reel/DbHt6sEwgXW/"),
    ("reel10", "https://www.instagram.com/offdahookhairsalon/reel/DbWzPbrNHzL/"),
    ("reel11", "https://www.instagram.com/offdahookhairsalon/reel/Ddh84IgzlOj/"),
    ("reel12", "https://www.instagram.com/offdahookhairsalon/reel/DdxMv6nJOcp/")
]

proc = subprocess.Popen([
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9788', '--remote-allow-origins=*',
    '--user-data-dir=/tmp/chrome_ig_harvest'
])

time.sleep(2)

try:
    with urllib.request.urlopen('http://127.0.0.1:9788/json') as resp:
        tabs = json.loads(resp.read().decode())
        page_tab = next(t for t in tabs if t.get('type') == 'page')
        ws_url = page_tab['webSocketDebuggerUrl']

    ws = websocket.create_connection(ws_url)
    msg_id = 1

    def send_cmd(method, params=None):
        global msg_id
        payload = {"id": msg_id, "method": method, "params": params or {}}
        ws.send(json.dumps(payload))
        msg_id += 1

    send_cmd("Network.enable")

    for rname, rurl in candidate_reels:
        print(f"Loading {rname}: {rurl}...")
        send_cmd("Page.navigate", {"url": rurl})
        start_t = time.time()
        streams = []
        posters = []
        
        ws.settimeout(1.0)
        while time.time() - start_t < 7.0:
            try:
                raw = ws.recv()
                d = json.loads(raw)
                if d.get("method") == "Network.responseReceived":
                    resp = d.get("params", {}).get("response", {})
                    u = resp.get("url", "")
                    headers = resp.get("headers", {})
                    cl = int(headers.get("content-length") or headers.get("Content-Length") or 0)
                    if ".mp4" in u:
                        clean_u = re_sub = u.split("&bytestart=")[0] if "&bytestart=" in u else u
                        streams.append((cl, clean_u))
                    if ("cdninstagram" in u or "fbcdn" in u) and resp.get("mimeType", "").startswith("image/jpeg") and cl > 20000:
                        posters.append((cl, u))
            except websocket.WebSocketTimeoutException:
                pass
            except Exception as e:
                break

        print(f"{rname} captured {len(streams)} video streams, {len(posters)} posters")
        if streams:
            streams.sort(key=lambda x: x[0], reverse=True)
            best_stream_url = streams[0][1]
            dest_mp4 = f"assets/videos/{rname}.mp4"
            print(f"Downloading {rname}.mp4 ({streams[0][0]} bytes)...")
            try:
                req = urllib.request.Request(best_stream_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as vresp, open(dest_mp4, 'wb') as out_f:
                    out_f.write(vresp.read())
                print(f"SAVED {dest_mp4} ({os.path.getsize(dest_mp4)} bytes)")
            except Exception as e:
                print(f"Error downloading {rname}:", e)
        
        if posters:
            posters.sort(key=lambda x: x[0], reverse=True)
            best_poster_url = posters[0][1]
            dest_jpg = f"assets/daimage/{rname}_poster.jpg"
            try:
                req = urllib.request.Request(best_poster_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as presp, open(dest_jpg, 'wb') as out_f:
                    out_f.write(presp.read())
                print(f"SAVED {dest_jpg} ({os.path.getsize(dest_jpg)} bytes)")
            except Exception as e:
                print(f"Error downloading poster for {rname}:", e)

finally:
    try:
        ws.close()
    except Exception:
        pass
    proc.terminate()
