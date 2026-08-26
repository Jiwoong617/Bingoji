import type { Board, LineDefinition } from "./types";

const indexOf = (row: number, col: number) => row * 5 + col;

export const BINGO_LINES: LineDefinition[] = [
  ...Array.from({ length: 5 }, (_, row) => ({
    id: `row-${row}`,
    label: `${row + 1}번째 가로줄`,
    cells: Array.from({ length: 5 }, (_, col) => indexOf(row, col)),
  })),
  ...Array.from({ length: 5 }, (_, col) => ({
    id: `col-${col}`,
    label: `${col + 1}번째 세로줄`,
    cells: Array.from({ length: 5 }, (_, row) => indexOf(row, col)),
  })),
  {
    id: "diag-main",
    label: "왼쪽 위 대각선",
    cells: Array.from({ length: 5 }, (_, value) => indexOf(value, value)),
  },
  {
    id: "diag-anti",
    label: "왼쪽 아래 대각선",
    cells: Array.from({ length: 5 }, (_, value) => indexOf(4 - value, value)),
  },
];

export function isLineComplete(board: Board, line: LineDefinition): boolean {
  return line.cells.every((cell) => board[cell] !== null);
}

export function completedLinesAt(board: Board, cellIndex: number): LineDefinition[] {
  return BINGO_LINES.filter(
    (line) => line.cells.includes(cellIndex) && isLineComplete(board, line),
  );
}

export function boardHasBingo(board: Board): boolean {
  return BINGO_LINES.some((line) => isLineComplete(board, line));
}
