"use client";

import { useState } from "react";

/**
 * Tabs for the post editor. Every panel stays in the DOM (inactive ones are hidden), so all fields
 * are part of the form when it is submitted, whichever tab is open.
 */
export function PostTabs({
  tabs,
  panels,
  label,
}: {
  tabs: { id: string; label: string }[];
  panels: React.ReactNode[];
  label: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`-mb-px rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium ${
                selected
                  ? "border-line bg-white text-ink"
                  : "border-transparent text-ink-3 hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== active}
          className="pt-6"
        >
          {panels[index]}
        </div>
      ))}
    </div>
  );
}
