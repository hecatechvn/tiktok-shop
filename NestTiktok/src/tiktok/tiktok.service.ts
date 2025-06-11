import { Injectable } from '@nestjs/common';
import { extractOrderData } from 'src/common/extractOrderData';
import {
  AllOrdersResponse,
  BaseResponse,
  OrdersResponse,
  RefreshTokenResponse,
  ShopCipherResponse,
  TokenResponse,
} from 'src/types';
import { GRANT_TYPE } from 'src/enum';
import { isValidBodyValue } from 'src/lib/validBodyValue';
import { CommonParams, RequestOption, QueryParams } from 'src/types';
import { ExtractedOrderItem, Order } from 'src/types/order';

import { startOfMonth, endOfDay, setDate, format } from 'date-fns';
import {
  getCurrentDateByRegion,
  getDateDaysAgoByRegion,
  toUnixTimestampByRegion,
  getTimezoneByRegion,
} from 'src/utils/date';
import { sendRequest } from 'src/common/sendReq';

@Injectable()
export class TiktokService {
  /**
   * Lấy access token từ auth code
   */
  async getAccessToken<T extends BaseResponse = TokenResponse>(
    data: CommonParams,
  ): Promise<T> {
    const { app_key, app_secret, auth_code } = data;
    const requestOption: RequestOption = {
      uri: 'https://auth.tiktok-shops.com/api/v2/token/get',
      qs: {
        auth_code: auth_code,
        app_secret: app_secret,
        app_key: app_key,
        grant_type: GRANT_TYPE.AUTHORIZED_CODE,
      },
      body: {},
    };

    try {
      const response = await sendRequest<T>(requestOption, app_secret);
      return response;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  /**
   * Lấy shop cipher
   */
  async getShopCipher<T extends BaseResponse = ShopCipherResponse>(
    data: CommonParams,
  ): Promise<T> {
    const { app_key, app_secret, access_token } = data;
    const requestOption: RequestOption = {
      uri: 'https://open-api.tiktokglobalshop.com/authorization/202309/shops',
      qs: {
        app_key: app_key,
      },
      headers: {
        'x-tts-access-token': access_token,
      },
      body: {},
    };

    try {
      const response = await sendRequest<T>(requestOption, app_secret);
      return response;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  /**
   * Làm mới access token
   */
  async refreshToken<T extends BaseResponse = RefreshTokenResponse>(
    data: CommonParams,
  ): Promise<T> {
    const { app_key, app_secret, refresh_token } = data;
    const requestOption: RequestOption = {
      uri: 'https://auth.tiktok-shops.com/api/v2/token/refresh',
      qs: {
        refresh_token: refresh_token,
        app_secret: app_secret,
        app_key: app_key,
        grant_type: GRANT_TYPE.REFRESH_TOKEN,
      },
      body: {},
    };

    try {
      const response = await sendRequest<T>(requestOption, app_secret);
      return response;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  /**
   * Lấy danh sách đơn hàng từ TikTok Shop API
   */
  async getOrderList(data: CommonParams): Promise<OrdersResponse> {
    try {
      // Xác thực các tham số bắt buộc
      const requiredParams = [
        'app_key',
        'app_secret',
        'shop_cipher',
        'access_token',
      ];
      for (const param of requiredParams) {
        if (!data[param]) {
          throw new Error(`Thiếu tham số bắt buộc: ${param}`);
        }
      }

      const { app_key, shop_cipher, access_token, page_size } = data;
      // Thiết lập các tùy chọn request với page_size tối đa để giảm số lần gọi API
      const requestOption: RequestOption = {
        uri: 'https://open-api.tiktokglobalshop.com/order/202309/orders/search',
        qs: {
          app_key: app_key,
          shop_cipher: shop_cipher,
          page_size: page_size || 100, // Sử dụng page_size tối đa
        },
        headers: {
          'x-tts-access-token': access_token,
        },
        body: {},
      };

      // Thêm các tham số query tùy chọn
      if (data.query_params?.sort_order) {
        requestOption.qs.sort_order = data.query_params?.sort_order;
      }

      if (data.query_params?.sort_field) {
        requestOption.qs.sort_field = data.query_params?.sort_field;
      }

      if (data.query_params?.page_token) {
        requestOption.qs.page_token = data.query_params?.page_token;
      }

      // Thêm các tham số body để lọc - sử dụng create_time_lt thay vì create_time_le để tối ưu hơn
      const bodyParams = [
        'order_status',
        'create_time_ge',
        'create_time_lt', // Thay đổi từ create_time_le thành create_time_lt
        'update_time_ge',
        'update_time_lt', // Thay đổi từ update_time_le thành update_time_lt
        'shipping_type',
        'buyer_user_id',
        'is_buyer_request_cancel',
        'warehouse_ids',
      ];

      bodyParams.forEach((param) => {
        if (
          data.query_params &&
          data.query_params[param] !== undefined &&
          isValidBodyValue(data.query_params[param])
        ) {
          requestOption.body[param] = data.query_params[param];
        }
      });

      const response = await sendRequest<OrdersResponse>(
        requestOption,
        data.app_secret,
        'POST',
      );
      return response;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  /**
   * Hàm helper được tối ưu để lấy đơn hàng với phân trang nhanh hơn
   * @param options Tùy chọn API
   * @param startTimestamp Thời gian bắt đầu (Unix timestamp)
   * @param endTimestamp Thời gian kết thúc (Unix timestamp)
   * @param page_size Kích thước trang
   * @param sortOrder Thứ tự sắp xếp (DESC cho đơn hàng mới nhất, ASC cho đơn hàng cũ nhất)
   * @returns Danh sách đơn hàng đã xử lý
   */
  private async fetchOrdersWithPagination(
    options: CommonParams,
    startTimestamp: number,
    endTimestamp: number,
    page_size = 100,
    sortOrder: 'ASC' | 'DESC' = 'DESC', // Mặc định DESC để lấy đơn mới nhất trước
  ): Promise<ExtractedOrderItem[]> {
    // Mảng lưu trữ tất cả các đơn hàng
    let allOrders: Order[] = [];
    let hasMoreData = true;
    let nextPageToken = '';
    let totalCount = 0;
    let requestCount = 0;
    const maxRequests = 50; // Giới hạn số request để tránh timeout

    console.log(
      `🚀 Bắt đầu lấy đơn hàng (${sortOrder}) từ ${new Date(startTimestamp * 1000).toLocaleString()} đến ${new Date(endTimestamp * 1000).toLocaleString()}`,
    );

    // Lấy tất cả các trang dữ liệu
    while (hasMoreData && requestCount < maxRequests) {
      requestCount++;

      // Cập nhật tùy chọn với page_token nếu có
      const requestOptions: CommonParams = {
        ...options,
        query_params: {
          page_size,
          create_time_ge: startTimestamp,
          create_time_lt: endTimestamp, // Sử dụng create_time_lt thay vì create_time_le
          sort_field: 'create_time',
          sort_order: sortOrder,
        },
      };

      // Thêm page_token nếu không phải lần gọi đầu tiên
      if (nextPageToken) {
        requestOptions.query_params.page_token = nextPageToken;
      }

      try {
        const result = await this.getOrderList(requestOptions);

        // Lưu tổng số lượng đơn hàng nếu là lần đầu
        if (totalCount === 0 && result.data?.total_count) {
          totalCount = result.data.total_count;
        }

        // Thêm đơn hàng vào mảng kết quả
        if (result.data?.orders && Array.isArray(result.data.orders)) {
          allOrders = [...allOrders, ...result.data.orders];
        }

        // Kiểm tra có trang tiếp theo không
        if (result.data?.next_page_token) {
          nextPageToken = result.data.next_page_token;
          console.log(
            `📦 Đã lấy ${allOrders.length}/${totalCount || '?'} đơn hàng (Request #${requestCount})`,
          );
        } else {
          hasMoreData = false;
        }

        // Tối ưu: Nếu đã lấy đủ đơn hàng trong khoảng thời gian, có thể dừng sớm
        if (allOrders.length > 0) {
          const lastOrder = allOrders[allOrders.length - 1];
          if (sortOrder === 'DESC' && lastOrder.create_time < startTimestamp) {
            console.log(
              '⚡ Tối ưu: Dừng sớm vì đã vượt qua khoảng thời gian yêu cầu',
            );
            break;
          }
          if (sortOrder === 'ASC' && lastOrder.create_time > endTimestamp) {
            console.log(
              '⚡ Tối ưu: Dừng sớm vì đã vượt qua khoảng thời gian yêu cầu',
            );
            break;
          }
        }
      } catch (error) {
        console.error(`❌ Lỗi tại request #${requestCount}:`, error);
        break;
      }
    }

    if (requestCount >= maxRequests) {
      console.log(
        `⚠️ Đã đạt giới hạn ${maxRequests} requests, dừng lại để tránh timeout`,
      );
    }

    // Lọc đơn hàng theo khoảng thời gian (chỉ cần thiết nếu API trả về đơn hàng ngoài khoảng)
    const validOrders = allOrders.filter((order) => {
      return (
        order.create_time >= startTimestamp && order.create_time < endTimestamp
      );
    });

    if (validOrders.length < allOrders.length) {
      console.log(
        `🔍 Đã lọc bỏ ${
          allOrders.length - validOrders.length
        } đơn hàng nằm ngoài khoảng thời gian yêu cầu.`,
      );
    }

    console.log(
      `✅ Hoàn thành: ${validOrders.length} đơn hàng trong ${requestCount} requests`,
    );

    let region: string | undefined;
    if (options.region) {
      region = options.region;
    }

    const extractedData = extractOrderData(validOrders, region);

    // 🎯 Đảm bảo sắp xếp cuối cùng từ cũ đến mới (đơn cũ ở trên, mới chèn xuống dưới)
    extractedData.sort((a, b) => {
      if (!a.created_time) return -1;
      if (!b.created_time) return 1;

      // Chuyển đổi định dạng DD/MM/YYYY HH:mm:ss thành timestamp để so sánh
      const parseDateTime = (dateTimeStr: string) => {
        // Format: DD/MM/YYYY HH:mm:ss
        const [datePart, timePart] = dateTimeStr.split(' ');
        if (!datePart) return 0;

        const [day, month, year] = datePart.split('/').map(Number);
        if (timePart) {
          const [hour, minute, second] = timePart.split(':').map(Number);
          return new Date(
            year,
            month - 1,
            day,
            hour || 0,
            minute || 0,
            second || 0,
          ).getTime();
        } else {
          return new Date(year, month - 1, day).getTime();
        }
      };

      const timeA = parseDateTime(a.created_time);
      const timeB = parseDateTime(b.created_time);
      return timeA - timeB; // Sắp xếp từ cũ đến mới
    });

    return extractedData;
  }

  /**
   * Phương thức mới: Lấy đơn hàng với chiến lược song song để tăng tốc
   */
  private async fetchOrdersParallel(
    options: CommonParams,
    startTimestamp: number,
    endTimestamp: number,
    page_size = 100,
  ): Promise<ExtractedOrderItem[]> {
    // Chia khoảng thời gian thành các chunk nhỏ hơn để xử lý song song
    const timeRange = endTimestamp - startTimestamp;
    const maxChunkSize = 7 * 24 * 60 * 60; // 7 ngày

    if (timeRange <= maxChunkSize) {
      // Nếu khoảng thời gian nhỏ, sử dụng phương thức thông thường
      return this.fetchOrdersWithPagination(
        options,
        startTimestamp,
        endTimestamp,
        page_size,
        'DESC',
      );
    }

    // Chia thành các chunk
    const chunks: Array<{ start: number; end: number }> = [];
    let currentStart = startTimestamp;

    while (currentStart < endTimestamp) {
      const currentEnd = Math.min(currentStart + maxChunkSize, endTimestamp);
      chunks.push({ start: currentStart, end: currentEnd });
      currentStart = currentEnd;
    }

    console.log(`🔀 Chia thành ${chunks.length} chunks để xử lý song song`);

    // Xử lý song song các chunk (giới hạn 3 chunk cùng lúc để tránh rate limit)
    const maxConcurrent = 3;
    const allResults: ExtractedOrderItem[] = [];

    for (let i = 0; i < chunks.length; i += maxConcurrent) {
      const currentChunks = chunks.slice(i, i + maxConcurrent);

      const promises = currentChunks.map((chunk) =>
        this.fetchOrdersWithPagination(
          options,
          chunk.start,
          chunk.end,
          page_size,
          'DESC',
        ),
      );

      try {
        const results = await Promise.all(promises);
        results.forEach((result) => allResults.push(...result));
      } catch (error) {
        console.error('❌ Lỗi khi xử lý song song:', error);
        // Fallback: xử lý tuần tự
        for (const chunk of currentChunks) {
          try {
            const result = await this.fetchOrdersWithPagination(
              options,
              chunk.start,
              chunk.end,
              page_size,
              'DESC',
            );
            allResults.push(...result);
          } catch (chunkError) {
            console.error('❌ Lỗi khi xử lý chunk:', chunkError);
          }
        }
      }
    }

    console.log(
      `📊 Tổng cộng đã lấy ${allResults.length} đơn hàng từ ${chunks.length} chunks`,
    );

    // 🎯 BƯỚC QUAN TRỌNG: Sắp xếp lại toàn bộ kết quả theo thời gian tạo từ cũ đến mới
    allResults.sort((a, b) => {
      if (!a.created_time) return -1;
      if (!b.created_time) return 1;

      // Chuyển đổi định dạng DD/MM/YYYY HH:mm:ss thành timestamp để so sánh
      const parseDateTime = (dateTimeStr: string) => {
        // Format: DD/MM/YYYY HH:mm:ss
        const [datePart, timePart] = dateTimeStr.split(' ');
        if (!datePart) return 0;

        const [day, month, year] = datePart.split('/').map(Number);
        if (timePart) {
          const [hour, minute, second] = timePart.split(':').map(Number);
          return new Date(
            year,
            month - 1,
            day,
            hour || 0,
            minute || 0,
            second || 0,
          ).getTime();
        } else {
          return new Date(year, month - 1, day).getTime();
        }
      };

      const timeA = parseDateTime(a.created_time);
      const timeB = parseDateTime(b.created_time);
      return timeA - timeB; // Sắp xếp từ cũ đến mới (đơn cũ ở trên, mới chèn xuống dưới)
    });

    console.log(
      `✅ Đã sắp xếp lại ${allResults.length} đơn hàng theo thứ tự từ cũ đến mới`,
    );

    return allResults;
  }

  /**
   * Lấy tất cả đơn hàng từ đầu năm đến hiện tại
   */
  async getAllOrders(options: CommonParams): Promise<AllOrdersResponse> {
    // Lấy region từ options
    const region = options.region;

    // Tính timestamp cho ngày 1 tháng 1 năm hiện tại theo timezone của region
    const currentDate = getCurrentDateByRegion(region);
    const currentYear = currentDate.getFullYear();
    const startDate = new Date(currentYear, 0, 1);
    const startTimestamp = toUnixTimestampByRegion(startDate, region);

    // Tính timestamp cho 15 ngày trước theo timezone của region
    const fifteenDaysAgo = getDateDaysAgoByRegion(15, region);
    const fifteenDaysAgoTimestamp = toUnixTimestampByRegion(
      fifteenDaysAgo,
      region,
    );

    // Lưu trữ tất cả đơn hàng
    const allOrders: ExtractedOrderItem[] = [];

    // Lấy đơn hàng gần đây (15 ngày gần nhất) - những đơn này sẽ ghi đè lên dữ liệu hiện có
    let pageToken = '';
    let hasMoreRecentOrders = true;

    console.log(
      `Đang lấy đơn hàng gần đây (15 ngày gần nhất) cho region ${region || 'VN'}...`,
    );

    while (hasMoreRecentOrders) {
      const recentOrdersOptions: CommonParams = {
        ...options,
        query_params: {
          create_time_ge: fifteenDaysAgoTimestamp,
          page_size: 100,
          sort_field: 'create_time',
          sort_order: 'DESC',
        },
      };

      if (pageToken) {
        recentOrdersOptions.query_params.page_token = pageToken;
      }

      const response = await this.getOrderList(recentOrdersOptions);

      if (response.code === 0 && response.data && response.data.orders) {
        const extractedOrders = extractOrderData(response.data.orders, region);
        allOrders.push(...extractedOrders);

        if (response.data.next_page_token) {
          pageToken = response.data.next_page_token;
        } else {
          hasMoreRecentOrders = false;
        }
      } else {
        console.error(
          'Lỗi khi lấy đơn hàng gần đây:',
          response.message || 'Lỗi không xác định',
        );
        hasMoreRecentOrders = false;
      }
    }

    // Lấy đơn hàng cũ hơn (từ đầu năm đến 15 ngày trước) - những đơn này sẽ không ghi đè lên dữ liệu hiện có
    pageToken = '';
    let hasMoreOlderOrders = true;

    console.log('Đang lấy đơn hàng cũ hơn (từ đầu năm đến 15 ngày trước)...');

    while (hasMoreOlderOrders) {
      const olderOrdersOptions: CommonParams = {
        ...options,
        page_size: 100,
        query_params: {
          sort_order: 'DESC',
          sort_field: 'create_time',
          create_time_ge: startTimestamp,
          create_time_lt: fifteenDaysAgoTimestamp,
        } as QueryParams,
      };

      if (pageToken) {
        olderOrdersOptions.query_params.page_token = pageToken;
      }

      const response = await this.getOrderList(olderOrdersOptions);

      if (response.code === 0 && response.data && response.data.orders) {
        const extractedOrders = extractOrderData(response.data.orders, region);
        allOrders.push(...extractedOrders);

        if (response.data.next_page_token) {
          pageToken = response.data.next_page_token;
        } else {
          hasMoreOlderOrders = false;
        }
      } else {
        console.error(
          'Lỗi khi lấy đơn hàng cũ hơn:',
          response.message || 'Lỗi không xác định',
        );
        hasMoreOlderOrders = false;
      }
    }

    // Phân loại đơn hàng theo tháng
    const ordersByMonth: Record<number, ExtractedOrderItem[]> = {};

    // Khởi tạo mảng cho mỗi tháng từ 1-12
    for (let i = 1; i <= 12; i++) {
      ordersByMonth[i] = [];
    }

    // Phân loại đơn hàng theo tháng
    allOrders.forEach((order) => {
      if (!order.created_time) {
        return;
      }

      // Chuyển đổi chuỗi ngày tháng (DD/MM/YYYY HH:mm:ss)
      const parts = order.created_time.split(/[/ :]/);
      if (parts.length < 3) {
        return;
      }

      // Format là DD/MM/YYYY, nên month ở vị trí thứ 2 (index 1)
      const month = Number(parts[1]);
      const year = Number(parts[2]);

      // Kiểm tra tính hợp lệ của dữ liệu
      if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
        return;
      }

      // Chỉ thêm đơn hàng của năm hiện tại
      if (year === currentYear && Array.isArray(ordersByMonth[month])) {
        ordersByMonth[month].push(order);
      }
    });

    return {
      allOrders,
      ordersByMonth,
      recentOrdersTimestamp: fifteenDaysAgoTimestamp,
    };
  }

  /**
   * Lấy đơn hàng trong khoảng ngày gần đây - ĐƯỢC TỐI ƯU
   */
  async fetchOrdersByDateRange(
    options: CommonParams,
    daysAgo = 30,
    page_size = 100,
  ) {
    try {
      // Lấy region từ options
      const region = options.region;

      // Tính toán thời gian bắt đầu dựa trên số ngày theo timezone của region
      const startDate = getDateDaysAgoByRegion(daysAgo, region);
      const endDate = getCurrentDateByRegion(region);

      const startTimestamp = toUnixTimestampByRegion(startDate, region);
      const endTimestamp = toUnixTimestampByRegion(endDate, region);

      console.log(
        `🚀 Tối ưu: Lấy đơn hàng trong ${daysAgo} ngày gần nhất cho region ${region || 'VN'}...`,
      );
      console.log(`Timezone: ${getTimezoneByRegion(region)}`);
      console.log(`Timestamp: ${startTimestamp} → ${endTimestamp}`);

      // Sử dụng phương thức song song nếu khoảng thời gian lớn
      if (daysAgo > 7) {
        return await this.fetchOrdersParallel(
          options,
          startTimestamp,
          endTimestamp,
          page_size,
        );
      } else {
        return await this.fetchOrdersWithPagination(
          options,
          startTimestamp,
          endTimestamp,
          page_size,
          'DESC', // Lấy đơn hàng mới nhất trước
        );
      }
    } catch (error) {
      console.error('❌ Lỗi khi lấy đơn hàng:', error);
      return [];
    }
  }

  /**
   * Lấy đơn hàng từ đầu tháng đến ngày 15 của tháng hiện tại - ĐƯỢC TỐI ƯU
   */
  async fetchCurrentMonthOrders(options: CommonParams, page_size = 100) {
    try {
      // Lấy region từ options
      const region = options.region;

      // Lấy ngày hiện tại theo timezone của region
      const currentDate = getCurrentDateByRegion(region);
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth(); // 0-11

      // Tính timestamp cho ngày đầu tiên của tháng hiện tại
      const firstDayOfMonth = startOfMonth(new Date(currentYear, currentMonth));
      const firstDayTimestamp = toUnixTimestampByRegion(
        firstDayOfMonth,
        region,
      );

      // Tính timestamp cho ngày 15 của tháng hiện tại
      const day15OfMonth = endOfDay(
        setDate(new Date(currentYear, currentMonth), 15),
      );
      const day15Timestamp = toUnixTimestampByRegion(day15OfMonth, region);

      // Nếu ngày hiện tại lớn hơn ngày 15, sử dụng timestamp ngày 15
      // Nếu ngày hiện tại nhỏ hơn hoặc bằng ngày 15, sử dụng timestamp hiện tại
      const endTimestamp =
        currentDate.getDate() > 15
          ? day15Timestamp
          : toUnixTimestampByRegion(currentDate, region);

      console.log(
        `🚀 Tối ưu: Lấy đơn hàng từ đầu tháng ${
          currentMonth + 1
        }/${currentYear} đến ngày 15/${currentMonth + 1}/${currentYear} cho region ${region || 'VN'}...`,
      );
      console.log(`Timezone: ${getTimezoneByRegion(region)}`);
      console.log(`Timestamp: ${firstDayTimestamp} → ${endTimestamp}`);

      return await this.fetchOrdersWithPagination(
        options,
        firstDayTimestamp,
        endTimestamp,
        page_size,
        'DESC', // Lấy đơn hàng mới nhất trước
      );
    } catch (error) {
      console.error('❌ Lỗi khi lấy đơn hàng đầu tháng:', error);
      return [];
    }
  }

  /**
   * Lấy đơn hàng từ đầu tháng trước đến ngày 15 của tháng hiện tại - ĐƯỢC TỐI ƯU
   */
  async fetchPreviousToCurrentMonthOrders(
    options: CommonParams,
    page_size = 100,
  ) {
    try {
      // Lấy region từ options
      const region = options.region;

      // Lấy thời gian hiện tại theo timezone của region
      const now = getCurrentDateByRegion(region);
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-11

      // Tính năm và tháng trước
      const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const previousMonthYear =
        currentMonth === 0 ? currentYear - 1 : currentYear;

      // Ngày 1 tháng trước theo timezone của region
      const firstDayLocal = startOfMonth(
        new Date(previousMonthYear, previousMonth),
      );
      const firstDayTimestamp = toUnixTimestampByRegion(firstDayLocal, region);

      // Ngày 15 tháng này 23:59:59 theo timezone của region
      const day15Local = endOfDay(
        setDate(new Date(currentYear, currentMonth), 15),
      );
      const day15Timestamp = toUnixTimestampByRegion(day15Local, region);

      // Log kiểm tra
      console.log(
        `🚀 Tối ưu: Lấy đơn hàng từ ${format(firstDayLocal, 'dd/MM/yyyy')} đến ${format(
          day15Local,
          'dd/MM/yyyy',
        )} cho region ${region || 'VN'}`,
      );
      console.log(`Timezone: ${getTimezoneByRegion(region)}`);
      console.log(`Timestamp: ${firstDayTimestamp} → ${day15Timestamp}`);

      // Sử dụng xử lý song song cho khoảng thời gian lớn
      const timeRange = day15Timestamp - firstDayTimestamp;
      const sevenDays = 7 * 24 * 60 * 60;

      if (timeRange > sevenDays) {
        return await this.fetchOrdersParallel(
          options,
          firstDayTimestamp,
          day15Timestamp,
          page_size,
        );
      } else {
        return await this.fetchOrdersWithPagination(
          options,
          firstDayTimestamp,
          day15Timestamp,
          page_size,
          'DESC',
        );
      }
    } catch (error) {
      console.error('❌ Lỗi khi lấy đơn hàng:', error);
      return [];
    }
  }

  /**
   * Lấy tất cả đơn hàng của tháng hiện tại - ĐƯỢC TỐI ƯU
   */
  async fetchCurrentMonthAllOrders(options: CommonParams, page_size = 100) {
    try {
      // Lấy region từ options
      const region = options.region;

      // Lấy thời gian hiện tại theo timezone của region
      const now = getCurrentDateByRegion(region);
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-11

      // Ngày 1 của tháng hiện tại
      const firstDayLocal = startOfMonth(new Date(currentYear, currentMonth));
      const firstDayTimestamp = toUnixTimestampByRegion(firstDayLocal, region);

      // Thời điểm hiện tại theo timezone của region
      const nowTimestamp = toUnixTimestampByRegion(now, region);

      // Log kiểm tra
      console.log(
        `🚀 Tối ưu: Lấy đơn hàng của tháng ${
          currentMonth + 1
        }/${currentYear} (từ ngày 1 đến hiện tại) cho region ${region || 'VN'}`,
      );
      console.log(`Timezone: ${getTimezoneByRegion(region)}`);
      console.log(`Timestamp: ${firstDayTimestamp} → ${nowTimestamp}`);

      return await this.fetchOrdersWithPagination(
        options,
        firstDayTimestamp,
        nowTimestamp,
        page_size,
        'DESC', // Lấy đơn hàng mới nhất trước
      );
    } catch (error) {
      console.error('❌ Lỗi khi lấy đơn hàng:', error);
      return [];
    }
  }

  /**
   * Lấy đơn hàng trong khoảng thời gian tùy chỉnh - ĐƯỢC TỐI ƯU
   */
  async getOrdersByDateRange(
    options: CommonParams,
    startDate: Date,
    endDate: Date,
    page_size = 100,
  ) {
    try {
      // Lấy region từ options
      const region = options.region;

      // Tính timestamp cho thời gian bắt đầu và kết thúc theo timezone của region
      const startTimestamp = toUnixTimestampByRegion(startDate, region);
      const endTimestamp = toUnixTimestampByRegion(endDate, region);

      console.log(
        `🚀 Tối ưu: Lấy đơn hàng từ ${startDate.toLocaleString(
          'vi-VN',
        )} đến ${endDate.toLocaleString('vi-VN')} cho region ${region || 'VN'}...`,
      );
      console.log(`Timezone: ${getTimezoneByRegion(region)}`);
      console.log(`Timestamp: ${startTimestamp} đến ${endTimestamp}`);

      // Tự động chọn phương thức tối ưu dựa trên khoảng thời gian
      const timeRange = endTimestamp - startTimestamp;
      const sevenDays = 7 * 24 * 60 * 60;

      if (timeRange > sevenDays) {
        return await this.fetchOrdersParallel(
          options,
          startTimestamp,
          endTimestamp,
          page_size,
        );
      } else {
        return await this.fetchOrdersWithPagination(
          options,
          startTimestamp,
          endTimestamp,
          page_size,
          'DESC',
        );
      }
    } catch (error) {
      console.error('❌ Lỗi khi lấy đơn hàng:', error);
      return [];
    }
  }

  /**
   * Phương thức mới: Lấy đơn hàng được cập nhật gần đây (sử dụng update_time thay vì create_time)
   */
  async fetchRecentlyUpdatedOrders(
    options: CommonParams,
    daysAgo = 7,
    page_size = 100,
  ) {
    try {
      const region = options.region;

      const startDate = getDateDaysAgoByRegion(daysAgo, region);
      const endDate = getCurrentDateByRegion(region);

      const startTimestamp = toUnixTimestampByRegion(startDate, region);
      const endTimestamp = toUnixTimestampByRegion(endDate, region);

      console.log(
        `🔄 Lấy đơn hàng được cập nhật trong ${daysAgo} ngày gần nhất cho region ${region || 'VN'}...`,
      );

      const requestOptions: CommonParams = {
        ...options,
        query_params: {
          page_size,
          update_time_ge: startTimestamp,
          update_time_lt: endTimestamp,
          sort_field: 'update_time', // Sắp xếp theo thời gian cập nhật
          sort_order: 'DESC',
        },
      };

      let allOrders: Order[] = [];
      let hasMoreData = true;
      let nextPageToken = '';

      while (hasMoreData) {
        if (nextPageToken) {
          requestOptions.query_params.page_token = nextPageToken;
        }

        const result = await this.getOrderList(requestOptions);

        if (result.data?.orders && Array.isArray(result.data.orders)) {
          allOrders = [...allOrders, ...result.data.orders];
        }

        if (result.data?.next_page_token) {
          nextPageToken = result.data.next_page_token;
          console.log(
            `📦 Đã lấy ${allOrders.length} đơn hàng được cập nhật...`,
          );
        } else {
          hasMoreData = false;
        }
      }

      console.log(`✅ Hoàn thành: ${allOrders.length} đơn hàng được cập nhật`);
      return extractOrderData(allOrders, region);
    } catch (error) {
      console.error('❌ Lỗi khi lấy đơn hàng được cập nhật:', error);
      return [];
    }
  }
}
