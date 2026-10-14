import {
  changeInitialPassword,
  loadRecoveryQuestion,
  login,
  logout,
  registerPlayer,
  resetForgottenPassword,
  sendJournalEntryToDiscord,
} from "../google-sheets-api";

import { LoginScreen, FirstPasswordScreen } from "../components/AccountViews";

import { JournalView } from "../components/CampaignViews";
import type { useAppController } from "./useAppController";
import type { ComponentProps } from "react";
type AccountContext = Pick<
  ReturnType<typeof useAppController>,
  | "passwordChangeToken"
  | "setCurrentPlayer"
  | "currentPlayer"
  | "setPlayers"
  | "players"
  | "setCharacters"
  | "characters"
  | "selectedCharacterIdRef"
  | "setSelectedCharacterId"
  | "setPasswordChangeToken"
  | "setAuthenticated"
  | "setPermissions"
  | "accountPermissions"
  | "selectedCharacter"
>;
export function useAccountCommands(controller: AccountContext) {
  const onSaveFirstPassword: ComponentProps<
    typeof FirstPasswordScreen
  >["onSave"] = async ({ newPassword, recoveryQuestion, recoveryAnswer }) => {
    const {
      passwordChangeToken,
      setCurrentPlayer,
      currentPlayer,
      setPlayers,
      players,
      setCharacters,
      characters,
      selectedCharacterIdRef,
      setSelectedCharacterId,
      setPasswordChangeToken,
      setAuthenticated,
    } = controller;

    const result = await changeInitialPassword({
      passwordChangeToken,
      newPassword,
      recoveryQuestion,
      recoveryAnswer,
    });
    setCurrentPlayer(result.currentPlayer);
    setPlayers(result.players || []);
    setCharacters(result.characters || []);
    const firstCharacterId = result.characters?.[0]?.characterId || "";
    selectedCharacterIdRef.current = firstCharacterId;
    setSelectedCharacterId(firstCharacterId);
    setPasswordChangeToken("");
    setAuthenticated(true);
  };

  const onLogin: ComponentProps<typeof LoginScreen>["onLogin"] = async (
    credentials,
  ) => {
    const {
      passwordChangeToken,
      setPasswordChangeToken,
      currentPlayer,
      setCurrentPlayer,
      setPermissions,
      accountPermissions,
      setPlayers,
      players,
      setCharacters,
      characters,
      selectedCharacterIdRef,
      setSelectedCharacterId,
      setAuthenticated,
    } = controller;

    const result = await login(credentials);
    if (result.mustChangePassword && result.passwordChangeToken) {
      setPasswordChangeToken(result.passwordChangeToken);
    } else {
      if (result.currentPlayer) {
        setCurrentPlayer(result.currentPlayer);
        setPermissions(accountPermissions(result.currentPlayer));
      }
      setPlayers(result.players || []);
      setCharacters(result.characters || []);
      const firstCharacterId = result.characters?.[0]?.characterId || "";
      selectedCharacterIdRef.current = firstCharacterId;
      setSelectedCharacterId(firstCharacterId);
      setAuthenticated(true);
    }
  };

  const onRegister: ComponentProps<typeof LoginScreen>["onRegister"] = async (
    registration,
  ) => {
    const { setPasswordChangeToken, passwordChangeToken } = controller;

    const result = await registerPlayer(registration);
    setPasswordChangeToken(result.passwordChangeToken);
  };

  const onResetPassword: ComponentProps<
    typeof LoginScreen
  >["onResetPassword"] = async (input) => {
    const {} = controller;

    await resetForgottenPassword(input);
  };

  const onSignOut: ComponentProps<"button">["onClick"] = () => {
    const {
      setAuthenticated,
      setCharacters,
      selectedCharacterIdRef,
      setSelectedCharacterId,
    } = controller;
    void logout()
      .catch(() => {})
      .finally(() => {
        selectedCharacterIdRef.current = "";
        setSelectedCharacterId("");
        setAuthenticated(false);
        setCharacters([]);
      });
  };

  const onSendJournal: ComponentProps<typeof JournalView>["onSend"] = async (
    entry,
  ) => {
    const { selectedCharacter } = controller;

    if (!selectedCharacter) throw new Error("Select a character first.");
    if (entry.syncPending || entry.entryId.startsWith("local-"))
      throw new Error(
        "Wait for this journal entry to sync before sending it to Discord.",
      );
    await sendJournalEntryToDiscord({
      characterId: selectedCharacter.characterId,
      entryId: entry.entryId,
    });
  };
  return {
    onSaveFirstPassword,
    onLogin,
    onRegister,
    onResetPassword,
    onSignOut,
    onSendJournal,
    onLoadRecoveryQuestion: loadRecoveryQuestion,
  };
}
