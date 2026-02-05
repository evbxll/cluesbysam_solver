export type CellId = number; // 0..19
export type Status = "UNKNOWN" | "INNOCENT" | "CRIMINAL";

export type CellSnapshot = {
  id: CellId;
  name: string;
  profession: string;
  status: Status;
  pos: string; // e.g., "A1"
};

export type BoardSnapshot = {
  cells: CellSnapshot[]; // length 20
  clues: string[];
};

export type Suggestion = {
  forced: Array<{ id: CellId; status: "INNOCENT" | "CRIMINAL"; reason?: string }>;
  numSolutions: number;
};
