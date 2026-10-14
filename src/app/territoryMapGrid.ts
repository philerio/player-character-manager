export type TapRevealPoint = { id: string; x: number; y: number };

// The territory maps use one large, point-topped hex made from 61 equal
// point-topped sub-hexes. These percentages are derived from the actual map
// canvas: five cells on the first row, expanding to nine, then contracting.
// Keeping one canonical grid makes the reveal mask independent of where in a
// sub-hex the player happens to tap.
export const TAP_REVEAL_ROW_COUNTS = [5, 6, 7, 8, 9, 8, 7, 6, 5];

export const TAP_REVEAL_HEX_WIDTH = 100 / 9;

export const TAP_REVEAL_HEX_HEIGHT = 100 / 7;

export const TAP_REVEAL_ROW_STEP = TAP_REVEAL_HEX_HEIGHT * 0.75;

export const TAP_REVEAL_HEXES: TapRevealPoint[] = TAP_REVEAL_ROW_COUNTS.flatMap(
  (count, row) => {
    const startX =
      ((9 - count) * TAP_REVEAL_HEX_WIDTH) / 2 + TAP_REVEAL_HEX_WIDTH / 2;
    const y = TAP_REVEAL_HEX_HEIGHT / 2 + row * TAP_REVEAL_ROW_STEP;
    return Array.from({ length: count }, (_, column) => ({
      id: `${row}-${column}`,
      x: startX + column * TAP_REVEAL_HEX_WIDTH,
      y,
    }));
  },
);

export const TAP_REVEAL_CENTER_HEX = TAP_REVEAL_HEXES.find(
  (hex) => hex.id === "4-4",
)!;

export function tapRevealHexPolygon(hex: TapRevealPoint) {
  return `${hex.x},${hex.y - TAP_REVEAL_HEX_HEIGHT / 2} ${hex.x + TAP_REVEAL_HEX_WIDTH / 2},${hex.y - TAP_REVEAL_HEX_HEIGHT / 4} ${hex.x + TAP_REVEAL_HEX_WIDTH / 2},${hex.y + TAP_REVEAL_HEX_HEIGHT / 4} ${hex.x},${hex.y + TAP_REVEAL_HEX_HEIGHT / 2} ${hex.x - TAP_REVEAL_HEX_WIDTH / 2},${hex.y + TAP_REVEAL_HEX_HEIGHT / 4} ${hex.x - TAP_REVEAL_HEX_WIDTH / 2},${hex.y - TAP_REVEAL_HEX_HEIGHT / 4}`;
}

export function nearestTapRevealHex(point: { x: number; y: number }) {
  return TAP_REVEAL_HEXES.reduce(
    (nearest, hex) => {
      const distance = Math.hypot(
        (hex.x - point.x) / (TAP_REVEAL_HEX_WIDTH / 2),
        (hex.y - point.y) / (TAP_REVEAL_HEX_HEIGHT / 2),
      );
      return distance < nearest.distance ? { hex, distance } : nearest;
    },
    { hex: TAP_REVEAL_HEXES[0], distance: Number.POSITIVE_INFINITY },
  );
}
