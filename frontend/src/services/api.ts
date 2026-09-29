import type { CompetitionAuthResponse, CompetitionDimensionOneEntry, CompetitionDimensionOneRow, CompetitionImportResponse, CompetitionJudgeScore, CompetitionLeaderboardRow, CompetitionProgressResponse, CompetitionSettings, CompetitionState } from "../types";
async function readJsonResponse<T>(response: Response): Promise<T> { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "请求失败"); return payload as T; }
const COMPETITION_API = "/api/ai-apps/competition-scoring";

function competitionHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

export async function competitionAuth(
  apiKey: string,
  signal?: AbortSignal
): Promise<CompetitionAuthResponse> {
  const response = await fetch(`${COMPETITION_API}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
    signal
  });
  return readJsonResponse<CompetitionAuthResponse>(response);
}

export async function fetchCompetitionState(token: string): Promise<CompetitionState> {
  const response = await fetch(`${COMPETITION_API}/state`, {
    method: "GET",
    headers: competitionHeaders(token)
  });
  return readJsonResponse<CompetitionState>(response);
}

export async function submitCompetitionScore(
  token: string,
  teamId: string,
  items: Record<string, number>,
  comment: string
): Promise<CompetitionJudgeScore> {
  const response = await fetch(`${COMPETITION_API}/scores`, {
    method: "POST",
    headers: competitionHeaders(token),
    body: JSON.stringify({ team_id: teamId, items, comment })
  });
  const payload = await readJsonResponse<{ score: CompetitionJudgeScore }>(response);
  return payload.score;
}

export async function fetchCompetitionResults(
  token: string
): Promise<CompetitionLeaderboardRow[]> {
  const response = await fetch(`${COMPETITION_API}/results`, {
    method: "GET",
    headers: competitionHeaders(token)
  });
  const payload = await readJsonResponse<{ leaderboard: CompetitionLeaderboardRow[] }>(response);
  return payload.leaderboard;
}

export async function fetchCompetitionProgress(
  token: string
): Promise<CompetitionProgressResponse> {
  const response = await fetch(`${COMPETITION_API}/admin/progress`, {
    method: "GET",
    headers: competitionHeaders(token)
  });
  return readJsonResponse<CompetitionProgressResponse>(response);
}

export async function updateCompetitionSettings(
  token: string,
  settings: Partial<CompetitionSettings>
): Promise<CompetitionSettings> {
  const response = await fetch(`${COMPETITION_API}/admin/settings`, {
    method: "POST",
    headers: competitionHeaders(token),
    body: JSON.stringify(settings)
  });
  const payload = await readJsonResponse<{ settings: CompetitionSettings }>(response);
  return payload.settings;
}

export async function resetCompetitionScores(token: string): Promise<number> {
  const response = await fetch(`${COMPETITION_API}/admin/reset-scores`, {
    method: "POST",
    headers: competitionHeaders(token),
    body: JSON.stringify({ confirm: true })
  });
  const payload = await readJsonResponse<{ cleared: number }>(response);
  return payload.cleared;
}

export async function saveCompetitionDimensionOne(
  token: string,
  entries: CompetitionDimensionOneEntry[]
): Promise<CompetitionDimensionOneRow[]> {
  const response = await fetch(`${COMPETITION_API}/admin/dimension-one`, {
    method: "POST",
    headers: competitionHeaders(token),
    body: JSON.stringify({ entries })
  });
  const payload = await readJsonResponse<{ rows: CompetitionDimensionOneRow[] }>(response);
  return payload.rows;
}

export async function importCompetitionDimensionOne(
  token: string,
  file: File
): Promise<CompetitionImportResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${COMPETITION_API}/admin/dimension-one/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  return readJsonResponse<CompetitionImportResponse>(response);
}

export function competitionExportUrl(): string {
  return `${COMPETITION_API}/admin/export`;
}

export async function downloadCompetitionResults(token: string): Promise<Blob> {
  const response = await fetch(competitionExportUrl(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "导出失败");
  }
  return response.blob();
}
