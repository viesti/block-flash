#!/usr/bin/env python3
"""Dead simple one-off file upload receiver.

Run it here, then from the other computer either open the printed URL in a
browser and pick a file, or:

    curl -F file=@somefile.txt http://<this-host>:8000/

Uploads land in --dir (default: ./uploads). No auth, no TLS: only use it on a
network you trust, and Ctrl-C when you're done.
"""

import argparse
import email
import html
import re
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

FORM = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upload</title>
<style>
body {{ font: 16px/1.5 system-ui, sans-serif; margin: 3rem auto; max-width: 30rem; padding: 0 1rem; }}
input, button {{ font: inherit; }}
button {{ margin-top: 1rem; padding: .5rem 1rem; }}
p.msg {{ background: #eef; padding: .75rem; border-radius: 4px; }}
</style></head>
<body>
<h1>Upload a file</h1>
{msg}
<form method="post" enctype="multipart/form-data">
  <input type="file" name="file" required>
  <button type="submit">Send</button>
</form>
</body></html>
"""


def safe_name(name, dest):
    """Basename-only, boring characters, never overwrites an existing file."""
    name = Path(name.replace("\\", "/")).name
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name).lstrip(".") or "upload"
    target = dest / name
    stem, suffix, n = target.stem, target.suffix, 1
    while target.exists():
        target = dest / f"{stem}-{n}{suffix}"
        n += 1
    return target


class Handler(BaseHTTPRequestHandler):
    server_version = "upload/1.0"

    def reply(self, code, msg=""):
        body = FORM.format(msg=f'<p class="msg">{html.escape(msg)}</p>' if msg else "")
        body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.reply(200)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return self.reply(400, "Empty request.")
        if length > self.server.max_bytes:
            return self.reply(413, f"Too big (limit {self.server.max_bytes} bytes).")

        # Re-parse the body as a MIME message so we don't hand-roll multipart.
        raw = b"Content-Type: " + self.headers["Content-Type"].encode() + b"\r\n\r\n"
        raw += self.rfile.read(length)
        msg = email.message_from_bytes(raw)
        if not msg.is_multipart():
            return self.reply(400, "Expected multipart/form-data.")

        saved = []
        for part in msg.walk():
            filename = part.get_filename()
            if not filename:
                continue
            data = part.get_payload(decode=True) or b""
            target = safe_name(filename, self.server.dest)
            target.write_bytes(data)
            saved.append((target, len(data)))

        if not saved:
            return self.reply(400, "No file in the request.")

        for target, size in saved:
            print(f"saved {target} ({size} bytes)", flush=True)
        self.reply(200, "Got: " + ", ".join(t.name for t, _ in saved))

        if self.server.once:
            print("--once given, shutting down.", flush=True)
            import threading
            threading.Thread(target=self.server.shutdown, daemon=True).start()

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}", flush=True)


def lan_ip():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("8.8.8.8", 80))  # no packets sent, just picks a route
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("-p", "--port", type=int, default=8000)
    ap.add_argument("-d", "--dir", default="uploads", help="where to save (default: uploads)")
    ap.add_argument("--max-mb", type=int, default=512, help="reject bigger uploads (default: 512)")
    ap.add_argument("--once", action="store_true", help="exit after the first upload")
    args = ap.parse_args()

    dest = Path(args.dir).expanduser().resolve()
    dest.mkdir(parents=True, exist_ok=True)

    httpd = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    httpd.dest = dest
    httpd.once = args.once
    httpd.max_bytes = args.max_mb * 1024 * 1024

    url = f"http://{lan_ip()}:{args.port}/"
    print(f"saving to {dest}")
    print(f"open {url} on the other computer, or:")
    print(f"  curl -F file=@yourfile {url}")
    print("Ctrl-C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
