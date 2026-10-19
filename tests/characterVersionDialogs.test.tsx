import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  DeleteCharacterModal,
  EditCharacterModal,
} from "../src/components/AccountViews";
const character = {
  characterId: "hero",
  playerId: "player",
  name: "Original name",
  class: "Fighter",
  level: 1,
  version: 1,
};
it("keeps the version the edit form was opened with when a roster refresh arrives", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const props = {
    onSave,
    onClose: vi.fn(),
    onDelete: vi.fn(),
    onPortraitUpload: vi.fn(),
    onPortraitDelete: vi.fn(),
  };
  const view = render(<EditCharacterModal character={character} {...props} />);
  fireEvent.change(screen.getByLabelText("Level"), { target: { value: "2" } });
  view.rerender(
    <EditCharacterModal
      character={{ ...character, name: "Someone else's rename", version: 2 }}
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith({
      characterId: "hero",
      expectedVersion: 1,
      name: "Original name",
      className: "Fighter",
      level: 2,
    }),
  );
});
it("keeps deletion tied to the character and version shown when confirmation opened", async () => {
  const onDelete = vi.fn().mockResolvedValue(undefined),
    onClose = vi.fn();
  const view = render(
    <DeleteCharacterModal
      character={character}
      onDelete={onDelete}
      onClose={onClose}
    />,
  );
  view.rerender(
    <DeleteCharacterModal
      character={{ ...character, name: "Renamed", version: 2 }}
      onDelete={onDelete}
      onClose={onClose}
    />,
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Original name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  await waitFor(() =>
    expect(onDelete).toHaveBeenCalledWith({
      characterId: "hero",
      expectedVersion: 1,
    }),
  );
});
