import { BINGO_LINES } from "./lines";

describe("Bingo line definitions", () => {
  it("defines five rows, five columns, and two diagonals", () => {
    expect(BINGO_LINES).toHaveLength(12);
    expect(BINGO_LINES.map((line) => line.id)).toEqual([
      "row-0", "row-1", "row-2", "row-3", "row-4",
      "col-0", "col-1", "col-2", "col-3", "col-4",
      "diag-main", "diag-anti",
    ]);
  });

  it("orders every line in its effect processing direction", () => {
    expect(BINGO_LINES.find((line) => line.id === "row-2")?.cells).toEqual([10, 11, 12, 13, 14]);
    expect(BINGO_LINES.find((line) => line.id === "col-2")?.cells).toEqual([2, 7, 12, 17, 22]);
    expect(BINGO_LINES.find((line) => line.id === "diag-main")?.cells).toEqual([0, 6, 12, 18, 24]);
    expect(BINGO_LINES.find((line) => line.id === "diag-anti")?.cells).toEqual([20, 16, 12, 8, 4]);
  });
});
