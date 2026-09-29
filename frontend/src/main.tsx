import React from "react";
import { createRoot } from "react-dom/client";
import CompetitionScoringPage from "./pages/CompetitionScoringPage";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<main className="page"><CompetitionScoringPage onNavigate={(path) => window.location.assign(path)} /></main>);
