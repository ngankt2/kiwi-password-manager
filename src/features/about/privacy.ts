import type { Locale, MessageKey } from '@/core/i18n';
import { FORMAT_LOCALES } from '@/core/i18n/locales';
import { expo as appConfig } from '../../../app.json';

/** Bump when the policy text changes; docs/PRIVACY.md mirrors it for the public URL in App Store Connect. */
export const PRIVACY_UPDATED = '2026-10-17T00:00:00Z';

export const privacyUpdatedDate = (locale: Locale) =>
  new Intl.DateTimeFormat(FORMAT_LOCALES[locale], { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(PRIVACY_UPDATED));

export const SUPPORT_URL = `https://appkiro.com/contact?utm_source=${encodeURIComponent(appConfig.name)}`;

export type PrivacySection = { title: MessageKey; paragraphs: MessageKey[] };

export const PRIVACY_INTRO: MessageKey = 'Chính sách này giải thích cách Kiro Password Manager do AppKiro phát triển xử lý dữ liệu của bạn.';

export const PRIVACY_SECTIONS: PrivacySection[] = [
  { title: 'Dữ liệu chúng tôi thu thập', paragraphs: ['AppKiro không thu thập, lưu trữ hay nhận bất kỳ dữ liệu nào bạn nhập vào ứng dụng. Ứng dụng không có tài khoản trực tuyến, không có phân tích sử dụng, quảng cáo hay theo dõi.'] },
  { title: 'Dữ liệu trên thiết bị của bạn', paragraphs: [
    'Kho mật khẩu được mã hoá bằng AES-256-GCM với khoá dẫn xuất từ mật khẩu chính bằng Argon2id và chỉ được lưu trên thiết bị của bạn. Mật khẩu chính không bao giờ được lưu lại hay gửi đi.',
    'Tệp kho đã mã hoá có thể nằm trong bản sao lưu thiết bị nếu bạn bật tính năng sao lưu của hệ điều hành, ví dụ iCloud. Cài đặt ứng dụng như ngôn ngữ, giao diện và thời gian tự khoá được lưu cục bộ và không chứa mật khẩu.',
  ] },
  { title: 'Kết nối mạng', paragraphs: [
    'Khi một mục có địa chỉ website, ứng dụng có thể tải biểu tượng hoặc favicon trực tiếp từ website đó. Website ấy có thể thấy địa chỉ IP của bạn giống như khi bạn truy cập bình thường. Mật khẩu và nội dung kho không bao giờ được gửi đi.',
    'Ứng dụng máy tính kiểm tra bản cập nhật từ GitHub. Bản web tải biểu tượng qua máy chủ đang chạy trang web để vượt giới hạn trình duyệt; máy chủ đó chỉ nhận địa chỉ website cần tải biểu tượng.',
  ] },
  { title: 'Xuất và chia sẻ', paragraphs: ['Dữ liệu chỉ rời khỏi thiết bị khi bạn chủ động xuất hoặc chia sẻ tệp. Tệp .akpr luôn được mã hoá. Tệp JSON xuất ra ở dạng văn bản thường, nên hãy bảo vệ và xoá nó khi không còn cần.'] },
  { title: 'Sinh trắc học', paragraphs: ['Face ID, Touch ID và các phương thức sinh trắc học khác chỉ được dùng để mở khoá nhanh thông qua hệ điều hành. Ứng dụng không bao giờ nhận được dữ liệu sinh trắc học của bạn.'] },
  { title: 'Xoá dữ liệu', paragraphs: ['Bạn có thể xoá một kho trong phần cài đặt của kho, hoặc gỡ ứng dụng để xoá toàn bộ dữ liệu cục bộ. Vì chúng tôi không lưu dữ liệu của bạn, chúng tôi không thể khôi phục kho hay mật khẩu chính.'] },
  { title: 'Thay đổi và liên hệ', paragraphs: ['Khi chính sách thay đổi, chúng tôi sẽ cập nhật ngày ở đầu trang này. Nếu bạn có câu hỏi về quyền riêng tư, hãy liên hệ AppKiro qua trang hỗ trợ.'] },
];
