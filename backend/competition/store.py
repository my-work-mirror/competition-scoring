"""大赛评分存储：维度一录入、评委打分、审计日志与现场开关。"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path

from backend.database import connect_database

SCHEMA = """
CREATE TABLE IF NOT EXISTS team_dimension_one (
    competition_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    training_count INTEGER NOT NULL DEFAULT 0,
    training_score REAL NOT NULL DEFAULT 0,
    audience_total INTEGER NOT NULL DEFAULT 0,
    signin_score REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    note TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (competition_id, team_id)
);

CREATE TABLE IF NOT EXISTS judge_scores (
    competition_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    judge_employee_id TEXT NOT NULL,
    judge_name TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL DEFAULT '{}',
    total REAL NOT NULL DEFAULT 0,
    comment TEXT NOT NULL DEFAULT '',
    submitted_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (competition_id, team_id, judge_employee_id)
);

CREATE TABLE IF NOT EXISTS score_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    actor_employee_id TEXT NOT NULL,
    actor_name TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    before_value TEXT NOT NULL DEFAULT '',
    after_value TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_score_audit_team
    ON score_audit (competition_id, team_id, created_at);

CREATE TABLE IF NOT EXISTS competition_settings (
    competition_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (competition_id, key)
);
"""

DEFAULT_SETTINGS = {
    "scoring_open": "1",
    "results_published": "0",
}


class CompetitionStore:
    def __init__(self, db_file: Path) -> None:
        self.db_file = Path(db_file)
        self.db_file.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA)
        try:
            os.chmod(self.db_file, 0o600)
        except OSError:
            pass

    def _connect(self) -> sqlite3.Connection:
        connection = connect_database(self.db_file, "competition", timeout=10)
        connection.row_factory = sqlite3.Row
        return connection

    # ---------- 现场开关 ----------

    def settings(self, competition_id: str) -> dict[str, str]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT key, value FROM competition_settings WHERE competition_id = ?",
                (competition_id,),
            ).fetchall()
        resolved = dict(DEFAULT_SETTINGS)
        resolved.update({row["key"]: row["value"] for row in rows})
        return resolved

    def set_setting(
        self,
        competition_id: str,
        key: str,
        value: str,
        *,
        actor_employee_id: str = "",
        actor_name: str = "",
    ) -> dict[str, str]:
        now = int(time.time())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO competition_settings
                    (competition_id, key, value, updated_by, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (competition_id, key) DO UPDATE SET
                    value = excluded.value,
                    updated_by = excluded.updated_by,
                    updated_at = excluded.updated_at
                """,
                (competition_id, key, value, actor_employee_id, now),
            )
            conn.execute(
                """
                INSERT INTO score_audit
                    (competition_id, team_id, actor_employee_id, actor_name,
                     action, before_value, after_value, created_at)
                VALUES (?, '', ?, ?, ?, '', ?, ?)
                """,
                (competition_id, actor_employee_id, actor_name, f"setting:{key}", value, now),
            )
        return self.settings(competition_id)

    # ---------- 维度一 ----------

    def dimension_one_rows(self, competition_id: str) -> dict[str, dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM team_dimension_one WHERE competition_id = ?",
                (competition_id,),
            ).fetchall()
        return {row["team_id"]: dict(row) for row in rows}

    def put_dimension_one(
        self,
        competition_id: str,
        team_id: str,
        payload: dict,
        *,
        actor_employee_id: str = "",
        actor_name: str = "",
    ) -> dict:
        now = int(time.time())
        with self._connect() as conn:
            previous = conn.execute(
                """
                SELECT * FROM team_dimension_one
                WHERE competition_id = ? AND team_id = ?
                """,
                (competition_id, team_id),
            ).fetchone()
            conn.execute(
                """
                INSERT INTO team_dimension_one
                    (competition_id, team_id, training_count, training_score,
                     audience_total, signin_score, total, source, note,
                     updated_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (competition_id, team_id) DO UPDATE SET
                    training_count = excluded.training_count,
                    training_score = excluded.training_score,
                    audience_total = excluded.audience_total,
                    signin_score = excluded.signin_score,
                    total = excluded.total,
                    source = excluded.source,
                    note = excluded.note,
                    updated_by = excluded.updated_by,
                    updated_at = excluded.updated_at
                """,
                (
                    competition_id,
                    team_id,
                    int(payload.get("training_count", 0)),
                    float(payload.get("training_score", 0)),
                    int(payload.get("audience_total", 0)),
                    float(payload.get("signin_score", 0)),
                    float(payload.get("total", 0)),
                    str(payload.get("source", "manual")),
                    str(payload.get("note", "")),
                    actor_employee_id,
                    now,
                ),
            )
            conn.execute(
                """
                INSERT INTO score_audit
                    (competition_id, team_id, actor_employee_id, actor_name,
                     action, before_value, after_value, created_at)
                VALUES (?, ?, ?, ?, 'dimension_one', ?, ?, ?)
                """,
                (
                    competition_id,
                    team_id,
                    actor_employee_id,
                    actor_name,
                    json.dumps(dict(previous), ensure_ascii=False) if previous else "",
                    json.dumps(payload, ensure_ascii=False),
                    now,
                ),
            )
            row = conn.execute(
                """
                SELECT * FROM team_dimension_one
                WHERE competition_id = ? AND team_id = ?
                """,
                (competition_id, team_id),
            ).fetchone()
        return dict(row)

    # ---------- 维度二 ----------

    def judge_score(
        self, competition_id: str, team_id: str, judge_employee_id: str
    ) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM judge_scores
                WHERE competition_id = ? AND team_id = ? AND judge_employee_id = ?
                """,
                (competition_id, team_id, judge_employee_id),
            ).fetchone()
        return self._score_row(row) if row else None

    def judge_scores_for_judge(self, competition_id: str, judge_employee_id: str) -> dict[str, dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM judge_scores
                WHERE competition_id = ? AND judge_employee_id = ?
                """,
                (competition_id, judge_employee_id),
            ).fetchall()
        return {row["team_id"]: self._score_row(row) for row in rows}

    def all_judge_scores(self, competition_id: str) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM judge_scores
                WHERE competition_id = ?
                ORDER BY team_id, judge_employee_id
                """,
                (competition_id,),
            ).fetchall()
        return [self._score_row(row) for row in rows]

    def put_judge_score(
        self,
        competition_id: str,
        team_id: str,
        judge_employee_id: str,
        judge_name: str,
        items: dict[str, float],
        total: float,
        comment: str,
    ) -> dict:
        now = int(time.time())
        serialized = json.dumps(items, ensure_ascii=False, sort_keys=True)
        with self._connect() as conn:
            previous = conn.execute(
                """
                SELECT items, total, comment, submitted_at, revision FROM judge_scores
                WHERE competition_id = ? AND team_id = ? AND judge_employee_id = ?
                """,
                (competition_id, team_id, judge_employee_id),
            ).fetchone()
            submitted_at = previous["submitted_at"] if previous else now
            revision = (previous["revision"] + 1) if previous else 1
            conn.execute(
                """
                INSERT INTO judge_scores
                    (competition_id, team_id, judge_employee_id, judge_name, items,
                     total, comment, submitted_at, updated_at, revision)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (competition_id, team_id, judge_employee_id) DO UPDATE SET
                    judge_name = excluded.judge_name,
                    items = excluded.items,
                    total = excluded.total,
                    comment = excluded.comment,
                    updated_at = excluded.updated_at,
                    revision = excluded.revision
                """,
                (
                    competition_id,
                    team_id,
                    judge_employee_id,
                    judge_name,
                    serialized,
                    float(total),
                    comment,
                    submitted_at,
                    now,
                    revision,
                ),
            )
            conn.execute(
                """
                INSERT INTO score_audit
                    (competition_id, team_id, actor_employee_id, actor_name,
                     action, before_value, after_value, created_at)
                VALUES (?, ?, ?, ?, 'judge_score', ?, ?, ?)
                """,
                (
                    competition_id,
                    team_id,
                    judge_employee_id,
                    judge_name,
                    json.dumps(
                        {
                            "items": json.loads(previous["items"]) if previous else None,
                            "total": previous["total"] if previous else None,
                            "comment": previous["comment"] if previous else None,
                        },
                        ensure_ascii=False,
                    )
                    if previous
                    else "",
                    json.dumps(
                        {"items": items, "total": float(total), "comment": comment},
                        ensure_ascii=False,
                    ),
                    now,
                ),
            )
            row = conn.execute(
                """
                SELECT * FROM judge_scores
                WHERE competition_id = ? AND team_id = ? AND judge_employee_id = ?
                """,
                (competition_id, team_id, judge_employee_id),
            ).fetchone()
        return self._score_row(row)

    def clear_judge_scores(
        self,
        competition_id: str,
        *,
        actor_employee_id: str = "",
        actor_name: str = "",
    ) -> int:
        """清空本场所有评委打分，删除前把完整快照写入审计表以便追回。

        维度一得分不受影响。
        """
        now = int(time.time())
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM judge_scores WHERE competition_id = ?",
                (competition_id,),
            ).fetchall()
            if not rows:
                return 0
            snapshot = [self._score_row(row) for row in rows]
            conn.execute(
                "DELETE FROM judge_scores WHERE competition_id = ?",
                (competition_id,),
            )
            conn.execute(
                """
                INSERT INTO score_audit
                    (competition_id, team_id, actor_employee_id, actor_name,
                     action, before_value, after_value, created_at)
                VALUES (?, '', ?, ?, 'reset_scores', ?, '', ?)
                """,
                (
                    competition_id,
                    actor_employee_id,
                    actor_name,
                    json.dumps(snapshot, ensure_ascii=False),
                    now,
                ),
            )
        return len(rows)

    def audit_trail(self, competition_id: str, limit: int = 200) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM score_audit WHERE competition_id = ?
                ORDER BY id DESC LIMIT ?
                """,
                (competition_id, max(1, min(int(limit), 1000))),
            ).fetchall()
        return [dict(row) for row in rows]

    @staticmethod
    def _score_row(row: sqlite3.Row) -> dict:
        payload = dict(row)
        try:
            payload["items"] = json.loads(payload.get("items") or "{}")
        except json.JSONDecodeError:
            payload["items"] = {}
        return payload
