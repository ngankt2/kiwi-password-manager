import { ERROR_MESSAGES, safeError, type VaultErrorCode } from '../errors';
import { common } from './common';
import { desktop } from './desktop';
import { dataTools } from './data-tools';
import { quickUnlock } from './quick-unlock';
import { customization } from './customization';
import { updates } from './updates';
import { about } from './about';
import { privacy } from './privacy';
import { usesSingular } from './plurals';
import { system, errorKeys } from './system';
import { FORMAT_LOCALES, LOCALES, type Locale, type LocalizedMessage, type Translations } from './locales';

export { LANGUAGE_NAMES, LOCALES, type Locale } from './locales';
export const catalog = { ...common, ...desktop, ...dataTools, ...system, ...quickUnlock, ...customization, ...updates, ...about, ...privacy };
export type MessageKey = keyof typeof catalog;
export type MessageValues = Record<string, string | number>;
export type Translator = (key: MessageKey, values?: MessageValues) => string;

// Keep the established source keys while polishing the Vietnamese product copy.
export const vietnamese: Partial<Record<MessageKey, string>> = {
  'Mục lưu trữ': 'Lưu trữ', 'Các thư mục': 'Thư mục',
  Vault: 'Kho mật khẩu', 'Vault gốc': 'Thư mục gốc', 'Khoá Vault': 'Khoá kho',
  'Tạo Vault mới': 'Tạo kho mới', 'Mở Vault có sẵn…': 'Mở kho có sẵn…', 'Vault gần đây': 'Kho gần đây',
  'Tạo Vault': 'Tạo kho', 'Tên Vault': 'Tên kho', 'Tên vault': 'Tên kho', 'Tên vault mới': 'Tên kho mới', 'Tên Vault mới': 'Tên kho mới',
  'Master Password': 'Mật khẩu chính', 'Master Password mới': 'Mật khẩu chính mới',
  'Xác nhận Master Password': 'Xác nhận mật khẩu chính', 'Đổi Master Password': 'Đổi mật khẩu chính',
  'Quên Master Password?': 'Quên mật khẩu chính?', 'Master Password là chìa khoá của bạn': 'Mật khẩu chính là chìa khoá của bạn',
  'Master Password được dùng để bảo vệ Vault. Ứng dụng không thể tự khôi phục nếu bạn quên mật khẩu.': 'Mật khẩu chính bảo vệ kho của bạn. Ứng dụng không thể khôi phục nếu bạn quên mật khẩu.',
  'Mở khoá Vault': 'Mở khoá kho', 'Mở Vault khác': 'Mở kho khác', 'Chọn file Vault…': 'Chọn file kho…',
  'Nhập mật khẩu của Vault để tiếp tục.': 'Nhập mật khẩu chính của kho để tiếp tục.',
  'Khoá Vault (⌘L)': 'Khoá kho (⌘L)', 'Tìm trong Vault': 'Tìm trong kho', 'Tìm trong vault…': 'Tìm trong kho…',
  'Điều hướng Vault': 'Điều hướng kho', 'Tìm trong Vault hiện tại': 'Tìm trong kho hiện tại',
  'Vault của bạn đã sẵn sàng': 'Kho của bạn đã sẵn sàng', 'Dữ liệu Vault': 'Dữ liệu trong kho', 'Quản lý Vault': 'Quản lý kho',
  'Cài đặt vault': 'Cài đặt kho', 'Đổi tên vault': 'Đổi tên kho', 'VD: Personal Vault': 'Ví dụ: Cá nhân',
  'B · Rail': 'B · Thanh biểu tượng', 'Passphrase': 'Cụm mật khẩu',
  'Tạo file độc lập với salt và khóa dẫn xuất mới. Mật khẩu chính được giữ nguyên.': 'Tạo kho độc lập được bảo vệ bằng cùng mật khẩu chính.',
  'Đã nhập dữ liệu với ID mới; các mục hiện có được giữ nguyên.': 'Đã nhập dữ liệu. Các mục hiện có được giữ nguyên.',
  'Các mục trong “{name}” sẽ được chuyển lên thư mục cha.': 'Các mục và thư mục con trong “{name}” sẽ được chuyển lên thư mục cha.',
  'Xóa vault này': 'Xoá kho này', 'Xác nhận xóa vault và bản sao nội bộ': 'Xoá kho và các bản sao nội bộ?',
  'XÓA VAULT KHỎI THIẾT BỊ': 'Xoá kho khỏi thiết bị', 'Lưu thành vault mới': 'Lưu thành kho mới',
  'LƯU THÀNH VAULT MỚI': 'Lưu thành kho mới', 'Phục hồi vault': 'Phục hồi kho', 'Tạo vault từ JSON': 'Tạo kho từ JSON',
  'Tạo Vault từ dữ liệu này': 'Tạo kho từ dữ liệu này', 'Nhập vào vault đang mở': 'Nhập vào kho đang mở',
  'Xuất vault mã hóa': 'Xuất kho mã hoá', 'KHUYÊN DÙNG · VAULT MÃ HÓA': 'Khuyên dùng · Kho mã hoá',
  'Yêu cầu Master Password khi hiện hoặc sao chép thông tin bí mật.': 'Yêu cầu mật khẩu chính khi hiện hoặc sao chép thông tin bí mật.',
};

export const aliases: Record<string, MessageKey> = {
  'Browser · encrypted local storage': 'Lưu trong bộ nhớ của trình duyệt này',
  ...Object.fromEntries(Object.entries(ERROR_MESSAGES).map(([code, message]) => [message, errorKeys[code as VaultErrorCode]])),
  'Changes saved': 'Đã lưu thay đổi.',
  'Vault location changed. Future changes will be saved to this file.': 'Đã đổi vị trí lưu. Các thay đổi tiếp theo sẽ được ghi vào file này.',
  'Vault location changed. The old file was kept because it changed or could not be removed.': 'Đã đổi vị trí lưu. File cũ được giữ lại vì đã thay đổi hoặc chưa thể xoá.',
  'An older vault was opened safely. Your original will be backed up on the next save.': 'Đã mở kho phiên bản cũ. File gốc sẽ được sao lưu trong lần lưu tiếp theo.',
  'Master password changed. Existing backups still use their original password.': 'Đã đổi mật khẩu chính. Các bản sao lưu cũ vẫn dùng mật khẩu lúc tạo.',
  'Biometric quick unlock enabled on this device.': 'Đã bật mở khoá bằng sinh trắc học trên thiết bị này.',
  'Quick unlock enabled on this device.': 'Đã bật mở khoá nhanh trên thiết bị này.',
  'Quick unlock disabled on this device.': 'Đã tắt mở khoá nhanh trên thiết bị này.',
  'KeePass auto-type rules, icons, plugin settings and original timestamps are preserved as encrypted metadata; Kiro does not execute auto-type rules.': 'Quy tắc tự điền, biểu tượng và thiết lập KeePass được lưu kèm dưới dạng mã hoá. Ứng dụng không thực thi quy tắc tự điền của KeePass.',
  'The original encrypted KDBX is preserved inside this vault. Keep its original password to open that source archive.': 'File KDBX gốc được lưu trong kho này. Hãy giữ mật khẩu cũ để mở lại file gốc khi cần.',
  'Some OTP values need an otpauth:// configuration before Kiro can display a code. Their original values are preserved.': 'Một số mã OTP cần thiết lập otpauth:// để hiển thị. Giá trị gốc vẫn được giữ nguyên.',
  'Some TOTP configurations are invalid or unsupported. Their original values are preserved.': 'Một số cấu hình TOTP chưa hợp lệ hoặc chưa được hỗ trợ. Giá trị gốc vẫn được giữ nguyên.',
  'Item updated': 'Đã cập nhật mục', 'Item organized': 'Đã sắp xếp mục', 'Version restored': 'Đã khôi phục phiên bản',
  'Username': 'Tên đăng nhập', 'Password': 'Mật khẩu', 'Website': 'Trang web',
  'Cardholder': 'Tên chủ thẻ', 'Card number': 'Số thẻ', 'Expiry': 'Ngày hết hạn', 'Security code': 'Mã bảo mật',
  'Private key': 'Khoá riêng tư', 'Public key': 'Khoá công khai', 'API key': 'API Key', 'SSH key': 'SSH Key',
  'Connection string': 'Chuỗi kết nối', 'One-time password': 'Mã xác thực OTP', 'Port': 'Cổng',
  'Host / IP address': 'Địa chỉ máy chủ / IP', 'Host': 'Máy chủ', 'Protocol': 'Giao thức', 'Network name (SSID)': 'Tên mạng (SSID)',
  'Security': 'Bảo mật', 'Secret': 'Bí mật', 'Database': 'Cơ sở dữ liệu', 'Server': 'Máy chủ',
  'Login': 'Đăng nhập', 'Secure note': 'Ghi chú bảo mật', 'Card': 'Thẻ thanh toán', 'Custom secret': 'Tuỳ chỉnh',
  'Close': 'Đóng', 'Close dialog': 'Đóng', 'Go back': 'Quay lại', 'Cancel': 'Huỷ', 'Confirm': 'Xác nhận',
  'Master password': 'Mật khẩu chính', 'Confirm it’s you': 'Xác nhận mật khẩu', 'Enter your master password to continue.': 'Nhập mật khẩu của Vault để tiếp tục.',
};

export function createI18n(locale: Locale) {
  const index = LOCALES.indexOf(locale) - 1;
  const formatLocale = FORMAT_LOCALES[locale];
  const numbers = new Intl.NumberFormat(formatLocale);
  const format = (message: LocalizedMessage, values: MessageValues = {}) => {
    const template = typeof message === 'string' ? message : usesSingular(locale, Number(values.count ?? 0)) ? message.one : message.other;
    return template.replace(/\{(\w+)\}/g, (token, name: string) => {
      const value = values[name];
      return value === undefined ? token : typeof value === 'number' ? numbers.format(value) : value;
    });
  };
  const t: Translator = (key, values) => {
    const messages: Translations | undefined = catalog[key];
    return format(locale === 'vi' ? vietnamese[key] ?? key : messages?.[index] ?? key, values);
  };
  /** Only pass application-owned text (safe notices, template labels), never user content. */
  const text = (source: string) => {
    const key = aliases[source] ?? source;
    return Object.hasOwn(catalog, key) ? t(key as MessageKey) : source;
  };
  return {
    locale, t, text, number: (value: number) => numbers.format(value),
    error: (value: unknown, fallback?: VaultErrorCode) => t(errorKeys[safeError(value, fallback).code]),
    dateTime: (value: string) => new Date(value).toLocaleString(formatLocale, { dateStyle: 'medium', timeStyle: 'short' }),
    shortDate: (value: string) => new Date(value).toLocaleDateString(formatLocale, { year: 'numeric', month: '2-digit', day: '2-digit' }),
    compactDateTime: (value: string, now = new Date()) => {
      const date = new Date(value);
      const sameYear = date.getFullYear() === now.getFullYear();
      if (sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()) {
        return date.toLocaleTimeString(formatLocale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      }
      const label = date.toLocaleDateString(formatLocale, { day: '2-digit', month: '2-digit', year: sameYear ? undefined : 'numeric' });
      // Some runtimes use a dash for Vietnamese dates without a year.
      return locale === 'vi' ? label.replaceAll('-', '/') : label;
    },
  };
}
