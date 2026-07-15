import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type {
  AssetRow,
  AssetScoreResult,
  AssetTrend,
  DriftDirection,
} from "@/data";

import { EffectivenessMovers } from "./EffectivenessMovers";

const asset = (id: string, name: string): AssetRow =>
  ({ id, name, type: "skill" }) as AssetRow;

const score = (aes: number): AssetScoreResult =>
  ({ assetEffectivenessScore: aes }) as AssetScoreResult;

const trend = (
  assetId: string,
  direction: DriftDirection,
  prior: number | null,
  recent: number | null,
): AssetTrend => ({
  assetId,
  prior: prior === null ? null : score(prior),
  recent: recent === null ? null : score(recent),
  delta: prior === null || recent === null ? null : recent - prior,
  direction,
});

function renderMovers(trends: AssetTrend[], assets: AssetRow[]) {
  return render(
    <MemoryRouter>
      <EffectivenessMovers assets={assets} trends={trends} />
    </MemoryRouter>,
  );
}

describe("EffectivenessMovers", () => {
  it("renders improving and regressing sides with signed deltas", () => {
    const assets = [asset("a", "Gainer"), asset("b", "Slider")];
    const trends = [
      trend("a", "improving", 0.6, 0.72),
      trend("b", "regressing", 0.8, 0.66),
    ];
    renderMovers(trends, assets);

    const improving = screen
      .getByRole("heading", { name: "Improving" })
      .closest("div")!.parentElement!;
    expect(within(improving).getByText("Gainer")).toBeInTheDocument();
    expect(within(improving).getByText("+12%")).toBeInTheDocument();

    const regressing = screen
      .getByRole("heading", { name: "Regressing" })
      .closest("div")!.parentElement!;
    expect(within(regressing).getByText("Slider")).toBeInTheDocument();
    expect(within(regressing).getByText("-14%")).toBeInTheDocument();
  });

  it("links each mover to its asset detail route", () => {
    renderMovers([trend("a", "improving", 0.6, 0.72)], [asset("a", "Gainer")]);
    expect(screen.getByRole("link", { name: "Gainer" })).toHaveAttribute(
      "href",
      "/asset/a",
    );
  });

  it("orders improving by largest gain first", () => {
    const assets = [asset("a", "Small"), asset("b", "Big")];
    const trends = [
      trend("a", "improving", 0.5, 0.62), // +12
      trend("b", "improving", 0.4, 0.7), // +30
    ];
    renderMovers(trends, assets);
    const names = screen.getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual(["Big", "Small"]);
  });

  it("excludes steady assets from the mover lists but counts them", () => {
    const assets = [asset("a", "Gainer"), asset("b", "Flat")];
    const trends = [
      trend("a", "improving", 0.6, 0.72),
      trend("b", "steady", 0.6, 0.64), // +4, within the band
    ];
    renderMovers(trends, assets);
    expect(screen.queryByText("Flat")).not.toBeInTheDocument();
    expect(screen.getByText(/1 steady/)).toBeInTheDocument();
  });

  it("shows a 'not enough history' state when every trend is insufficient", () => {
    renderMovers(
      [trend("a", "insufficient", null, null)],
      [asset("a", "Unknown")],
    );
    expect(screen.getByText(/Not enough history yet/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Improving" })).not.toBeInTheDocument();
  });

  it("shows a 'held steady' state when there are trends but no movers", () => {
    renderMovers([trend("a", "steady", 0.6, 0.63)], [asset("a", "Flat")]);
    expect(screen.getByText(/held steady/)).toBeInTheDocument();
  });
});
