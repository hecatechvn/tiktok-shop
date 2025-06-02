// src/google-sheets/google-sheets.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { google, sheets_v4 } from 'googleapis';
import { join } from 'path';
import {
  AppendToSheetParams,
  WriteToSheetParams,
  ReadSheetParams,
  AddSheetParams,
  SheetValues,
} from '../types/google-sheets';

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private readonly auth = new google.auth.GoogleAuth({
    keyFile: join(__dirname, 'service-account.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  private async getSheetsClient(): Promise<sheets_v4.Sheets> {
    const client = await this.auth.getClient();
    // @ts-expect-error - Google API typing issues
    return google.sheets({ version: 'v4', auth: client });
  }

  async writeToSheet({
    spreadsheetId,
    range,
    values,
  }: WriteToSheetParams): Promise<any> {
    const sheets = await this.getSheetsClient();

    const res = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    return res.data;
  }

  async appendToSheet({
    spreadsheetId,
    range,
    values,
  }: AppendToSheetParams): Promise<any> {
    const sheets = await this.getSheetsClient();

    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });

    return res.data;
  }

  async readSheet({
    spreadsheetId,
    range,
  }: ReadSheetParams): Promise<SheetValues> {
    const sheets = await this.getSheetsClient();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return res.data.values ?? [];
  }

  async sheetExists(
    spreadsheetId: string,
    sheetTitle: string,
  ): Promise<boolean> {
    const sheets = await this.getSheetsClient();

    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    });

    const sheetTitles = res.data.sheets?.map((s) => s.properties?.title) ?? [];
    return sheetTitles.includes(sheetTitle);
  }

  async addSheet({ spreadsheetId, sheetTitle }: AddSheetParams): Promise<any> {
    const exists = await this.sheetExists(spreadsheetId, sheetTitle);
    if (exists) {
      this.logger.log(`Sheet "${sheetTitle}" already exists.`);
      return { exists: true };
    }

    const sheets = await this.getSheetsClient();

    const request: sheets_v4.Params$Resource$Spreadsheets$Batchupdate = {
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetTitle,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 26,
                },
              },
            },
          },
        ],
      },
    };

    const res = await sheets.spreadsheets.batchUpdate(request);
    this.logger.log(`Added sheet "${sheetTitle}"`);
    return res.data;
  }
}
