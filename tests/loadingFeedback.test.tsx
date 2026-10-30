import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LoginScreen } from "../src/components/AccountViews";
import {
  ResourceFeedback,
  WorkflowStatus,
} from "../src/components/DataFeedback";
const actions = () => ({
  onLogin: vi.fn(async () => {}),
  onRegister: vi.fn(async () => {}),
  onLoadRecoveryQuestion: vi.fn(async () => ({ recoveryQuestion: "Question" })),
  onResetPassword: vi.fn(async () => {}),
});
it("does not present login options or submit a login before names finish loading", () => {
  const props = actions();
  const { container } = render(
    <LoginScreen
      requiresPlayerSelection
      players={[]}
      optionsStatus="loading"
      {...props}
    />,
  );
  expect(
    screen.getByRole<HTMLSelectElement>("combobox", { hidden: true }).disabled,
  ).toBe(true);
  expect(screen.getByText("Loading player names…")).toBeTruthy();
  fireEvent.submit(container.querySelector("form")!);
  expect(props.onLogin).not.toHaveBeenCalled();
});
it("shows a recoverable dropdown error instead of claiming that no players exist", () => {
  const retry = vi.fn();
  render(
    <LoginScreen
      requiresPlayerSelection
      players={[]}
      optionsStatus="error"
      optionsError="Campaign unavailable"
      onRetryOptions={retry}
      {...actions()}
    />,
  );
  expect(screen.queryByText("No players registered")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { hidden: true, name: "Retry loading names" }),
  );
  expect(retry).toHaveBeenCalledOnce();
});
it("distinguishes an unavailable dataset from a successfully loaded empty dataset", () => {
  const retry = vi.fn(async () => {});
  const state = {
    status: "loading" as const,
    hasData: false,
    error: "",
    updatedAt: "",
  };
  const { rerender } = render(
    <ResourceFeedback name="retainers" state={state} retry={retry}>
      <p>No retainers found</p>
    </ResourceFeedback>,
  );
  expect(screen.queryByText("No retainers found")).toBeNull();
  rerender(
    <ResourceFeedback
      name="retainers"
      state={{ ...state, status: "ready", hasData: true }}
      retry={retry}
    >
      <p>No retainers found</p>
    </ResourceFeedback>,
  );
  expect(screen.getByText("No retainers found")).toBeTruthy();
});
it("keeps cached content usable when its background refresh fails", () => {
  const retry = vi.fn(async () => {});
  render(
    <ResourceFeedback
      name="territories"
      state={{
        status: "error",
        hasData: true,
        error: "Connection unavailable",
        updatedAt: "",
      }}
      retry={retry}
    >
      <p>Existing territory</p>
    </ResourceFeedback>,
  );
  expect(screen.getByText("Existing territory")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { hidden: true, name: "Retry territories" }),
  );
  expect(retry).toHaveBeenCalledOnce();
});

it("keeps background save status quiet while retaining pending, offline, error, and explicit-action feedback", () => {
  const props = {
    confirmed: true,
    online: true,
    busy: true,
    showProgress: false,
    phase: "Sending pending journal changes…",
    error: "",
    pending: true,
    dm: true,
    progress: { completed: 0, total: 1, label: "Saving journal" },
    refresh: vi.fn(async () => {}),
  };
  const { rerender } = render(<WorkflowStatus {...props} />);
  expect(screen.queryByRole("progressbar", { hidden: true })).toBeNull();
  expect(
    screen.getByText("Saved locally · DM changes await Push to Sheet"),
  ).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      hidden: true,
      name: "Refresh now",
    }).disabled,
  ).toBe(true);
  expect(
    screen
      .getByRole("complementary", { hidden: true })
      .getAttribute("aria-busy"),
  ).toBe("false");
  rerender(<WorkflowStatus {...props} online={false} />);
  expect(screen.getByText("Offline · Showing saved data")).toBeTruthy();
  rerender(<WorkflowStatus {...props} error="Campaign unavailable" />);
  expect(screen.getByText("Action needed")).toBeTruthy();
  expect(screen.getByText("Campaign unavailable")).toBeTruthy();
  rerender(<WorkflowStatus {...props} showProgress />);
  expect(screen.getByRole("progressbar", { hidden: true })).toBeTruthy();
  expect(screen.getByText("Sending pending journal changes…")).toBeTruthy();
});
