// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmForm } from "@/components/admin/confirm-form";
import { Flash, Pager } from "@/components/admin/ui";

afterEach(cleanup);

describe("ConfirmForm", () => {
  it("does not submit when the administrator cancels the confirmation", () => {
    const action = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = render(
      <ConfirmForm action={action} message="Delete it?" fields={{ id: "post-1" }}>
        <button>Delete</button>
      </ConfirmForm>
    );
    fireEvent.submit(container.querySelector("form")!);
    expect(confirm).toHaveBeenCalledWith("Delete it?");
    expect(container.querySelector('input[name="id"]')).toHaveProperty("value", "post-1");
    confirm.mockRestore();
  });

  it("renders hidden fields for the identifiers it is given", () => {
    const { container } = render(
      <ConfirmForm action={vi.fn()} message="x" fields={{ themeId: "starter" }}>
        <button>Activate</button>
      </ConfirmForm>
    );
    expect(container.querySelector('input[type="hidden"][name="themeId"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Activate" })).toBeTruthy();
  });
});

describe("Flash", () => {
  it("announces errors as alerts and confirmations as status messages", () => {
    const { rerender } = render(<Flash error="Slug already in use" />);
    expect(screen.getByRole("alert").textContent).toContain("Slug already in use");
    rerender(<Flash ok="Saved" />);
    expect(screen.getByRole("status").textContent).toContain("Saved");
  });

  it("renders nothing without a message", () => {
    const { container } = render(<Flash />);
    expect(container.innerHTML).toBe("");
  });
});

describe("Pager", () => {
  it("links to the previous and next pages with the current filters", () => {
    render(
      <Pager
        basePath="/admin/posts"
        page={2}
        totalPages={3}
        query={{ q: "hello", status: "draft" }}
        labels={{ previous: "Previous", next: "Next", pageOf: "Page 2 of 3", label: "Pagination" }}
      />
    );
    const prev = screen.getByRole("link", { name: "Previous" });
    const next = screen.getByRole("link", { name: "Next" });
    expect(prev.getAttribute("href")).toBe("/admin/posts?q=hello&status=draft&page=1");
    expect(next.getAttribute("href")).toBe("/admin/posts?q=hello&status=draft&page=3");
  });

  it("is hidden when there is only one page", () => {
    const { container } = render(
      <Pager
        basePath="/admin/posts"
        page={1}
        totalPages={1}
        labels={{ previous: "Previous", next: "Next", pageOf: "Page 2 of 3", label: "Pagination" }}
      />
    );
    expect(container.innerHTML).toBe("");
  });
});
