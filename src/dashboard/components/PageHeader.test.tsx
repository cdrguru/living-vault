import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./PageHeader";
import { SkeletonKpiRow } from "./Skeleton";

describe("PageHeader", () => {
  it("kpiColumns selects a distinct KPI grid layout for 3 vs 4 columns", () => {
    // The KPI grid is the component's single breakpoint owner: the prop must
    // actually change the layout, whatever the utility classes are named.
    const three = render(
      <PageHeader kpiColumns={3} kpis={<div data-testid="kpi" />} />,
    );
    const four = render(
      <PageHeader kpiColumns={4} kpis={<div data-testid="kpi" />} />,
    );
    const gridOf = (r: ReturnType<typeof render>) =>
      r.container.querySelector('[data-testid="kpi"]')
        ?.parentElement as HTMLElement;
    expect(gridOf(three).className).not.toBe(gridOf(four).className);
  });

  it("omits the meta band and rail when only kpis are passed", () => {
    const { container } = render(
      <PageHeader kpis={<div data-testid="kpi" />} />,
    );
    // No empty band or rail shells render around the single KPI grid.
    const section = container.querySelector("section") as HTMLElement;
    expect(section.children).toHaveLength(1);
  });

  it("renders the meta band content when meta is passed", () => {
    const { getByText } = render(<PageHeader meta={<span>3 sessions</span>} />);
    expect(getByText("3 sessions")).toBeTruthy();
  });

  it("does not render an h1 when title is omitted", () => {
    const { container } = render(
      <PageHeader meta={<span>band</span>} kpis={<div data-testid="kpi" />} />,
    );
    expect(container.querySelector("h1")).toBeNull();
  });

  it("renders an h1 only when a title is supplied", () => {
    const { getByRole } = render(<PageHeader title="Catalogue" />);
    expect(getByRole("heading", { level: 1 }).textContent).toBe("Catalogue");
  });

  it("sets --rise-delay from riseDelay", () => {
    const { container } = render(<PageHeader riseDelay={120} />);
    const section = container.querySelector("section") as HTMLElement;
    expect(section.style.getPropertyValue("--rise-delay")).toBe("120ms");
  });

  it("renders the search child before the toolbar in the DOM", () => {
    const { getByTestId } = render(
      <PageHeader
        search={<div data-testid="search" />}
        toolbar={<div data-testid="toolbar" />}
      />,
    );
    const search = getByTestId("search");
    const toolbar = getByTestId("toolbar");
    // compareDocumentPosition: search precedes toolbar when FOLLOWING bit is set.
    expect(
      search.compareDocumentPosition(toolbar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("SkeletonKpiRow", () => {
  it("renders one skeleton card per requested column", () => {
    const { container } = render(<SkeletonKpiRow count={3} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.children).toHaveLength(3);
  });

  it("lays out 3 and 4 column rows differently, matching PageHeader", () => {
    const three = render(<SkeletonKpiRow count={3} />);
    const four = render(<SkeletonKpiRow count={4} />);
    expect((three.container.firstChild as HTMLElement).className).not.toBe(
      (four.container.firstChild as HTMLElement).className,
    );
  });
});
