import type { MessageKey } from '@/core/i18n';
import type { IconError } from '@/core/icon-image';

export const ICON_IMAGE_ERRORS: Record<IconError['code'], MessageKey> = {
  url: 'Dùng URL HTTPS của ảnh hoặc website công khai.',
  format: 'Ảnh không hợp lệ. Hỗ trợ PNG, JPEG, WebP, GIF, SVG và ICO.',
  size: 'Ảnh quá lớn. Tối đa 512 KB và 1024 × 1024 px.',
  network: 'Không tải được icon. Kiểm tra URL hoặc thử ảnh khác.',
};
