# Báo cáo bản kiểm thử macOS

Báo cáo này ghi lại baseline trước migration. Trạng thái Tauri hiện tại nằm trong [DESKTOP-MIGRATION.md](DESKTOP-MIGRATION.md).

Ngày: 24/09/2026. Môi trường thực tế: macOS 26.4.1, Apple Silicon arm64, Electron 44.4.5, Expo 57.0.24, React Native 0.86.3, React 19.2.3, Bun 1.4.2.

Mục tiêu của đợt này là ứng dụng desktop macOS để kiểm thử. Không build lại iOS hoặc Android. Đây là bản ad-hoc để chạy cục bộ, chưa phải bản phát hành đã notarize hoặc đã audit bảo mật độc lập.

## Đã triển khai

| Nhóm | Nội dung | Bằng chứng |
| --- | --- | --- |
| Vault | Tạo, mở, khóa, lưu, đổi tên, Save As, đổi mật khẩu, xóa có xác thực | Unit/integration session, filesystem và E2E |
| Định dạng | Ba version độc lập, AES-256-GCM với AAD, Argon2id có calibration, schema 1→2 | Crypto/tamper/KDF tests, hai fixture vault cũ |
| An toàn ghi | Ghi độc quyền, fsync, verify, generation mới, bản phục hồi trước đó, conflict | Storage fault injection; filesystem macOS thật |
| KeePass | Chọn file/key file, giải mã, preview, chuyển đổi sang vault riêng | Bảy fixture upstream và file kiểm thử riêng |
| Dữ liệu | Chín loại mục, trường riêng, nhóm/thẻ, favorite/archive/trash, lịch sử, attachment, OTP | Domain tests; UI dùng chung domain; không tuyên bố đã E2E mọi loại mục |
| Luồng desktop | Danh sách/chi tiết, tìm kiếm, sửa, phím tắt, generator, ba bố cục và cửa sổ nhỏ | Electron E2E; 32 ảnh/màn hình ở 1320×860 và 760×580, không phát hiện tràn ngang hoặc lỗi renderer |
| Thư mục | Kéo đổi thứ tự, lồng nhau, đưa ra gốc; tự mở thư mục thu gọn; menu và phím tắt | Domain và Electron drag-and-drop E2E, giữ thứ tự sau khi khởi động lại, chặn chu trình |
| Clipboard | Helper AppKit, ownership bằng changeCount, timeout, clear khi khóa | Policy race regressions và Electron E2E với clipboard thật |
| Session | Mặc định khóa sau 3 phút rời app; giữ bản nháp trong thời gian chờ; xóa key/reference và unmount khi khóa | Deadline/async-race tests và Electron lifecycle E2E, kể cả khi hộp chọn file đang mở |
| Thiết lập | Lưu thời gian khóa, bố cục, mật độ danh sách và giảm chuyển động | Electron restart E2E và migration preferences |
| Backup | Tự động/thủ công, retention, thư mục ngoài, verify/preview/restore và recovery copy | Session/storage tests, external-folder retention, desktop E2E |
| Import/export | Vault mã hóa; JSON theo schema có preview; plaintext export cảnh báo/xác thực | Validation/domain tests, desktop export E2E |
| Ranh giới desktop | Sandbox, context isolation, CSP, IPC hạn chế, offline assets, một process mỗi profile | Electron security E2E và kiểm tra bundle |

## Chưa triển khai hoặc chưa được xác minh đủ

- Touch ID/device-bound key wrapping cho macOS và biometric trên web.
- KDBX export/chỉnh sửa KDBX tại chỗ; CSV mapping; hardware challenge-response; KDB 1.x; đồng bộ đám mây.
- Chứng nhận tương thích mọi plugin/property của KeePass. Dữ liệu không map trực tiếp được giữ lại thay vì âm thầm bỏ.
- Mở attachment lớn theo cơ chế lazy, benchmark hàng chục nghìn mục và kiểm thử hiệu năng trên nhiều cấu hình máy.
- Bản Intel được tạo bởi script khi chạy trên x64, nhưng chưa kiểm thử trên phần cứng Intel trong đợt này.
- Developer ID signing, notarization, auto-updater, audit độc lập, kiểm thử mất điện/disk-full thực và bảo vệ screenshot trên mọi công cụ macOS.
- E2E tương ứng trên thiết bị iOS/Android thật không thuộc kết quả desktop này.

## KDBX compatibility matrix

Mỗi fixture dưới đây đã chạy: KDBX → preview → vault nội bộ → encrypted save → reopen → edit → reopen. Nội dung fields/folders/tags/history/attachments và metadata được so sánh. Nguồn và SHA-256 nằm ở `fixtures/kdbx/provenance.json`; credentials là dữ liệu giả upstream.

| Fixture | Header thực tế | Cipher | KDF | Key file | Kết quả core |
| --- | --- | --- | --- | --- | --- |
| demo.kdbx | 3.1 | AES-256 | AES-KDF | demo.key | Qua; có history/custom fields/attachments |
| Argon2.kdbx | 4.0 | AES-256 | Argon2d v19 | demo.key | Qua |
| Argon2id.kdbx | 4.0 | AES-256 | Argon2id v19 | demo.key | Qua |
| Argon2ChaCha.kdbx | 4.0 | ChaCha20 | Argon2d v19 | demo.key | Qua |
| AesChaCha.kdbx | 3.1 | ChaCha20 | AES-KDF | demo.key | Qua |
| AesKdfKdbx4.kdbx | **3.1**, dù tên có “4” | AES-256 | AES-KDF | Không | Qua |
| KDBX4.1.kdbx | 4.1 | AES-256 | AES-KDF | Không | Qua; group tags/quality metadata |
| File kiểm thử người dùng | 4.0, KeePassXC | AES-256 | Argon2d v19, 64 MiB, 108 passes, 4 lanes | Không | Qua; 1 mục, 1 thư mục |

File riêng được kiểm tra không thay đổi byte nguồn; chỉ ghi số lượng vào kết quả. Giới hạn KDF cho phép chi phí gốc của file đó và không hạ tham số bảo mật để mở được. Các tổ hợp chưa có fixture, bao gồm KDBX 4.x ChaCha20 + Argon2id và XML key-file v2, chưa được đánh dấu tương thích dù thư viện có khả năng xử lý. Fixture KeyV2 hiện chỉ được lưu tham khảo, chưa nằm trong matrix đã xác minh.

## Migration compatibility matrix

| Format / crypto / schema | Cách xử lý | Kết quả |
| --- | --- | --- |
| 1 / 1 / 1 | Validate schema 1 → migrate in memory → schema 2 → verify file mới; backup nguyên bản trước lưu | Qua |
| 1 / 1 / 2 | Validate và mở trực tiếp | Qua |
| Version mới hơn reader | Từ chối trước khi ghi | Qua |
| Header/ciphertext sửa hoặc sai mật khẩu | Authentication/validation thất bại; không thay đổi file | Qua |

## Kết quả kiểm thử

| Kiểm tra | Trạng thái |
| --- | --- |
| Unit + integration + compatibility | 71 qua, 0 lỗi; 12 file test |
| Lint và TypeScript | Qua |
| Electron E2E với file KDBX riêng | 9 qua, 0 lỗi; bao gồm kéo thả thư mục, thời gian khóa, lưu thiết lập và mở lại process |
| Đóng gói và mở `.app` đã ký | Qua; chữ ký hợp lệ, chạy bằng hồ sơ kiểm thử riêng và hiển thị giao diện kho mới |
| Chữ ký, ASAR và fuses | Qua; Node/inspector CLI bị tắt, integrity được bật |
| Kiểm tra dữ liệu trong bundle | Qua; 36 asset code/HTML/JSON không chứa file riêng hoặc credential E2E |
| Expo dependency compatibility | `expo install --check`: tương thích |
| Dependency advisory scan | `bun audit --json` và `--production`: `{}` sau các bản vá |

Không ghi decrypted vault vào cache hoặc log. Các E2E dùng thư mục tạm riêng và xóa sau test; xuất JSON plaintext chỉ diễn ra với fixture giả ở đường dẫn được test chọn và được xóa khi kết thúc. Nhật ký Playwright không bật trace/video hoặc tự chụp màn hình của file riêng. Bản ảnh UI nếu có chỉ dùng credential giả.

Playwright kiểm thử runtime staging có cùng main/preload/web bundle; inspector cần cho Playwright được giữ ở Electron dùng để test. Bản `.app` cuối được kiểm tra riêng bằng native accessibility sau khi đóng các fuse inspector. Các mốc 179/180/181 giây được xác minh bằng đồng hồ renderer có điều khiển; sự kiện khóa màn hình/sleep được mô phỏng, không thay cho kiểm thử vật lý trên thiết bị. Các test tương tác chờ macOS xác nhận cửa sổ thực sự có focus. CI đã được cấu hình nhưng chưa chạy trên GitHub trong phiên này.

## Giới hạn nền tảng và quyết định bảo mật

Desktop chỉ chấp nhận IPC từ main frame của ứng dụng và chỉ cho file port truy cập đường dẫn vault/backup hợp lệ. File bên ngoài cần Finder dialog. Tên vault, recent metadata và vị trí backup không được coi là dữ liệu bí mật; nội dung mục và chỉ mục tìm kiếm nằm trong bộ nhớ hoặc file mã hóa.

Chuyển app, ẩn hoặc thu nhỏ cửa sổ bắt đầu thời gian chờ **3 phút**; có thể chỉnh tại Cài đặt → Bảo mật → Khoá sau khi rời ứng dụng. Quay lại sớm hủy thời hạn đó và giữ nguyên bản nháp. Thiết lập không thao tác là bộ đếm riêng, mặc định 5 phút. Hộp chọn file trong app không tự kích hoạt thời gian rời app; chuyển sang ứng dụng khác khi hộp đó mở vẫn bắt đầu bộ đếm. Khóa màn hình hoặc sleep khóa kho ngay. SessionBoundary loại bỏ giao diện chứa bí mật khi khóa thực sự. JavaScript không thể bảo đảm xóa sạch mọi bản sao string trong bộ nhớ; xem threat model.

Clipboard chỉ xóa khi ownership còn khớp. Ứng dụng khác vẫn có thể đọc hoặc lưu nội dung đã sao chép. ScreenCaptureKit có thể vượt qua Electron content protection; app không cam kết chống được mọi screenshot. Backup cũ giữ mật khẩu cũ. Rủi ro phần cứng, OS hoặc dependency bị xâm nhập cần được đánh giá trước phát hành thực tế.
