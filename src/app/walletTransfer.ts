import { AppError } from "./errors";
import { validateWalletBackup } from "./validation";
import type { LocalWalletState } from "./wallet";

export function readWalletTransfer(
  input: unknown,
  characterId: string,
): Pick<
  LocalWalletState,
  "characterId" | "transactions" | "recurringExpenses"
> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AppError(
      "rejected",
      "This file does not contain a wallet backup.",
    );
  let data = input as Record<string, any>;
  if (Array.isArray(data.records)) {
    const wallets = data.records.filter(
      (row: any) =>
        row?.kind === "pcm-local-wallet" &&
        row?.data?.characterId === characterId,
    );
    if (wallets.length !== 1)
      throw new AppError(
        "rejected",
        wallets.length
          ? "This file has multiple wallets for this character. Export the wallet separately before importing."
          : "This file does not contain a wallet for the selected character.",
      );
    data = wallets[0].data;
  }
  if (data.characterId !== characterId)
    throw new AppError(
      "rejected",
      "This wallet belongs to a different character. Select that character before importing.",
    );
  if (
    (data.format !== undefined && data.format !== "pcm-wallet") ||
    (data.version !== undefined && data.version !== 1)
  )
    throw new AppError(
      "rejected",
      "This wallet file uses an unsupported format or version.",
    );
  validateWalletBackup(data.transactions, data.recurringExpenses, characterId);
  return {
    characterId,
    transactions: data.transactions,
    recurringExpenses: data.recurringExpenses,
  };
}
export function downloadWalletTransfer(
  wallet: Pick<
    LocalWalletState,
    "characterId" | "transactions" | "recurringExpenses"
  >,
) {
  validateWalletBackup(
    wallet.transactions,
    wallet.recurringExpenses,
    wallet.characterId,
  );
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            format: "pcm-wallet",
            version: 1,
            exportedAt: new Date().toISOString(),
            ...wallet,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "character-wallet.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
