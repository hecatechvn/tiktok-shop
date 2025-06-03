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
import { toUnixTimestamp } from 'src/utils/date';
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
      // Thiết lập các tùy chọn request
      const requestOption: RequestOption = {
        uri: 'https://open-api.tiktokglobalshop.com/order/202309/orders/search',
        qs: {
          app_key: app_key,
          shop_cipher: shop_cipher,
          page_size: page_size || 20,
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

      // Thêm các tham số body để lọc
      const bodyParams = [
        'order_status',
        'create_time_ge',
        'create_time_le',
        'create_time_lt',
        'update_time_ge',
        'update_time_le',
        'update_time_lt',
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
   * Hàm helper để lấy đơn hàng với phân trang
   * @param options Tùy chọn API
   * @param startTimestamp Thời gian bắt đầu (Unix timestamp)
   * @param endTimestamp Thời gian kết thúc (Unix timestamp)
   * @param page_size Kích thước trang
   * @returns Danh sách đơn hàng đã xử lý
   */
  private async fetchOrdersWithPagination(
    options: CommonParams,
    startTimestamp: number,
    endTimestamp: number,
    page_size = 100,
  ): Promise<ExtractedOrderItem[]> {
    // Mảng lưu trữ tất cả các đơn hàng
    let allOrders: Order[] = [];
    let hasMoreData = true;
    let nextPageToken = '';
    let totalCount = 0;

    // Lấy tất cả các trang dữ liệu
    while (hasMoreData) {
      // Cập nhật tùy chọn với page_token nếu có
      const requestOptions: CommonParams = {
        ...options,
        query_params: {
          page_size,
          create_time_ge: startTimestamp,
          create_time_le: endTimestamp,
          sort_field: 'create_time',
          sort_order: 'DESC',
        },
      };

      // Thêm page_token nếu không phải lần gọi đầu tiên
      if (nextPageToken) {
        requestOptions.query_params.page_token = nextPageToken;
      }

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
          `Đã lấy ${allOrders.length}/${totalCount || '?'} đơn hàng, tiếp tục...`,
        );
      } else {
        hasMoreData = false;
      }
    }

    // Lọc đơn hàng để đảm bảo nằm trong khoảng thời gian
    const validOrders = allOrders.filter((order) => {
      return (
        order.create_time >= startTimestamp && order.create_time <= endTimestamp
      );
    });

    if (validOrders.length < allOrders.length) {
      console.log(
        `⚠️ Đã lọc bỏ ${
          allOrders.length - validOrders.length
        } đơn hàng nằm ngoài khoảng thời gian yêu cầu.`,
      );
    }

    console.log(`✅ Đã lấy tổng cộng ${validOrders.length} đơn hàng.`);
    return extractOrderData(validOrders);
  }

  /**
   * Lấy tất cả đơn hàng từ đầu năm đến hiện tại
   */
  async getAllOrders(options: CommonParams): Promise<AllOrdersResponse> {
    // Tính timestamp cho ngày 1 tháng 1 năm hiện tại
    const currentYear = new Date().getFullYear();
    const startDate = new Date(currentYear, 0, 1);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);

    // Tính timestamp cho 15 ngày trước
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const fifteenDaysAgoTimestamp = Math.floor(fifteenDaysAgo.getTime() / 1000);

    // Lưu trữ tất cả đơn hàng
    const allOrders: ExtractedOrderItem[] = [];

    // Lấy đơn hàng gần đây (15 ngày gần nhất) - những đơn này sẽ ghi đè lên dữ liệu hiện có
    let pageToken = '';
    let hasMoreRecentOrders = true;

    console.log('Đang lấy đơn hàng gần đây (15 ngày gần nhất)...');

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
        const extractedOrders = extractOrderData(response.data.orders);
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
        const extractedOrders = extractOrderData(response.data.orders);
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

    console.log(ordersByMonth);
    return {
      allOrders,
      ordersByMonth,
      recentOrdersTimestamp: fifteenDaysAgoTimestamp,
    };
  }

  /**
   * Lấy đơn hàng trong khoảng ngày gần đây
   */
  async fetchOrdersByDateRange(
    options: CommonParams,
    daysAgo = 30,
    page_size = 100,
  ) {
    try {
      // Tính toán thời gian bắt đầu dựa trên số ngày
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);
      const startTimestamp = toUnixTimestamp(startDate);
      const endTimestamp = toUnixTimestamp(new Date());

      console.log(`Đang lấy đơn hàng trong ${daysAgo} ngày gần nhất...`);
      console.log(`Timestamp: ${startTimestamp} → ${endTimestamp}`);

      return await this.fetchOrdersWithPagination(
        options,
        startTimestamp,
        endTimestamp,
        page_size,
      );
    } catch (error) {
      console.error('❌ Lỗi khi lấy đơn hàng:', error);
      return [];
    }
  }

  /**
   * Lấy đơn hàng từ đầu tháng đến ngày 15 của tháng hiện tại
   */
  async fetchCurrentMonthOrders(options: CommonParams, page_size = 100) {
    try {
      // Lấy ngày hiện tại
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth(); // 0-11

      // Tính timestamp cho ngày đầu tiên của tháng hiện tại
      const firstDayOfMonth = startOfMonth(new Date(currentYear, currentMonth));
      const firstDayTimestamp = toUnixTimestamp(firstDayOfMonth);

      // Tính timestamp cho ngày 15 của tháng hiện tại
      const day15OfMonth = endOfDay(
        setDate(new Date(currentYear, currentMonth), 15),
      );
      const day15Timestamp = toUnixTimestamp(day15OfMonth);

      // Nếu ngày hiện tại lớn hơn ngày 15, sử dụng timestamp ngày 15
      // Nếu ngày hiện tại nhỏ hơn hoặc bằng ngày 15, sử dụng timestamp hiện tại
      const endTimestamp =
        currentDate.getDate() > 15
          ? day15Timestamp
          : toUnixTimestamp(currentDate);

      console.log(
        `Đang lấy đơn hàng từ đầu tháng ${
          currentMonth + 1
        }/${currentYear} đến ngày 15/${currentMonth + 1}/${currentYear}...`,
      );
      console.log(`Timestamp: ${firstDayTimestamp} → ${endTimestamp}`);

      return await this.fetchOrdersWithPagination(
        options,
        firstDayTimestamp,
        endTimestamp,
        page_size,
      );
    } catch (error) {
      console.error('❌ Lỗi khi lấy đơn hàng đầu tháng:', error);
      return [];
    }
  }

  /**
   * Lấy đơn hàng từ đầu tháng trước đến ngày 15 của tháng hiện tại
   */
  async fetchPreviousToCurrentMonthOrders(
    options: CommonParams,
    page_size = 100,
  ) {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-11

      // Tính năm và tháng trước
      const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const previousMonthYear =
        currentMonth === 0 ? currentYear - 1 : currentYear;

      // Ngày 1 tháng trước theo giờ VN
      const firstDayLocal = startOfMonth(
        new Date(previousMonthYear, previousMonth),
      );
      const firstDayTimestamp = toUnixTimestamp(firstDayLocal);

      // Ngày 15 tháng này 23:59:59 giờ VN
      const day15Local = endOfDay(
        setDate(new Date(currentYear, currentMonth), 15),
      );
      const day15Timestamp = toUnixTimestamp(day15Local);

      // Log kiểm tra
      console.log(
        `Đang lấy đơn hàng từ ${format(firstDayLocal, 'dd/MM/yyyy')} đến ${format(
          day15Local,
          'dd/MM/yyyy',
        )}`,
      );
      console.log(`Timestamp: ${firstDayTimestamp} → ${day15Timestamp}`);

      return await this.fetchOrdersWithPagination(
        options,
        firstDayTimestamp,
        day15Timestamp,
        page_size,
      );
    } catch (error) {
      console.error('❌ Lỗi khi lấy đơn hàng:', error);
      return [];
    }
  }

  /**
   * Lấy tất cả đơn hàng của tháng hiện tại
   */
  async fetchCurrentMonthAllOrders(options: CommonParams, page_size = 100) {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-11

      // Ngày 1 của tháng hiện tại
      const firstDayLocal = startOfMonth(new Date(currentYear, currentMonth));
      const firstDayTimestamp = toUnixTimestamp(firstDayLocal);

      // Thời điểm hiện tại
      const nowTimestamp = toUnixTimestamp(now);

      // Log kiểm tra
      console.log(
        `Đang lấy đơn hàng của tháng ${
          currentMonth + 1
        }/${currentYear} (từ ngày 1 đến hiện tại)`,
      );
      console.log(`Timestamp: ${firstDayTimestamp} → ${nowTimestamp}`);

      return await this.fetchOrdersWithPagination(
        options,
        firstDayTimestamp,
        nowTimestamp,
        page_size,
      );
    } catch (error) {
      console.error('❌ Lỗi khi lấy đơn hàng:', error);
      return [];
    }
  }

  /**
   * Lấy đơn hàng trong khoảng thời gian tùy chỉnh
   */
  async getOrdersByDateRange(
    options: CommonParams,
    startDate: Date,
    endDate: Date,
    page_size = 100,
  ) {
    try {
      // Tính timestamp cho thời gian bắt đầu và kết thúc
      const startTimestamp = toUnixTimestamp(startDate);
      const endTimestamp = toUnixTimestamp(endDate);

      console.log(
        `Đang lấy đơn hàng từ ${startDate.toLocaleString(
          'vi-VN',
        )} đến ${endDate.toLocaleString('vi-VN')}...`,
      );
      console.log(`Timestamp: ${startTimestamp} đến ${endTimestamp}`);

      return await this.fetchOrdersWithPagination(
        options,
        startTimestamp,
        endTimestamp,
        page_size,
      );
    } catch (error) {
      console.error('❌ Lỗi khi lấy đơn hàng:', error);
      return [];
    }
  }
}
