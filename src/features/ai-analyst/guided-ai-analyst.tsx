"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { ArrowRight, BrainCircuit, FileSearch, Send, Sparkles } from "lucide-react";

import type { DashboardViewModel } from "@/features/dashboard/analytics-adapter";
import type { EvidenceSelection } from "@/features/dashboard/evidence-drawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { classifyAnalystQuestion, ANALYST_DEFAULT_SUGGESTIONS } from "./intent-classifier";
import { createAnalystPlan, executeAnalystPlan } from "./analysis-plans";
import { createAnalystConversationContextKey } from "./conversation-context";
import { validateAnalystAnswer } from "./grounding";
import type { AnalystAnswer, AnalystConversationContext, AnalystDimension } from "./types";

type ConversationTurn = Readonly<{ question: string; answer: AnalystAnswer }>;

type GuidedAiAnalystProps = Readonly<{
  datasetFingerprint: string;
  onExplore: (dimension: AnalystDimension, value: string) => void;
  onInspectEvidence: (selection: EvidenceSelection) => void;
  viewModel: DashboardViewModel;
}>;

function localFallback(viewModel: DashboardViewModel): AnalystAnswer {
  return Object.freeze({
    status: "grounding_failure",
    intent: null,
    directAnswer: "I couldn't verify a safe answer for this view.",
    supportingFact: null,
    whatItMeans: "Your dashboard and Insights remain available while you try another question.",
    nextStep: "Try asking what needs attention, what is going well, or which channel is strongest.",
    contextLabel: viewModel.filterContextLabel,
    evidence: null,
    evidenceTitle: "Current selection",
    evidenceDescription: "No additional evidence was used for this response.",
    referencedEntities: Object.freeze([]),
    suggestedQuestions: ANALYST_DEFAULT_SUGGESTIONS,
    explore: null,
    limitations: Object.freeze([
      "Only verified deterministic analysis is shown in this experience.",
    ]),
  });
}

function analysisFailure(viewModel: DashboardViewModel): AnalystAnswer {
  return Object.freeze({
    status: "analysis_failure",
    intent: null,
    directAnswer: "I couldn't complete that analysis right now.",
    supportingFact: null,
    whatItMeans: "Your dashboard and Insights are still available while you try again.",
    nextStep: "Try the question again, or choose a suggested question below.",
    contextLabel: viewModel.filterContextLabel,
    evidence: null,
    evidenceTitle: "Current selection",
    evidenceDescription: "No result was produced for this request.",
    referencedEntities: Object.freeze([]),
    suggestedQuestions: ANALYST_DEFAULT_SUGGESTIONS,
    explore: null,
    limitations: Object.freeze([
      "Only verified deterministic analysis is shown in this experience.",
    ]),
  });
}

function messageAnswer(
  viewModel: DashboardViewModel,
  status: "clarification" | "unsupported",
  message: string,
  suggestions: readonly string[],
): AnalystAnswer {
  return Object.freeze({
    status,
    intent: null,
    directAnswer: message,
    supportingFact: null,
    whatItMeans: null,
    nextStep:
      "Choose one of the suggested questions, or ask about sales, profit, products, channels, or regions.",
    contextLabel: viewModel.filterContextLabel,
    evidence: null,
    evidenceTitle: "Current selection",
    evidenceDescription: "This question did not run a deterministic analysis plan.",
    referencedEntities: Object.freeze([]),
    suggestedQuestions: suggestions,
    explore: null,
    limitations: Object.freeze([]),
  });
}

function isSafeSuggestion(
  suggestion: string,
  viewModel: DashboardViewModel,
  context: AnalystConversationContext,
): boolean {
  try {
    const classification = classifyAnalystQuestion(suggestion, viewModel, context);
    if (classification.status !== "supported") return false;
    return (
      validateAnalystAnswer(
        executeAnalystPlan(createAnalystPlan(classification), viewModel),
        viewModel,
      ) === null
    );
  } catch {
    return false;
  }
}

function AnswerCard({
  answer,
  onExplore,
  onInspectEvidence,
}: {
  readonly answer: AnalystAnswer;
  readonly onExplore: (dimension: AnalystDimension, value: string) => void;
  readonly onInspectEvidence: (selection: EvidenceSelection) => void;
}) {
  return (
    <Card className="bg-surface-subtle/70 space-y-4 p-5 shadow-card" aria-live="polite">
      <div className="flex items-center gap-2 text-primary">
        <Sparkles aria-hidden="true" className="size-4" />
        <p className="text-xs font-semibold">InsightAI answer</p>
      </div>
      <section>
        <h3 className="text-base font-semibold">{answer.directAnswer}</h3>
        <p className="text-muted-foreground mt-2 text-xs">Based on: {answer.contextLabel}</p>
      </section>
      {answer.supportingFact ? (
        <section>
          <h4 className="text-sm font-semibold">Supporting fact</h4>
          <p className="text-muted-foreground mt-1 text-sm leading-6">{answer.supportingFact}</p>
        </section>
      ) : null}
      {answer.whatItMeans ? (
        <section>
          <h4 className="text-sm font-semibold">What it may mean</h4>
          <p className="text-muted-foreground mt-1 text-sm leading-6">{answer.whatItMeans}</p>
        </section>
      ) : null}
      {answer.nextStep ? (
        <section>
          <h4 className="text-sm font-semibold">What to check next</h4>
          <p className="text-muted-foreground mt-1 text-sm leading-6">{answer.nextStep}</p>
        </section>
      ) : null}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {answer.explore ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onExplore(answer.explore!.dimension, answer.explore!.value)}
          >
            Explore details
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
        {answer.evidence ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onInspectEvidence({
                title: answer.evidenceTitle,
                description: answer.evidenceDescription,
                evidence: answer.evidence!,
                periodLabel: answer.contextLabel,
              })
            }
          >
            <FileSearch aria-hidden="true" className="size-3.5" />
            How we know
          </Button>
        ) : null}
      </div>
      {answer.limitations.length ? (
        <p className="text-muted-foreground border-t border-border pt-3 text-xs leading-5">
          {answer.limitations[0]}
        </p>
      ) : null}
    </Card>
  );
}

export function GuidedAiAnalyst({
  datasetFingerprint,
  onExplore,
  onInspectEvidence,
  viewModel,
}: GuidedAiAnalystProps) {
  const contextKey = createAnalystConversationContextKey(datasetFingerprint, viewModel.filter);
  return (
    <GuidedAiAnalystState
      key={contextKey}
      datasetFingerprint={datasetFingerprint}
      onExplore={onExplore}
      onInspectEvidence={onInspectEvidence}
      viewModel={viewModel}
    />
  );
}

function GuidedAiAnalystState({
  datasetFingerprint,
  onExplore,
  onInspectEvidence,
  viewModel,
}: GuidedAiAnalystProps) {
  const activeFilterKey = useMemo(
    () => createAnalystConversationContextKey(datasetFingerprint, viewModel.filter),
    [datasetFingerprint, viewModel.filter],
  );
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<readonly ConversationTurn[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const ask = useCallback(
    (nextQuestion: string) => {
      const trimmed = nextQuestion.trim();
      if (!trimmed || isProcessing) return;
      // Clear immediately so a clicked suggestion never leaves an older draft in the input.
      setQuestion("");
      setIsProcessing(true);
      const context: AnalystConversationContext = {
        datasetFingerprint,
        filterKey: activeFilterKey,
        lastAnswer: turns.at(-1)?.answer ?? null,
      };
      // The plan runs locally from the engine-derived view model; this is a real calculation state,
      // not simulated provider latency.
      queueMicrotask(() => {
        let nextAnswer: AnalystAnswer;
        try {
          const classification = classifyAnalystQuestion(trimmed, viewModel, context);
          nextAnswer =
            classification.status === "supported"
              ? executeAnalystPlan(createAnalystPlan(classification), viewModel)
              : messageAnswer(
                  viewModel,
                  classification.status,
                  classification.message,
                  classification.suggestions,
                );
        } catch {
          nextAnswer = analysisFailure(viewModel);
        }
        const safeAnswer = validateAnalystAnswer(nextAnswer, viewModel)
          ? localFallback(viewModel)
          : nextAnswer;
        setTurns((current) =>
          Object.freeze([...current.slice(-2), { question: trimmed, answer: safeAnswer }]),
        );
        setIsProcessing(false);
      });
    },
    [activeFilterKey, datasetFingerprint, isProcessing, turns, viewModel],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    ask(question);
  };
  const latest = turns.at(-1);
  const suggestions = useMemo(() => {
    const suggestionContext: AnalystConversationContext = {
      datasetFingerprint,
      filterKey: activeFilterKey,
      lastAnswer: latest?.answer ?? null,
    };
    return (latest?.answer.suggestedQuestions ?? ANALYST_DEFAULT_SUGGESTIONS).filter((suggestion) =>
      isSafeSuggestion(suggestion, viewModel, suggestionContext),
    );
  }, [activeFilterKey, datasetFingerprint, latest, viewModel]);

  return (
    <section
      aria-labelledby="guided-analyst-title"
      className="rounded-[1.25rem] border border-primary/30 bg-primary-soft/45 p-5 sm:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-primary">
            <BrainCircuit aria-hidden="true" className="size-5" />
            <p className="text-sm font-semibold">InsightAI Analyst</p>
          </div>
          <h2 id="guided-analyst-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
            Ask InsightAI about your business
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Ask in everyday language. InsightAI checks the verified analysis already calculated for
            this view.
          </p>
        </div>
        <Sparkles aria-hidden="true" className="text-primary mt-1 size-7 shrink-0" />
      </div>

      <form className="mt-5 flex gap-2" onSubmit={submit}>
        <label className="sr-only" htmlFor="guided-ai-question">
          Ask InsightAI about your business
        </label>
        <input
          id="guided-ai-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about your business..."
          className="border-border bg-surface text-foreground placeholder:text-muted-foreground min-h-11 min-w-0 flex-1 rounded-button border px-3 text-sm shadow-control focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/35"
          disabled={isProcessing}
        />
        <Button
          type="submit"
          aria-label="Send question"
          disabled={!question.trim() || isProcessing}
        >
          <Send aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>

      {isProcessing ? (
        <p className="text-muted-foreground mt-3 text-sm" role="status">
          Checking verified data…
        </p>
      ) : null}
      {latest ? (
        <div className="mt-5 space-y-3">
          <p className="text-muted-foreground text-sm">
            <span className="font-semibold text-foreground">You asked: </span>
            {latest.question}
          </p>
          <AnswerCard
            answer={latest.answer}
            onExplore={onExplore}
            onInspectEvidence={onInspectEvidence}
          />
        </div>
      ) : null}

      <div className="mt-5">
        <p className="text-muted-foreground text-xs font-semibold">Try a question</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.slice(0, 5).map((suggestion) => (
            <Button
              key={suggestion}
              size="sm"
              variant="secondary"
              disabled={isProcessing}
              onClick={() => ask(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
