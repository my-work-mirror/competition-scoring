import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  KeyRound,
  Loader,
  LockKeyhole,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Trophy,
  Upload,
  Users
} from "lucide-react";

import {
  competitionAuth,
  downloadCompetitionResults,
  fetchCompetitionProgress,
  fetchCompetitionState,
  importCompetitionDimensionOne,
  resetCompetitionScores,
  saveCompetitionDimensionOne,
  submitCompetitionScore,
  updateCompetitionSettings
} from "../services/api";
import { clearBoundApiKey, loadBoundApiKey, saveBoundApiKey } from "../services/apiKeyBinding";
import type {
  CompetitionProgressResponse,
  CompetitionState,
  CompetitionTeam
} from "../types";

type AdminTab = "scoring" | "dimension-one" | "progress" | "results";

const SESSION_EXPIRED = "登录状态已过期";

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

function formatTime(seconds: number | null | undefined): string {
  if (!seconds) {
    return "";
  }
  return new Date(seconds * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
}

function KeyGate(props: {
  apiKey: string;
  setApiKey: (value: string) => void;
  loading: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="judge-gate" aria-label="评委登录">
      <div className="judge-gate-copy">
        <span className="judge-eyebrow">君正杯 · AI 提效大赛</span>
        <h1>评委打分</h1>
        <p>用你本人的 API Key 登录即可打分，系统会自动识别你的评委身份。分数仅你本人可见，提交后仍可修改，直到 AI应用部 截止打分。</p>
      </div>
      <form className="judge-gate-form" onSubmit={props.onSubmit}>
        <label htmlFor="judge-api-key">API Key</label>
        <div className="judge-gate-input">
          <KeyRound aria-hidden="true" />
          <input
            id="judge-api-key"
            type="password"
            inputMode="text"
            autoComplete="off"
            placeholder="sk-..."
            value={props.apiKey}
            onChange={(event) => props.setApiKey(event.target.value)}
          />
        </div>
        {props.error ? <p className="alert error">{props.error}</p> : null}
        <button type="submit" disabled={props.loading}>
          {props.loading ? <Loader aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          {props.loading ? "正在验证..." : "进入打分"}
        </button>
      </form>
    </section>
  );
}

function ScoreStepper(props: {
  label: string;
  criteria: string;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const { max, step, value } = props;

  function clamp(next: number) {
    const bounded = Math.min(max, Math.max(0, next));
    return Math.round(bounded / step) * step;
  }

  return (
    <div className="judge-item">
      <div className="judge-item-head">
        <span className="judge-item-name">{props.label}</span>
        <span className="judge-item-max">满分 {formatScore(max)}</span>
      </div>
      {props.criteria ? <p className="judge-item-criteria">{props.criteria}</p> : null}
      <div className="judge-item-control">
        <button
          type="button"
          aria-label={`${props.label} 减 ${step}`}
          onClick={() => props.onChange(clamp(value - step))}
          disabled={value <= 0}
        >
          <Minus aria-hidden="true" />
        </button>
        <output className="judge-item-value">{formatScore(value)}</output>
        <button
          type="button"
          aria-label={`${props.label} 加 ${step}`}
          onClick={() => props.onChange(clamp(value + step))}
          disabled={value >= max}
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
      <input
        className="judge-item-slider"
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        aria-label={`${props.label} 分值`}
        onChange={(event) => props.onChange(clamp(Number(event.target.value)))}
      />
    </div>
  );
}

function ScoreSheet(props: {
  state: CompetitionState;
  team: CompetitionTeam;
  onBack: () => void;
  onSubmit: (items: Record<string, number>, comment: string) => Promise<void>;
  readOnly: boolean;
}) {
  const { state, team } = props;
  const [items, setItems] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    state.items.forEach((item) => {
      initial[item.key] = team.my_score?.items?.[item.key] ?? 0;
    });
    return initial;
  });
  const [comment, setComment] = useState(team.my_score?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const total = useMemo(
    () => state.items.reduce((sum, item) => sum + (items[item.key] ?? 0), 0),
    [items, state.items]
  );

  async function handleSubmit() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await props.onSubmit(items, comment);
      setSaved(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="judge-sheet" aria-label={`${team.name} 打分表`}>
      <header className="judge-sheet-head">
        <button type="button" className="judge-back" onClick={props.onBack}>
          <ChevronLeft aria-hidden="true" />
          返回列表
        </button>
        <div className="judge-sheet-title">
          <span className="judge-sheet-order">第 {team.display_order} 位</span>
          <h2>{team.name}</h2>
          <span className="judge-sheet-label">{team.contest_label}</span>
        </div>
      </header>

      <div className="judge-sheet-items">
        {state.items.map((item) => (
          <ScoreStepper
            key={item.key}
            label={item.name}
            criteria={item.criteria}
            max={item.max}
            step={state.competition.score_step}
            value={items[item.key] ?? 0}
            onChange={(value) => setItems((current) => ({ ...current, [item.key]: value }))}
          />
        ))}
      </div>

      <label className="judge-comment">
        <span>评语（可选）</span>
        <textarea
          rows={3}
          value={comment}
          placeholder="记录亮点或问题，便于会后复盘"
          onChange={(event) => setComment(event.target.value)}
        />
      </label>

      {error ? <p className="alert error">{error}</p> : null}

      <div className="judge-sheet-footer">
        <div className="judge-sheet-total">
          <span>本项小计</span>
          <strong>
            {formatScore(total)}
            <em> / {formatScore(state.competition.dimension_two_max)}</em>
          </strong>
        </div>
        <button type="button" onClick={handleSubmit} disabled={saving || props.readOnly}>
          {saving ? <Loader aria-hidden="true" /> : <Check aria-hidden="true" />}
          {props.readOnly ? "打分已截止" : saving ? "提交中..." : team.my_score ? "更新分数" : "提交分数"}
        </button>
      </div>
      {saved ? <p className="judge-saved">已保存，截止前可随时修改</p> : null}
    </section>
  );
}

function TeamList(props: {
  state: CompetitionState;
  onOpen: (teamId: string) => void;
}) {
  const { state } = props;
  const scored = state.teams.filter((team) => team.my_score).length;

  return (
    <section className="judge-teams" aria-label="参赛部门列表">
      <div className="judge-progress">
        <Users aria-hidden="true" />
        <span>
          已打分 <strong>{scored}</strong> / {state.teams.length} 个部门
        </span>
        {state.settings.scoring_open ? null : <span className="judge-closed">打分已截止</span>}
      </div>
      <ol className="judge-team-list">
        {state.teams.map((team) => (
          <li key={team.id}>
            <button type="button" onClick={() => props.onOpen(team.id)}>
              <span className="judge-team-order">{team.display_order}</span>
              <span className="judge-team-main">
                <span className="judge-team-name">{team.name}</span>
                <span className="judge-team-meta">
                  {team.contest_label} · {state.competition.dimension_one_label}{" "}
                  {formatScore(team.dimension_one)} 分
                </span>
              </span>
              <span className={team.my_score ? "judge-team-score done" : "judge-team-score"}>
                {team.my_score ? formatScore(team.my_score.total) : "未打分"}
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Leaderboard(props: { state: CompetitionState }) {
  const rows = props.state.leaderboard ?? [];
  if (rows.length === 0) {
    return <p className="judge-empty">还没有可展示的成绩。</p>;
  }
  return (
    <section className="judge-results" aria-label="成绩排名">
      <table>
        <thead>
          <tr>
            <th>名次</th>
            <th>参赛部门</th>
            <th>{props.state.competition.dimension_one_label}</th>
            <th>{props.state.competition.dimension_two_label}</th>
            <th>总分</th>
            <th>奖项</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.team_id}>
              <td>{row.rank}</td>
              <td>
                <span className="judge-results-name">{row.name}</span>
                <span className="judge-results-label">{row.contest_label}</span>
              </td>
              <td>{formatScore(row.dimension_one)}</td>
              <td>
                {formatScore(row.dimension_two)}
                <span className="judge-results-note">
                  {row.judge_count} 位评委
                  {row.trimmed ? `，计入 ${row.counted_count} 位` : "，不足以去极值"}
                </span>
              </td>
              <td className="judge-results-total">{formatScore(row.total)}</td>
              <td>{row.award ? <span className="judge-award">{row.award}</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DimensionOneEditor(props: {
  state: CompetitionState;
  onSave: (entries: Array<{ team_id: string; training_count: number; audience_total: number }>) => Promise<void>;
  onImport: (file: File) => Promise<string>;
}) {
  const [drafts, setDrafts] = useState<Record<string, { count: string; audience: string }>>(() => {
    const initial: Record<string, { count: string; audience: string }> = {};
    props.state.teams.forEach((team) => {
      initial[team.id] = {
        count: String(team.dimension_one_detail.training_count ?? 0),
        audience: String(team.dimension_one_detail.audience_total ?? 0)
      };
    });
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSave() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await props.onSave(
        props.state.teams.map((team) => ({
          team_id: team.id,
          training_count: Number(drafts[team.id]?.count ?? 0),
          audience_total: Number(drafts[team.id]?.audience ?? 0)
        }))
      );
      setMessage("已按分段与对数规则重算并保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await props.onImport(file));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="judge-admin-panel" aria-label="维度一录入">
      <header className="judge-admin-head">
        <div>
          <h3>{props.state.competition.dimension_one_label}（{formatScore(props.state.competition.dimension_one_max)} 分）</h3>
          <p>可直接手填培训次数与覆盖人次，保存时按分段计分与对数折算自动重算；也可上传培训统计表批量导入。</p>
        </div>
        <label className="judge-upload">
          <Upload aria-hidden="true" />
          导入 Excel
          <input
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </header>

      {message ? <p className="alert success">{message}</p> : null}
      {error ? <p className="alert error">{error}</p> : null}

      <div className="judge-table-scroll">
        <table className="judge-admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>参赛部门</th>
              <th>培训次数</th>
              <th>覆盖人次</th>
              <th>次数分</th>
              <th>签到分</th>
              <th>小计</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {props.state.teams.map((team) => (
              <tr key={team.id}>
                <td>{team.display_order}</td>
                <td>
                  <span className="judge-results-name">{team.name}</span>
                  <span className="judge-results-label">{team.contest_label}</span>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    aria-label={`${team.name} 培训次数`}
                    value={drafts[team.id]?.count ?? "0"}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [team.id]: { ...current[team.id], count: event.target.value }
                      }))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    aria-label={`${team.name} 覆盖人次`}
                    value={drafts[team.id]?.audience ?? "0"}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [team.id]: { ...current[team.id], audience: event.target.value }
                      }))
                    }
                  />
                </td>
                <td>{formatScore(team.dimension_one_detail.training_score ?? 0)}</td>
                <td>{(team.dimension_one_detail.signin_score ?? 0).toFixed(2)}</td>
                <td className="judge-results-total">{formatScore(team.dimension_one)}</td>
                <td>{team.dimension_one_detail.source || "未录入"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={handleSave} disabled={busy}>
        {busy ? <Loader aria-hidden="true" /> : <Check aria-hidden="true" />}
        保存并重算
      </button>
    </section>
  );
}

function ResetScoresControl(props: {
  submittedCount: number;
  resultsPublished: boolean;
  onReset: () => Promise<number>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleReset() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const cleared = await props.onReset();
      setMessage(`已清空 ${cleared} 条打分记录，维度一得分保留；记录快照已存入审计日志`);
      setConfirming(false);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "清空失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="judge-danger-zone">
      <div className="judge-danger-copy">
        <span>
          <TriangleAlert aria-hidden="true" />
          清空本场打分
        </span>
        <p>
          删除全部 {props.submittedCount} 条评委打分，仅用于正式开赛前清理试打数据。
          {props.resultsPublished ? "结果已公布，需先取消公布才能清空。" : "维度一得分不受影响，快照会写入审计日志。"}
        </p>
      </div>
      {message ? <p className="alert success">{message}</p> : null}
      {error ? <p className="alert error">{error}</p> : null}
      {confirming ? (
        <div className="judge-danger-actions">
          <button type="button" className="danger" onClick={handleReset} disabled={busy}>
            {busy ? <Loader aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
            确认清空 {props.submittedCount} 条
          </button>
          <button type="button" className="secondary" onClick={() => setConfirming(false)}>
            取消
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="danger"
          onClick={() => setConfirming(true)}
          disabled={props.resultsPublished || props.submittedCount === 0}
        >
          <Trash2 aria-hidden="true" />
          清空本场打分
        </button>
      )}
    </div>
  );
}

function ProgressMatrix(props: { progress: CompetitionProgressResponse | null; onRefresh: () => void }) {
  const { progress } = props;
  return (
    <section className="judge-admin-panel" aria-label="打分进度">
      <header className="judge-admin-head">
        <div>
          <h3>现场打分进度</h3>
          <p>共 {progress?.judge_total ?? 0} 位评委，绿色表示该评委已提交该部门的分数。</p>
        </div>
        <button type="button" className="secondary" onClick={props.onRefresh}>
          <RefreshCw aria-hidden="true" />
          刷新
        </button>
      </header>
      {progress ? (
        <div className="judge-table-scroll">
          <table className="judge-admin-table">
            <thead>
              <tr>
                <th>参赛部门</th>
                {progress.matrix[0]?.judges.map((judge) => (
                  <th key={judge.employee_id}>{judge.name}</th>
                ))}
                <th>已提交</th>
              </tr>
            </thead>
            <tbody>
              {progress.matrix.map((row) => (
                <tr key={row.team_id}>
                  <td>
                    <span className="judge-results-name">{row.name}</span>
                    <span className="judge-results-label">{row.contest_label}</span>
                  </td>
                  {row.judges.map((judge) => (
                    <td key={judge.employee_id} className={judge.submitted ? "judge-cell-done" : "judge-cell-pending"}>
                      {judge.submitted ? formatScore(judge.total ?? 0) : "—"}
                      {judge.submitted ? (
                        <span className="judge-cell-time">{formatTime(judge.updated_at)}</span>
                      ) : null}
                    </td>
                  ))}
                  <td className="judge-results-total">
                    {row.submitted_count} / {progress.judge_total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="judge-empty">正在加载进度…</p>
      )}
    </section>
  );
}

export default function CompetitionScoringPage(props: { onNavigate: (path: string) => void }) {
  const initialBinding = useRef(loadBoundApiKey());
  const [apiKey, setApiKey] = useState(initialBinding.current?.apiKey || "");
  const [token, setToken] = useState("");
  const [state, setState] = useState<CompetitionState | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [activeTeamId, setActiveTeamId] = useState("");
  const [adminTab, setAdminTab] = useState<AdminTab>("scoring");
  const [progress, setProgress] = useState<CompetitionProgressResponse | null>(null);
  const [pageError, setPageError] = useState("");
  const keyRef = useRef(apiKey);
  const tokenRef = useRef("");

  keyRef.current = apiKey;
  tokenRef.current = token;

  const authenticate = useCallback(async (key: string) => {
    const normalized = key.trim();
    if (!normalized) {
      setAuthError("请输入 API Key");
      return null;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const result = await competitionAuth(normalized);
      setToken(result.token);
      tokenRef.current = result.token;
      setApiKey(normalized);
      setState(result);
      saveBoundApiKey(normalized);
      return result;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "登录失败");
      return null;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialBinding.current?.apiKey) {
      void authenticate(initialBinding.current.apiKey);
    }
  }, [authenticate]);

  /** 现场一轮汇报要跑几个小时，token 过期后用保存的 Key 静默续期再重试一次。 */
  const withSession = useCallback(
    async <T,>(action: (token: string) => Promise<T>): Promise<T> => {
      try {
        return await action(tokenRef.current);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes(SESSION_EXPIRED) || !keyRef.current) {
          throw error;
        }
        const refreshed = await competitionAuth(keyRef.current);
        setToken(refreshed.token);
        tokenRef.current = refreshed.token;
        setState(refreshed);
        return action(refreshed.token);
      }
    },
    []
  );

  const refreshState = useCallback(async () => {
    try {
      setState(await withSession(fetchCompetitionState));
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "刷新失败");
    }
  }, [withSession]);

  const refreshProgress = useCallback(async () => {
    try {
      setProgress(await withSession(fetchCompetitionProgress));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "读取进度失败");
    }
  }, [withSession]);

  useEffect(() => {
    if (state?.role === "admin" && adminTab === "progress") {
      void refreshProgress();
    }
  }, [adminTab, refreshProgress, state?.role]);

  const activeTeam = useMemo(
    () => state?.teams.find((team) => team.id === activeTeamId) ?? null,
    [activeTeamId, state]
  );

  async function handleSubmitScore(items: Record<string, number>, comment: string) {
    if (!activeTeam) {
      return;
    }
    await withSession((sessionToken) =>
      submitCompetitionScore(sessionToken, activeTeam.id, items, comment)
    );
    await refreshState();
  }

  async function handleToggle(key: "scoring_open" | "results_published", value: boolean) {
    try {
      await withSession((sessionToken) => updateCompetitionSettings(sessionToken, { [key]: value }));
      await refreshState();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "设置失败");
    }
  }

  async function handleExport() {
    try {
      const blob = await withSession(downloadCompetitionResults);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${state?.competition.id ?? "competition"}-results.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "导出失败");
    }
  }

  function handleSignOut() {
    clearBoundApiKey();
    setToken("");
    setState(null);
    setApiKey("");
    setActiveTeamId("");
  }

  if (!state || !token) {
    return (
      <section className="judge-page" aria-label="君正杯评分系统">
        <div className="ai-app-breadcrumb" aria-label="当前位置">
          <a
            href="/apps"
            onClick={(event) => {
              event.preventDefault();
              props.onNavigate("/apps");
            }}
          >
            AI 应用
          </a>
          <span aria-hidden="true">/</span>
          <span>君正杯评分</span>
        </div>
        <KeyGate
          apiKey={apiKey}
          setApiKey={setApiKey}
          loading={authLoading}
          error={authError}
          onSubmit={(event) => {
            event.preventDefault();
            void authenticate(apiKey);
          }}
        />
      </section>
    );
  }

  const isAdmin = state.role === "admin";
  const canSeeResults = isAdmin || state.settings.results_published;
  const readOnly = !state.settings.scoring_open && !isAdmin;

  return (
    <section className="judge-page" aria-label="君正杯评分系统">
      <div className="ai-app-breadcrumb" aria-label="当前位置">
        <a
          href="/apps"
          onClick={(event) => {
            event.preventDefault();
            props.onNavigate("/apps");
          }}
        >
          AI 应用
        </a>
        <span aria-hidden="true">/</span>
        <span>君正杯评分</span>
      </div>

      <header className="judge-header">
        <div>
          <span className="judge-eyebrow">
            <Trophy aria-hidden="true" />
            {state.competition.name}
          </span>
          <h1>{isAdmin ? "评分管理台" : "评委打分"}</h1>
          <p>
            {state.judge.name}
            {isAdmin ? " · 管理员" : " · 评委"} · {state.competition.dimension_two_label}{" "}
            {formatScore(state.competition.dimension_two_max)} 分现场评定
          </p>
        </div>
        <div className="judge-header-actions">
          <button type="button" className="secondary" onClick={() => void refreshState()}>
            <RefreshCw aria-hidden="true" />
            刷新
          </button>
          <button type="button" className="secondary" onClick={handleSignOut}>
            <LockKeyhole aria-hidden="true" />
            退出
          </button>
        </div>
      </header>

      {pageError ? <p className="alert error">{pageError}</p> : null}
      {readOnly ? (
        <p className="alert">打分已截止，如需修改请联系 {state.competition.organizer}。</p>
      ) : null}

      {isAdmin ? (
        <nav className="judge-tabs" aria-label="管理台分区">
          {(
            [
              ["scoring", "打分"],
              ["dimension-one", state.competition.dimension_one_label],
              ["progress", "打分进度"],
              ["results", "排名与导出"]
            ] as Array<[AdminTab, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={adminTab === value ? "active" : ""}
              onClick={() => setAdminTab(value)}
            >
              {label}
            </button>
          ))}
        </nav>
      ) : null}

      {isAdmin && adminTab === "dimension-one" ? (
        <DimensionOneEditor
          state={state}
          onSave={async (entries) => {
            await withSession((sessionToken) => saveCompetitionDimensionOne(sessionToken, entries));
            await refreshState();
          }}
          onImport={async (file) => {
            const result = await withSession((sessionToken) =>
              importCompetitionDimensionOne(sessionToken, file)
            );
            await refreshState();
            const skipped = result.unmatched.length
              ? `；未匹配的行：${result.unmatched.join("、")}`
              : "";
            return `已从「${result.sheet}」导入 ${result.rows.length} 个部门${skipped}`;
          }}
        />
      ) : null}

      {isAdmin && adminTab === "progress" ? (
        <ProgressMatrix progress={progress} onRefresh={() => void refreshProgress()} />
      ) : null}

      {isAdmin && adminTab === "results" ? (
        <section className="judge-admin-panel" aria-label="排名与导出">
          <header className="judge-admin-head">
            <div>
              <h3>总排名</h3>
              <p>
                {state.competition.dimension_two_label}去掉一个最高分和一个最低分后取平均；总分相同的以
                {state.competition.dimension_two_label}高者优先。
              </p>
            </div>
            <div className="judge-header-actions">
              <button type="button" className="secondary" onClick={handleExport}>
                <Download aria-hidden="true" />
                导出 Excel
              </button>
            </div>
          </header>
          <div className="judge-switches">
            <label>
              <input
                type="checkbox"
                checked={state.settings.scoring_open}
                onChange={(event) => void handleToggle("scoring_open", event.target.checked)}
              />
              允许评委打分
            </label>
            <label>
              <input
                type="checkbox"
                checked={state.settings.results_published}
                onChange={(event) => void handleToggle("results_published", event.target.checked)}
              />
              向评委公布结果
            </label>
          </div>
          <Leaderboard state={state} />
          <ul className="judge-awards">
            {state.awards.map((award) => (
              <li key={award.name}>
                <Award aria-hidden="true" />
                {award.name}
                {award.remaining
                  ? " · 其余参赛部门"
                  : ` ${award.count} 名`}
                {award.amount ? ` · ${award.amount}` : ""}
              </li>
            ))}
          </ul>
          <ResetScoresControl
            submittedCount={(state.leaderboard ?? []).reduce(
              (sum, row) => sum + row.judge_count,
              0
            )}
            resultsPublished={state.settings.results_published}
            onReset={async () => {
              const cleared = await withSession(resetCompetitionScores);
              await refreshState();
              return cleared;
            }}
          />
        </section>
      ) : null}

      {(!isAdmin || adminTab === "scoring") &&
        (activeTeam ? (
          <ScoreSheet
            state={state}
            team={activeTeam}
            readOnly={readOnly}
            onBack={() => setActiveTeamId("")}
            onSubmit={handleSubmitScore}
          />
        ) : (
          <>
            <TeamList state={state} onOpen={setActiveTeamId} />
            {!isAdmin && canSeeResults ? <Leaderboard state={state} /> : null}
          </>
        ))}
    </section>
  );
}
