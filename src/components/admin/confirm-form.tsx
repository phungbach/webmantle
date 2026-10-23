"use client";

// Destructive actions go through a browser confirmation. The server action still checks permissions.
export function ConfirmForm({
  action,
  message,
  children,
  fields,
}: {
  action: (formData: FormData) => Promise<void>;
  message: string;
  children: React.ReactNode;
  fields: Record<string, string>;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
    </form>
  );
}
