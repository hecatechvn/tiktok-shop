import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import * as ct from 'countries-and-timezones';

/**
 * Format Unix timestamp to date time format based on region
 * @param timestamp Unix timestamp in seconds
 * @param region Region code (e.g., 'VN', 'ID', 'TH', etc.)
 * @returns Formatted date string according to the region's format
 */
export const formatDateTimeByRegion = (
  timestamp: number,
  region?: string,
): string => {
  if (!timestamp) return '';

  // Default to Vietnam if no region is specified
  if (!region) {
    return formatDateTimeVN(timestamp);
  }

  // Get timezone based on region using countries-and-timezones library
  let timeZone: string;

  try {
    const country = ct.getCountry(region.toUpperCase());

    if (country && country.timezones && country.timezones.length > 0) {
      // Use the first timezone from the country's timezone list
      timeZone = country.timezones[0];
    } else {
      // Fallback to Vietnam timezone if country not found
      timeZone = 'Asia/Ho_Chi_Minh';
    }
  } catch (error) {
    // Fallback to Vietnam timezone if any error occurs
    console.error('Error getting timezone for region:', region, error);
    timeZone = 'Asia/Ho_Chi_Minh';
  }

  // Use the same date format for all regions: dd/MM/yyyy HH:mm:ss
  const date = toZonedTime(new Date(timestamp * 1000), timeZone);
  return format(date, 'dd/MM/yyyy HH:mm:ss');
};

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

export const getDateInIndochinaTime = () => {
  // Lấy ngày hiện tại ở UTC
  const utcDate = new Date();
  // Chuyển đổi sang UTC+7 (Giờ Đông Dương)
  return toZonedTime(utcDate, 'Asia/Bangkok');
};
