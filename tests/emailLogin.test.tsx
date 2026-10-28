import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LoginScreen } from "../src/components/AccountViews";

const actions = () => ({
  onLogin: vi.fn(async (_input: { email: string; password: string }) => {}),
  onRegister: vi.fn(
    async (_input: {
      displayName: string;
      email: string;
      setupPassword: string;
    }) => {},
  ),
  onLoadRecoveryQuestion: vi.fn(async (_input: { email: string }) => ({
    recoveryQuestion: "What is your test word?",
  })),
  onResetPassword: vi.fn(
    async (_input: {
      email: string;
      recoveryAnswer: string;
      newPassword: string;
    }) => {},
  ),
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("signs in immediately with email and password without a name list", async () => {
  const handlers = actions();
  render(<LoginScreen optionsStatus="loading" players={[]} {...handlers} />);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  const email = screen.getByLabelText<HTMLInputElement>("Email");
  expect(email.autocomplete).toBe("username");
  fireEvent.change(email, { target: { value: "PLAYER@EXAMPLE.TEST" } });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: " password with spaces " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() =>
    expect(handlers.onLogin).toHaveBeenCalledWith({
      email: "player@example.test",
      password: " password with spaces ",
    }),
  );
});

it("keeps credentials available after a failed login and blocks duplicate submissions while waiting", async () => {
  const handlers = actions();
  let reject!: (reason: Error) => void;
  handlers.onLogin.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const { container } = render(<LoginScreen {...handlers} />);
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "player@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "wrong" },
  });
  fireEvent.submit(container.querySelector("form")!);
  fireEvent.submit(container.querySelector("form")!);
  expect(handlers.onLogin).toHaveBeenCalledOnce();
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Please wait…" })
      .disabled,
  ).toBe(true);
  await act(async () => reject(new Error("Incorrect email or password.")));
  expect(screen.getByRole("alert").textContent).toContain(
    "Incorrect email or password.",
  );
  expect(screen.getByLabelText<HTMLInputElement>("Email").value).toBe(
    "player@example.test",
  );
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Sign in" }).disabled,
  ).toBe(false);
});

it("recovers a password using email and keeps the question tied to that account", async () => {
  const handlers = actions();
  render(<LoginScreen {...handlers} />);
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "PLAYER@EXAMPLE.TEST" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  const answer = await screen.findByLabelText("What is your test word?");
  expect(handlers.onLoadRecoveryQuestion).toHaveBeenCalledWith({
    email: "player@example.test",
  });
  expect(screen.getByLabelText<HTMLInputElement>("Email").readOnly).toBe(true);
  fireEvent.change(answer, { target: { value: "test answer" } });
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "replacement-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: "replacement-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
  await waitFor(() =>
    expect(handlers.onResetPassword).toHaveBeenCalledWith({
      email: "player@example.test",
      recoveryAnswer: "test answer",
      newPassword: "replacement-password",
    }),
  );
  await screen.findByRole("heading", { name: "Sign in" });
  expect(screen.getByLabelText<HTMLInputElement>("Email").readOnly).toBe(false);
});

it("still collects a display name when registering an account", async () => {
  const handlers = actions();
  render(<LoginScreen {...handlers} />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "First time here? Set up your account",
    }),
  );
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "New player" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "NEW@EXAMPLE.TEST" },
  });
  fireEvent.change(screen.getByLabelText("Shared setup password"), {
    target: { value: "setup-key" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() =>
    expect(handlers.onRegister).toHaveBeenCalledWith({
      displayName: "New player",
      email: "new@example.test",
      setupPassword: "setup-key",
    }),
  );
});

it("does not fetch auth.options or send a player ID from the D1 login page", async () => {
  vi.stubEnv("VITE_API_BACKEND", "d1");
  vi.stubEnv("VITE_API_URL", "https://campaign.example.test/");
  vi.stubEnv("VITE_DEMO_MODE", "false");
  vi.resetModules();
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      Response.json(
        { ok: false, error: "Incorrect email or password." },
        { status: 400 },
      ),
    );
  const { default: App } = await import("../src/App");
  render(<App />);
  expect(network).not.toHaveBeenCalled();
  expect(screen.queryByRole("combobox")).toBeNull();
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "player@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "wrong" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Incorrect email or password.");
  expect(network).toHaveBeenCalledOnce();
  const body = JSON.parse(String(network.mock.calls[0][1]?.body));
  expect(body).toMatchObject({
    action: "auth.login",
    email: "player@example.test",
    password: "wrong",
  });
  expect(body.playerId).toBeUndefined();
});
