// Google Sheets can return a hex number as either text or a number. Keep every
// map/card/mission comparison on the same normalized key so a completed mission
// cannot remain fogged merely because Sheets changed the cell's value type or
// retained surrounding whitespace.
export function territoryHexKey(value: unknown) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!text) return "";

  // Google Sheets may coerce a coordinate such as "2.0" into the numeric
  // value 2. Normalize numeric-looking hex coordinates exactly as the Apps
  // Script backend does so "2.0", "2.00", and 2 all refer to the same hex.
  const numeric = Number(text);
  return Number.isFinite(numeric) ? String(numeric) : text;
}
