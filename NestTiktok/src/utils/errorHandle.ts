import { ERROR_CODE } from 'src/const';

/**
 * Hàm xử lý lỗi từ TikTok Shop API
 * @param {Object} error - Đối tượng lỗi từ API
 * @returns {Object} Đối tượng chứa mã lỗi và thông báo lỗi
 */
export const handleTikTokError = (error: {
  code: number;
  message: string;
  response: { data: { code: number; message: string } };
}) => {
  // Nếu lỗi đã được xử lý trước đó
  if (error.code && error.message) {
    return error;
  }

  // Lấy mã lỗi từ phản hồi của TikTok API
  const errorCode =
    error?.response?.data?.code || error?.code || ERROR_CODE.UNKNOWN_ERROR;
  let errorMessage = '';

  // Xác định thông báo lỗi dựa trên mã lỗi
  switch (errorCode) {
    // Mã lỗi xác thực
    case ERROR_CODE.ACCESS_TOKEN_EXPIRED:
      errorMessage = 'Access token đã hết hạn. Vui lòng làm mới token của bạn.';
      break;
    case ERROR_CODE.INVALID_SIGN:
      errorMessage =
        'Chữ ký không hợp lệ. Vui lòng đảm bảo bạn tạo chữ ký đúng cách.';
      break;
    case ERROR_CODE.MISSING_SIGNATURE:
      errorMessage =
        'Thiếu chữ ký trong yêu cầu. Vui lòng tạo chữ ký và thêm vào truy vấn.';
      break;
    case ERROR_CODE.INVALID_ACCESS_TOKEN:
      errorMessage =
        'Access token không hợp lệ. Vui lòng kiểm tra và cung cấp access_token hợp lệ.';
      break;
    case ERROR_CODE.INVALID_TTS_ACCESS_TOKEN:
      errorMessage =
        'x-tts-access-token không hợp lệ. Vui lòng kiểm tra và cung cấp token hợp lệ.';
      break;
    case ERROR_CODE.INVALID_APP_KEY:
      errorMessage =
        'App key không hợp lệ. Hãy kiểm tra định dạng, ứng dụng không tồn tại hoặc đã bị vô hiệu hóa.';
      break;
    case ERROR_CODE.INVALID_TIMESTAMP:
      errorMessage = 'Timestamp không hợp lệ. Giá trị không được nhỏ hơn 0.';
      break;
    case ERROR_CODE.TIMESTAMP_TOO_EARLY:
      errorMessage =
        'Timestamp quá sớm. Không được sớm hơn 5 phút so với thời gian hiện tại.';
      break;
    case ERROR_CODE.TIMESTAMP_TOO_LATE:
      errorMessage =
        'Timestamp quá muộn. Không được muộn hơn 30 giây so với thời gian hiện tại.';
      break;

    // Mã lỗi khác
    case ERROR_CODE.UNKNOWN_ERROR:
    default:
      errorMessage = 'Đã xảy ra lỗi không xác định, vui lòng thử lại sau.';
      break;
  }

  // Ưu tiên sử dụng thông báo lỗi từ API nếu có
  const apiErrorMsg = error?.response?.data?.message || error?.message;
  if (apiErrorMsg) {
    errorMessage = apiErrorMsg;
  }

  return {
    code: errorCode,
    message: errorMessage,
    originalError: error,
  };
};

export default {
  handleTikTokError,
};
