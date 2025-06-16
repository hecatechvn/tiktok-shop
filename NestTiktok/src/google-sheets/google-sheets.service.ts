// src/google-sheets/google-sheets.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { google, sheets_v4, Auth, drive_v3 } from 'googleapis';
import { join } from 'path';
import * as fs from 'fs';
import {
  AppendToSheetParams,
  WriteToSheetParams,
  AddSheetParams,
} from '../types/google-sheets';

interface CachedSheetInfo {
  sheetId: number;
  title: string;
  lastUpdated: number;
}

interface SpreadsheetCache {
  sheets: Map<string, CachedSheetInfo>;
  lastUpdated: number;
}

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private readonly auth: Auth.GoogleAuth;

  // Cache để lưu trữ thông tin spreadsheet và tránh gọi API nhiều lần
  private readonly spreadsheetCache = new Map<string, SpreadsheetCache>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 phút cache TTL

  // Quota tracking
  private apiCallCount = 0;
  private taskStartTime = 0;
  private currentTaskName = '';

  // Batch operation queue để gom nhóm các operations
  private readonly batchQueue = new Map<
    string,
    Array<{
      range: string;
      values: any[][];
      resolve: (value: any) => void;
      reject: (error: any) => void;
    }>
  >();

  // Debounce timer cho batch operations
  private readonly batchTimers = new Map<string, NodeJS.Timeout>();
  private readonly BATCH_DELAY = 500; // 500ms delay để gom nhóm operations

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
   * Bắt đầu theo dõi quota cho một task
   */
  startTaskTracking(taskName: string): void {
    this.apiCallCount = 0;
    this.taskStartTime = Date.now();
    this.currentTaskName = taskName;
    this.logger.log(`🔍 Bắt đầu theo dõi quota cho task: ${taskName}`);
  }

  /**
   * Kết thúc theo dõi và log thông tin quota
   */
  endTaskTracking(): void {
    const duration = Date.now() - this.taskStartTime;

    // Hiển thị chi tiết các loại API call
    this.logger.log(
      `📊 Thống kê quota cho task "${this.currentTaskName}":
       - Số lần gọi API thành công: ${this.apiCallCount}
       - Thời gian thực hiện: ${(duration / 1000).toFixed(2)}s
       - Chi tiết các hoạt động:
         + getSpreadsheetInfo: lấy và cache thông tin spreadsheet (1 API call)
         + batchUpdate (addSheet): tạo sheet mới nếu cần (1 API call)
         + batchUpdate (updateCells): ghi và định dạng dữ liệu cùng lúc (1 API call duy nhất)
         + writeAndFormatSheet: ghi và định dạng sheet (2 API calls)
         + writeMultipleSheets mới: tối ưu tối đa (chỉ 2 API calls thay vì 10+)`,
    );

    this.currentTaskName = '';
  }

  /**
   * Utility method để xử lý retry với exponential backoff cho Google API calls
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 5,
  ): Promise<T> {
    let retries = 0;
    // Không tăng số lần gọi API ở đây, chỉ đếm khi thành công

    // Log chi tiết về lần gọi API
    const stackTrace = new Error().stack;
    const callerInfo = stackTrace ? stackTrace.split('\n')[2] : 'unknown';
    const callerFunction = callerInfo.match(/at\s+(\S+)/)?.[1] || 'unknown';

    while (true) {
      try {
        const result = await operation();
        // Chỉ tăng số lần gọi API khi thành công
        this.apiCallCount++;
        this.logger.debug(
          `📡 API Call #${this.apiCallCount} thành công từ: ${callerFunction}`,
        );
        return result;
      } catch (error: unknown) {
        retries++;

        if (retries > maxRetries) {
          this.logger.error(
            `❌ Đã vượt quá số lần retry (${maxRetries}), ném lỗi:`,
            error,
          );
          throw error;
        }

        // Kiểm tra nếu là lỗi 503 Service Unavailable hoặc 429 Rate Limit Exceeded
        let shouldRetry = false;
        let isRateLimit = false;

        // Type guard để kiểm tra các thuộc tính của error
        if (error && typeof error === 'object') {
          // Sử dụng type assertion an toàn hơn
          const err = error as {
            response?: { status?: number };
            status?: number;
            code?: number | string;
            message?: string;
          };

          // Kiểm tra lỗi 500 (Internal Server Error) hoặc 503 (Service Unavailable)
          const isServerError =
            err.response?.status === 500 ||
            err.status === 500 ||
            err.code === 500;
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

          shouldRetry = isServerError || isServiceUnavailable || isRateLimit;
        }

        if (!shouldRetry) {
          throw error; // Nếu không phải lỗi cần retry, ném lỗi ngay
        }

        // Tính thời gian chờ với exponential backoff theo hướng dẫn của Google
        // Công thức: min(((2^n) + random_number_milliseconds), maximum_backoff)
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
   * Tạo và trả về một client API Google Sheets với cache
   */
  private async getSheetsClient(): Promise<sheets_v4.Sheets> {
    const client = await this.auth.getClient();
    // @ts-expect-error - Google API typing issues with auth client
    return google.sheets({ version: 'v4', auth: client });
  }

  /**
   * Tạo và trả về một client API Google Drive với cache
   */
  private async getDriveClient(): Promise<drive_v3.Drive> {
    const client = await this.auth.getClient();
    // @ts-expect-error - Google API typing issues with auth client
    return google.drive({ version: 'v3', auth: client });
  }

  /**
   * Lấy thông tin spreadsheet từ cache hoặc API
   */
  async getSpreadsheetInfo(spreadsheetId: string): Promise<SpreadsheetCache> {
    const now = Date.now();
    const cached = this.spreadsheetCache.get(spreadsheetId);

    // Kiểm tra cache còn hợp lệ không
    if (cached && now - cached.lastUpdated < this.CACHE_TTL) {
      return cached;
    }

    // Nếu cache hết hạn hoặc không tồn tại, gọi API
    try {
      return this.executeWithRetry(async () => {
        const sheets = await this.getSheetsClient();
        const res = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: 'sheets.properties(sheetId,title)',
        });

        const sheetsMap = new Map<string, CachedSheetInfo>();
        res.data.sheets?.forEach((sheet) => {
          if (
            sheet.properties?.title &&
            sheet.properties?.sheetId !== undefined
          ) {
            sheetsMap.set(sheet.properties.title, {
              sheetId: sheet.properties.sheetId!,
              title: sheet.properties.title,
              lastUpdated: now,
            });
          }
        });

        const cacheData: SpreadsheetCache = {
          sheets: sheetsMap,
          lastUpdated: now,
        };

        this.spreadsheetCache.set(spreadsheetId, cacheData);
        this.logger.debug(`Cached spreadsheet info for ${spreadsheetId}`);
        return cacheData;
      });
    } catch (error) {
      this.logger.error(
        `Lỗi khi lấy thông tin spreadsheet ${spreadsheetId}:`,
        error,
      );

      // Nếu có lỗi và có cache cũ, trả về cache cũ nếu nó chưa quá cũ (dưới 1 giờ)
      if (cached && now - cached.lastUpdated < 3600000) {
        this.logger.warn(`Sử dụng cache cũ cho spreadsheet ${spreadsheetId}`);
        return cached;
      }

      // Nếu không có cache hoặc cache quá cũ, tạo cache rỗng tạm thời
      const emptyCache: SpreadsheetCache = {
        sheets: new Map(),
        lastUpdated: now,
      };
      this.logger.warn(
        `Tạo cache rỗng tạm thời cho spreadsheet ${spreadsheetId}`,
      );
      return emptyCache;
    }
  }

  /**
   * Lấy sheetId từ tên sheet với cache
   */
  private async getSheetId(
    spreadsheetId: string,
    sheetName: string,
  ): Promise<number | null> {
    const spreadsheetInfo = await this.getSpreadsheetInfo(spreadsheetId);
    const sheetInfo = spreadsheetInfo.sheets.get(sheetName);
    return sheetInfo?.sheetId ?? null;
  }

  /**
   * Kiểm tra xem một sheet có tồn tại không với cache
   */
  async sheetExists(
    spreadsheetId: string,
    sheetTitle: string,
  ): Promise<boolean> {
    const spreadsheetInfo = await this.getSpreadsheetInfo(spreadsheetId);
    return spreadsheetInfo.sheets.has(sheetTitle);
  }

  /**
   * Thêm operation vào batch queue để xử lý gom nhóm
   */
  private addToBatchQueue(
    spreadsheetId: string,
    range: string,
    values: any[][],
  ): Promise<sheets_v4.Schema$UpdateValuesResponse> {
    return new Promise((resolve, reject) => {
      if (!this.batchQueue.has(spreadsheetId)) {
        this.batchQueue.set(spreadsheetId, []);
      }

      const queue = this.batchQueue.get(spreadsheetId)!;
      queue.push({ range, values, resolve, reject });

      // Clear existing timer
      const existingTimer = this.batchTimers.get(spreadsheetId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new timer để process batch sau BATCH_DELAY
      const timer = setTimeout(() => {
        this.processBatchQueue(spreadsheetId);
      }, this.BATCH_DELAY);

      this.batchTimers.set(spreadsheetId, timer);
    });
  }

  /**
   * Xử lý batch queue để gom nhóm các operations
   */
  private async processBatchQueue(spreadsheetId: string): Promise<void> {
    const queue = this.batchQueue.get(spreadsheetId);
    if (!queue || queue.length === 0) {
      return;
    }

    // Clear queue và timer
    this.batchQueue.set(spreadsheetId, []);
    this.batchTimers.delete(spreadsheetId);

    try {
      // Gom nhóm tất cả operations thành một batch update
      const data = queue.map((item) => ({
        range: item.range,
        values: item.values,
      }));

      const result = await this.batchUpdateToSheet({ spreadsheetId, data });

      // Resolve tất cả promises
      queue.forEach((item) => item.resolve(result));

      this.logger.debug(
        `Processed batch of ${queue.length} operations for ${spreadsheetId}`,
      );
    } catch (error) {
      // Reject tất cả promises
      queue.forEach((item) => item.reject(error));
      this.logger.error(`Batch processing failed for ${spreadsheetId}:`, error);
    }
  }

  /**
   * Cập nhật giá trị trong một phạm vi cụ thể của bảng tính với batch optimization
   */
  async writeToSheet({
    spreadsheetId,
    range,
    values,
    taskName,
  }: WriteToSheetParams): Promise<sheets_v4.Schema$UpdateValuesResponse> {
    // Bắt đầu tracking nếu có taskName
    if (taskName && !this.currentTaskName) {
      this.startTaskTracking(taskName);
    }

    // Log chi tiết về hoạt động
    this.logger.debug(
      `📝 writeToSheet: ${range} (${values.length} dòng x ${values[0]?.length || 0} cột)`,
    );

    // Sử dụng batch queue để tối ưu hóa
    const result = await this.addToBatchQueue(spreadsheetId, range, values);

    // Kết thúc tracking nếu đã bắt đầu với taskName này
    if (taskName && this.currentTaskName === taskName) {
      this.endTaskTracking();
    }

    return result;
  }

  /**
   * Batch update trực tiếp (không qua queue)
   */
  async batchUpdateToSheet({
    spreadsheetId,
    data,
  }: {
    spreadsheetId: string;
    data: { range: string; values: any[][] }[];
  }): Promise<sheets_v4.Schema$BatchUpdateValuesResponse> {
    // Log số lượng operations được gom nhóm
    if (this.currentTaskName) {
      this.logger.debug(
        `Batch update with ${data.length} operations in task "${this.currentTaskName}"`,
      );
    }

    return this.executeWithRetry(async () => {
      const sheets = await this.getSheetsClient();
      const result = await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data,
        },
      });
      return result.data;
    });
  }

  /**
   * Thêm giá trị vào cuối một phạm vi cụ thể của bảng tính
   */
  async appendToSheet({
    spreadsheetId,
    range,
    values,
    taskName,
  }: AppendToSheetParams): Promise<any> {
    // Bắt đầu tracking nếu có taskName
    if (taskName && !this.currentTaskName) {
      this.startTaskTracking(taskName);
    }

    const result = await this.executeWithRetry(async () => {
      const sheets = await this.getSheetsClient();
      const res = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });
      return res.data;
    });

    // Kết thúc tracking nếu đã bắt đầu với taskName này
    if (taskName && this.currentTaskName === taskName) {
      this.endTaskTracking();
    }

    return result;
  }

  /**
   * Thêm một sheet mới vào bảng tính hiện có với cache invalidation
   */
  async addSheet({ spreadsheetId, sheetTitle }: AddSheetParams): Promise<any> {
    const exists = await this.sheetExists(spreadsheetId, sheetTitle);
    if (exists) {
      this.logger.log(`Sheet "${sheetTitle}" already exists.`);
      return { exists: true };
    }

    const result = await this.executeWithRetry(async () => {
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

    // Invalidate cache sau khi thêm sheet mới
    this.clearCache(spreadsheetId);

    return result;
  }

  /**
   * Chia sẻ bảng tính với một người dùng cụ thể
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

  /**
   * Đảm bảo sheet tồn tại và đã được định dạng với header,
   * sử dụng một API call duy nhất khi cần tạo mới
   * @param spreadsheetId ID của spreadsheet
   * @param sheetName Tên sheet cần kiểm tra/tạo
   * @param header Header của sheet
   * @returns true nếu sheet mới được tạo, false nếu sheet đã tồn tại
   */
  async ensureSheetExistsWithHeader(
    spreadsheetId: string,
    sheetName: string,
    header: string[],
  ): Promise<boolean> {
    try {
      // Kiểm tra xem sheet tháng đã tồn tại chưa
      const exists = await this.sheetExists(spreadsheetId, sheetName);

      // Nếu sheet đã tồn tại, không cần làm gì thêm
      if (exists) {
        return false; // Sheet đã tồn tại trước đó
      }

      this.logger.log(`Sheet "${sheetName}" không tồn tại, đang tạo mới...`);

      // Tạo sheet mới và thiết lập trong 3 bước tối thiểu
      // Step 1: Tạo sheet với batch request
      const sheetId = await this.executeWithRetry(async () => {
        const sheets = await this.getSheetsClient();

        // Tạo sheet với batch request để chỉ gọi API một lần
        const res = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              // Tạo sheet mới
              {
                addSheet: {
                  properties: {
                    title: sheetName,
                    gridProperties: {
                      rowCount: 50000,
                      columnCount: header.length + 2, // Thêm vài cột dự phòng
                      frozenRowCount: 1, // Cố định hàng header luôn
                      frozenColumnCount: 1, // Cố định cột đầu
                    },
                  },
                },
              },
            ],
          },
        });

        // Lấy sheetId từ kết quả trả về
        const addedSheet = res.data.replies?.[0]?.addSheet?.properties;
        const newSheetId = addedSheet?.sheetId;

        if (!newSheetId) {
          throw new Error(
            `Không thể lấy sheetId sau khi tạo sheet ${sheetName}`,
          );
        }

        return newSheetId;
      });

      // Step 2: Ghi header và định dạng trong một lần gọi API duy nhất
      await this.executeWithRetry(async () => {
        const sheets = await this.getSheetsClient();

        // Ghi header trước
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A1:${String.fromCharCode(65 + header.length - 1)}1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [header] },
        });

        // Định dạng header và cột ngày tháng trong cùng một lần gọi
        return sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              // Định dạng header
              {
                repeatCell: {
                  range: {
                    sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: header.length,
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
                      horizontalAlignment: 'CENTER',
                      verticalAlignment: 'MIDDLE',
                      wrapStrategy: 'OVERFLOW_CELL',
                      padding: {
                        left: 20, // Tăng padding bên trái
                        right: 20, // Tăng padding bên phải
                        top: 4, // Tăng padding trên
                        bottom: 4, // Tăng padding dưới
                      },
                    },
                  },
                  fields: 'userEnteredFormat',
                },
              },
              // Định dạng cột Created Time là TEXT để tránh tự động chuyển đổi sang số
              {
                repeatCell: {
                  range: {
                    sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1000,
                    startColumnIndex: 22, // Cột W - Created Time (23 là index 22)
                    endColumnIndex: 23,
                  },
                  cell: {
                    userEnteredFormat: {
                      numberFormat: {
                        type: 'TEXT',
                      },
                    },
                  },
                  fields: 'userEnteredFormat.numberFormat',
                },
              },
              // Thiết lập kích thước tối thiểu cho các cột
              {
                updateDimensionProperties: {
                  range: {
                    sheetId,
                    dimension: 'COLUMNS',
                    startIndex: 0,
                    endIndex: header.length,
                  },
                  properties: {
                    pixelSize: 150, // Thiết lập chiều rộng tối thiểu là 150 pixels
                  },
                  fields: 'pixelSize',
                },
              },
              // Auto resize columns (sẽ mở rộng cột nếu nội dung lớn hơn 150px)
              {
                autoResizeDimensions: {
                  dimensions: {
                    sheetId,
                    dimension: 'COLUMNS',
                    startIndex: 0,
                    endIndex: header.length,
                  },
                },
              },
            ],
          },
        });
      });

      // Xóa cache để đảm bảo thông tin mới nhất
      this.clearCache(spreadsheetId);
      this.logger.log(`Đã tạo và chuẩn bị sheet ${sheetName} thành công`);

      return true; // Sheet mới được tạo
    } catch (error) {
      this.logger.error(`Lỗi khi chuẩn bị sheet ${sheetName}:`, error);
      throw error;
    }
  }

  /**
   * Flush tất cả pending batch operations ngay lập tức
   */
  async flushBatchOperations(): Promise<void> {
    const spreadsheetIds = Array.from(this.batchQueue.keys());

    for (const spreadsheetId of spreadsheetIds) {
      const timer = this.batchTimers.get(spreadsheetId);
      if (timer) {
        clearTimeout(timer);
        this.batchTimers.delete(spreadsheetId);
      }
      await this.processBatchQueue(spreadsheetId);
    }

    this.logger.debug('Flushed all pending batch operations');
  }

  /**
   * Clear cache cho một spreadsheet cụ thể hoặc tất cả
   */
  clearCache(spreadsheetId?: string): void {
    if (spreadsheetId) {
      this.spreadsheetCache.delete(spreadsheetId);
      this.logger.debug(`Cleared cache for spreadsheet ${spreadsheetId}`);
    } else {
      this.spreadsheetCache.clear();
      this.logger.debug('Cleared all spreadsheet cache');
    }
  }

  /**
   * Xóa một sheet khỏi spreadsheet dựa trên sheetId
   * @param spreadsheetId ID của spreadsheet
   * @param sheetId ID của sheet cần xóa
   * @returns Kết quả của việc xóa sheet
   */
  async deleteSheet(spreadsheetId: string, sheetId: number): Promise<any> {
    try {
      const result = await this.executeWithRetry(async () => {
        const sheets = await this.getSheetsClient();

        const request: sheets_v4.Params$Resource$Spreadsheets$Batchupdate = {
          spreadsheetId,
          requestBody: {
            requests: [
              {
                deleteSheet: {
                  sheetId,
                },
              },
            ],
          },
        };

        const res = await sheets.spreadsheets.batchUpdate(request);
        this.logger.log(`Deleted sheet with ID: ${sheetId}`);
        return res.data;
      });

      // Xóa cache sau khi xóa sheet
      this.clearCache(spreadsheetId);

      return result;
    } catch (error) {
      this.logger.error(`Error deleting sheet ${sheetId}:`, error);
      throw error;
    }
  }

  /**
   * Phương thức tối ưu để ghi dữ liệu vào nhiều sheet cùng lúc
   * Giảm thiểu overhead khi xử lý nhiều sheet - CHỈ SỬ DỤNG 1 API CALL THỐNG NHẤT
   */
  async writeMultipleSheets({
    spreadsheetId,
    sheets,
    taskName,
  }: {
    spreadsheetId: string;
    sheets: Array<{
      sheetName: string;
      header: string[];
      data: any[][];
      numericColumns?: string[];
    }>;
    taskName?: string;
  }): Promise<void> {
    // Bắt đầu tracking nếu có taskName
    if (taskName && !this.currentTaskName) {
      this.startTaskTracking(taskName);
    }

    try {
      this.logger.debug(
        `🚀 writeMultipleSheets: Ghi dữ liệu vào ${sheets.length} sheets cùng lúc (siêu tối ưu - 1 API call)`,
      );

      // Tạo một map để lưu thông tin sheetId cho mỗi sheet để tránh gọi API lấy info nhiều lần
      const sheetIdMap = new Map<string, number>();

      // Lấy toàn bộ thông tin spreadsheet chỉ một lần duy nhất
      this.logger.debug(`Kiểm tra sheets tồn tại...`);
      const spreadsheetInfo = await this.getSpreadsheetInfo(spreadsheetId);

      // Chuẩn bị tất cả các yêu cầu để gửi trong một API call duy nhất
      const batchRequests: any[] = [];
      const existingSheets = new Set<string>();

      // Kiểm tra sheet nào đã tồn tại, sheet nào cần tạo mới
      for (const sheet of sheets) {
        const sheetExists = spreadsheetInfo.sheets.has(sheet.sheetName);
        if (sheetExists) {
          // Lưu sheetId vào map nếu đã tồn tại
          const sheetId = spreadsheetInfo.sheets.get(sheet.sheetName)?.sheetId;
          if (sheetId !== undefined) {
            sheetIdMap.set(sheet.sheetName, sheetId);
            existingSheets.add(sheet.sheetName);
          }
        } else {
          // Thêm yêu cầu tạo sheet mới
          batchRequests.push({
            addSheet: {
              properties: {
                title: sheet.sheetName,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: sheet.header.length + 2, // Thêm vài cột dự phòng
                  frozenRowCount: 1, // Cố định hàng header luôn
                  frozenColumnCount: 1, // Cố định cột đầu
                },
              },
            },
          });
        }
      }

      // Thực hiện API call đầu tiên để tạo các sheet mới nếu cần
      if (batchRequests.length > 0) {
        this.logger.debug(`Tạo ${batchRequests.length} sheets mới...`);
        const newSheetsResult = await this.executeWithRetry(async () => {
          const sheetsClient = await this.getSheetsClient();
          return sheetsClient.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: batchRequests },
          });
        });

        // Cập nhật sheetIdMap với các sheet mới được tạo
        if (newSheetsResult.data.replies) {
          for (let i = 0; i < newSheetsResult.data.replies.length; i++) {
            const reply = newSheetsResult.data.replies[i];
            if (reply.addSheet?.properties) {
              const newSheetId = reply.addSheet.properties.sheetId;
              const newSheetTitle = reply.addSheet.properties.title;
              if (newSheetId !== undefined && newSheetTitle) {
                // Đảm bảo newSheetId là number
                const safeSheetId: number =
                  typeof newSheetId === 'number' ? newSheetId : 0;
                sheetIdMap.set(newSheetTitle, safeSheetId);

                // Cập nhật cache với sheet mới
                const sheetInfo: CachedSheetInfo = {
                  sheetId: safeSheetId,
                  title: newSheetTitle,
                  lastUpdated: Date.now(),
                };
                spreadsheetInfo.sheets.set(newSheetTitle, sheetInfo);
              }
            }
          }
        }

        // Xóa mảng batch request để chuẩn bị cho các yêu cầu mới
        batchRequests.length = 0;
      }

      // Đảm bảo spreadsheet có đủ dòng cho dữ liệu - PHẢI ĐẶT TRƯỚC KHI THÊM UPDATECELLS
      const maxDataRows = Math.max(
        ...sheets.map((sheet) => sheet.data.length),
        0,
      );
      if (maxDataRows > 0) {
        // Thêm yêu cầu mở rộng số dòng nếu cần - ĐẶT ĐẦU TIÊN trong mảng requests
        for (const sheet of sheets) {
          const sheetId = sheetIdMap.get(sheet.sheetName);
          if (sheetId === undefined) continue;

          // Đặt yêu cầu cập nhật số dòng VÀO ĐẦU mảng batchRequests
          batchRequests.unshift({
            updateSheetProperties: {
              properties: {
                sheetId: sheetId,
                gridProperties: {
                  rowCount: Math.max(5000, maxDataRows + 100), // Đủ dòng nhưng không quá lớn
                },
              },
              fields: 'gridProperties.rowCount',
            },
          });
        }
      }

      // Chuẩn bị TẤT CẢ dữ liệu và định dạng vào CÙNG một API call
      for (const sheet of sheets) {
        const sheetId = sheetIdMap.get(sheet.sheetName);
        if (sheetId === undefined) {
          this.logger.warn(
            `Không tìm thấy sheetId cho sheet ${sheet.sheetName}, bỏ qua`,
          );
          continue;
        }

        // TỐI ƯU: Sử dụng updateCells để GHI DỮ LIỆU và ĐỊNH DẠNG cùng lúc
        // Chuẩn bị dữ liệu và định dạng cho header
        if (!existingSheets.has(sheet.sheetName)) {
          // Tạo mảng RowData với dữ liệu header và định dạng
          const headerRow: {
            values: Array<{
              userEnteredValue: { stringValue: string };
              userEnteredFormat: {
                backgroundColor: { red: number; green: number; blue: number };
                textFormat: { bold: boolean; fontSize: number };
                horizontalAlignment: string;
                verticalAlignment: string;
                wrapStrategy: string;
                padding: {
                  left: number;
                  right: number;
                  top: number;
                  bottom: number;
                };
              };
            }>;
          } = {
            values: sheet.header.map((headerText) => ({
              userEnteredValue: { stringValue: headerText },
              userEnteredFormat: {
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                textFormat: { bold: true, fontSize: 12 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                wrapStrategy: 'OVERFLOW_CELL',
                padding: { left: 20, right: 20, top: 4, bottom: 4 },
              },
            })),
          };

          // Thêm yêu cầu updateCells cho header
          batchRequests.push({
            updateCells: {
              start: {
                sheetId: sheetId,
                rowIndex: 0,
                columnIndex: 0,
              },
              rows: [headerRow] as any[], // Type assertion to avoid linter error with complex nested types
              fields: 'userEnteredValue,userEnteredFormat',
            },
          });
        }

        // Chuẩn bị dữ liệu và định dạng cho data nếu có dữ liệu
        if (sheet.data.length > 0) {
          // Tạo mảng RowData với dữ liệu và định dạng cơ bản
          const dataRows = sheet.data.map((row) => ({
            values: row.map((cellValue, columnIndex) => {
              // Định dạng mặc định cho tất cả các ô
              const baseFormat = {
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                wrapStrategy: 'OVERFLOW_CELL',
                backgroundColor: { red: 1, green: 1, blue: 1 },
                padding: { left: 20, right: 20, top: 2, bottom: 2 },
              };

              // Xác định loại dữ liệu và định dạng đặc biệt
              let userEnteredValue: {
                stringValue?: string;
                numberValue?: number;
                boolValue?: boolean;
              };
              let specialFormat: {
                numberFormat?: {
                  type: string;
                  pattern?: string;
                };
              } = {};

              // Xử lý cột Created Time (cột thứ 23, index = 22)
              if (columnIndex === 22) {
                // Đảm bảo định dạng văn bản cho cột Created Time
                // Loại bỏ dấu nháy đơn nếu có
                const timeValue =
                  typeof cellValue === 'string'
                    ? cellValue.replace(/^'/, '') // Loại bỏ dấu nháy đơn ở đầu nếu có
                    : String(cellValue || '');

                userEnteredValue = { stringValue: timeValue };
                specialFormat = { numberFormat: { type: 'TEXT' } };
              }
              // Xử lý các cột số
              else if (
                sheet.numericColumns?.includes(
                  String.fromCharCode(65 + columnIndex),
                )
              ) {
                // Chuyển đổi thành số nếu có thể
                const numValue: number =
                  typeof cellValue === 'string' && cellValue
                    ? parseFloat(cellValue)
                    : typeof cellValue === 'number'
                      ? cellValue
                      : NaN;
                if (
                  !isNaN(numValue) &&
                  numValue !== null &&
                  numValue !== undefined
                ) {
                  userEnteredValue = { numberValue: numValue };
                  specialFormat = {
                    numberFormat: { type: 'NUMBER', pattern: '#,##0.00' },
                  };
                } else {
                  userEnteredValue = { stringValue: String(cellValue || '') };
                }
              }
              // Xử lý các loại dữ liệu khác
              else if (cellValue === null || cellValue === undefined) {
                userEnteredValue = { stringValue: '' };
              } else if (typeof cellValue === 'number') {
                userEnteredValue = { numberValue: cellValue };
              } else if (typeof cellValue === 'boolean') {
                userEnteredValue = { boolValue: cellValue };
              } else {
                userEnteredValue = { stringValue: String(cellValue) };
              }

              // Kết hợp định dạng cơ bản và đặc biệt
              return {
                userEnteredValue,
                userEnteredFormat: { ...baseFormat, ...specialFormat },
              };
            }),
          }));

          // Thêm yêu cầu updateCells cho dữ liệu
          batchRequests.push({
            updateCells: {
              start: {
                sheetId: sheetId,
                rowIndex: 1, // Bắt đầu từ dòng 2 (sau header)
                columnIndex: 0,
              },
              rows: dataRows as {
                values: {
                  userEnteredValue: {
                    stringValue?: string;
                    numberValue?: number;
                    boolValue?: boolean;
                  };
                  userEnteredFormat: {
                    horizontalAlignment: string;
                    verticalAlignment: string;
                    wrapStrategy: string;
                    backgroundColor: {
                      red: number;
                      green: number;
                      blue: number;
                    };
                    padding: {
                      left: number;
                      right: number;
                      top: number;
                      bottom: number;
                    };
                    numberFormat?: { type: string; pattern?: string };
                  };
                }[];
              }[],
              fields: 'userEnteredValue,userEnteredFormat',
            },
          });
        }

        // Thiết lập kích thước tối thiểu cho các cột
        batchRequests.push({
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: sheet.header.length,
            },
            properties: {
              pixelSize: 150, // Thiết lập chiều rộng tối thiểu là 150 pixels
            },
            fields: 'pixelSize',
          },
        });

        // Auto resize columns
        batchRequests.push({
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: sheet.header.length,
            },
          },
        });
      }

      // Thực thi TẤT CẢ các thay đổi trong MỘT lần gọi API duy nhất
      this.logger.debug(
        `Thực hiện API call để ghi và định dạng ${sheets.length} sheets...`,
      );
      await this.executeWithRetry(async () => {
        const sheetsClient = await this.getSheetsClient();
        return sheetsClient.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: batchRequests },
        });
      });

      this.logger.log(
        `Đã ghi và định dạng ${sheets.length} sheets trong cùng một API call (siêu tối ưu)`,
      );

      // Kết thúc tracking
      if (taskName && this.currentTaskName === taskName) {
        this.endTaskTracking();
      }
    } catch (error) {
      if (taskName && this.currentTaskName === taskName) {
        this.endTaskTracking();
      }
      throw error;
    }
  }

  /**
   * Phương thức tối ưu kết hợp xóa, ghi và định dạng dữ liệu vào một sheet
   * Giảm số lần gọi API từ 6-7 xuống còn 2-3 lần
   */
  async writeAndFormatSheet({
    spreadsheetId,
    sheetName,
    header,
    data,
    numericColumns,
    taskName,
  }: {
    spreadsheetId: string;
    sheetName: string;
    header: string[];
    data: any[][];
    numericColumns?: string[];
    taskName?: string;
  }): Promise<sheets_v4.Schema$UpdateValuesResponse> {
    // Bắt đầu tracking nếu có taskName
    if (taskName && !this.currentTaskName) {
      this.startTaskTracking(taskName);
    }

    this.logger.debug(
      `🚀 writeAndFormatSheet: Ghi và định dạng sheet ${sheetName} (${data.length} dòng x ${data[0]?.length || 0} cột)`,
    );

    try {
      // Đảm bảo sheet tồn tại trước khi thao tác
      await this.ensureSheetExistsWithHeader(spreadsheetId, sheetName, header);

      // Ghi dữ liệu vào sheet
      const values = [...data]; // Không cần thêm header vì đã được thêm khi tạo sheet

      // Lấy sheetId để định dạng
      const sheetId = await this.getSheetId(spreadsheetId, sheetName);

      if (sheetId === null) {
        throw new Error(`Không tìm thấy sheetId cho sheet ${sheetName}`);
      }

      // Ghi data từ dòng 2 (dưới header)
      const writeResult = await this.executeWithRetry(async () => {
        const sheets = await this.getSheetsClient();
        return sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A2:${String.fromCharCode(65 + header.length - 1)}${values.length + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
      });

      // Định dạng bảng trong một lần gọi
      const formatRequests: any[] = [
        // Định dạng cơ bản cho tất cả các ô dữ liệu
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1, // Bắt đầu từ dòng 2 (sau header)
              endRowIndex: values.length + 1,
              startColumnIndex: 0,
              endColumnIndex: header.length,
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
                padding: {
                  left: 20, // Tăng padding bên trái
                  right: 20, // Tăng padding bên phải
                  top: 2,
                  bottom: 2,
                },
              },
            },
            fields: 'userEnteredFormat',
          },
        },
        // Thiết lập kích thước tối thiểu cho các cột
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: header.length,
            },
            properties: {
              pixelSize: 150, // Thiết lập chiều rộng tối thiểu là 150 pixels
            },
            fields: 'pixelSize',
          },
        },
        // Auto resize columns để căn chỉnh theo nội dung thực tế
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: header.length,
            },
          },
        },
      ];

      // Đặc biệt định dạng cột Created Time là TEXT để tránh chuyển đổi sang số
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: values.length + 1,
            startColumnIndex: 22, // Cột W - Created Time (thứ 23)
            endColumnIndex: 23,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: 'TEXT',
              },
            },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      });

      // Thêm định dạng số cho các cột được chỉ định
      if (numericColumns?.length) {
        for (const colLetter of numericColumns) {
          const colIndex = colLetter.charCodeAt(0) - 65;
          // Bỏ qua nếu đây là cột Created Time
          if (colIndex === 22) continue;

          formatRequests.push({
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 1,
                endRowIndex: values.length + 1,
                startColumnIndex: colIndex,
                endColumnIndex: colIndex + 1,
              },
              cell: {
                userEnteredFormat: {
                  numberFormat: {
                    type: 'NUMBER',
                    pattern: '#,##0.00',
                  },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          });
        }
      }

      // Thực hiện format trong một lần gọi
      await this.executeWithRetry(async () => {
        const sheets = await this.getSheetsClient();
        return sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: formatRequests },
        });
      });

      this.logger.log(
        `Đã ghi và định dạng ${values.length} dòng vào sheet ${sheetName} (tối ưu)`,
      );

      // Kết thúc tracking nếu đã bắt đầu
      if (taskName && this.currentTaskName === taskName) {
        this.endTaskTracking();
      }

      return writeResult.data;
    } catch (error) {
      if (taskName && this.currentTaskName === taskName) {
        this.endTaskTracking();
      }
      throw error;
    }
  }
}
