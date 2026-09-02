"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { Finding } from "@/findings";
import { createEvidencePacket, createExplanationContextKey } from "@/ai/evidence-packet";
import type { AiServiceResult, EvidencePacket } from "@/ai/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type AiExplanationProps = Readonly<{
  datasetFingerprint: string;
  finding: Finding;
  uploadedDataset?: boolean;
  compactTrigger?: boolean;
}>;

type AiExplanationStateProps = AiExplanationProps &
  Readonly<{
    packet: EvidencePacket;
    consent: boolean;
    onConsentChange: (consent: boolean) => void;
  }>;

/**
 * The outer component retains uploaded-data session consent. The keyed inner component intentionally
 * remounts whenever the immutable evidence context changes, clearing old result/error/loading state.
 */
export function AiExplanation({
  datasetFingerprint,
  finding,
  uploadedDataset = false,
  compactTrigger = false,
}: AiExplanationProps) {
  const [consent, setConsent] = useState(false);
  const packet = useMemo(
    () => createEvidencePacket(datasetFingerprint, finding),
    [datasetFingerprint, finding],
  );
  const contextKey = createExplanationContextKey(packet);
  return (
    <AiExplanationState
      key={contextKey}
      datasetFingerprint={datasetFingerprint}
      finding={finding}
      uploadedDataset={uploadedDataset}
      compactTrigger={compactTrigger}
      packet={packet}
      consent={consent}
      onConsentChange={setConsent}
    />
  );
}

function AiExplanationState({
  packet,
  uploadedDataset,
  consent,
  onConsentChange,
  compactTrigger,
}: AiExplanationStateProps) {
  const [result, setResult] = useState<AiServiceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPrivacyReview, setShowPrivacyReview] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  const explain = async () => {
    if (uploadedDataset && !consent) {
      setShowPrivacyReview(true);
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packet, uploadedDataset, consent }),
        signal: controller.signal,
      });
      const nextResult = (await response.json()) as AiServiceResult;
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setResult(nextResult);
    } catch {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setResult({
        status: "unavailable",
        message: "AI explanation is unavailable. Your deterministic finding remains available.",
      });
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  };

  return (
    <div className={compactTrigger ? undefined : "border-border border-t pt-3"}>
      <Button
        size="sm"
        variant="secondary"
        onClick={explain}
        disabled={loading}
        aria-busy={loading}
      >
        <Sparkles aria-hidden="true" className="size-4" />
        {loading ? "Analyzing verified evidence…" : "Explain with AI"}
      </Button>
      {uploadedDataset && !consent ? (
        <p className="text-muted-foreground mt-2 text-xs">
          A privacy review is required before an uploaded dataset can be sent to a live AI provider.
        </p>
      ) : null}
      {showPrivacyReview ? (
        <Card
          className="bg-surface-subtle mt-3 space-y-3 p-4"
          role="dialog"
          aria-label="AI privacy review"
        >
          <div>
            <p className="font-semibold">View what will be sent</p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              InsightAI will send a minimized evidence summary to the configured AI provider. Your
              raw CSV is not sent.
            </p>
          </div>
          <dl className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-foreground">Finding</dt>
              <dd>{packet.finding.summary}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Period</dt>
              <dd>
                {packet.finding.period.start} to {packet.finding.period.end}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Evidence strength</dt>
              <dd>{packet.finding.evidenceStrength}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Included evidence</dt>
              <dd>
                {packet.evidence.length} bounded aggregate reference
                {packet.evidence.length === 1 ? "" : "s"}
              </dd>
            </div>
          </dl>
          <p className="text-muted-foreground text-xs">
            The summary excludes raw CSV rows, customer IDs, order IDs, order-line IDs, and
            unrelated uploaded fields. It is advisory and does not establish causation.
          </p>
          <p className="text-muted-foreground text-xs">
            AI is optional. You can keep using deterministic analytics without it.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => onConsentChange(event.target.checked)}
              className="mt-1 size-4"
            />
            <span>
              I consent to this minimized summary being sent for this browser session only.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={explain} disabled={!consent || loading}>
              Continue with AI
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowPrivacyReview(false)}>
              Keep analytics local
            </Button>
          </div>
        </Card>
      ) : null}
      {result?.status === "ok" ? (
        <Card className="bg-surface-subtle mt-3 space-y-3 p-4" aria-live="polite">
          <p className="text-xs font-semibold text-primary">
            AI-generated explanation ·{" "}
            {result.value.provider === "mock" ? "development mock" : result.value.model}
          </p>
          <section>
            <p className="font-semibold">Verified data</p>
            <p className="text-muted-foreground mt-1 text-sm">{result.value.verifiedFact}</p>
          </section>
          <section>
            <p className="font-semibold">What it may mean</p>
            <p className="text-muted-foreground mt-1 text-sm">{result.value.interpretation}</p>
          </section>
          <section>
            <p className="font-semibold">What to check next</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {result.value.recommendedActions[0]?.action}
            </p>
          </section>
          <section>
            <p className="font-semibold">Questions worth asking</p>
            <ul className="text-muted-foreground mt-1 list-disc space-y-1 pl-5 text-sm">
              {result.value.questionsToInvestigate.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </section>
          <section>
            <p className="font-semibold">How we know</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {result.value.evidenceReferences.join(", ")}
            </p>
          </section>
          <section>
            <p className="font-semibold">Limitations</p>
            <ul className="text-muted-foreground mt-1 list-disc space-y-1 pl-5 text-sm">
              {result.value.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </section>
          <p className="text-muted-foreground text-xs">{result.value.confidenceLanguage}</p>
        </Card>
      ) : result ? (
        <p className="text-warning-strong mt-2 text-sm" role="status">
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
