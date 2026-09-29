"""大赛配置加载：参赛部门、评委名册、管理员与计分参数。"""

from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_ITEMS = (
    {"key": "background", "name": "问题背景", "max": 10, "criteria": ""},
    {"key": "solution", "name": "AI解决方案", "max": 15, "criteria": ""},
    {"key": "efficiency", "name": "效率提升数据", "max": 15, "criteria": ""},
    {"key": "scalability", "name": "可推广性", "max": 10, "criteria": ""},
)


class CompetitionConfigError(RuntimeError):
    """配置缺失或结构非法。"""


def normalize_label(value: str) -> str:
    """归一化部门名，消除全角/半角、分隔符与空白差异。

    通知、Excel 与部门树对同一个部门的写法并不一致（IV.SOC部 / IV-SOC部、
    IV. 音视频算法部 / IV.音视频算法部），匹配时统一去掉分隔符再比较。
    """
    text = unicodedata.normalize("NFKC", str(value or "")).strip().lower()
    return "".join(char for char in text if char not in {".", "-", "_", "/", " ", "\u3000"})


@dataclass(frozen=True)
class Team:
    id: str
    display_order: int
    name: str
    contest_label: str
    aliases: tuple[str, ...] = field(default_factory=tuple)
    department_ids: tuple[str, ...] = field(default_factory=tuple)

    def match_keys(self) -> set[str]:
        keys = {normalize_label(self.name), normalize_label(self.contest_label)}
        keys.update(normalize_label(alias) for alias in self.aliases)
        return {key for key in keys if key}


@dataclass(frozen=True)
class Person:
    employee_id: str
    name: str
    email: str
    key_hashes: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ScoringItem:
    key: str
    name: str
    max: float
    criteria: str = ""


@dataclass(frozen=True)
class CompetitionConfig:
    id: str
    name: str
    organizer: str
    dimension_one_label: str
    dimension_two_label: str
    dimension_one_max: float
    training_count_max: float
    signin_max: float
    signin_full_headcount: int
    score_step: float
    trim_high: int
    trim_low: int
    items: tuple[ScoringItem, ...]
    awards: tuple[dict, ...]
    teams: tuple[Team, ...]
    judges: tuple[Person, ...]
    administrators: tuple[Person, ...]

    @property
    def dimension_two_max(self) -> float:
        return sum(item.max for item in self.items)

    def team(self, team_id: str) -> Team | None:
        for team in self.teams:
            if team.id == team_id:
                return team
        return None

    def team_by_label(self, label: str) -> Team | None:
        key = normalize_label(label)
        if not key:
            return None
        for team in self.teams:
            if key in team.match_keys():
                return team
        return None

    def item(self, key: str) -> ScoringItem | None:
        for item in self.items:
            if item.key == key:
                return item
        return None

    def resolve_person(
        self,
        *,
        employee_id: str = "",
        email: str = "",
        key_hash: str = "",
    ) -> tuple[Person, str] | None:
        """返回 (人员, 角色)。角色为 admin 或 judge，管理员优先。

        依次按 employee_id、邮箱、显式登记的 key 哈希匹配。邮箱与 key 哈希是
        key 注册表未绑定 employee_id 时的兜底路径。
        """
        candidates = [("admin", self.administrators), ("judge", self.judges)]
        normalized_email = str(email or "").strip().lower()
        normalized_hash = str(key_hash or "").strip().lower()
        for role, people in candidates:
            for person in people:
                if employee_id and person.employee_id and person.employee_id == employee_id:
                    return person, role
        for role, people in candidates:
            for person in people:
                if normalized_email and person.email and person.email.lower() == normalized_email:
                    return person, role
        for role, people in candidates:
            for person in people:
                if normalized_hash and normalized_hash in person.key_hashes:
                    return person, role
        return None


def _person(payload: dict) -> Person:
    return Person(
        employee_id=str(payload.get("employee_id", "")).strip(),
        name=str(payload.get("name", "")).strip(),
        email=str(payload.get("email", "")).strip(),
        key_hashes=tuple(
            str(value).strip().lower()
            for value in payload.get("key_hashes") or []
            if str(value).strip()
        ),
    )


def load_competition_config(file_path: Path) -> CompetitionConfig:
    if not file_path.exists():
        raise CompetitionConfigError(f"竞赛配置文件不存在：{file_path}")
    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CompetitionConfigError(f"竞赛配置文件不是合法 JSON：{exc}") from exc
    if not isinstance(payload, dict):
        raise CompetitionConfigError("竞赛配置文件根节点必须是对象")

    meta = payload.get("competition") or {}
    scoring = payload.get("scoring") or {}
    raw_items = scoring.get("items") or list(DEFAULT_ITEMS)

    items: list[ScoringItem] = []
    seen_item_keys: set[str] = set()
    for entry in raw_items:
        key = str(entry.get("key", "")).strip()
        if not key:
            raise CompetitionConfigError("评分项缺少 key")
        if key in seen_item_keys:
            raise CompetitionConfigError(f"评分项 key 重复：{key}")
        seen_item_keys.add(key)
        items.append(
            ScoringItem(
                key=key,
                name=str(entry.get("name", key)).strip(),
                max=float(entry.get("max", 0)),
                criteria=str(entry.get("criteria", "")).strip(),
            )
        )
    if not items:
        raise CompetitionConfigError("至少需要配置一个评分项")

    teams: list[Team] = []
    seen_team_ids: set[str] = set()
    seen_match_keys: set[str] = set()
    for index, entry in enumerate(payload.get("teams") or [], start=1):
        team_id = str(entry.get("id", "")).strip()
        name = str(entry.get("name", "")).strip()
        if not team_id or not name:
            raise CompetitionConfigError("参赛部门必须同时配置 id 与 name")
        if team_id in seen_team_ids:
            raise CompetitionConfigError(f"参赛部门 id 重复：{team_id}")
        seen_team_ids.add(team_id)
        team = Team(
            id=team_id,
            display_order=int(entry.get("display_order", index)),
            name=name,
            contest_label=str(entry.get("contest_label", name)).strip(),
            aliases=tuple(
                str(alias).strip() for alias in entry.get("aliases") or [] if str(alias).strip()
            ),
            department_ids=tuple(
                str(value).strip()
                for value in entry.get("department_ids") or []
                if str(value).strip()
            ),
        )
        collisions = team.match_keys() & seen_match_keys
        if collisions:
            raise CompetitionConfigError(f"参赛部门名称或别名重复：{sorted(collisions)}")
        seen_match_keys |= team.match_keys()
        teams.append(team)
    if not teams:
        raise CompetitionConfigError("至少需要配置一个参赛部门")

    judges = tuple(_person(entry) for entry in payload.get("judges") or [])
    administrators = tuple(_person(entry) for entry in payload.get("administrators") or [])
    if not judges:
        raise CompetitionConfigError("至少需要配置一名评委")

    return CompetitionConfig(
        id=str(meta.get("id", "competition")).strip() or "competition",
        name=str(meta.get("name", "AI 提效大赛")).strip(),
        organizer=str(meta.get("organizer", "")).strip(),
        dimension_one_label=str(meta.get("dimension_one_label", "维度一")).strip(),
        dimension_two_label=str(meta.get("dimension_two_label", "维度二")).strip(),
        dimension_one_max=float(scoring.get("dimension_one_max", 50)),
        training_count_max=float(scoring.get("training_count_max", 30)),
        signin_max=float(scoring.get("signin_max", 20)),
        signin_full_headcount=int(scoring.get("signin_full_headcount", 1000)),
        score_step=float(scoring.get("score_step", 0.5)),
        trim_high=int(scoring.get("trim_high", 1)),
        trim_low=int(scoring.get("trim_low", 1)),
        items=tuple(items),
        awards=tuple(payload.get("awards") or []),
        teams=tuple(sorted(teams, key=lambda item: item.display_order)),
        judges=judges,
        administrators=administrators,
    )
