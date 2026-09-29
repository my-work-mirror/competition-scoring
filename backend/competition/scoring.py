"""大赛计分规则，纯函数实现，不依赖存储与请求上下文。

维度一（AI提效培训 50 分）由培训次数分段计分与签到人次对数折算组成；
维度二（AI提效案例 50 分）由评委现场打分去掉一个最高分与一个最低分后取平均。
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# 培训次数分段：第 1—2 次每次 5 分，第 3—5 次每次 3 分，
# 第 6—10 次每次 2 分，第 11 次起每次 1 分。
COUNT_TIERS = ((2, 5), (5, 3), (10, 2))
COUNT_TAIL_SCORE = 1


def round_half_up(value: float, digits: int = 2) -> float:
    """四舍五入到指定小数位，避免浮点 banker's rounding 造成的分数争议。"""
    if value != value or value in (float("inf"), float("-inf")):
        raise ValueError("value must be a finite number")
    factor = 10**digits
    return math.floor(abs(value) * factor + 0.5) / factor * (1 if value >= 0 else -1)


def training_count_score(times: int, maximum: float = 30) -> float:
    """按累计培训次数分段计分，上限 maximum。"""
    times = max(0, int(times))
    total = 0.0
    previous_bound = 0
    for bound, per_time in COUNT_TIERS:
        if times <= previous_bound:
            break
        total += (min(times, bound) - previous_bound) * per_time
        previous_bound = bound
    if times > previous_bound:
        total += (times - previous_bound) * COUNT_TAIL_SCORE
    return round_half_up(min(total, maximum))


def signin_score(headcount: int, maximum: float = 20, full_headcount: int = 1000) -> float:
    """签到人次对数折算：maximum * ln(人次) / ln(full_headcount)，满分封顶。"""
    headcount = max(0, int(headcount))
    if headcount <= 0:
        return 0.0
    if full_headcount <= 1:
        raise ValueError("full_headcount must be greater than 1")
    ratio = math.log(headcount) / math.log(full_headcount)
    return round_half_up(min(maximum, maximum * ratio), 6)


@dataclass(frozen=True)
class DimensionOne:
    training_count: int
    training_score: float
    audience_total: int
    signin_score: float
    total: float
    manual: bool = False


def dimension_one(
    training_count: int,
    audience_total: int,
    *,
    training_max: float = 30,
    signin_max: float = 20,
    full_headcount: int = 1000,
) -> DimensionOne:
    """由培训次数与累计签到人次推导维度一得分。"""
    count_score = training_count_score(training_count, training_max)
    audience_score = signin_score(audience_total, signin_max, full_headcount)
    return DimensionOne(
        training_count=max(0, int(training_count)),
        training_score=count_score,
        audience_total=max(0, int(audience_total)),
        signin_score=audience_score,
        total=round_half_up(count_score + audience_score),
    )


@dataclass(frozen=True)
class TrimmedResult:
    total: float
    judge_count: int
    counted_count: int
    dropped_high: float | None
    dropped_low: float | None
    trimmed: bool


def trimmed_average(
    totals: list[float],
    *,
    trim_high: int = 1,
    trim_low: int = 1,
) -> TrimmedResult:
    """去掉一个最高分和一个最低分后取平均。

    评委数不足以支撑去极值（去极值后无人剩余）时退化为全体平均，并把
    trimmed 置为 False，供结果页标注说明。
    """
    values = sorted(float(value) for value in totals)
    if not values:
        return TrimmedResult(0.0, 0, 0, None, None, False)

    if len(values) > trim_high + trim_low:
        counted = values[trim_low : len(values) - trim_high]
        return TrimmedResult(
            total=round_half_up(sum(counted) / len(counted)),
            judge_count=len(values),
            counted_count=len(counted),
            dropped_high=values[-1],
            dropped_low=values[0],
            trimmed=True,
        )

    return TrimmedResult(
        total=round_half_up(sum(values) / len(values)),
        judge_count=len(values),
        counted_count=len(values),
        dropped_high=None,
        dropped_low=None,
        trimmed=False,
    )


def award_for_rank(rank: int, awards: list[dict]) -> str:
    """按名额顺序划分奖项。

    带 ``remaining: true`` 的奖项覆盖超出前述名额的所有名次（如鼓励奖）。
    未配置 remaining 且超出名额时返回空字符串。
    """
    cursor = 0
    for award in awards:
        if award.get("remaining"):
            return str(award.get("name", "")) if rank > cursor else ""
        count = int(award.get("count", 0))
        if cursor < rank <= cursor + count:
            return str(award.get("name", ""))
        cursor += count
    return ""


def rank_teams(rows: list[dict], awards: list[dict] | None = None) -> list[dict]:
    """按总分排名，总分相同的以维度二得分高者优先。

    每行需含 team_id、dimension_one、dimension_two；同分同名次，名次按并列后跳号。
    """
    ordered = sorted(
        rows,
        key=lambda row: (
            -round_half_up(row["dimension_one"] + row["dimension_two"]),
            -row["dimension_two"],
            row.get("display_order", 0),
        ),
    )
    awards = awards or []
    ranked: list[dict] = []
    previous_key: tuple[float, float] | None = None
    previous_rank = 0
    for index, row in enumerate(ordered, start=1):
        total = round_half_up(row["dimension_one"] + row["dimension_two"])
        key = (total, row["dimension_two"])
        rank = previous_rank if key == previous_key else index
        previous_key, previous_rank = key, rank
        ranked.append({**row, "total": total, "rank": rank, "award": award_for_rank(rank, awards)})
    return ranked
