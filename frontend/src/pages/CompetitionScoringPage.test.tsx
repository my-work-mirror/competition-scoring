import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CompetitionScoringPage from "./CompetitionScoringPage";
import type { CompetitionState } from "../types";

const apiMocks = vi.hoisted(() => ({
  competitionAuth: vi.fn(),
  downloadCompetitionResults: vi.fn(),
  fetchCompetitionProgress: vi.fn(),
  fetchCompetitionState: vi.fn(),
  importCompetitionDimensionOne: vi.fn(),
  resetCompetitionScores: vi.fn(),
  saveCompetitionDimensionOne: vi.fn(),
  submitCompetitionScore: vi.fn(),
  updateCompetitionSettings: vi.fn()
}));

vi.mock("../services/api", () => apiMocks);

const items = [
  { key: "background", name: "问题背景", max: 10, criteria: "业务痛点真实清晰" },
  { key: "solution", name: "AI解决方案", max: 15, criteria: "方案设计合理" },
  { key: "efficiency", name: "效率提升数据", max: 15, criteria: "有前后对比的量化数据" },
  { key: "scalability", name: "可推广性", max: 10, criteria: "经验可复制" }
];

function team(order: number, id: string, name: string, label: string, myTotal?: number) {
  return {
    id,
    display_order: order,
    name,
    contest_label: label,
    department_ids: [],
    dimension_one: 32.71,
    dimension_one_detail: {
      training_count: 6,
      training_score: 21,
      audience_total: 57,
      signin_score: 11.7058,
      source: "excel",
      note: ""
    },
    my_score:
      myTotal === undefined
        ? null
        : {
            team_id: id,
            judge_employee_id: "test-judge",
            judge_name: "测试评委",
            items: { background: 8, solution: 12, efficiency: 12, scalability: 8 },
            total: myTotal,
            comment: "已看过",
            submitted_at: 1,
            updated_at: 2,
            revision: 1
          }
  };
}

function judgeState(overrides: Partial<CompetitionState> = {}): CompetitionState {
  return {
    role: "judge",
    judge: { employee_id: "test-judge", name: "测试评委" },
    competition: {
      id: "junzheng-cup-2026",
      name: "君正杯 AI 提效大赛",
      organizer: "AI应用部",
      dimension_one_label: "AI提效培训",
      dimension_two_label: "AI提效案例",
      dimension_one_max: 50,
      dimension_two_max: 50,
      score_step: 0.5,
      trim_high: 1,
      trim_low: 1
    },
    items,
    awards: [{ name: "一等奖", count: 1, amount: "3万元" }],
    settings: { scoring_open: true, results_published: false },
    teams: [
      team(1, "team-ipt", "合肥IP技术部", "IV.IPT"),
      team(2, "team-soc", "SOC部", "IV.SOC部", 40)
    ],
    judges: [{ employee_id: "test-judge", name: "测试评委" }],
    ...overrides
  };
}

function authResponse(state: CompetitionState) {
  return { token: "judge-token", expires_at: 999, ...state };
}

describe("CompetitionScoringPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.competitionAuth.mockResolvedValue(authResponse(judgeState()));
    apiMocks.fetchCompetitionState.mockResolvedValue(judgeState());
  });

  afterEach(() => {
    cleanup();
  });

  it("asks for the API key before showing any team", () => {
    render(<CompetitionScoringPage onNavigate={vi.fn()} />);

    expect(screen.getByLabelText("评委登录")).toBeTruthy();
    expect(screen.queryByLabelText("参赛部门列表")).toBeNull();
  });

  it("logs in and lists the teams in presentation order with scoring status", async () => {
    render(<CompetitionScoringPage onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-judge" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));

    await waitFor(() => expect(screen.getByLabelText("参赛部门列表")).toBeTruthy());
    expect(apiMocks.competitionAuth).toHaveBeenCalledWith("sk-judge");

    const buttons = screen.getAllByRole("button", { name: /IV\./ });
    expect(buttons[0].textContent).toContain("合肥IP技术部");
    expect(buttons[1].textContent).toContain("SOC部");
    expect(buttons[0].textContent).toContain("未打分");
    expect(buttons[1].textContent).toContain("40");
    expect(screen.getByText(/已打分/).textContent).toContain("1");
  });

  it("reuses the API key saved in the browser", async () => {
    window.localStorage.setItem(
      "lobsterai.bound-api-key.v1",
      JSON.stringify({ apiKey: "sk-remembered" })
    );

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText("参赛部门列表")).toBeTruthy());
    expect(apiMocks.competitionAuth).toHaveBeenCalledWith("sk-remembered");
  });

  it("shows the rejection message when the key is not on the judge roster", async () => {
    apiMocks.competitionAuth.mockRejectedValue(
      new Error("该 API Key 不在评委名册中，请联系 AI应用部")
    );

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-outsider" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));

    await waitFor(() =>
      expect(screen.getByText("该 API Key 不在评委名册中，请联系 AI应用部")).toBeTruthy()
    );
  });

  it("submits the four item scores and the running total", async () => {
    apiMocks.submitCompetitionScore.mockResolvedValue({
      team_id: "team-ipt",
      judge_employee_id: "test-judge",
      judge_name: "测试评委",
      items: { background: 1, solution: 0, efficiency: 0, scalability: 0 },
      total: 1,
      comment: "亮点明确",
      submitted_at: 1,
      updated_at: 1,
      revision: 1
    });

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-judge" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("参赛部门列表")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: /IV\.IPT/ })[0]);
    await waitFor(() => expect(screen.getByLabelText("合肥IP技术部 打分表")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("问题背景 分值"), { target: { value: "9" } });
    fireEvent.click(screen.getByLabelText("AI解决方案 加 0.5"));
    fireEvent.change(screen.getByLabelText("评语（可选）"), {
      target: { value: "亮点明确" }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交分数" }));

    await waitFor(() =>
      expect(apiMocks.submitCompetitionScore).toHaveBeenCalledWith(
        "judge-token",
        "team-ipt",
        { background: 9, solution: 0.5, efficiency: 0, scalability: 0 },
        "亮点明确"
      )
    );
  });

  it("keeps the score value inside the item maximum", async () => {
    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-judge" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("参赛部门列表")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("button", { name: /IV\.IPT/ })[0]);

    fireEvent.change(screen.getByLabelText("问题背景 分值"), { target: { value: "10" } });
    const plus = screen.getByLabelText("问题背景 加 0.5") as HTMLButtonElement;
    expect(plus.disabled).toBe(true);
  });

  it("prefills the sheet with a previously submitted score", async () => {
    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-judge" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("参赛部门列表")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: /IV\.SOC部/ })[0]);

    await waitFor(() => expect(screen.getByRole("button", { name: "更新分数" })).toBeTruthy());
    expect((screen.getByLabelText("问题背景 分值") as HTMLInputElement).value).toBe("8");
    expect((screen.getByLabelText("评语（可选）") as HTMLTextAreaElement).value).toBe("已看过");
  });

  it("blocks scoring and explains why once the organizer closes it", async () => {
    const closed = judgeState({ settings: { scoring_open: false, results_published: false } });
    apiMocks.competitionAuth.mockResolvedValue(authResponse(closed));

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-judge" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("参赛部门列表")).toBeTruthy());

    expect(screen.getByText("打分已截止，如需修改请联系 AI应用部。")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /IV\.IPT/ })[0]);
    const submit = screen.getByRole("button", { name: "打分已截止" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("hides the ranking from judges until it is published", async () => {
    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-judge" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("参赛部门列表")).toBeTruthy());

    expect(screen.queryByLabelText("成绩排名")).toBeNull();
  });

  it("shows the ranking to judges after publication", async () => {
    const published = judgeState({
      settings: { scoring_open: true, results_published: true },
      leaderboard: [
        {
          team_id: "team-ipt",
          name: "合肥IP技术部",
          contest_label: "IV.IPT",
          dimension_one: 32.71,
          dimension_two: 43.5,
          total: 76.21,
          rank: 1,
          award: "一等奖",
          judge_count: 10,
          counted_count: 8,
          trimmed: true
        }
      ]
    });
    apiMocks.competitionAuth.mockResolvedValue(authResponse(published));

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-judge" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));

    await waitFor(() => expect(screen.getByLabelText("成绩排名")).toBeTruthy());
    expect(screen.getByText("76.21")).toBeTruthy();
    expect(screen.getByText("一等奖")).toBeTruthy();
    expect(screen.getByText("10 位评委，计入 8 位")).toBeTruthy();
  });

  it("does not offer the admin tabs to a judge", async () => {
    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-judge" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("参赛部门列表")).toBeTruthy());

    expect(screen.queryByLabelText("管理台分区")).toBeNull();
  });

  it("lets an administrator type dimension one by hand and recompute", async () => {
    const adminState = judgeState({
      role: "admin",
      judge: { employee_id: "employee-0470", name: "张向东" },
      leaderboard: []
    });
    apiMocks.competitionAuth.mockResolvedValue(authResponse(adminState));
    apiMocks.fetchCompetitionState.mockResolvedValue(adminState);
    apiMocks.saveCompetitionDimensionOne.mockResolvedValue([]);

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-admin" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("管理台分区")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "AI提效培训" }));
    await waitFor(() => expect(screen.getByLabelText("维度一录入")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("合肥IP技术部 培训次数"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("合肥IP技术部 覆盖人次"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并重算" }));

    await waitFor(() =>
      expect(apiMocks.saveCompetitionDimensionOne).toHaveBeenCalledWith("judge-token", [
        { team_id: "team-ipt", training_count: 7, audience_total: 80 },
        { team_id: "team-soc", training_count: 6, audience_total: 57 }
      ])
    );
  });

  it("lets an administrator open and close scoring", async () => {
    const adminState = judgeState({
      role: "admin",
      judge: { employee_id: "employee-0470", name: "张向东" },
      leaderboard: []
    });
    apiMocks.competitionAuth.mockResolvedValue(authResponse(adminState));
    apiMocks.fetchCompetitionState.mockResolvedValue(adminState);
    apiMocks.updateCompetitionSettings.mockResolvedValue({
      scoring_open: false,
      results_published: false
    });

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-admin" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("管理台分区")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "排名与导出" }));
    fireEvent.click(screen.getByLabelText("允许评委打分"));

    await waitFor(() =>
      expect(apiMocks.updateCompetitionSettings).toHaveBeenCalledWith("judge-token", {
        scoring_open: false
      })
    );
  });

  it("clears the scores only after a second confirming click", async () => {
    const adminState = judgeState({
      role: "admin",
      judge: { employee_id: "employee-0470", name: "张向东" },
      leaderboard: [
        {
          team_id: "team-ipt",
          name: "合肥IP技术部",
          contest_label: "IV.IPT",
          dimension_one: 32.71,
          dimension_two: 43,
          total: 75.71,
          rank: 1,
          award: "一等奖",
          judge_count: 3,
          counted_count: 1,
          trimmed: true
        }
      ]
    });
    apiMocks.competitionAuth.mockResolvedValue(authResponse(adminState));
    apiMocks.fetchCompetitionState.mockResolvedValue(adminState);
    apiMocks.resetCompetitionScores.mockResolvedValue(3);

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-admin" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("管理台分区")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "排名与导出" }));

    fireEvent.click(screen.getByRole("button", { name: "清空本场打分" }));
    expect(apiMocks.resetCompetitionScores).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认清空 3 条" }));
    await waitFor(() => expect(apiMocks.resetCompetitionScores).toHaveBeenCalledWith("judge-token"));
    await waitFor(() =>
      expect(screen.getByText(/已清空 3 条打分记录/)).toBeTruthy()
    );
  });

  it("abandons the clear when the confirmation is cancelled", async () => {
    const adminState = judgeState({
      role: "admin",
      judge: { employee_id: "employee-0470", name: "张向东" },
      leaderboard: [
        {
          team_id: "team-ipt",
          name: "合肥IP技术部",
          contest_label: "IV.IPT",
          dimension_one: 32.71,
          dimension_two: 43,
          total: 75.71,
          rank: 1,
          award: "",
          judge_count: 2,
          counted_count: 2,
          trimmed: false
        }
      ]
    });
    apiMocks.competitionAuth.mockResolvedValue(authResponse(adminState));
    apiMocks.fetchCompetitionState.mockResolvedValue(adminState);

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-admin" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("管理台分区")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "排名与导出" }));

    fireEvent.click(screen.getByRole("button", { name: "清空本场打分" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(apiMocks.resetCompetitionScores).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "清空本场打分" })).toBeTruthy();
  });

  it("disables the clear button once results are published", async () => {
    const adminState = judgeState({
      role: "admin",
      judge: { employee_id: "employee-0470", name: "张向东" },
      settings: { scoring_open: false, results_published: true },
      leaderboard: [
        {
          team_id: "team-ipt",
          name: "合肥IP技术部",
          contest_label: "IV.IPT",
          dimension_one: 32.71,
          dimension_two: 43,
          total: 75.71,
          rank: 1,
          award: "一等奖",
          judge_count: 3,
          counted_count: 1,
          trimmed: true
        }
      ]
    });
    apiMocks.competitionAuth.mockResolvedValue(authResponse(adminState));
    apiMocks.fetchCompetitionState.mockResolvedValue(adminState);

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-admin" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("管理台分区")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "排名与导出" }));

    const button = screen.getByRole("button", { name: "清空本场打分" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/需先取消公布才能清空/)).toBeTruthy();
  });

  it("does not offer the clear control to a judge", async () => {
    const published = judgeState({
      settings: { scoring_open: true, results_published: true },
      leaderboard: []
    });
    apiMocks.competitionAuth.mockResolvedValue(authResponse(published));

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-judge" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("参赛部门列表")).toBeTruthy());

    expect(screen.queryByRole("button", { name: "清空本场打分" })).toBeNull();
  });

  it("renews the session and retries once when the token has expired", async () => {
    apiMocks.fetchCompetitionState
      .mockRejectedValueOnce(new Error("登录状态已过期，请重新用 API Key 登录"))
      .mockResolvedValueOnce(judgeState());

    render(<CompetitionScoringPage onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-judge" } });
    fireEvent.click(screen.getByRole("button", { name: "进入打分" }));
    await waitFor(() => expect(screen.getByLabelText("参赛部门列表")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    await waitFor(() => expect(apiMocks.competitionAuth).toHaveBeenCalledTimes(2));
    expect(apiMocks.fetchCompetitionState).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/登录状态已过期/)).toBeNull();
  });
});
