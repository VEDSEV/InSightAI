import { CircleCheck, Eye, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { previewWorkspace } from "@/features/dashboard/preview-data";

const signalStyle = {
  warning: {
    icon: TriangleAlert,
    badge: "warning" as const,
    iconClassName: "bg-warning-soft text-warning-strong border-warning/20",
  },
  success: {
    icon: CircleCheck,
    badge: "success" as const,
    iconClassName: "bg-success-soft text-success-strong border-success/20",
  },
  neutral: {
    icon: Eye,
    badge: "neutral" as const,
    iconClassName: "bg-surface-subtle text-muted-foreground border-border",
  },
};

export function BusinessHealthPreview() {
  return (
    <section aria-labelledby="health-preview-title">
      <SectionHeader
        eyebrow="Business health preview"
        title="What should the team review next?"
        titleId="health-preview-title"
        description="Illustrative rule-result patterns show how future verified findings will preserve context without claiming causality."
        action={<Badge variant="primary">Demonstration only</Badge>}
      />
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {previewWorkspace.healthSignals.map((signal) => {
          const style = signalStyle[signal.tone];
          const Icon = style.icon;

          return (
            <Card key={signal.id} className="p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`flex size-9 items-center justify-center rounded-button border ${style.iconClassName}`}
                >
                  <Icon aria-hidden="true" className="size-4" strokeWidth={1.9} />
                </span>
                <Badge variant={style.badge}>{signal.label}</Badge>
              </div>
              <h3 className="mt-4 text-sm font-semibold">{signal.title}</h3>
              <p className="text-muted-foreground mt-2 text-xs leading-5">{signal.description}</p>
              <p className="border-border text-muted-foreground mt-4 border-t pt-3 text-[0.6875rem] font-medium">
                {signal.evidence}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
