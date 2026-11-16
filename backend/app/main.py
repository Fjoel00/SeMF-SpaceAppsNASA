#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SeMF 2.0 — Servidor Principal de Aplicaciones (FastAPI / HTTP Server Unificado)
===============================================================================
Si FastAPI y Uvicorn están presentes (contenedor Docker o venv), levanta el
servidor ASGI con soporte completo OpenAPI. Si se ejecuta directamente en el
entorno Python base local, levanta el servidor HTTP multihilo sirviendo
exactamente los mismos endpoints REST /api/v1/* y el frontend estático en el
puerto configurado (8000 en contenedor / 8090 en ejecución local unificada).
"""

import json
import mimetypes
import os
import sys
import warnings
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Any

# Suprimir avisos de diferencia menor de versión scikit-learn entre host y contenedor
try:
    from sklearn.exceptions import InconsistentVersionWarning
    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
except ImportError:
    pass

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.app.api.v1.router import build_openapi_spec, dispatch_api_request
from backend.app.core.config import settings

FRONTEND_DIST = os.path.join(ROOT_DIR, "frontend", "dist")


def create_fastapi_app():
    try:
        from fastapi import FastAPI, Request
        from fastapi.middleware.cors import CORSMiddleware
        from fastapi.responses import JSONResponse

        app = FastAPI(
            title=settings.app_name,
            version=settings.app_version,
        )
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        @app.api_route("/health", methods=["GET"])
        @app.api_route("/api/health", methods=["GET"])
        async def health_gateway(request: Request):
            status, payload = dispatch_api_request("GET", "/api/v1/health", {})
            return JSONResponse(status_code=status, content=payload)

        @app.api_route("/api/v1/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
        async def api_gateway(request: Request, rest_of_path: str):
            body: Dict[str, Any] = {}
            if request.method in ("POST", "PUT"):
                try:
                    body = await request.json()
                except Exception:
                    body = {}
            full_path = f"/api/v1/{rest_of_path}"
            if request.url.query:
                full_path = f"{full_path}?{request.url.query}"
            status, payload = dispatch_api_request(request.method, full_path, body)
            return JSONResponse(status_code=status, content=payload)

        return app
    except ImportError:
        return None


app = create_fastapi_app()


class UnifiedSeMFRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        return

    def _send_json(self, status: int, payload: Dict[str, Any]):
        raw = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/v1") or self.path == "/openapi.json":
            status, payload = dispatch_api_request("GET", self.path, {})
            self._send_json(status, payload)
            return

        # Servir archivos del Frontend SPA desde frontend/dist
        clean_path = self.path.split("?")[0].lstrip("/")
        if not clean_path:
            clean_path = "index.html"
        candidate = os.path.join(FRONTEND_DIST, clean_path)
        if not os.path.isfile(candidate):
            candidate = os.path.join(FRONTEND_DIST, "index.html")

        if os.path.isfile(candidate):
            ctype, _ = mimetypes.guess_type(candidate)
            with open(candidate, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype or "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self._send_json(200, build_openapi_spec())

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": "JSON inválido"})
            return
        status, payload = dispatch_api_request("POST", self.path, body)
        self._send_json(status, payload)

    def do_PUT(self):
        self.do_POST()


def run_server(port: int = settings.port):
    if app is not None:
        try:
            import uvicorn
            uvicorn.run(app, host=settings.host, port=port)
            return
        except ImportError:
            pass

    server = ThreadingHTTPServer((settings.host, port), UnifiedSeMFRequestHandler)
    print(f"🚀 SeMF 2.0 Server activo en http://localhost:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    target_port = int(sys.argv[1]) if len(sys.argv) > 1 else settings.port
    run_server(target_port)
