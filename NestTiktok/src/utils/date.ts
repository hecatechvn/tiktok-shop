import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * Format Unix timestamp to Vietnamese date time format (UTC+7)
 * @param timestamp Unix timestamp in seconds
 * @returns Formatted date string in Vietnamese format
 */
export const formatDateTimeVN = (timestamp: number): string => {
  if (!timestamp) return '';

  const timeZone = 'Asia/Ho_Chi_Minh'; // VN timezone
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
