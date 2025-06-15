// src/google-sheets/types/google-sheets.types.ts

export type SheetValue = string | number | boolean | null;
export type SheetValues = SheetValue[][];

export interface WriteToSheetParams {
  spreadsheetId: string;
  range: string;
  values: SheetValues;
  taskName?: string;
}

export interface AppendToSheetParams {
  spreadsheetId: string;
  range: string;
  values: SheetValues;
  taskName?: string;
}

export interface ReadSheetParams {
  spreadsheetId: string;
  range: string;
  taskName?: string;
}

export interface AddSheetParams {
  spreadsheetId: string;
  sheetTitle: string;
}
