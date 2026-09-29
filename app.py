"""Standalone competition application. Production settings are platform-owned."""
from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.error import URLError
from urllib.request import ProxyHandler, Request, build_opener

from flask import Flask, jsonify, send_from_directory

from backend.competition.api import create_competition_blueprint
from backend.database import connect_database

ROOT = Path(__file__).resolve().parent
BASE = "/apps/competition-scoring"
CONFIG = Path(os.getenv("COMPETITION_CONFIG_FILE", "/app-config/competition.json"))
TOKEN_SECRET = os.getenv("COMPETITION_TOKEN_SECRET", "")
BRIDGE_URL = os.getenv("COMPETITION_IDENTITY_URL", "")
BRIDGE_TOKEN = os.getenv("COMPETITION_IDENTITY_BRIDGE_TOKEN", "")
if not TOKEN_SECRET or not BRIDGE_URL or not BRIDGE_TOKEN:
    raise RuntimeError("平台须配置比赛令牌密钥和受限身份服务")


def identity(key_hash: str) -> dict | None:
    request = Request(BRIDGE_URL, data=json.dumps({"key_hash": key_hash}).encode(),
                      headers={"Content-Type": "application/json", "Authorization": "Bearer " + BRIDGE_TOKEN})
    try:
        with build_opener(ProxyHandler({})).open(request, timeout=5) as response:
            return json.load(response)["identity"]
    except (URLError, OSError, ValueError, KeyError):
        raise RuntimeError("身份服务不可用") from None


app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024
app.register_blueprint(create_competition_blueprint(
    config_file=CONFIG, db_file=Path("/app-data/competition"),
    resolve_identity=identity, token_secret=TOKEN_SECRET,
))


@app.get("/health")
def health():
    try:
        with connect_database(None, "competition") as connection:
            connection.execute("SELECT 1").fetchone()
        return jsonify({"status": "ok"})
    except Exception:
        return jsonify({"status": "unavailable"}), 503


@app.get(BASE)
@app.get(BASE + "/")
def index():
    return send_from_directory(ROOT / "frontend/dist", "index.html")


@app.get(BASE + "/assets/<path:filename>")
def assets(filename):
    return send_from_directory(ROOT / "frontend/dist/assets", filename)
