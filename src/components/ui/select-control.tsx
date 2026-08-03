import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type SelectControlProps = {
  id: string;
  label: string;
  value: string;
  options?: readonly string[];
  disabled?: boolean;
  preview?: boolean;
};

export function SelectControl({
  disabled = true,
  id,
  label,
  options,
  preview = true,
  value,
}: SelectControlProps) {
  const values = options ?? [value];

  return (
    <div className="min-w-40 flex-1 sm:flex-none">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-muted-foreground text-[0.6875rem] font-semibold">
          {label}
        </label>
        {preview ? <Badge>Preview</Badge> : null}
      </div>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          aria-describedby={preview ? `${id}-help` : undefined}
          className="border-border-strong bg-surface text-foreground focus-visible:ring-focus/35 h-10 w-full appearance-none rounded-button border pr-9 pl-3 text-sm font-medium shadow-control transition-colors duration-fast focus-visible:outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-75 motion-reduce:transition-none"
        >
          {values.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        />
      </div>
      {preview ? (
        <span id={`${id}-help`} className="sr-only">
          Demonstration control. Interactive filtering is planned for Phase 4.
        </span>
      ) : null}
    </div>
  );
}
