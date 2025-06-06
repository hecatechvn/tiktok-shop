import axios, { AxiosError } from 'axios';
import { generateSign } from './sign';
import { handleTikTokError } from 'src/utils/errorHandle';
import { RequestOption } from 'src/types';
import { BaseResponse } from 'src/types';

/**
 * Gửi yêu cầu đến TikTok Shop API với xác thực đúng
 * @param {Object} requestOption - Đối tượng chứa các tùy chọn yêu cầu
 * @param {string} requestOption.uri - URL của API endpoint
 * @param {Object} requestOption.qs - Các tham số truy vấn
 * @param {Object} requestOption.headers - Headers của yêu cầu
 * @param {Object} [requestOption.body] - Body của yêu cầu cho POST/PUT
 * @param {string} appSecret - App secret dùng để ký yêu cầu
 * @param {string} [method='GET'] - Phương thức HTTP
 * @returns {Promise<T>} Phản hồi từ API
 */
export const sendRequest = async <T extends BaseResponse = BaseResponse>(
  requestOption: RequestOption,
  appSecret: string,
  method = 'GET',
): Promise<T> => {
  // Tạo timestamp nếu chưa được cung cấp
  if (!requestOption.qs.timestamp) {
    requestOption.qs.timestamp = Math.floor(Date.now() / 1000).toString();
  }

  // Tạo chữ ký
  const signature = generateSign(requestOption, appSecret);
  requestOption.qs.sign = signature;

  // Xây dựng URL với các tham số truy vấn
  const url = new URL(requestOption.uri);
  Object.keys(requestOption.qs).forEach((key) => {
    url.searchParams.append(key, String(requestOption.qs[key]));
  });

  try {
    const axiosConfig = {
      method,
      url: url.toString(),
      headers: {
        'Content-Type': 'application/json',
        ...(requestOption.headers || {}),
      },
      data:
        method !== 'GET' &&
        requestOption.body &&
        Object.keys(requestOption.body).length > 0
          ? JSON.stringify(requestOption.body)
          : undefined,
    };

    console.log(axiosConfig);
    const response = await axios(axiosConfig);
    const data = response.data as T;

    // Kiểm tra và xử lý lỗi từ API
    if (data && typeof data.code === 'number' && data.code !== 0) {
      const error = {
        code: data.code,
        message: data.message || 'Lỗi từ TikTok API',
        response: {
          data: {
            code: data.code,
            message: data.message || '',
          },
        },
      };
      throw new Error(JSON.stringify(handleTikTokError(error)));
    }

    return data;
  } catch (error: unknown) {
    // Xử lý lỗi mạng hoặc lỗi khác
    let tikTokError: {
      code: number;
      message: string;
      response: { data: { code: number; message: string } };
    };

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      tikTokError = {
        code: axiosError.response?.status || 90000,
        message: axiosError.message || 'Lỗi từ TikTok API',
        response: {
          data: {
            code: axiosError.response?.status || 90000,
            message:
              axiosError.response?.statusText || axiosError.message || '',
          },
        },
      };
    } else if (error instanceof Error) {
      tikTokError = {
        code: 90000, // UNKNOWN_ERROR
        message: error.message,
        response: { data: { code: 90000, message: error.message } },
      };
    } else {
      tikTokError = {
        code: 90000,
        message: 'Lỗi không xác định',
        response: { data: { code: 90000, message: 'Lỗi không xác định' } },
      };
    }

    const processedError = handleTikTokError(tikTokError);
    throw new Error(JSON.stringify(processedError));
  }
};
