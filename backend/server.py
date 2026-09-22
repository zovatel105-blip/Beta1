"""
Thin reverse-proxy backend.

This project's real application is a Next.js app living at /app (root),
which implements its own API routes under /api/[[...path]] and runs on
port 3000 (supervisor program "nextjs"). The platform's Kubernetes ingress
routes all `/api/*` traffic to this service (port 8001) by convention, so
this tiny FastAPI app simply forwards every request it receives straight
through to the Next.js server on localhost:3000, preserving method, path,
query string, headers, and body (including streaming responses).

Do not put real business logic here - it belongs in the Next.js app.
"""
import os
import asyncio
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask

NEXT_TARGET = os.environ.get("NEXT_INTERNAL_URL", "http://127.0.0.1:3000")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = httpx.AsyncClient(base_url=NEXT_TARGET, timeout=120.0)

HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-length",
    "content-encoding",
}


async def _proxy(request: Request, full_path: str):
    url = httpx.URL(path=f"/api/{full_path}", query=request.url.query.encode("utf-8"))
    body = await request.body()
    headers = [
        (k, v) for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length")
    ]
    req = client.build_request(
        request.method, url, headers=headers, content=body,
    )
    # El servidor Next.js "nextjs" (dev mode) se reinicia solo de vez en
    # cuando por su propio watchdog de memoria (ver
    # start-server.js: "approaching the used memory threshold") — un
    # reintento corto absorbe esa ventana de reinicio en vez de devolver un
    # 502/500 al usuario por una petición que llegó justo en ese instante.
    last_exc = None
    for attempt in range(3):
        try:
            upstream = await client.send(req, stream=True)
            break
        except (httpx.ConnectError, httpx.RemoteProtocolError, httpx.ReadError) as exc:
            last_exc = exc
            await asyncio.sleep(0.5 * (attempt + 1))
    else:
        raise last_exc

    response_headers = [
        (k, v) for k, v in upstream.headers.items() if k.lower() not in HOP_BY_HOP
    ]

    return Response(
        content=await upstream.aread(),
        status_code=upstream.status_code,
        headers=dict(response_headers),
        background=BackgroundTask(upstream.aclose),
    )


@app.api_route("/api/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def proxy_api(request: Request, full_path: str):
    return await _proxy(request, full_path)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "proxy_target": NEXT_TARGET}
