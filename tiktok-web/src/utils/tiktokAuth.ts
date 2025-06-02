/**
 * Các hàm tiện ích cho việc ủy quyền TikTok
 */

/**
 * Tạo chuỗi state ngẫu nhiên để bảo vệ khỏi tấn công CSRF
 * @returns Chuỗi ngẫu nhiên dùng làm state
 */
export const generateRandomState = (): string => {
  const randomBytes = new Uint8Array(16);
  window.crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Trích xuất mã ủy quyền từ URL
 * @param url URL chứa mã ủy quyền
 * @returns Mã ủy quyền đã trích xuất hoặc null nếu không tìm thấy
 */
export const extractAuthCodeFromUrl = (url: string): string | null => {
  try {
    // Thử phân tích như một URL hoàn chỉnh trước
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      const code = params.get('code');
      if (code) {
        return code;
      }
    } catch {
      // Nếu không phải URL hợp lệ, tiếp tục với việc trích xuất regex
    }
    
    // Thử trích xuất bằng regex như một phương án dự phòng
    const codeMatch = url.match(/code=([^&]+)/);
    if (codeMatch && codeMatch[1]) {
      return codeMatch[1];
    }
    
    return null;
  } catch (error) {
    console.error('Lỗi khi trích xuất mã ủy quyền:', error);
    return null;
  }
};

/**
 * Tạo URL ủy quyền TikTok
 * @param serviceId ID dịch vụ (ID shop)
 * @param market Thị trường ('us' hoặc 'global')
 * @param state Chuỗi state dùng để bảo vệ khỏi tấn công CSRF
 * @returns URL ủy quyền
 */
export const generateTikTokAuthUrl = (
  serviceId: string, 
  market: 'us' | 'global' = 'global',
  state: string = generateRandomState()
): string => {
  // Lưu state vào localStorage để xác thực khi callback
  localStorage.setItem('tiktok_auth_state', state);
  
  if (market === 'us') {
    return `https://services.us.tiktokshop.com/open/authorize?service_id=${serviceId}&state=${state}`;
  }
  return `https://services.tiktokshop.com/open/authorize?service_id=${serviceId}&state=${state}`;
};

/**
 * Phân tích URL callback từ TikTok
 * @param callbackUrl URL callback từ TikTok
 * @returns Đối tượng chứa các tham số đã phân tích
 */
export const parseTikTokCallback = (callbackUrl: string) => {
  try {
    const url = new URL(callbackUrl);
    const params = new URLSearchParams(url.search);
    
    return {
      appKey: params.get('app_key'),
      code: params.get('code'),
      locale: params.get('locale'),
      shopRegion: params.get('shop_region'),
      state: params.get('state'),
    };
  } catch (error) {
    console.error('Lỗi khi phân tích URL callback:', error);
    return {
      appKey: null,
      code: null,
      locale: null,
      shopRegion: null,
      state: null,
    };
  }
}; 