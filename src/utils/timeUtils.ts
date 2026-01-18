/**
 * 时间工具函数 - 将UTC时间转换为北京时间
 */

/**
 * 将UTC时间戳转换为北京时间格式的日期字符串 (YYYYMMDD)
 * @param timestamp UTC时间戳 (毫秒)
 * @returns 北京时间格式的日期字符串，如 "20260117"
 */
export function formatDateToBeijing(timestamp: number): string {
  // 创建UTC日期对象
  const utcDate = new Date(timestamp);

  // 转换为北京时间 (UTC+8)
  const beijingTime = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));

  // 格式化为 YYYYMMDD
  const year = beijingTime.getUTCFullYear();
  const month = (beijingTime.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = beijingTime.getUTCDate().toString().padStart(2, '0');

  return `${year}${month}${day}`;
}

/**
 * 将UTC时间戳转换为北京时间的本地化字符串
 * @param timestamp UTC时间戳 (毫秒)
 * @param options Intl.DateTimeFormatOptions
 * @returns 北京时间的本地化字符串
 */
export function formatDateTimeToBeijing(
  timestamp: number,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }
): string {
  // 创建UTC日期对象
  const utcDate = new Date(timestamp);

  // 转换为北京时间 (UTC+8)
  const beijingTime = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));

  // 手动格式化，避免toLocaleString的时区问题
  const year = beijingTime.getUTCFullYear();
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getUTCDate()).padStart(2, '0');
  const hour = String(beijingTime.getUTCHours()).padStart(2, '0');
  const minute = String(beijingTime.getUTCMinutes()).padStart(2, '0');
  const second = String(beijingTime.getUTCSeconds()).padStart(2, '0');

  return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
}

/**
 * 获取当前北京时间的日期字符串 (YYYYMMDD)
 * @returns 北京时间格式的日期字符串
 */
export function getCurrentBeijingDateString(): string {
  return formatDateToBeijing(Date.now());
}

/**
 * 获取当前北京时间的Date对象
 * @returns 北京时间的Date对象
 */
export function getCurrentBeijingDate(): Date {
  return new Date(Date.now() + (8 * 60 * 60 * 1000));
}