"use client";

import { useActionState } from "react";
import { uploadThemeAction } from "@/app/admin/actions/themes";
import type { ActionState } from "@/app/admin/actions/shared";

// Shows the validation result of the last upload, including every rejected file and rule.
export function ThemeUploadForm({ labels }: { labels: { button: string; uploading: string } }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(
    uploadThemeAction,
    null
  );
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="archive"
          accept=".zip,application/zip"
          required
          className="text-sm"
        />
        <button
          disabled={pending}
          className="rounded-control bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? labels.uploading : labels.button}
        </button>
      </form>
      {state ? (
        <div
          role={state.ok ? "status" : "alert"}
          className={`rounded-control border p-3 text-sm ${state.ok ? "border-success-600/30 bg-success-50" : "border-danger-600/30 bg-danger-50"}`}
        >
          <p className="font-medium">{state.message}</p>
          {state.errors && state.errors.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
