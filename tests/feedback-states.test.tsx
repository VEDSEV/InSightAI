import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback-state";
import { Skeleton } from "@/components/ui/skeleton";

describe("feedback states", () => {
  it("uses appropriate live-region semantics", () => {
    render(
      <>
        <LoadingState />
        <EmptyState title="No rows" description="Change the active filters." />
        <ErrorState title="Unable to load" description="Try again later." />
      </>,
    );

    expect(screen.getByText("Loading workspace").closest("[role='status']")).toBeInTheDocument();
    expect(screen.getByText("No rows").closest("[role='status']")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load");
  });

  it("disables shimmer animation when reduced motion is requested", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstElementChild).toHaveClass("motion-reduce:animate-none");
  });
});
