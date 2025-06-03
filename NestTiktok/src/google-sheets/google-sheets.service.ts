// src/google-sheets/google-sheets.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { google, sheets_v4, Auth, drive_v3 } from 'googleapis';
import { join } from 'path';
import * as fs from 'fs';
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
  private readonly auth: Auth.GoogleAuth;

  constructor() {
    // Tìm đường dẫn đến file service-account.json từ nhiều vị trí có thể
    let keyFilePath: string | undefined;
    const possiblePaths = [
      join(process.cwd(), 'src/google-sheets/service-account.json'),
      join(process.cwd(), 'dist/google-sheets/service-account.json'),
      join(__dirname, 'service-account.json'),
    ];

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        keyFilePath = filePath;
        this.logger.log(`Using service account key file at: ${keyFilePath}`);
        break;
      }
    }

    if (!keyFilePath) {
      this.logger.error('Could not find service-account.json file!');
      throw new Error('Service account key file not found');
    }

    this.auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ],
    });
  }

  /**
   * Tạo và trả về một client API Google Sheets
   * @returns Promise với client Sheets đã được xác thực
   */
  private async getSheetsClient(): Promise<sheets_v4.Sheets> {
    const client = await this.auth.getClient();
    // @ts-expect-error - Google API typing issues with auth client
    return google.sheets({ version: 'v4', auth: client });
  }

  /**
   * Tạo và trả về một client API Google Drive
   * @returns Promise với client Drive đã được xác thực
   */
  private async getDriveClient(): Promise<drive_v3.Drive> {
    const client = await this.auth.getClient();
    // @ts-expect-error - Google API typing issues with auth client
    return google.drive({ version: 'v3', auth: client });
  }

  /**
   * Cập nhật giá trị trong một phạm vi cụ thể của bảng tính
   * @param spreadsheetId - ID của bảng tính
   * @param range - Ký hiệu A1 của phạm vi cần cập nhật
   * @param values - Các giá trị cần ghi vào phạm vi
   * @returns Promise với dữ liệu phản hồi
   */
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

  /**
   * Thêm giá trị vào cuối một phạm vi cụ thể của bảng tính
   * @param spreadsheetId - ID của bảng tính
   * @param range - Ký hiệu A1 của phạm vi cần thêm vào
   * @param values - Các giá trị cần thêm
   * @returns Promise với dữ liệu phản hồi
   */
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

  /**
   * Đọc giá trị từ một phạm vi cụ thể của bảng tính
   * @param spreadsheetId - ID của bảng tính
   * @param range - Ký hiệu A1 của phạm vi cần đọc
   * @returns Promise với các giá trị từ phạm vi đã chỉ định
   */
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

  /**
   * Kiểm tra xem một sheet với tiêu đề đã cho có tồn tại trong bảng tính không
   * @param spreadsheetId - ID của bảng tính
   * @param sheetTitle - Tiêu đề của sheet cần kiểm tra
   * @returns Promise với giá trị boolean cho biết sheet có tồn tại hay không
   */
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

  /**
   * Thêm một sheet mới vào bảng tính hiện có
   * @param spreadsheetId - ID của bảng tính
   * @param sheetTitle - Tiêu đề cho sheet mới
   * @returns Promise với dữ liệu phản hồi hoặc trạng thái tồn tại
   */
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

  /**
   * Chia sẻ bảng tính với một người dùng cụ thể
   * @param spreadsheetId - ID của bảng tính cần chia sẻ
   * @param email - Địa chỉ email của người dùng cần chia sẻ
   * @param role - Vai trò cấp cho người dùng (writer hoặc reader)
   * @returns Promise hoàn thành khi việc chia sẻ hoàn tất
   */
  async shareSheet(
    spreadsheetId: string,
    email: string,
    role: 'writer' | 'reader' = 'writer',
  ): Promise<void> {
    try {
      const drive = await this.getDriveClient();
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: {
          type: 'user',
          role: role,
          emailAddress: email,
        },
        fields: 'id',
      });
      this.logger.log(`Sheet ${spreadsheetId} shared with ${email} as ${role}`);
    } catch (error) {
      this.logger.error(
        `Error sharing sheet ${spreadsheetId} with ${email}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Tạo một bảng tính mới với tiêu đề đã cho
   * @param title - Tiêu đề cho bảng tính mới
   * @param shareWithEmail - Email tùy chọn để chia sẻ bảng tính
   * @returns Promise với ID của bảng tính đã tạo
   */
  async createSheet(
    title: string,
    shareWithEmail?: string,
  ): Promise<string | null | undefined> {
    const sheets = await this.getSheetsClient();
    const res = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title,
        },
      },
    });

    const spreadsheetId = res.data.spreadsheetId;

    // Nếu có email được cung cấp, chia sẻ sheet với người dùng đó
    if (shareWithEmail && typeof shareWithEmail === 'string' && spreadsheetId) {
      await this.shareSheet(spreadsheetId, shareWithEmail);
    }

    return spreadsheetId;
  }
}
