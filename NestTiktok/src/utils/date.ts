import { format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import * as ct from 'countries-and-timezones';

/**
 * Định dạng Unix timestamp thành chuỗi ngày giờ dựa theo khu vực
 * @param timestamp Unix timestamp tính bằng giây
 * @param region Mã khu vực (ví dụ: 'VN', 'ID', 'TH', v.v.)
 * @returns Chuỗi ngày được định dạng theo khu vực
 */
export const formatDateTimeByRegion = (
  timestamp: number,
  region?: string,
): string => {
  if (!timestamp) return '';

  // Mặc định là Việt Nam nếu không chỉ định khu vực
  if (!region) {
    return formatDateTimeVN(timestamp);
  }

  const timeZone = getTimezoneByRegion(region);

  try {
    // Chuyển đổi Unix timestamp (giây) sang Date object (mili giây)
    const utcDate = new Date(timestamp * 1000);

    // Kiểm tra xem Date có hợp lệ không
    if (isNaN(utcDate.getTime())) {
      console.error('❌ Timestamp không hợp lệ:', timestamp);
      return '';
    }

    // Sử dụng cùng định dạng ngày cho tất cả khu vực: dd/MM/yyyy HH:mm:ss
    const zonedDate = toZonedTime(utcDate, timeZone);
    return format(zonedDate, 'dd/MM/yyyy HH:mm:ss');
  } catch (error) {
    console.error(
      '❌ Lỗi khi format datetime:',
      error,
      'timestamp:',
      timestamp,
      'timezone:',
      timeZone,
    );
    return '';
  }
};

/**
 * Định dạng Unix timestamp thành chuỗi ngày giờ theo định dạng Việt Nam (UTC+7)
 * @param timestamp Unix timestamp tính bằng giây
 * @returns Chuỗi ngày được định dạng theo kiểu Việt Nam
 */
export const formatDateTimeVN = (timestamp: number): string => {
  if (!timestamp) return '';

  const timeZone = 'Asia/Ho_Chi_Minh'; // Múi giờ VN
  const date = toZonedTime(new Date(timestamp * 1000), timeZone); // chuyển từ UTC → VN time

  return format(date, 'dd/MM/yyyy HH:mm:ss');
};

/**
 * Chuyển đổi đối tượng Date thành Unix timestamp (giây)
 * @param {Date} date - Đối tượng Date
 * @returns {number} - Unix timestamp (giây)
 */
export const toUnixTimestamp = (date: Date): number => {
  return Math.floor(date.getTime() / 1000);
};

export const getDateInIndochinaTime = () => {
  // Lấy ngày hiện tại ở UTC
  const utcDate = new Date();
  // Chuyển đổi sang UTC+7 (Giờ Đông Dương)
  return toZonedTime(utcDate, 'Asia/Bangkok');
};

/**
 * Lấy timezone theo mã khu vực
 * @param region Mã khu vực (ví dụ: 'VN', 'ID', 'TH', v.v.)
 * @returns Chuỗi timezone
 */
export const getTimezoneByRegion = (region?: string): string => {
  if (!region) {
    return 'Asia/Ho_Chi_Minh'; // Mặc định Việt Nam
  }

  try {
    const country = ct.getCountry(region.toUpperCase());

    if (country && country.timezones && country.timezones.length > 0) {
      // Sử dụng múi giờ đầu tiên từ danh sách múi giờ của quốc gia
      return country.timezones[0];
    } else {
      // Dự phòng về múi giờ Việt Nam nếu không tìm thấy quốc gia
      return 'Asia/Ho_Chi_Minh';
    }
  } catch (error) {
    // Dự phòng về múi giờ Việt Nam nếu có lỗi xảy ra
    console.error('Error getting timezone for region:', region, error);
    return 'Asia/Ho_Chi_Minh';
  }
};

/**
 * Lấy thời gian hiện tại theo timezone của region cụ thể
 * @param region Mã khu vực
 * @returns Date object theo timezone của region
 */
export const getCurrentDateByRegion = (region?: string): Date => {
  const timezone = getTimezoneByRegion(region);
  const utcNow = new Date();
  return toZonedTime(utcNow, timezone);
};

/**
 * Tính thời gian X ngày trước theo timezone của region cụ thể
 * @param daysAgo Số ngày trước đó
 * @param region Mã khu vực
 * @returns Date object của thời điểm X ngày trước theo timezone của region
 */
export const getDateDaysAgoByRegion = (
  daysAgo: number,
  region?: string,
): Date => {
  const currentDate = getCurrentDateByRegion(region);
  const targetDate = new Date(currentDate);
  targetDate.setDate(currentDate.getDate() - daysAgo);
  return targetDate;
};

/**
 * Chuyển đổi Date theo timezone cụ thể thành Unix timestamp
 * @param date Date object trong timezone cụ thể
 * @param region Mã khu vực để xác định timezone
 * @returns Unix timestamp (giây)
 */
export const toUnixTimestampByRegion = (
  date: Date,
  region?: string,
): number => {
  const timezone = getTimezoneByRegion(region);
  // Chuyển từ zoned time về UTC trước khi tính timestamp
  const utcDate = fromZonedTime(date, timezone);
  return Math.floor(utcDate.getTime() / 1000);
};

/**
 * Demo: So sánh thời gian giữa các region khác nhau
 * @param regions Danh sách các regions để so sánh
 */
export const demonstrateTimezoneComparison = (
  regions: string[] = ['VN', 'ID', 'TH', 'MY', 'SG'],
) => {
  console.log('=== TIMEZONE COMPARISON DEMO ===');
  const utcNow = new Date();
  console.log(`UTC Time: ${utcNow.toISOString()}`);
  console.log('');

  regions.forEach((region) => {
    const timezone = getTimezoneByRegion(region);
    const localTime = getCurrentDateByRegion(region);
    const fifteenDaysAgo = getDateDaysAgoByRegion(15, region);

    console.log(`Region: ${region}`);
    console.log(`Timezone: ${timezone}`);
    console.log(`Current Time: ${localTime.toLocaleString()}`);
    console.log(`15 Days Ago: ${fifteenDaysAgo.toLocaleString()}`);
    console.log(`Timestamp Now: ${toUnixTimestampByRegion(localTime, region)}`);
    console.log(
      `Timestamp 15 Days Ago: ${toUnixTimestampByRegion(fifteenDaysAgo, region)}`,
    );
    console.log('---');
  });
};
