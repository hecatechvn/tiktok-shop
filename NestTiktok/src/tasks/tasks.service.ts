import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { AccountsService } from 'src/accounts/accounts.service';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AccountDocument } from 'src/accounts/entities/account.entity';
import { TiktokService } from 'src/tiktok/tiktok.service';
import { CommonParams, ResponseRefreshToken } from 'src/types';
import { GoogleSheetsService } from 'src/google-sheets/google-sheets.service';
import { getDateInIndochinaTime } from 'src/utils/date';
import { ExtractedOrderItem } from 'src/types/order';
import { SheetValues } from 'src/types/google-sheets';

@Injectable()
export class TasksService implements OnModuleInit {
  private readonly logger = new Logger(TasksService.name);
  private accountJobs: Map<string, CronJob> = new Map();

  constructor(
    @Inject(forwardRef(() => AccountsService))
    private readonly accountsService: AccountsService,
    private schedulerRegistry: SchedulerRegistry,
    private readonly tiktokService: TiktokService,
    private readonly googleSheetsService: GoogleSheetsService,
  ) {}

  // Phương thức khởi tạo cronjob khi ứng dụng khởi động
  async onModuleInit() {
    this.logger.log('Đang khởi tạo cronjob cho các tài khoản...');
    await this.setupAccountJobs();
  }

  // Phương thức ghi dữ liệu vào Google Sheets
  async writeSheets() {
    const accounts = await this.accountsService.findAll();
    return accounts;
  }

  // Phương thức lên lịch các công việc động, chạy vào phút 0 mỗi giờ
  @Cron('0 * * * *')
  async scheduleDynamicJobs() {
    this.logger.log('Đang kiểm tra và cập nhật các cronjob theo tài khoản...');
    await this.setupAccountJobs();
  }

  // Phương thức lên lịch các công việc động, chạy vào ngày 1 tháng mỗi năm
  @Cron('0 0 0 1 * *')
  async runUpdateSheetsForNewYear() {
    const accounts = await this.accountsService.findAll();
    this.logger.log(
      'Đang kiểm tra và cập nhật các sheets mới cho tài khoản...',
    );
    for (const account of accounts) {
      await this.updateSheetsForNewYear(account);
    }
  }

  // // Phương thức kiểm tra và chạy thử nghiệm mỗi phút
  // @Cron('* * * * *')
  // async test() {
  //   this.logger.log('Đang chạy test');
  //   // const account = await this.accountsService.findOne(
  //   //   '68429f6fe44a7a2502dd6938',
  //   // );

  //   // if (!account) {
  //   //   this.logger.error('Không tìm thấy tài khoản');
  //   //   return;
  //   // }

  //   // await this.runWriteSheetCurrentMonthAndUpdatePreviousMonth(account);
  //   this.logger.log('Đã chạy test');
  // }

  // Phương thức đăng ký cronjob cho một tài khoản mới ngay lập tức
  async registerAccountJob(accountId: string) {
    try {
      const account = await this.accountsService.findOne(accountId);
      if (!account) {
        this.logger.error(`Không tìm thấy tài khoản với ID: ${accountId}`);
        return false;
      }

      // Kiểm tra xem account.task có tồn tại không
      if (!account.task) {
        this.logger.error(`Tài khoản ${accountId} không có thông tin task`);
        return false;
      }

      // Nếu tài khoản đã có cronjob, xóa cronjob cũ
      if (this.accountJobs.has(accountId)) {
        this.logger.log(`Xóa cronjob cũ cho tài khoản ${accountId}`);
        this.deleteAccountJob(accountId);
      }

      // Nếu tài khoản bị vô hiệu hóa (status = false), không tạo cronjob
      if (account.status === false) {
        this.logger.log(
          `Không tạo cronjob cho tài khoản ${accountId} vì tài khoản đang bị vô hiệu hóa (status: ${account.status})`,
        );
        return true; // Vẫn trả về true vì đã xử lý thành công theo yêu cầu (không tạo cronjob)
      }

      // Tạo cronjob mới nếu tài khoản có task và task đang được kích hoạt
      if (account.task && account.task.cronExpression) {
        // Kiểm tra trạng thái isActive
        if (account.task.isActive === false) {
          this.logger.log(
            `Không tạo cronjob cho tài khoản ${accountId} vì task đang bị vô hiệu hóa (isActive: ${account.task.isActive})`,
          );
          return true; // Vẫn trả về true vì đã xử lý thành công theo yêu cầu (không tạo cronjob)
        }

        this.logger.log(
          `Tạo cronjob mới cho tài khoản ${accountId} với biểu thức: ${account.task.cronExpression}, isActive: ${account.task.isActive}`,
        );
        this.createAccountJob(account);
        return true;
      } else {
        this.logger.warn(
          `Tài khoản ${accountId} không có cronExpression hợp lệ: ${account.task?.cronExpression}`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Lỗi khi đăng ký cronjob cho tài khoản ${accountId}:`,
        error,
      );
      return false;
    }
  }

  // Phương thức thiết lập cronjob cho tất cả các tài khoản
  async setupAccountJobs() {
    try {
      // Lấy tất cả tài khoản
      const accounts = await this.accountsService.findAll();

      // Danh sách các accountIds hiện có
      const currentAccountIds = new Set(this.accountJobs.keys());
      const newAccountIds = new Set();

      // Kiểm tra từng tài khoản
      for (const account of accounts) {
        const accountId = account._id as string;
        newAccountIds.add(accountId);

        // Kiểm tra và làm mới access token nếu cần
        await this.checkAndRefreshToken(account);

        // Nếu tài khoản bị vô hiệu hóa (status = false), xóa cronjob nếu có
        if (account.status === false) {
          if (this.accountJobs.has(accountId)) {
            this.logger.log(
              `Xóa cronjob cho tài khoản ${accountId} vì tài khoản đã bị vô hiệu hóa (status: ${account.status})`,
            );
            this.deleteAccountJob(accountId);
          }
          continue;
        }

        // Nếu task không được kích hoạt, xóa cronjob nếu có
        if (account.task && account.task.isActive === false) {
          if (this.accountJobs.has(accountId)) {
            this.logger.log(
              `Xóa cronjob cho tài khoản ${accountId} vì task đã bị vô hiệu hóa`,
            );
            this.deleteAccountJob(accountId);
          }
          continue;
        }

        // Nếu tài khoản đã có cronjob, kiểm tra xem có cần cập nhật không
        if (this.accountJobs.has(accountId)) {
          const existingJob = this.accountJobs.get(accountId);
          if (existingJob) {
            const currentCronTime = existingJob.cronTime.source;

            // Nếu cronExpression đã thay đổi, cập nhật cronjob
            if (
              account.task &&
              account.task.cronExpression !== currentCronTime
            ) {
              this.logger.log(
                `Cập nhật cronjob cho tài khoản ${accountId}: ${String(
                  currentCronTime,
                )} -> ${account.task.cronExpression}`,
              );

              // Xóa cronjob cũ
              this.deleteAccountJob(accountId);

              // Tạo cronjob mới
              this.createAccountJob(account);
            }
          }
        }
        // Nếu tài khoản chưa có cronjob, tạo mới
        else if (account.task && account.task.cronExpression) {
          this.createAccountJob(account);
        }
      }

      // Xóa các cronjob của tài khoản không còn tồn tại
      for (const oldAccountId of currentAccountIds) {
        if (!newAccountIds.has(oldAccountId)) {
          this.deleteAccountJob(oldAccountId);
        }
      }

      this.logger.log(
        `Tổng số cronjob đang hoạt động: ${this.accountJobs.size}`,
      );
    } catch (error) {
      this.logger.error('Lỗi khi thiết lập cronjob theo tài khoản:', error);
    }
  }

  // Phương thức tạo cronjob cho một tài khoản
  private createAccountJob(account: AccountDocument) {
    try {
      const accountId = String(account._id);
      const cronExpression = account.task.cronExpression;

      // Kiểm tra nếu tài khoản bị vô hiệu hóa thì không tạo cronjob
      if (account.status === false) {
        this.logger.log(
          `Không tạo cronjob cho tài khoản ${accountId} vì tài khoản đang bị vô hiệu hóa (status: ${account.status})`,
        );
        return;
      }

      // Kiểm tra nếu task không được kích hoạt thì không tạo cronjob
      if (account.task.isActive === false) {
        this.logger.log(
          `Không tạo cronjob cho tài khoản ${accountId} vì task đang bị vô hiệu hóa`,
        );
        return;
      }

      // Tạo cronjob mới
      const job = new CronJob(cronExpression, async () => {
        try {
          this.logger.log(
            `Đang chạy task cho tài khoản ${accountId} - ${account.appKey}`,
          );

          // Cập nhật thời gian chạy gần nhất
          await this.accountsService.updateTaskLastRun(accountId);

          // Thực hiện công việc của cronjob
          await this.processAccountTask(account);

          this.logger.log(
            `Hoàn thành task cho tài khoản ${accountId} - ${account.appKey}`,
          );
        } catch (error) {
          this.logger.error(
            `Lỗi khi chạy task cho tài khoản ${accountId}:`,
            error,
          );
        }
      });

      // Lưu và khởi động cronjob
      this.accountJobs.set(accountId, job);
      job.start();

      this.logger.log(
        `Đã tạo cronjob cho tài khoản ${accountId} với biểu thức: ${cronExpression}`,
      );
    } catch (error) {
      this.logger.error(`Lỗi khi tạo cronjob cho tài khoản:`, error);
    }
  }

  // Phương thức xóa cronjob của một tài khoản
  public deleteAccountJob(accountId: string) {
    try {
      const job = this.accountJobs.get(accountId);
      if (job) {
        job.stop();
        this.accountJobs.delete(accountId);
        this.logger.log(`Đã xóa cronjob cho tài khoản ${accountId}`);
      }
    } catch (error) {
      this.logger.error(
        `Lỗi khi xóa cronjob cho tài khoản ${accountId}:`,
        error,
      );
    }
  }

  // Phương thức ghi dữ liệu vào Google Sheets
  private async writeDataToSheet(
    spreadsheetId: string,
    sheetName: string,
    orderData: ExtractedOrderItem[],
    // updateOnly: boolean = false,
  ) {
    try {
      if (!orderData || orderData.length === 0) {
        console.log(`Không có dữ liệu để xử lý cho sheet: ${sheetName}`);
        return;
      }

      const header = [
        'Order ID',
        'Order Status',
        'Order Substatus',
        'Cancellation Return Type',
        'SKU ID',
        'Product Name',
        'Variation',
        'Quantity',
        'SKU Quantity Return',
        'SKU Unit Original Price',
        'SKU Subtotal Before Discount',
        'SKU Platform Discount',
        'SKU Seller Discount',
        'SKU Subtotal After Discount',
        'Shipping Fee After Discount',
        'Original Shipping Fee',
        'Shipping Fee Seller Discount',
        'Shipping Fee Platform Discount',
        'Payment Platform Discount',
        'Taxes',
        'Order Amount',
        'Order Refund Amount',
        'Created Time',
        'Cancel Reason',
      ];

      // Sắp xếp dữ liệu theo ngày tạo (created_time) trước khi mapping
      orderData.sort((a, b) => {
        // Kiểm tra nếu created_time không tồn tại
        if (!a.created_time) return -1;
        if (!b.created_time) return 1;

        // Chuyển đổi định dạng DD/MM/YYYY thành Date object
        const parseDate = (dateStr: string) => {
          const [day, month, year] = dateStr.split('/').map(Number);
          return new Date(year, month - 1, day).getTime();
        };

        const dateA = parseDate(a.created_time);
        const dateB = parseDate(b.created_time);
        return dateA - dateB; // Sắp xếp tăng dần theo ngày (cũ đến mới)
      });

      const mappingOrder = orderData.map((item) => [
        item.order_id || '',
        item.order_status || '',
        item.order_substatus || '',
        item.cancellation_return_type || '',
        item.sku_id || '',
        item.product_name || '',
        item.variation || '',
        item.quantity || '',
        item.sku_quantity_return || '',
        item.sku_unit_original_price || '',
        item.sku_subtotal_before_discount || '',
        item.sku_platform_discount || '',
        item.sku_seller_discount || '',
        item.sku_subtotal_after_discount || '',
        item.shipping_fee_after_discount || '',
        item.original_shipping_fee || '',
        item.shipping_fee_seller_discount || '',
        item.shipping_fee_platform_discount || '',
        item.payment_platform_discount || '',
        item.taxes || '',
        item.order_amount || '',
        item.order_refund_amount || '',
        item.created_time || '',
        item.cancel_reason || '',
      ]) as SheetValues;

      // Kiểm tra sheet có tồn tại
      const checkExist = await this.googleSheetsService.sheetExists(
        spreadsheetId,
        sheetName,
      );

      // Quota limit + helper
      const QUOTA_LIMIT = 60;
      let requestCount = 0;
      let startTime = Date.now();

      const checkAndWaitForQuota = async () => {
        requestCount++;
        if (requestCount >= QUOTA_LIMIT) {
          const elapsedMs = Date.now() - startTime;
          const oneMinuteInMs = 60 * 1000;

          if (elapsedMs < oneMinuteInMs) {
            const waitTime = oneMinuteInMs - elapsedMs + 500;
            console.log(
              `Đã đạt giới hạn quota, đợi ${waitTime}ms trước khi tiếp tục`,
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }

          requestCount = 0;
          startTime = Date.now();
        }
      };

      if (!checkExist) {
        // Thêm mới sheet
        await this.googleSheetsService.addSheet({
          spreadsheetId,
          sheetTitle: sheetName,
        });
        await checkAndWaitForQuota();

        // Ghi header
        await this.googleSheetsService.writeToSheet({
          spreadsheetId,
          range: `${sheetName}!A1`,
          values: [header],
        });
        await checkAndWaitForQuota();

        // Chuẩn bị định dạng cho vùng dữ liệu trước khi thêm dữ liệu mới
        await this.googleSheetsService.prepareDataArea(
          spreadsheetId,
          sheetName,
          1, // Bắt đầu từ dòng 1 (sau header)
          mappingOrder.length + 100, // Dự phòng thêm 100 dòng
        );
        await checkAndWaitForQuota();
        console.log(`Đã chuẩn bị định dạng cho vùng dữ liệu ${sheetName}`);

        // Ghi toàn bộ data 1 lần
        await this.googleSheetsService.appendToSheet({
          spreadsheetId,
          range: `${sheetName}!A2`,
          values: mappingOrder,
        });
        await checkAndWaitForQuota();

        // Áp dụng định dạng hoàn chỉnh cho bảng sau khi thêm dữ liệu
        const totalRows = mappingOrder.length + 1;
        await this.googleSheetsService.formatCompleteTable(
          spreadsheetId,
          sheetName,
          totalRows,
        );
        await checkAndWaitForQuota();

        console.log(`Đã ghi toàn bộ dữ liệu cho sheet ${sheetName}`);
      } else {
        // Sheet đã tồn tại
        const existingData = await this.googleSheetsService.readSheet({
          spreadsheetId,
          range: `${sheetName}!A:Z`,
        });

        if (existingData.length === 0) {
          // Sheet rỗng, ghi header
          await this.googleSheetsService.writeToSheet({
            spreadsheetId,
            range: `${sheetName}!A1`,
            values: [header],
          });
          await checkAndWaitForQuota();

          // Chuẩn bị định dạng cho vùng dữ liệu trước khi thêm dữ liệu mới
          await this.googleSheetsService.prepareDataArea(
            spreadsheetId,
            sheetName,
            1, // Bắt đầu từ dòng 1 (sau header)
            mappingOrder.length + 100, // Dự phòng thêm 100 dòng
          );
          await checkAndWaitForQuota();
          console.log(`Đã chuẩn bị định dạng cho vùng dữ liệu ${sheetName}`);

          await this.googleSheetsService.appendToSheet({
            spreadsheetId,
            range: `${sheetName}!A2`,
            values: mappingOrder,
          });
          await checkAndWaitForQuota();

          // Áp dụng định dạng hoàn chỉnh cho bảng sau khi thêm dữ liệu
          const totalRows = mappingOrder.length + 1; // +1 cho header
          await this.googleSheetsService.formatCompleteTable(
            spreadsheetId,
            sheetName,
            totalRows,
          );
          await checkAndWaitForQuota();

          console.log(`Đã ghi toàn bộ dữ liệu cho sheet ${sheetName}`);
        } else {
          // Đã có data → xóa hết dữ liệu cũ (trừ header) và thêm lại dữ liệu mới

          // Xóa tất cả dữ liệu cũ trừ hàng header
          await this.googleSheetsService.clearSheetData(
            spreadsheetId,
            sheetName,
          );
          await checkAndWaitForQuota();
          console.log(`Đã xóa tất cả dữ liệu cũ của sheet ${sheetName}`);

          // Chuẩn bị định dạng cho vùng dữ liệu trước khi thêm dữ liệu mới
          // Số dòng là số dòng dữ liệu + 100 dòng buffer để đảm bảo bao phủ đủ
          await this.googleSheetsService.prepareDataArea(
            spreadsheetId,
            sheetName,
            1, // Bắt đầu từ dòng 1 (sau header)
            mappingOrder.length + 100, // Dự phòng thêm 100 dòng
          );
          await checkAndWaitForQuota();
          console.log(`Đã chuẩn bị định dạng cho vùng dữ liệu ${sheetName}`);

          // Thêm tất cả dữ liệu mới vào sheet
          await this.googleSheetsService.appendToSheet({
            spreadsheetId,
            range: `${sheetName}!A2`,
            values: mappingOrder,
          });
          await checkAndWaitForQuota();

          // Áp dụng định dạng hoàn chỉnh cho bảng sau khi thêm dữ liệu
          const totalRows = mappingOrder.length + 1; // +1 cho header
          await this.googleSheetsService.formatCompleteTable(
            spreadsheetId,
            sheetName,
            totalRows,
          );
          await checkAndWaitForQuota();

          console.log(
            `Đã thêm ${mappingOrder.length} dòng mới vào sheet ${sheetName}`,
          );
        }
      }

      console.log(`Hoàn thành xử lý dữ liệu cho sheet: ${sheetName}`);
    } catch (error) {
      console.error(`Lỗi khi xử lý dữ liệu cho sheet ${sheetName}:`, error);
      throw error;
    }
  }

  // Phương thức lấy tên tháng từ số tháng
  private getMonthName(month: number): string {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return monthNames[month];
  }

  // Phương thức xử lý và ghi dữ liệu đơn hàng của tháng hiện tại và cập nhật tháng trước
  public async runWriteSheetCurrentMonthAndUpdatePreviousMonth(
    account: AccountDocument,
  ) {
    try {
      const options: Partial<CommonParams> = {
        app_key: account.appKey,
        app_secret: account.appSecret,
        access_token: account.accessToken,
        shop_cipher: account.shopCipher[0].cipher,
      };

      const currentDate = getDateInIndochinaTime();
      const currentDay = currentDate.getDate();

      // Xử lý đơn hàng của tháng hiện tại
      // Lấy ra ngày đầu tháng của tháng hiện tại
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();

      // Tạo ngày đầu tháng hiện tại
      const currentDateStartOfMonth = new Date(currentYear, currentMonth, 1);
      currentDateStartOfMonth.setHours(0, 0, 0, 0); // Đặt về đầu ngày (00:00:00)

      const currentMonthName = this.getMonthName(currentMonth);

      const dataCurrentMonth = await this.tiktokService.getOrdersByDateRange(
        options as CommonParams,
        currentDateStartOfMonth,
        currentDate,
      );

      // Ghi dữ liệu vào sheet
      await this.writeDataToSheet(
        account.sheetId,
        `${currentMonthName}-${currentYear}`,
        dataCurrentMonth,
      );

      // Xử lý đơn hàng của tháng trước - chỉ thực hiện trong nửa đầu tháng
      if (currentDay < 16) {
        // Tạo ngày 15 ngày trước
        const date15DaysAgo = new Date(currentDate);
        date15DaysAgo.setDate(currentDate.getDate() - 15);
        date15DaysAgo.setHours(0, 0, 0, 0); // Đặt thời gian về 00:00:00

        // Lấy dữ liệu đơn hàng từ 15 ngày trước đến hiện tại
        const dataPreviousMonth = await this.tiktokService.getOrdersByDateRange(
          options as CommonParams,
          date15DaysAgo,
          currentDate,
        );

        const getMonth =
          currentDate.getMonth() === 0 ? 11 : currentDate.getMonth() - 1;

        const dataPreviousMonthFiltered = dataPreviousMonth.filter((order) => {
          if (!order.created_time) return false;

          // Xử lý định dạng DD/MM/YYYY
          const dateParts = order.created_time.split('/');
          if (dateParts.length !== 3) return false;

          // Chuyển từ DD/MM/YYYY sang MM/DD/YYYY để JavaScript parse đúng
          const month = parseInt(dateParts[1], 10) - 1; // Tháng trong JS là 0-11

          // Kiểm tra tháng có phải là tháng trước không
          return month === getMonth;
        });

        // Nếu có dữ liệu của tháng trước
        if (dataPreviousMonthFiltered.length > 0) {
          // Lấy tên tháng của tháng trước
          const previousMonth = getMonth;
          const previousYear =
            previousMonth === 11 && currentMonth === 0
              ? currentYear - 1
              : currentYear;
          const previousMonthName = this.getMonthName(previousMonth);
          const previousSheetName = `${previousMonthName}-${previousYear}`;

          // Sử dụng hàm writeDataToSheet để cập nhật sheet
          await this.writeDataToSheet(
            account.sheetId,
            previousSheetName,
            dataPreviousMonthFiltered,
          );
        }
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Lỗi khi xử lý dữ liệu cho tài khoản ${account.appKey}:`,
        error,
      );
      return false;
    }
  }

  // Phương thức xử lý công việc cụ thể cho tài khoản
  private async processAccountTask(account: AccountDocument) {
    // Thực hiện công việc cụ thể cho tài khoản
    // Ví dụ: lấy dữ liệu đơn hàng, cập nhật data, v.v.
    try {
      this.logger.log(`Đang xử lý dữ liệu cho tài khoản: ${account.appKey}`);

      // Kiểm tra và làm mới access token nếu cần
      await this.checkAndRefreshToken(account);

      // Chỉ xử lý tài khoản được truyền vào, không lấy lại tất cả tài khoản
      await this.runWriteSheetCurrentMonthAndUpdatePreviousMonth(account);

      this.logger.log(
        `Hoàn thành xử lý dữ liệu cho tài khoản: ${account.appKey}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Lỗi khi xử lý task cho tài khoản ${String(account._id)}:`,
        error,
      );
      return false;
    }
  }

  // Phương thức kiểm tra và làm mới token nếu cần
  private async checkAndRefreshToken(account: AccountDocument) {
    try {
      const {
        accessTokenExpireIn,
        refreshToken,
        accessToken,
        appSecret,
        appKey,
      } = account;

      // Kiểm tra nếu token sắp hết hạn (ví dụ: còn dưới 1 giờ)
      const currentTimeInSec = Math.floor(Date.now() / 1000);
      const tokenExpiryTime = accessTokenExpireIn;
      const timeUntilExpiry = tokenExpiryTime - currentTimeInSec;

      // Nếu token sắp hết hạn (còn dưới 1 giờ), làm mới token
      if (timeUntilExpiry < 3600) {
        this.logger.log(
          `Token của tài khoản ${account.appKey} sắp hết hạn, đang làm mới...`,
        );

        const commonParams: CommonParams = {
          access_token: accessToken,
          app_key: appKey,
          app_secret: appSecret,
          sign: '',
          timestamp: Date.now(),
          auth_code: '',
          page_size: 10,
          shop_cipher: '',
          query_params: {},
          refresh_token: refreshToken,
        };

        const response =
          await this.tiktokService.refreshToken<ResponseRefreshToken>(
            commonParams,
          );

        if (response && response.code === 0 && response.data) {
          // Cập nhật token mới vào database
          await this.accountsService.update(String(account._id), {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            accessTokenExpireIn: response.data.access_token_expire_in,
            refreshTokenExpireIn: response.data.refresh_token_expire_in,
          });

          this.logger.log(`Đã làm mới token cho tài khoản ${account.appKey}`);
        } else {
          this.logger.error(
            `Không thể làm mới token cho tài khoản ${account.appKey}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Lỗi khi làm mới token cho tài khoản ${account.appKey}:`,
        error,
      );
    }
  }

  // Phương thức ghi dữ liệu đơn hàng của tất cả các tháng vào Google Sheets
  public async runWriteSheetAllMonth(account: AccountDocument) {
    const options: Partial<CommonParams> = {
      app_key: account.appKey,
      app_secret: account.appSecret,
      access_token: account.accessToken,
      shop_cipher: account.shopCipher[0].cipher,
    };

    const result = await this.tiktokService.getAllOrders(
      options as CommonParams,
    );

    // Lấy tháng hiện tại để xử lý đặc biệt
    const currentDate = getDateInIndochinaTime();
    const currentYear = currentDate.getFullYear();
    // const currentMonth = currentDate.getMonth();

    const { ordersByMonth } = result;

    const monthEntries = Object.entries(ordersByMonth);

    for (const [month, monthData] of monthEntries) {
      if (monthData.length === 0) {
        console.log(`Tháng ${month} không có dữ liệu, bỏ qua`);
        continue;
      }

      // Lấy tên tháng từ số tháng
      const monthNumber = parseInt(month);
      const monthName = this.getMonthName(monthNumber - 1);
      const sheetNameForMonth = `${monthName}-${currentYear}`;

      try {
        // Sử dụng hàm writeDataToSheet để xử lý dữ liệu

        // Nếu là tháng hiện tại, cho phép thêm đơn hàng mới (updateOnly = false)
        // Nếu không phải tháng hiện tại, chỉ cập nhật đơn hàng hiện có (updateOnly = true)
        await this.writeDataToSheet(
          account.sheetId,
          sheetNameForMonth,
          monthData,
        );
      } catch (error) {
        console.error(`Lỗi khi xử lý dữ liệu tháng ${month}:`, error);
      }
    }
  }

  // Phương thức cập nhật sheets khi sang năm mới
  public async updateSheetsForNewYear(account: AccountDocument) {
    try {
      // Lấy thời gian hiện tại theo múi giờ Đông Dương
      const currentDate = getDateInIndochinaTime();
      const currentYear = currentDate.getFullYear();

      // Lấy năm hiện tại của task.lastRun làm năm cập nhật cuối cùng
      const lastUpdateDate = account.task?.lastRun || new Date();
      const lastUpdateYear = lastUpdateDate.getFullYear();

      // Kiểm tra nếu năm hiện tại lớn hơn năm cập nhật cuối cùng
      if (currentYear > lastUpdateYear) {
        this.logger.log(
          `Phát hiện năm mới (${currentYear}) cho tài khoản ${account.appKey}, cập nhật sheets mới...`,
        );

        const sheetNew = await this.googleSheetsService.createSheet(
          `${account.shopName}-${currentYear}`,
        );

        if (sheetNew) {
          await this.accountsService.update(String(account._id), {
            sheetId: sheetNew,
          });
        }
      } else {
        this.logger.log(
          `Không cần cập nhật sheets mới cho tài khoản ${account.appKey} (Năm hiện tại: ${currentYear}, Năm cập nhật cuối: ${lastUpdateYear})`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Lỗi khi cập nhật sheets cho năm mới cho tài khoản ${account.appKey}:`,
        error,
      );
      return false;
    }
  }
}
