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
   * Utility method để xử lý retry với exponential backoff cho Google API calls
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 5,
  ): Promise<T> {
    let retries = 0;
    while (true) {
      try {
        return await operation();
      } catch (error: unknown) {
        retries++;
        if (retries > maxRetries) {
          this.logger.error(
            `❌ Đã vượt quá số lần retry (${maxRetries}), ném lỗi:`,
            error,
          );
          throw error;
        }

        // Kiểm tra nếu là lỗi cần retry
        let shouldRetry = false;
        let isRateLimit = false;

        if (error && typeof error === 'object') {
          const err = error as {
            response?: { status?: number };
            status?: number;
            code?: number | string;
            message?: string;
          };

          // Kiểm tra lỗi 503 (Service Unavailable)
          const isServiceUnavailable =
            err.response?.status === 503 ||
            err.status === 503 ||
            err.code === 503;

          // Kiểm tra lỗi 429 (Rate Limit Exceeded)
          isRateLimit =
            err.response?.status === 429 ||
            err.status === 429 ||
            err.code === 429 ||
            (typeof err.message === 'string' &&
              err.message.includes('Quota exceeded')) ||
            (typeof err.message === 'string' &&
              err.message.includes('Rate limit exceeded')) ||
            (typeof err.message === 'string' &&
              err.message.includes('rateLimitExceeded'));

          shouldRetry = isServiceUnavailable || isRateLimit;
        }

        if (!shouldRetry) {
          throw error; // Nếu không phải lỗi cần retry, ném lỗi ngay
        }

        // Exponential backoff theo hướng dẫn của Google với thời gian dài hơn
        const baseDelay = Math.pow(2, retries) * 2000; // Tăng từ 1000 lên 2000ms
        const randomJitter = Math.random() * 2000; // Tăng từ 1000 lên 2000ms
        const maxBackoff = isRateLimit ? 120000 : 90000; // Tăng từ 64000/60000 lên 120000/90000ms
        const waitTime = Math.min(baseDelay + randomJitter, maxBackoff);

        if (isRateLimit) {
          this.logger.warn(
            `🚫 Google Sheets quota exceeded. Retry ${retries}/${maxRetries} sau ${Math.round(
              waitTime / 1000,
            )}s...`,
          );
        } else {
          this.logger.warn(
            `⚠️ Google Sheets service unavailable. Retry ${retries}/${maxRetries} sau ${Math.round(
              waitTime / 1000,
            )}s...`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
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
    return this.executeWithRetry(async () => {
      const sheets = await this.getSheetsClient();
      const res = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values,
        },
      });
      return res.data;
    });
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
      valueInputOption: 'USER_ENTERED',
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
    return this.executeWithRetry(async () => {
      const sheets = await this.getSheetsClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      return (res.data.values || []) as SheetValues;
    });
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
    return this.executeWithRetry(async () => {
      const sheets = await this.getSheetsClient();
      const res = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties.title',
      });

      const sheetTitles = res.data.sheets?.map(
        (sheet) => sheet.properties?.title,
      );
      return sheetTitles?.includes(sheetTitle) ?? false;
    });
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

    return this.executeWithRetry(async () => {
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
    });
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
    role: 'writer' | 'reader' = 'reader',
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
   * Thu hồi quyền truy cập của một người dùng đối với bảng tính
   * @param spreadsheetId - ID của bảng tính
   * @param email - Địa chỉ email của người dùng cần thu hồi quyền
   * @returns Promise hoàn thành khi việc thu hồi quyền hoàn tất
   */
  async revokeAccess(spreadsheetId: string, email: string): Promise<void> {
    try {
      const drive = await this.getDriveClient();

      // Tìm permission ID dựa trên email
      const response = await drive.permissions.list({
        fileId: spreadsheetId,
        fields: 'permissions(id,emailAddress)',
      });

      const permissions = response.data.permissions || [];
      const permission = permissions.find((p) => p.emailAddress === email);

      if (permission && permission.id) {
        // Xóa quyền truy cập
        await drive.permissions.delete({
          fileId: spreadsheetId,
          permissionId: permission.id,
        });
        this.logger.log(
          `Access revoked for ${email} on sheet ${spreadsheetId}`,
        );
      } else {
        this.logger.warn(
          `No permission found for ${email} on sheet ${spreadsheetId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error revoking access for ${email} on sheet ${spreadsheetId}:`,
        error instanceof Error ? error.message : String(error),
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

  async batchUpdateToSheet({
    spreadsheetId,
    data,
  }: {
    spreadsheetId: string;
    data: { range: string; values: any[][] }[];
  }): Promise<any> {
    const sheets = await this.getSheetsClient();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data, // Array of { range, values }
      },
    });
  }

  /**
   * Định dạng bảng: chỉ header in đậm, các dữ liệu khác bình thường
   * @param spreadsheetId - ID của bảng tính
   * @param sheetName - Tên của sheet
   * @param totalRows - Tổng số hàng
   * @param options - Tùy chọn định dạng (numericColumns: danh sách các cột cần định dạng số)
   * @returns Promise hoàn thành khi việc định dạng hoàn tất
   */
  async formatCompleteTable(
    spreadsheetId: string,
    sheetName: string,
    totalRows: number,
    options?: { numericColumns?: string[] },
  ): Promise<any> {
    const sheets = await this.getSheetsClient();
    const sheetId = await this.getSheetId(spreadsheetId, sheetName);

    if (sheetId === null) {
      this.logger.error(`Sheet ID không tìm thấy cho sheet ${sheetName}`);
      return;
    }

    // Bước 1: Đầu tiên định dạng TẤT CẢ các ô với định dạng cơ bản (không in đậm, nền trắng)
    await this.executeWithRetry(async () => {
      return sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // Định dạng cơ bản cho tất cả các ô (bao gồm cả header)
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: 0,
                  endRowIndex: totalRows,
                  startColumnIndex: 0,
                  endColumnIndex: 24,
                },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE',
                    wrapStrategy: 'OVERFLOW_CELL',
                    backgroundColor: {
                      red: 1,
                      green: 1,
                      blue: 1,
                    },
                    textFormat: {
                      bold: false,
                      fontSize: 10,
                    },
                    padding: {
                      left: 10,
                      right: 10,
                      top: 2,
                      bottom: 2,
                    },
                  },
                },
                fields:
                  'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.padding',
              },
            },
          ],
        },
      });
    });

    // Bước 2: Sau đó mới định dạng riêng cho header
    await this.executeWithRetry(async () => {
      return sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // Định dạng đặc biệt cho header
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: 24,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: {
                      red: 0.9,
                      green: 0.9,
                      blue: 0.9,
                    },
                    textFormat: {
                      bold: true,
                      fontSize: 12,
                    },
                    padding: {
                      left: 10,
                      right: 10,
                      top: 2,
                      bottom: 2,
                    },
                  },
                },
                fields:
                  'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.padding',
              },
            },
            // Cố định cột đầu tiên và header
            {
              updateSheetProperties: {
                properties: {
                  sheetId,
                  gridProperties: {
                    frozenColumnCount: 1,
                    frozenRowCount: 1,
                  },
                },
                fields:
                  'gridProperties.frozenColumnCount,gridProperties.frozenRowCount',
              },
            },
          ],
        },
      });
    });

    // Bước 3: Định dạng các cột số (nếu có)
    if (options?.numericColumns && options.numericColumns.length > 0) {
      const requests = options.numericColumns.map((colLetter) => {
        // Chuyển đổi chữ cái thành số cột (A=0, B=1, ...)
        const colIndex = colLetter.charCodeAt(0) - 65; // 'A'.charCodeAt(0) = 65

        return {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1, // Bắt đầu từ dòng sau header
              endRowIndex: totalRows,
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: 'NUMBER',
                  pattern: '#,##0.00', // Định dạng số kiểu US với tối đa 2 số thập phân (không hiển thị số 0 thừa)
                },
              },
            },
            fields: 'userEnteredFormat.numberFormat',
          },
        };
      });

      await this.executeWithRetry(async () => {
        return sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests,
          },
        });
      });

      this.logger.log(
        `Đã áp dụng định dạng số kiểu US cho các cột: ${options.numericColumns.join(
          ', ',
        )}`,
      );
    }

    // Tự động điều chỉnh chiều rộng các cột
    await this.executeWithRetry(async () => {
      return sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: 24,
                },
              },
            },
          ],
        },
      });
    });

    this.logger.log(
      `Đã áp dụng định dạng cho sheet ${sheetName} - header màu xám, nội dung màu trắng, với kích thước phù hợp`,
    );
    return true;
  }

  /**
   * Lấy sheetId từ tên sheet
   * @param spreadsheetId - ID của bảng tính
   * @param sheetName - Tên của sheet
   * @returns Promise với sheetId
   */
  private async getSheetId(
    spreadsheetId: string,
    sheetName: string,
  ): Promise<number | null> {
    return this.executeWithRetry(async () => {
      const sheets = await this.getSheetsClient();
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties',
      });

      const sheet = response.data.sheets?.find(
        (s) => s.properties?.title === sheetName,
      );
      return sheet?.properties?.sheetId || null;
    });
  }

  /**
   * Xóa tất cả dữ liệu trong sheet trừ hàng header
   * @param spreadsheetId - ID của bảng tính
   * @param sheetName - Tên của sheet
   * @returns Promise hoàn thành khi việc xóa hoàn tất
   */
  async clearSheetData(spreadsheetId: string, sheetName: string): Promise<any> {
    // Đọc dữ liệu để xác định số lượng hàng
    const data = await this.readSheet({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });

    // Nếu sheet trống hoặc chỉ có header
    if (data.length <= 1) {
      this.logger.log(
        `Sheet ${sheetName} is empty or has only header. No need to clear.`,
      );
      return;
    }

    // Xóa tất cả dữ liệu từ hàng 2 trở đi (giữ lại header)
    return this.executeWithRetry(async () => {
      const sheets = await this.getSheetsClient();
      return sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!A2:Z${data.length}`,
      });
    });
  }

  /**
   * Chuẩn bị định dạng cho vùng dữ liệu trước khi thêm dữ liệu mới
   * @param spreadsheetId - ID của bảng tính
   * @param sheetName - Tên của sheet
   * @param startRow - Dòng bắt đầu (thường là 1 - sau header)
   * @param numRows - Số dòng cần chuẩn bị
   * @returns Promise hoàn thành khi việc định dạng hoàn tất
   */
  async prepareDataArea(
    spreadsheetId: string,
    sheetName: string,
    startRow: number,
    numRows: number,
  ): Promise<any> {
    const sheetId = await this.getSheetId(spreadsheetId, sheetName);

    if (sheetId === null) {
      this.logger.error(`Sheet ID không tìm thấy cho sheet ${sheetName}`);
      return;
    }

    const endRow = startRow + numRows;

    // Thiết lập định dạng cho vùng dữ liệu (không in đậm, nền trắng, cỡ chữ 10)
    // Sử dụng userEnteredFormat thay vì các trường riêng lẻ
    await this.executeWithRetry(async () => {
      const sheets = await this.getSheetsClient();
      return sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: startRow,
                  endRowIndex: endRow,
                  startColumnIndex: 0,
                  endColumnIndex: 24,
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: {
                      bold: false,
                      fontSize: 10,
                    },
                    backgroundColor: {
                      red: 1,
                      green: 1,
                      blue: 1,
                    },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE',
                    // Thiết lập tất cả các thuộc tính định dạng khác về mặc định
                    numberFormat: {
                      type: 'TEXT',
                    },
                    borders: {
                      top: {
                        style: 'SOLID',
                        color: {
                          red: 0.9,
                          green: 0.9,
                          blue: 0.9,
                        },
                      },
                      bottom: {
                        style: 'SOLID',
                        color: {
                          red: 0.9,
                          green: 0.9,
                          blue: 0.9,
                        },
                      },
                      left: {
                        style: 'SOLID',
                        color: {
                          red: 0.9,
                          green: 0.9,
                          blue: 0.9,
                        },
                      },
                      right: {
                        style: 'SOLID',
                        color: {
                          red: 0.9,
                          green: 0.9,
                          blue: 0.9,
                        },
                      },
                    },
                  },
                },
                fields: 'userEnteredFormat',
              },
            },
          ],
        },
      });
    });

    this.logger.log(
      `Đã chuẩn bị định dạng hoàn chỉnh cho vùng dữ liệu ${sheetName} từ dòng ${startRow + 1} đến ${endRow}`,
    );
    return true;
  }
}
