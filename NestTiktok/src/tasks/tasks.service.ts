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

  // Phương thức ghi dữ liệu vào Google Sheets (đã được tối ưu)
  private async writeDataToSheet(
    spreadsheetId: string,
    sheetName: string,
    orderData: ExtractedOrderItem[],
  ) {
    try {
      // Bắt đầu theo dõi quota API
      this.googleSheetsService.startTaskTracking(`Write data to ${sheetName}`);

      if (!orderData || orderData.length === 0) {
        console.log(`Không có dữ liệu để xử lý cho sheet: ${sheetName}`);
        this.googleSheetsService.endTaskTracking();
        return;
      }

      // Định nghĩa các cột cần định dạng số (US format)
      const numericColumns = [
        'H',
        'I',
        'J',
        'K',
        'L',
        'M',
        'N',
        'O',
        'P',
        'Q',
        'R',
        'S',
        'T',
        'U',
        'V',
      ];

      // Helper function to ensure numeric values are properly formatted
      const formatNumericValue = (
        value: string | number | undefined,
      ): string | number => {
        if (value === undefined || value === null || value === '') return '';
        // Try to convert to number if it's a string representing a number
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        // Return the numeric value if it's a valid number, otherwise return the original value
        return !isNaN(numValue) ? numValue : value;
      };

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

      // Lọc dữ liệu trùng lặp bằng cách tạo composite key
      const uniqueOrderData = this.removeDuplicateOrders(orderData);
      this.logger.log(
        `Đã lọc từ ${orderData.length} xuống ${uniqueOrderData.length} đơn hàng sau khi xóa trùng lặp cho sheet ${sheetName}`,
      );

      // Chuyển đổi dữ liệu sang định dạng mảng 2 chiều
      const mappingOrder = uniqueOrderData.map((item) => [
        item.order_id || '',
        item.order_status || '',
        item.order_substatus || '',
        item.cancellation_return_type || '',
        item.sku_id || '',
        item.product_name || '',
        item.variation || '',
        formatNumericValue(item.quantity),
        formatNumericValue(item.sku_quantity_return),
        formatNumericValue(item.sku_unit_original_price),
        formatNumericValue(item.sku_subtotal_before_discount),
        formatNumericValue(item.sku_platform_discount),
        formatNumericValue(item.sku_seller_discount),
        formatNumericValue(item.sku_subtotal_after_discount),
        formatNumericValue(item.shipping_fee_after_discount),
        formatNumericValue(item.original_shipping_fee),
        formatNumericValue(item.shipping_fee_seller_discount),
        formatNumericValue(item.shipping_fee_platform_discount),
        formatNumericValue(item.payment_platform_discount),
        formatNumericValue(item.taxes),
        formatNumericValue(item.order_amount),
        formatNumericValue(item.order_refund_amount),
        item.created_time || '',
        item.cancel_reason || '',
      ]) as SheetValues;

      // Sử dụng phương thức đã tối ưu để ghi và định dạng dữ liệu trong ít lần gọi API nhất
      await this.googleSheetsService.writeAndFormatSheet({
        spreadsheetId,
        sheetName,
        header,
        data: mappingOrder,
        numericColumns,
        taskName: `Write data to ${sheetName}`, // Truyền vào taskName để theo dõi
      });

      console.log(`Hoàn thành xử lý dữ liệu cho sheet: ${sheetName}`);
    } catch (error) {
      // Đảm bảo kết thúc tracking ngay cả khi có lỗi
      this.googleSheetsService.endTaskTracking();

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
        region: account.shopCipher[0].region,
      };

      const currentDate = getDateInIndochinaTime();
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();
      const currentMonthName = this.getMonthName(currentMonth);

      // Tạo ngày 15 ngày trước thay vì đầu tháng
      const date15DaysAgo = new Date(currentDate);
      date15DaysAgo.setDate(currentDate.getDate() - 15);
      date15DaysAgo.setHours(0, 0, 0, 0); // Đặt thời gian về 00:00:00

      // Xác định tháng trước
      const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const previousYear =
        previousMonth === 11 && currentMonth === 0
          ? currentYear - 1
          : currentYear;
      const previousMonthName = this.getMonthName(previousMonth);

      // Định nghĩa kích thước batch và các thông tin chung
      const BATCH_SIZE = 5000; // Xử lý tối đa 5000 đơn hàng mỗi lần
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

      // Định nghĩa các cột cần định dạng số (US format)
      const numericColumns = [
        'H',
        'I',
        'J',
        'K',
        'L',
        'M',
        'N',
        'O',
        'P',
        'Q',
        'R',
        'S',
        'T',
        'U',
        'V',
      ];

      // Helper function to ensure numeric values are properly formatted
      const formatNumericValue = (
        value: string | number | undefined,
      ): string | number => {
        if (value === undefined || value === null || value === '') return '';
        // Try to convert to number if it's a string representing a number
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        // Return the numeric value if it's a valid number, otherwise return the original value
        return !isNaN(numValue) ? numValue : value;
      };

      // Maps để theo dõi đơn hàng đã xử lý theo tháng
      // Sử dụng Map thay vì mảng để giảm bộ nhớ khi loại bỏ trùng lặp
      const currentMonthOrderMap = new Map<string, ExtractedOrderItem>();
      const previousMonthOrderMap = new Map<string, ExtractedOrderItem>();

      // Set để theo dõi các tháng có dữ liệu
      const monthsWithData = new Set<string>();

      // Xử lý theo batch thay vì lấy tất cả cùng lúc
      let hasMoreOrders = true;
      const pageToken = '';
      let totalProcessed = 0;

      this.logger.log(
        `Bắt đầu lấy và xử lý đơn hàng từ ${date15DaysAgo.toISOString()} đến ${currentDate.toISOString()}`,
      );

      while (hasMoreOrders) {
        // Chuẩn bị options với pageToken
        const batchOptions: CommonParams = {
          ...(options as CommonParams),
          query_params: {
            page_size: BATCH_SIZE,
            sort_field: 'create_time',
            sort_order: 'DESC',
          },
        };

        if (pageToken) {
          batchOptions.query_params.page_token = pageToken;
        }

        // Lấy dữ liệu đơn hàng theo batch
        const batchResult = await this.tiktokService.getOrdersByDateRange(
          batchOptions,
          date15DaysAgo,
          currentDate,
          BATCH_SIZE,
        );

        if (!batchResult || batchResult.length === 0) {
          hasMoreOrders = false;
          break;
        }

        this.logger.log(`Đang xử lý batch đơn hàng: ${batchResult.length} đơn`);
        totalProcessed += batchResult.length;

        // Phân loại đơn hàng theo tháng và loại bỏ trùng lặp trong batch hiện tại
        for (const order of batchResult) {
          if (!order.created_time) continue;

          // Tạo composite key để xác định đơn hàng duy nhất
          const key = [
            order.order_id || '',
            order.sku_id || '',
            order.product_name || '',
            order.quantity || '',
            order.created_time || '',
            order.order_status || '',
          ].join('-');

          // Xử lý định dạng DD/MM/YYYY
          const dateParts = order.created_time.split('/');
          if (dateParts.length !== 3) continue;

          // Chuyển từ DD/MM/YYYY sang tháng trong JS (0-11)
          const orderMonth = parseInt(dateParts[1], 10) - 1;
          const orderYear = parseInt(dateParts[2], 10);

          // Phân loại đơn hàng vào tháng tương ứng
          if (orderMonth === currentMonth && orderYear === currentYear) {
            currentMonthOrderMap.set(key, order);
            monthsWithData.add(`${currentMonthName}-${currentYear}`);
          } else if (
            orderMonth === previousMonth &&
            (previousMonth === 11 && currentMonth === 0
              ? orderYear === previousYear
              : orderYear === currentYear)
          ) {
            previousMonthOrderMap.set(key, order);
            monthsWithData.add(`${previousMonthName}-${previousYear}`);
          }

          // Thêm tháng vào danh sách các tháng có dữ liệu
          const monthName = this.getMonthName(orderMonth);
          monthsWithData.add(`${monthName}-${orderYear}`);
        }

        // Kiểm tra xem có cần phải giải phóng bộ nhớ sớm không
        const currentMonthSize = currentMonthOrderMap.size;
        const previousMonthSize = previousMonthOrderMap.size;

        // Nếu đã tích lũy đủ lớn, ghi vào sheet và xóa khỏi bộ nhớ
        if (currentMonthSize >= BATCH_SIZE * 2) {
          await this.processBatchOrders(
            account.sheetId,
            `${currentMonthName}-${currentYear}`,
            Array.from(currentMonthOrderMap.values()),
            header,
            numericColumns,
            formatNumericValue,
          );

          this.logger.log(
            `Đã ghi ${currentMonthSize} đơn hàng của tháng ${currentMonthName}-${currentYear}`,
          );
          // Giải phóng bộ nhớ sau khi xử lý xong
          currentMonthOrderMap.clear();
          if (global.gc) {
            global.gc();
          }
        }

        if (previousMonthSize >= BATCH_SIZE * 2) {
          await this.processBatchOrders(
            account.sheetId,
            `${previousMonthName}-${previousYear}`,
            Array.from(previousMonthOrderMap.values()),
            header,
            numericColumns,
            formatNumericValue,
          );

          this.logger.log(
            `Đã ghi ${previousMonthSize} đơn hàng của tháng ${previousMonthName}-${previousYear}`,
          );
          // Giải phóng bộ nhớ sau khi xử lý xong
          previousMonthOrderMap.clear();
          if (global.gc) {
            global.gc();
          }
        }

        // Lấy pageToken từ kết quả trả về của API để tiếp tục lấy dữ liệu
        // Giả sử API trả về nextPageToken trong metadata của response
        // Cần cập nhật cho phù hợp với API thực tế
        // Ví dụ: pageToken = batchResult.metadata?.nextPageToken;

        // Nếu không có pageToken hoặc đã xử lý đủ số lượng đơn hàng, dừng vòng lặp
        if (batchResult.length < BATCH_SIZE) {
          hasMoreOrders = false;
        } else {
          // Cần cập nhật pageToken từ API response để tiếp tục lấy batch tiếp theo
          // Giả định cấu trúc API response có chứa nextPageToken
          // pageToken = batchResult.metadata?.nextPageToken;

          // Dùng giải pháp tạm thời: để tránh lỗi logic khi không có nextPageToken thực
          // trong ví dụ này chúng ta sẽ dừng lại sau batch đầu tiên
          hasMoreOrders = false;

          // CHÚ Ý: Khi triển khai thực tế, cần cập nhật phần này để lấy nextPageToken đúng
          // từ API response của tiktokService.getOrdersByDateRange
        }
      }

      // Xử lý các đơn hàng còn lại sau khi hoàn thành tất cả các batch
      if (currentMonthOrderMap.size > 0) {
        await this.processBatchOrders(
          account.sheetId,
          `${currentMonthName}-${currentYear}`,
          Array.from(currentMonthOrderMap.values()),
          header,
          numericColumns,
          formatNumericValue,
        );
        this.logger.log(
          `Đã ghi ${currentMonthOrderMap.size} đơn hàng cuối cùng của tháng ${currentMonthName}-${currentYear}`,
        );
        // Giải phóng bộ nhớ sau khi xử lý xong
        currentMonthOrderMap.clear();
        if (global.gc) {
          global.gc();
        }
      }

      if (previousMonthOrderMap.size > 0) {
        await this.processBatchOrders(
          account.sheetId,
          `${previousMonthName}-${previousYear}`,
          Array.from(previousMonthOrderMap.values()),
          header,
          numericColumns,
          formatNumericValue,
        );
        this.logger.log(
          `Đã ghi ${previousMonthOrderMap.size} đơn hàng cuối cùng của tháng ${previousMonthName}-${previousYear}`,
        );
        // Giải phóng bộ nhớ sau khi xử lý xong
        previousMonthOrderMap.clear();
        if (global.gc) {
          global.gc();
        }
      }

      // Xóa các sheet của những tháng không có dữ liệu
      await this.cleanupUnusedSheets(account.sheetId, monthsWithData);

      this.logger.log(`Hoàn thành xử lý tổng cộng ${totalProcessed} đơn hàng`);

      return true;
    } catch (error) {
      this.logger.error(
        `Lỗi khi xử lý dữ liệu cho tài khoản ${account.appKey}:`,
        error,
      );
      return false;
    }
  }

  // Phương thức mới để xóa các sheet không có dữ liệu
  private async cleanupUnusedSheets(
    spreadsheetId: string,
    monthsWithData: Set<string>,
  ) {
    try {
      // Lấy thông tin về tất cả các sheet trong spreadsheet
      const spreadsheetInfo =
        await this.googleSheetsService.getSpreadsheetInfo(spreadsheetId);

      if (!spreadsheetInfo || !spreadsheetInfo.sheets) {
        this.logger.warn(
          `Không thể lấy thông tin spreadsheet ${spreadsheetId}`,
        );
        return;
      }

      // Lọc ra các sheet cần xóa (sheet của tháng mà không có dữ liệu)
      const sheetsToDelete: { sheetId: number; sheetName: string }[] = [];

      for (const [sheetName, sheetInfo] of spreadsheetInfo.sheets.entries()) {
        // Xóa tất cả các sheet tháng không có dữ liệu, bất kể năm nào
        if (this.isMonthSheet(sheetName) && !monthsWithData.has(sheetName)) {
          sheetsToDelete.push({
            sheetId: sheetInfo.sheetId,
            sheetName,
          });
        }
      }

      if (sheetsToDelete.length === 0) {
        this.logger.log('Không có sheet nào cần xóa');
        return;
      }

      // Xóa các sheet không có dữ liệu
      for (const sheet of sheetsToDelete) {
        this.logger.log(
          `Đang xóa sheet ${sheet.sheetName} vì không có dữ liệu`,
        );
        await this.googleSheetsService.deleteSheet(
          spreadsheetId,
          sheet.sheetId,
        );
      }

      this.logger.log(`Đã xóa ${sheetsToDelete.length} sheet không có dữ liệu`);
    } catch (error) {
      this.logger.error(`Lỗi khi xóa sheet không có dữ liệu:`, error);
    }
  }

  // Phương thức kiểm tra xem một sheet có phải là sheet tháng hay không
  private isMonthSheet(sheetName: string): boolean {
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

    // Kiểm tra xem tên sheet có bắt đầu bằng tên tháng không
    return monthNames.some((month) => sheetName.startsWith(month));
  }

  // Phương thức mới để xử lý đơn hàng theo batch và ghi vào sheet
  private async processBatchOrders(
    spreadsheetId: string,
    sheetName: string,
    orders: ExtractedOrderItem[],
    header: string[],
    numericColumns: string[],
    formatNumericValue: (value: string | number | undefined) => string | number,
  ) {
    if (!orders || orders.length === 0) {
      return;
    }

    // Sắp xếp dữ liệu theo ngày tạo (created_time) trước khi mapping
    orders.sort((a, b) => {
      // Kiểm tra nếu created_time không tồn tại
      if (!a.created_time) return -1;
      if (!b.created_time) return 1;

      // Chuyển đổi định dạng DD/MM/YYYY sang Date object
      const parseDate = (dateStr: string) => {
        const [day, month, year] = dateStr.split('/').map(Number);
        return new Date(year, month - 1, day).getTime();
      };

      const dateA = parseDate(a.created_time);
      const dateB = parseDate(b.created_time);
      return dateA - dateB; // Sắp xếp tăng dần theo ngày (cũ đến mới)
    });

    // Chuyển đổi dữ liệu sang định dạng mảng 2 chiều
    const mappingOrder = orders.map((item) => [
      item.order_id || '',
      item.order_status || '',
      item.order_substatus || '',
      item.cancellation_return_type || '',
      item.sku_id || '',
      item.product_name || '',
      item.variation || '',
      formatNumericValue(item.quantity),
      formatNumericValue(item.sku_quantity_return),
      formatNumericValue(item.sku_unit_original_price),
      formatNumericValue(item.sku_subtotal_before_discount),
      formatNumericValue(item.sku_platform_discount),
      formatNumericValue(item.sku_seller_discount),
      formatNumericValue(item.sku_subtotal_after_discount),
      formatNumericValue(item.shipping_fee_after_discount),
      formatNumericValue(item.original_shipping_fee),
      formatNumericValue(item.shipping_fee_seller_discount),
      formatNumericValue(item.shipping_fee_platform_discount),
      formatNumericValue(item.payment_platform_discount),
      formatNumericValue(item.taxes),
      formatNumericValue(item.order_amount),
      formatNumericValue(item.order_refund_amount),
      item.created_time || '',
      item.cancel_reason || '',
    ]) as SheetValues;

    try {
      // Sử dụng phương thức đã tối ưu để ghi và định dạng dữ liệu
      // writeAndFormatSheet tự động xử lý tracking khi có taskName
      await this.googleSheetsService.writeAndFormatSheet({
        spreadsheetId,
        sheetName,
        header,
        data: mappingOrder,
        numericColumns,
        taskName: `Write data to ${sheetName}`,
      });
    } catch (error) {
      // Kiểm tra nếu lỗi là do vượt quá giới hạn ô
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('above the limit of 10000000 cells')) {
        this.logger.error(
          `Lỗi vượt quá giới hạn 10 triệu ô khi ghi dữ liệu vào sheet ${sheetName}`,
        );
      }
      // Ném lỗi để xử lý ở lớp gọi
      throw error;
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
    try {
      const options: Partial<CommonParams> = {
        app_key: account.appKey,
        app_secret: account.appSecret,
        access_token: account.accessToken,
        shop_cipher: account.shopCipher[0].cipher,
        region: account.shopCipher[0].region,
      };

      // Lấy thời gian hiện tại theo múi giờ Đông Dương
      const currentDate = getDateInIndochinaTime();
      const currentYear = currentDate.getFullYear();

      // Tạo ngày đầu năm
      const startOfYear = new Date(currentYear, 0, 1);
      startOfYear.setHours(0, 0, 0, 0); // Đặt thời gian về 00:00:00

      this.logger.log(
        `Bắt đầu lấy và xử lý đơn hàng từ đầu năm ${currentYear} (${startOfYear.toISOString()}) đến hiện tại (${currentDate.toISOString()})`,
      );

      // Định nghĩa kích thước batch và các thông tin chung
      const BATCH_SIZE = 5000; // Xử lý tối đa 5000 đơn hàng mỗi lần
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

      // Định nghĩa các cột cần định dạng số (US format)
      const numericColumns = [
        'H',
        'I',
        'J',
        'K',
        'L',
        'M',
        'N',
        'O',
        'P',
        'Q',
        'R',
        'S',
        'T',
        'U',
        'V',
      ];

      // Helper function to ensure numeric values are properly formatted
      const formatNumericValue = (
        value: string | number | undefined,
      ): string | number => {
        if (value === undefined || value === null || value === '') return '';
        // Try to convert to number if it's a string representing a number
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        // Return the numeric value if it's a valid number, otherwise return the original value
        return !isNaN(numValue) ? numValue : value;
      };

      // Maps để theo dõi đơn hàng đã xử lý theo tháng
      // Sử dụng Map thay vì mảng để giảm bộ nhớ khi loại bỏ trùng lặp
      const ordersByMonth = new Map<string, Map<string, ExtractedOrderItem>>();

      // Set để theo dõi các tháng có dữ liệu
      const monthsWithData = new Set<string>();

      // Xử lý theo batch thay vì lấy tất cả cùng lúc
      let hasMoreOrders = true;
      const pageToken = '';
      let totalProcessed = 0;

      while (hasMoreOrders) {
        // Chuẩn bị options với pageToken
        const batchOptions: CommonParams = {
          ...(options as CommonParams),
          query_params: {
            page_size: BATCH_SIZE,
            sort_field: 'create_time',
            sort_order: 'DESC',
          },
        };

        if (pageToken) {
          batchOptions.query_params.page_token = pageToken;
        }

        // Lấy dữ liệu đơn hàng theo batch
        const batchResult = await this.tiktokService.getOrdersByDateRange(
          batchOptions,
          startOfYear,
          currentDate,
          BATCH_SIZE,
        );

        if (!batchResult || batchResult.length === 0) {
          hasMoreOrders = false;
          break;
        }

        this.logger.log(`Đang xử lý batch đơn hàng: ${batchResult.length} đơn`);
        totalProcessed += batchResult.length;

        // Phân loại đơn hàng theo tháng và loại bỏ trùng lặp trong batch hiện tại
        for (const order of batchResult) {
          if (!order.created_time) continue;

          // Xử lý định dạng DD/MM/YYYY
          const dateParts = order.created_time.split('/');
          if (dateParts.length !== 3) continue;

          // Chuyển từ DD/MM/YYYY sang tháng trong JS (0-11)
          const orderMonth = parseInt(dateParts[1], 10) - 1;
          const orderYear = parseInt(dateParts[2], 10);

          // Tạo key để xác định đơn hàng duy nhất
          const orderKey = [
            order.order_id || '',
            order.sku_id || '',
            order.product_name || '',
            order.quantity || '',
            order.created_time || '',
            order.order_status || '',
          ].join('-');

          // Lấy tên tháng
          const monthName = this.getMonthName(orderMonth);
          const sheetName = `${monthName}-${orderYear}`;

          // Thêm tháng vào danh sách các tháng có dữ liệu
          monthsWithData.add(sheetName);

          // Khởi tạo Map cho tháng nếu chưa tồn tại
          if (!ordersByMonth.has(sheetName)) {
            ordersByMonth.set(sheetName, new Map<string, ExtractedOrderItem>());
          }

          // Thêm đơn hàng vào Map tương ứng với tháng
          const monthMap = ordersByMonth.get(sheetName);
          if (monthMap) {
            monthMap.set(orderKey, order);
          }
        }

        // Kiểm tra và xử lý các tháng có nhiều đơn hàng để giải phóng bộ nhớ
        for (const [sheetName, ordersMap] of ordersByMonth.entries()) {
          if (ordersMap.size >= BATCH_SIZE * 2) {
            try {
              await this.processBatchOrders(
                account.sheetId,
                sheetName,
                Array.from(ordersMap.values()),
                header,
                numericColumns,
                formatNumericValue,
              );

              this.logger.log(
                `Đã ghi ${ordersMap.size} đơn hàng của ${sheetName}`,
              );
            } catch (error) {
              // Nếu gặp lỗi vượt quá giới hạn ô, tạo workbook mới và thử lại
              const newSheetId = await this.createNewWorkbookIfNeeded(
                account,
                error,
              );
              if (newSheetId) {
                // Cập nhật sheetId mới và thử lại
                account.sheetId = newSheetId;
                await this.processBatchOrders(
                  newSheetId,
                  sheetName,
                  Array.from(ordersMap.values()),
                  header,
                  numericColumns,
                  formatNumericValue,
                );
                this.logger.log(
                  `Đã ghi ${ordersMap.size} đơn hàng của ${sheetName} vào workbook mới`,
                );
              } else {
                // Nếu không phải lỗi giới hạn ô hoặc không thể tạo workbook mới, ném lỗi
                throw error;
              }
            }

            // Giải phóng bộ nhớ sau khi xử lý xong
            ordersMap.clear();
            if (global.gc) {
              global.gc();
            }
          }
        }

        // Lấy pageToken từ kết quả trả về của API để tiếp tục lấy dữ liệu
        // Giả sử API trả về nextPageToken trong metadata của response
        // Cần cập nhật cho phù hợp với API thực tế
        // Ví dụ: pageToken = batchResult.metadata?.nextPageToken;

        // Nếu không có pageToken hoặc đã xử lý đủ số lượng đơn hàng, dừng vòng lặp
        if (batchResult.length < BATCH_SIZE) {
          hasMoreOrders = false;
        } else {
          // Cần cập nhật pageToken từ API response để tiếp tục lấy batch tiếp theo
          // Giả định cấu trúc API response có chứa nextPageToken
          // pageToken = batchResult.metadata?.nextPageToken;

          // Dùng giải pháp tạm thời: để tránh lỗi logic khi không có nextPageToken thực
          // trong ví dụ này chúng ta sẽ dừng lại sau batch đầu tiên
          hasMoreOrders = false;

          // CHÚ Ý: Khi triển khai thực tế, cần cập nhật phần này để lấy nextPageToken đúng
          // từ API response của tiktokService.getOrdersByDateRange
        }
      }

      // Xử lý các đơn hàng còn lại sau khi hoàn thành tất cả các batch
      for (const [sheetName, ordersMap] of ordersByMonth.entries()) {
        if (ordersMap.size > 0) {
          try {
            await this.processBatchOrders(
              account.sheetId,
              sheetName,
              Array.from(ordersMap.values()),
              header,
              numericColumns,
              formatNumericValue,
            );

            this.logger.log(
              `Đã ghi ${ordersMap.size} đơn hàng cuối cùng của ${sheetName}`,
            );
          } catch (error) {
            // Nếu gặp lỗi vượt quá giới hạn ô, tạo workbook mới và thử lại
            const newSheetId = await this.createNewWorkbookIfNeeded(
              account,
              error,
            );
            if (newSheetId) {
              // Cập nhật sheetId mới và thử lại
              account.sheetId = newSheetId;
              await this.processBatchOrders(
                newSheetId,
                sheetName,
                Array.from(ordersMap.values()),
                header,
                numericColumns,
                formatNumericValue,
              );
              this.logger.log(
                `Đã ghi ${ordersMap.size} đơn hàng cuối cùng của ${sheetName} vào workbook mới`,
              );
            } else {
              // Nếu không phải lỗi giới hạn ô hoặc không thể tạo workbook mới, ném lỗi
              throw error;
            }
          }

          // Giải phóng bộ nhớ sau khi xử lý xong
          ordersMap.clear();
          if (global.gc) {
            global.gc();
          }
        }
      }

      // Xóa các sheet của những tháng không có dữ liệu
      try {
        await this.cleanupUnusedSheets(account.sheetId, monthsWithData);
      } catch (error) {
        // Nếu gặp lỗi vượt quá giới hạn ô, tạo workbook mới và thử lại
        const newSheetId = await this.createNewWorkbookIfNeeded(account, error);
        if (newSheetId) {
          // Cập nhật sheetId mới và thử lại
          account.sheetId = newSheetId;
          this.logger.log(
            `Đã chuyển sang sử dụng workbook mới với ID: ${newSheetId}`,
          );
          // Không cần thử lại cleanupUnusedSheets vì đây là workbook mới
        } else if (
          !(
            error instanceof Error &&
            error.message.includes('above the limit of 10000000 cells')
          )
        ) {
          // Nếu không phải lỗi giới hạn ô, ghi log và tiếp tục
          this.logger.error(`Lỗi khi xóa sheet không sử dụng: ${error}`);
        }
      }

      this.logger.log(
        `Hoàn thành xử lý tổng cộng ${totalProcessed} đơn hàng từ đầu năm đến hiện tại`,
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Lỗi khi xử lý dữ liệu cho tài khoản ${account.appKey}:`,
        error,
      );
      return false;
    }
  }

  // Phương thức tạo workbook mới nếu gặp lỗi vượt quá giới hạn ô
  private async createNewWorkbookIfNeeded(
    account: AccountDocument,
    error: unknown,
  ): Promise<string | null> {
    try {
      // Kiểm tra nếu lỗi là do vượt quá giới hạn ô
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('above the limit of 10000000 cells')) {
        this.logger.log(
          `Spreadsheet ${account.sheetId} đã đạt giới hạn 10 triệu ô. Tạo workbook mới...`,
        );

        const currentDate = getDateInIndochinaTime();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        // Tạo tên mới cho workbook với timestamp để tránh trùng lặp
        const newSheetName = `${account.shopName}-${currentYear}-${currentMonth}-${Date.now()}`;

        // Tạo workbook mới
        const newSheetId =
          await this.googleSheetsService.createSheet(newSheetName);

        if (newSheetId) {
          // Cập nhật ID sheet mới vào tài khoản
          await this.accountsService.update(String(account._id), {
            sheetId: newSheetId,
          });

          this.logger.log(
            `Đã tạo workbook mới ${newSheetName} với ID: ${newSheetId}`,
          );

          return newSheetId;
        }
      }

      return null;
    } catch (newError) {
      this.logger.error(
        `Lỗi khi tạo workbook mới cho tài khoản ${account.appKey}:`,
        newError,
      );
      return null;
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

        try {
          const sheetNew = await this.googleSheetsService.createSheet(
            `${account.shopName}-${currentYear}`,
          );

          if (sheetNew) {
            await this.accountsService.update(String(account._id), {
              sheetId: sheetNew,
            });
          }
        } catch (error) {
          // Nếu gặp lỗi vượt quá giới hạn ô, tạo workbook mới
          const newSheetId = await this.createNewWorkbookIfNeeded(
            account,
            error,
          );
          if (newSheetId) {
            this.logger.log(
              `Đã chuyển sang sử dụng workbook mới với ID: ${newSheetId}`,
            );
            return true;
          }
          // Nếu không phải lỗi giới hạn ô hoặc không thể tạo workbook mới, ném lỗi
          throw error;
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

  // Phương thức xóa các đơn hàng trùng lặp
  private removeDuplicateOrders(
    orders: ExtractedOrderItem[],
  ): ExtractedOrderItem[] {
    const uniqueOrders = new Map<string, ExtractedOrderItem>();
    const duplicates = new Set<string>();

    for (const order of orders) {
      // Tạo composite key từ nhiều trường để xác định chính xác đơn hàng
      // Kết hợp các trường quan trọng để tạo key duy nhất
      const key = [
        order.order_id || '',
        order.sku_id || '',
        order.product_name || '',
        order.quantity || '',
        order.created_time || '',
        order.order_status || '',
      ].join('-');

      // Nếu key chưa tồn tại, thêm vào Map
      if (!uniqueOrders.has(key)) {
        uniqueOrders.set(key, order);
      } else {
        duplicates.add(key);
      }
    }

    if (duplicates.size > 0) {
      this.logger.log(
        `Phát hiện ${duplicates.size} đơn hàng trùng lặp đã được lọc bỏ`,
      );
    }

    return Array.from(uniqueOrders.values());
  }
}
