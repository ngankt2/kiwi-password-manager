import { writeFile } from 'node:fs/promises';
import { addFolder, createItem, createVault, saveItem } from '../src/domain/services/items';
import { ITEM_TYPES } from '../src/domain/entities/vault';
import { deriveContext, sealVault } from '../src/core/vault-format/codec';
import { wipe } from '../src/core/bytes';
import { testCrypto, TEST_KDF } from '../tests/helpers/crypto';

const desktopPassword = 'Desktop-usability-fixture-2026';
async function fixture(path: string) {
  let vault = createVault('ui-review-vault', 'Desktop UI Review');
  vault = addFolder(vault, 'work', 'Công việc', null);
  vault = addFolder(vault, 'team', 'Nhóm thiết kế', 'work');
  vault = addFolder(vault, 'personal', 'Cá nhân', null);
  vault = addFolder(vault, 'long-folder', 'Dự án với tên thư mục dài để kiểm tra căn chỉnh', 'work');
  const names = ['Email công việc', 'Ghi chú dự án', 'Biến môi trường thử nghiệm', 'API thử nghiệm', 'Khoá SSH máy chủ', 'Cơ sở dữ liệu', 'Máy chủ staging', 'Wi-Fi văn phòng', 'Thẻ thanh toán mẫu', 'Thông tin tuỳ chỉnh'];
  ITEM_TYPES.forEach((type, index) => {
    const item = createItem('review-' + type, type, index % 2 ? 'personal' : 'team');
    item.title = names[index]; item.favorite = index % 3 === 0; item.tags = ['Desktop', 'Kiểm thử'];
    item.notes = 'Dữ liệu giả phục vụ kiểm tra giao diện.\nKiểm tra căn lề, xuống dòng và thao tác bằng bàn phím.';
    item.fields = item.fields.map((field) => ({ ...field, value: field.kind === 'otp' ? '' : field.kind === 'url' ? 'https://example.invalid/projects/desktop/usability-review' : field.protected ? 'synthetic-fixture-secret' : field.id === 'username' ? 'desktop-review@example.invalid' : 'Thông tin thử nghiệm' }));
    item.fields.push({ id: 'extra', kind: 'text', protected: false, label: 'Tên trường tuỳ chỉnh dài', value: 'Một giá trị đủ dài để kiểm tra cách xuống dòng ở cửa sổ nhỏ.' });
    vault = saveItem(vault, item, 'initial-' + index);
  });
  vault = saveItem(vault, { ...vault.items[0], notes: 'Nội dung đã cập nhật để kiểm tra lịch sử phiên bản.' }, 'review-history');
  const context = await deriveContext(testCrypto, desktopPassword, TEST_KDF);
  try { await writeFile(path, await sealVault(testCrypto, vault, context)); }
  finally { wipe(context.key); }
}

if (!Bun.argv[2]) throw new Error('A fixture output path is required');
await fixture(Bun.argv[2]);
