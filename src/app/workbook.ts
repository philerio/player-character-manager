import { type TerritoryWorkbookRow } from "../google-sheets-api";

export function localCalendarDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

function territoryWorkbookNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value ?? "")
    .trim()
    .replace(/,/g, "");

  if (!text) return 0;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function readTerritoryWorkbook(
  file: File,
): Promise<TerritoryWorkbookRow[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName =
    workbook.SheetNames.find(
      (name) => name.trim().toLowerCase() === "inhabitants",
    ) || workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet)
    throw new Error("The workbook does not contain an Inhabitants sheet.");
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const requiredHeaders = [
    "Hex",
    "Terrain",
    "Inhabitants",
    "Dungeon?",
    "Settlement?",
    "Settlement Name",
    "Settlement Inhabitants?",
    "Potential Hostile Encounter Population",
    "Hex Population Values",
    "Reaction",
    "DM Only Information",
  ];
  const headers = Object.keys(records[0] || {});
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length)
    throw new Error(`The hex workbook is missing: ${missing.join(", ")}.`);
  const rows = records
    .filter((record) => String(record.Hex || "").trim())
    .map((record) => {
      const hexValue = String(record.Hex || "").trim();
      return {
        hexNumber: /^\d+$/.test(hexValue) ? `${hexValue}.0` : hexValue,
        terrain: String(record.Terrain || "").trim(),
        inhabitants: String(record.Inhabitants || "").trim(),
        dungeon: String(record["Dungeon?"] || "").trim(),
        settlement: String(record["Settlement?"] || "").trim(),
        settlementName: String(record["Settlement Name"] || "").trim(),
        details: String(record["Settlement Inhabitants?"] || "").trim(),
        potentialHostileEncounterPopulation: Math.max(
          0,
          Math.floor(
            territoryWorkbookNumber(
              record["Potential Hostile Encounter Population"],
            ),
          ),
        ),
        reaction: String(record.Reaction || "").trim(),
        hexPopulationValue: Math.max(
          0,
          Math.floor(territoryWorkbookNumber(record["Hex Population Values"])),
        ),
        dmOnlyInformation: String(record["DM Only Information"] || "").trim(),
      };
    });
  if (rows.length !== 61)
    throw new Error(
      `The hex workbook must contain exactly 61 populated hex rows; this file contains ${rows.length}.`,
    );
  if (
    new Set(rows.map((row) => row.hexNumber.toLowerCase())).size !== rows.length
  )
    throw new Error("The hex workbook contains duplicate Hex values.");
  return rows;
}
