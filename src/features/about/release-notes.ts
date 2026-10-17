import type { MessageKey } from '@/core/i18n';

export type ReleaseNote = { version: string; notes: MessageKey[] };

/**
 * Newest first. Each note is a catalog key in src/core/i18n/about.ts so it is translated with the app.
 * Add an entry here before each release build; `version` is the version that build will receive.
 */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '1.0.23',
    notes: [
      'Ứng dụng được đổi tên thành Kiwi Password.',
      'Giao diện mới theo phong cách macOS: thanh bên nổi dạng kính, danh sách gọn hơn và trang chi tiết với các trường được nhóm rõ ràng.',
      'Hộp thoại, menu, thông báo và màn hình mở khoá được làm mới theo Apple Human Interface Guidelines, ở cả chế độ Sáng và Tối.',
      'Ứng dụng di động dùng màu và phông chữ hệ thống của iOS.',
      'Thêm trang Giới thiệu với nhật ký phát hành.',
    ],
  },
];
