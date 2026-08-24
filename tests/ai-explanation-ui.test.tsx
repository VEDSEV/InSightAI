import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiExplanation } from "@/features/dashboard/ai-explanation";
import type { Finding } from "@/findings";

const baseFinding = {
  findingId: "ui-finding",
  ruleId: "ui-rule",
  ruleVersion: "v1",
  findingType: "concentration",
  category: "risk",
  severity: "medium",
  priority: 100,
  summary: "Web represents a concentrated share at 62.4%.",
  explanation: "Web has a concentrated revenue share in the selected period.",
  evidenceStrength: "moderate",
  period: { start: "2025-01-01", end: "2025-01-31", boundary: "inclusive" },
  filterContext: {
    period: { start: "2025-01-01", end: "2025-01-31", boundary: "inclusive" },
    regions: [],
  },
  evidence: [
    {
      evidenceId: "evidence:region-a",
      matchingRowCount: 12,
      distinctOrderCount: 8,
      affectedDateBuckets: [],
      segmentKeys: ["Web"],
      numerator: 6240,
      denominator: 10000,
      metricDependencies: ["revenue"],
      sampleOrderLineIds: ["LINE-PRIVATE"],
      sampleOrderIds: ["ORD-PRIVATE"],
      sampleLimit: 1,
      truncated: false,
    },
  ],
} as unknown as Finding;

const regionBFinding = {
  ...baseFinding,
  summary: "Web represents a concentrated share at 60.77%.",
  explanation: "Web has a concentrated revenue share in the Region B selection.",
  filterContext: {
    period: { start: "2025-01-01", end: "2025-01-31", boundary: "inclusive" },
    regions: ["Region B"],
  },
  evidence: [
    {
      ...baseFinding.evidence[0],
      evidenceId: "evidence:region-b",
      matchingRowCount: 9,
      distinctOrderCount: 6,
      numerator: 6077,
      denominator: 10000,
    },
  ],
} as unknown as Finding;

function successfulResponse(finding: Finding, interpretation: string, evidenceId: string) {
  return {
    ok: true,
    json: async () => ({
      status: "ok",
      cached: false,
      value: {
        findingId: finding.findingId,
        verifiedFact: finding.summary,
        interpretation,
        recommendedActions: [
          {
            action: "Investigate the concentration pattern before changing allocation.",
            evidenceReferences: [evidenceId],
          },
        ],
        questionsToInvestigate: ["Which orders account for the concentration?"],
        assumptions: ["The supplied deterministic evidence is complete."],
        limitations: ["This is descriptive, not causal."],
        confidence: "moderate",
        evidenceReferences: [evidenceId],
        provider: "mock",
        model: "deterministic-development-mock",
        promptVersion: "ai-explain-v1",
      },
    }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("AiExplanation", () => {
  it("shows a privacy review for uploaded data without exposing private identifiers", async () => {
    const user = userEvent.setup();
    render(
      <AiExplanation datasetFingerprint="uploaded-test" finding={baseFinding} uploadedDataset />,
    );

    await user.click(screen.getByRole("button", { name: /explain with ai/i }));
    expect(screen.getByRole("dialog", { name: /ai privacy review/i })).toBeInTheDocument();
    expect(screen.getByText(/view what will be sent/i)).toBeInTheDocument();
    expect(screen.getByText(/raw csv is not sent/i)).toBeInTheDocument();
    expect(
      screen.getByText(/AI is optional.*deterministic analytics without it/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("LINE-PRIVATE")).not.toBeInTheDocument();
    expect(screen.queryByText("ORD-PRIVATE")).not.toBeInTheDocument();

    const consent = screen.getByRole("checkbox", {
      name: /consent to this minimized summary.*browser session only/i,
    });
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    await user.click(consent);
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("keeps uploaded analytics local after declining, then permits a consented mock explanation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        successfulResponse(
          baseFinding,
          "The uploaded-data concentration signal remains descriptive.",
          "evidence:region-a",
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AiExplanation datasetFingerprint="uploaded-test" finding={baseFinding} uploadedDataset />,
    );

    await user.click(screen.getByRole("button", { name: /explain with ai/i }));
    await user.click(screen.getByRole("button", { name: /keep analytics local/i }));
    expect(screen.queryByRole("dialog", { name: /ai privacy review/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /explain with ai/i })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /explain with ai/i }));
    await user.click(
      screen.getByRole("checkbox", {
        name: /consent to this minimized summary.*browser session only/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: /continue with ai/i }));

    expect(
      await screen.findByText(/AI-generated explanation.*development mock/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The uploaded-data concentration signal remains descriptive."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("labels development-mock output and separates its explanation sections", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          successfulResponse(
            baseFinding,
            "The Web share should be reviewed as a concentration signal.",
            "evidence:region-a",
          ),
        ),
    );
    render(<AiExplanation datasetFingerprint="demo" finding={baseFinding} />);

    await user.click(screen.getByRole("button", { name: /explain with ai/i }));

    expect(
      await screen.findByText(/AI-generated explanation.*development mock/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Verified fact")).toBeInTheDocument();
    expect(screen.getByText("AI interpretation")).toBeInTheDocument();
    expect(screen.getByText("Suggested action")).toBeInTheDocument();
    expect(screen.getByText("Questions to investigate")).toBeInTheDocument();
    expect(screen.getByText("Evidence references")).toBeInTheDocument();
    expect(screen.getByText("Limitations")).toBeInTheDocument();
    expect(screen.queryByText("LINE-PRIVATE")).not.toBeInTheDocument();
  });

  it("immediately clears a visible explanation when the finding evidence context changes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        successfulResponse(
          baseFinding,
          "Region A interpretation for the 62.4% Web share.",
          "evidence:region-a",
        ),
      )
      .mockResolvedValueOnce(
        successfulResponse(
          regionBFinding,
          "Region B interpretation for the 60.77% Web share.",
          "evidence:region-b",
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<AiExplanation datasetFingerprint="demo" finding={baseFinding} />);
    await user.click(screen.getByRole("button", { name: /explain with ai/i }));
    expect(await screen.findByText(/Region A interpretation for the 62.4%/)).toBeInTheDocument();
    expect(screen.getByText("evidence:region-a")).toBeInTheDocument();

    view.rerender(<AiExplanation datasetFingerprint="demo" finding={regionBFinding} />);

    expect(screen.queryByText(/Region A interpretation for the 62.4%/)).not.toBeInTheDocument();
    expect(screen.queryByText("evidence:region-a")).not.toBeInTheDocument();
    expect(screen.queryByText(/62.4%/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /explain with ai/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /explain with ai/i }));
    expect(await screen.findByText(/Region B interpretation for the 60.77%/)).toBeInTheDocument();
    expect(screen.getByText("evidence:region-b")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears the result for a dataset replacement even when the finding ID is unchanged", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          successfulResponse(baseFinding, "Dataset one interpretation.", "evidence:region-a"),
        ),
    );
    const view = render(<AiExplanation datasetFingerprint="dataset-one" finding={baseFinding} />);

    await user.click(screen.getByRole("button", { name: /explain with ai/i }));
    expect(await screen.findByText("Dataset one interpretation.")).toBeInTheDocument();

    view.rerender(<AiExplanation datasetFingerprint="dataset-two" finding={baseFinding} />);
    expect(screen.queryByText("Dataset one interpretation.")).not.toBeInTheDocument();
    expect(screen.queryByText("evidence:region-a")).not.toBeInTheDocument();
  });

  it("ignores an old in-flight response after the filter context changes", async () => {
    const user = userEvent.setup();
    let resolveOldRequest: ((value: ReturnType<typeof successfulResponse>) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<ReturnType<typeof successfulResponse>>((resolve) => {
          resolveOldRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<AiExplanation datasetFingerprint="demo" finding={baseFinding} />);

    await user.click(screen.getByRole("button", { name: /explain with ai/i }));
    expect(screen.getByText(/analyzing verified evidence/i)).toBeInTheDocument();

    view.rerender(<AiExplanation datasetFingerprint="demo" finding={regionBFinding} />);
    expect(screen.queryByText(/analyzing verified evidence/i)).not.toBeInTheDocument();

    await act(async () => {
      resolveOldRequest?.(
        successfulResponse(
          baseFinding,
          "This old response must never render.",
          "evidence:region-a",
        ),
      );
      await Promise.resolve();
    });

    expect(screen.queryByText("This old response must never render.")).not.toBeInTheDocument();
    expect(screen.queryByText("evidence:region-a")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /explain with ai/i })).toBeEnabled();
  });
});
