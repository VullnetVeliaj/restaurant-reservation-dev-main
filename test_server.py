#!/usr/bin/env python3
"""
Lightweight development & testing server for Restaurant Reservation Antigravity
Serves static files from /public and provides local mock endpoints for /api
"""

import os
import json
import http.server
import socketserver
import urllib.request
import urllib.parse
from datetime import datetime

PORT = 3000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

# Load .env file
env_vars = {}
env_path = os.path.join(BASE_DIR, '.env')
if os.path.exists(env_path):
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env_vars[k.strip()] = v.strip()

class ReservationServerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            response = {
                "status": "ok",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "service": "restaurant-reservation-api"
            }
            self.wfile.write(json.dumps(response, indent=2).encode('utf-8'))
            return
        
        # Admin / reservations query fallback
        if parsed.path.startswith('/api/reservations') or parsed.path.startswith('/api/admin/reservations'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            response = {
                "success": True,
                "data": []
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/reservations' or parsed.path == '/api/admin/reservations':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
            except Exception:
                data = {}

            import uuid
            new_id = str(uuid.uuid4())
            reservation = {
                "id": new_id,
                "customer_name": data.get("customer_name", "Anonymous"),
                "customer_email": data.get("customer_email"),
                "customer_phone": data.get("customer_phone"),
                "party_size": data.get("party_size", 2),
                "reservation_date": data.get("reservation_date", "2026-08-29"),
                "reservation_time": data.get("reservation_time", "19:00"),
                "special_requests": data.get("special_requests"),
                "status": "PENDING",
                "source": "WEB",
                "created_at": datetime.utcnow().isoformat() + "Z"
            }

            print(f"[Server] New Reservation Received: {reservation['customer_name']} (Party of {reservation['party_size']}) on {reservation['reservation_date']} at {reservation['reservation_time']}")

            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            response = {
                "success": True,
                "message": "Reservation created successfully",
                "data": reservation
            }
            self.wfile.write(json.dumps(response, indent=2).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), ReservationServerHandler) as httpd:
        print(f"[Server] Serving Restaurant Reservation at http://localhost:{PORT}")
        httpd.serve_forever()
