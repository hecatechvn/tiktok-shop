import * as crypto from 'crypto';
import { RequestOption } from 'src/types';
// Danh sách các khóa cần loại trừ khi tạo chữ ký
const excludeKeys = ['access_token', 'sign'];
/**
 * Hàm tạo chữ ký cho API request
 * @param {Object} requestOption - Các tùy chọn request
 * @param {string} app_secret - Khóa bí mật của ứng dụng
 * @returns {string} - Chữ ký được tạo
 */
export const generateSign = (
  requestOption: RequestOption,
  app_secret: string,
) => {
  // console.log(requestOption);
  // console.log(app_secret);
  let signString = '';
  // Bước 1: Trích xuất tất cả các tham số truy vấn, loại trừ sign và access_token. Sắp xếp lại các khóa tham số theo thứ tự bảng chữ cái
  const params = requestOption.qs || {};
  const sortedParams = Object.keys(params)
    .filter((key) => !excludeKeys.includes(key))
    .sort()
    .map((key) => ({ key, value: params[key] }));
  // Bước 2: Nối tất cả các tham số theo định dạng {key}{value}
  const paramString = sortedParams
    .map(({ key, value }) => `${key}${value}`)
    .join('');

  signString += paramString;

  // Bước 3: Thêm chuỗi từ Bước 2 vào đường dẫn yêu cầu API
  const pathname = new URL(requestOption.uri || '').pathname;

  signString = `${pathname}${paramString}`;

  // Bước 4: Nếu tiêu đề yêu cầu content-type không phải là multipart/form-data, thêm nội dung body của API request vào chuỗi từ Bước 3
  if (
    requestOption.headers?.['content-type'] !== 'multipart/form-data' &&
    requestOption.body &&
    Object.keys(requestOption.body).length
  ) {
    const body = JSON.stringify(requestOption.body);
    signString += body;
  }

  // Bước 5: Bọc chuỗi được tạo ở Bước 4 với app_secret
  signString = `${app_secret}${signString}${app_secret}`;

  // Bước 6: Mã hóa chuỗi đã bọc bằng HMAC-SHA256
  const hmac = crypto.createHmac('sha256', app_secret);
  hmac.update(signString);
  const sign = hmac.digest('hex');

  return sign;
};
