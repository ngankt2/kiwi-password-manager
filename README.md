# Kiro Password Manager

Ứng dụng quản lý mật khẩu local-first. Dữ liệu được xuất thành file `.akpr` mã hóa, không có tài khoản trực tuyến, đồng bộ đám mây hay telemetry. Desktop chạy bằng **Tauri v2**, dùng giao diện Expo Web, core TypeScript và Expo Router. Expo iOS/Android giữ runtime và adapter riêng. Dữ liệu kho ở trên thiết bị; kết nối mạng được dùng để kiểm tra cập nhật và tải ảnh icon/favicon khi tạo hoặc sửa mục.

## Chạy desktop trên macOS

Yêu cầu macOS 13 trở lên, Bun 1.4.2, Node 24, Rust stable và Xcode Command Line Tools để biên dịch host Rust và helper clipboard Swift. Lệnh dưới đây không build iOS hoặc Android.

```sh
bun install --frozen-lockfile
bun run desktop:prepare
bun run desktop:start
```

Đóng gói ứng dụng theo kiến trúc máy hiện tại:

```sh
bun run build:macos
```

File `.app`, gói cập nhật `.app.tar.gz`, chữ ký và `latest.json` nằm trong `desktop-release/tauri-<version>/`. Build mặc định cần khóa ký cập nhật riêng của ứng dụng; xem [hướng dẫn cập nhật](docs/AUTOUPDATE.md). Dùng `bun run build:macos --no-updater` để đóng gói cục bộ khi chưa cấu hình khóa. App hiện ký ad-hoc; chữ ký cập nhật không thay thế Developer ID/notarization của Apple.

Mỗi lần build ứng dụng (kể cả `desktop:prepare` hoặc build lại) tự tăng phiên bản patch, đồng bộ `package.json`, `app.json`, manifest/lockfile Rust và tăng số bản dựng iOS/Android trước khi xuất ứng dụng. Giữ lại phiên bản mới sau cả lần build thất bại. Dùng các lệnh build trong `package.json`; không gọi trực tiếp Expo export/run hoặc EAS build để tránh bỏ qua quy tắc này. Các bước biên dịch worker, kiểm thử và chạy máy chủ phát triển không tăng phiên bản.

Build web bằng `bun run build:web`, xem bản xuất bằng `bun run preview:web`. Web dùng Expo server output (`dist/client` và `dist/server`) để phục vụ API cùng origin `/api/icon`, tải ảnh từ các website không cho phép CORS. Triển khai cả client và server bằng adapter Expo Server; chỉ host file tĩnh sẽ không tải được ảnh từ URL. Desktop vẫn xuất tĩnh qua wrapper và tải icon bằng native host. Build native trên EAS bằng `bun run build:ios --profile production` hoặc `bun run build:android --profile production`; EAS dùng phiên bản local đã được tăng sẵn.

Logo gốc nằm trong `assets/branding/appkiro-original.png`. Bộ nhận diện trong app dùng phần biểu tượng để rõ ở kích thước nhỏ. App icon dùng ảnh riêng có nền gradient tại `assets/branding/appkiro-app-icon-original.png`. Có thể tạo lại PNG nền trong suốt, favicon, splash và icon các nền tảng bằng `python3 scripts/prepare-branding.py` (cần Pillow).

## Kiểm thử

```sh
bun run verify
bun run desktop:prepare --runtime-tests
bun run test:desktop:host
bun run test:desktop:native
bunx playwright install webkit
bun run test:desktop
bun audit
```

Kiểm thử native mở Tauri/WKWebView thật với thư mục dữ liệu tạm: mở file cũ, lưu, tạo kho, khởi động lại, clipboard hệ điều hành, ranh giới IPC và thao tác cửa sổ. Kiểm thử Rust kiểm tra filesystem, xung đột, quyền truy cập, backup và bộ cài cập nhật có chữ ký. Chạy hai nhóm này tuần tự vì cùng kiểm tra clipboard.

Bộ `test:desktop` dùng Playwright WebKit và bridge giả dành riêng cho UI: form sửa, icon, tìm kiếm, kéo thả, ba bố cục, TOTP, sao lưu/khôi phục, đổi mật khẩu, xuất JSON, thông báo cập nhật và bảo vệ bản nháp. Đây không phải kiểm thử native Tauri; macOS chưa có Tauri WebDriver chính thức. Ảnh và báo cáo chỉ dùng dữ liệu giả.

File KeePass riêng chỉ được kiểm thử khi cung cấp đường dẫn và mật khẩu qua môi trường. Không lưu mật khẩu vào source hoặc `.env`:

```sh
read -r -s KIRO_TEST_PASSWORD
export KIRO_TEST_PASSWORD
bun run test:kdbx:local '/absolute/path/to/test.kdbx'
KIRO_TEST_KDBX='/absolute/path/to/test.kdbx' bun run test:desktop
unset KIRO_TEST_PASSWORD
```

Kiểm thử file riêng chỉ báo số lượng và trạng thái. Không ghi nội dung mục hoặc mật khẩu vào báo cáo. Source KDBX được giữ nguyên; kết quả chuyển đổi dùng cho kiểm thử được xóa sau khi chạy. File `tests/Passwords*.kdbx` bị loại khỏi Git và không đi vào bundle ứng dụng.

## Dữ liệu và các thao tác chính

- Tạo vault với mật khẩu chính ít nhất 12 ký tự; mở `.akpr`, các file `.vault` cũ hoặc nhập `.kdbx` qua Finder. Mật khẩu của KDBX nguồn không bị áp dụng quy tắc tạo mật khẩu mới.
- Xem trước dữ liệu nhập rồi tạo vault mới. Giữ nhóm, trường riêng, history, attachment, timestamps, tags và cấu hình OTP; dữ liệu KeePass không biểu diễn trực tiếp được giữ trong metadata và bản nguồn đã mã hóa.
- Tìm kiếm bằng `⌘K`, thêm bằng `⌘N`, sửa bằng `⌘E`, lưu bằng `⌘S`, khóa bằng `⌘L`. Mật khẩu mặc định bị che và tự ẩn sau khi hiện.
- Sidebar có các badge thẻ kèm số mục đang hoạt động. Bấm thẻ để lọc chính xác, bấm lại hoặc chọn bỏ lọc để về tất cả mục; hỗ trợ cả thanh bên đầy đủ và bố cục thu gọn.
- Phần biểu tượng và màu cho phép chọn bộ logo thương hiệu và ngân hàng có sẵn hoặc tải ảnh từ URL HTTPS. Website của mục được dùng để lấy favicon tự động nếu chưa có ảnh hay lựa chọn icon thủ công. Chỉ origin của website được gửi khi lấy favicon; đường dẫn, query và thông tin đăng nhập bị bỏ. Ảnh được lưu trong metadata mã hóa, đi cùng lịch sử và backup; không tải lại khi xem/mở kho hoặc đổi website. Chọn ảnh/icon mới mới thay ảnh cũ. PNG, JPEG, WebP, GIF, SVG và ICO được hỗ trợ, tối đa 512 KB; bitmap tối đa 1024 × 1024 px. Logo có sẵn dùng được offline.
- Khi chuyển sang app khác, ẩn hoặc thu nhỏ cửa sổ, kho mặc định chỉ khóa sau **3 phút**. Quay lại trước thời hạn sẽ giữ nguyên màn hình và bản nháp. Chỉnh thời gian ở **Cài đặt → Bảo mật → Khoá sau khi rời ứng dụng**; thời gian không thao tác là một thiết lập riêng. Khóa màn hình hoặc cho Mac ngủ vẫn khóa kho ngay.
- Kéo thư mục lên/xuống để đổi thứ tự; thả vào giữa thư mục khác để lồng bên trong. Vùng **Thả vào đây để đưa ra kho gốc** xuất hiện khi kéo. Giữ trên thư mục đang thu gọn để tự mở nó. Có thể dùng menu `…` hoặc `⌥↑`, `⌥↓`, `⌥←` để di chuyển.
- Bố cục, mật độ danh sách và tùy chọn giảm chuyển động được lưu sau khi đóng app. Cửa sổ nhỏ giữ thanh bên và hiển thị danh sách hoặc chi tiết để nội dung dễ đọc.
- Settings dẫn tới sao lưu/khôi phục, xuất dữ liệu và quản lý vault. Xuất `.akpr` là lựa chọn mặc định; các bản sao lưu xuất ra và bản sao trong thư mục ngoài cũng dùng đuôi này. JSON không mã hóa cần cảnh báo và nhập lại mật khẩu.
- **Cài đặt → Đăng nhập & mở khoá** cho phép bật Passkey trên trình duyệt hỗ trợ WebAuthn PRF, hoặc Face ID/Touch ID/sinh trắc học trên ứng dụng iOS/Android phù hợp. Xác nhận mật khẩu chính trước khi bật hoặc tắt. Passkey có thể dùng Face ID, Touch ID, Windows Hello hoặc khoá bảo mật theo trình duyệt và thiết bị; không phải mọi Passkey đều hỗ trợ giải mã kho. Cách mở khoá nhanh chỉ áp dụng cho kho trên thiết bị/trình duyệt đã thiết lập; cần thiết lập lại sau khi đổi mật khẩu chính. Bản Tauri dùng giao thức nội bộ vẫn chưa hỗ trợ Passkey/Touch ID trực tiếp.
- Mỗi lần lưu tạo generation mã hóa mới, đọc kiểm chứng rồi mới công nhận. Luôn giữ generation trước đó; backup tự động, backup thủ công và bản trước migration/restore/đổi mật khẩu được quản lý riêng.

Desktop giữ nguyên `~/Library/Application Support/Kiro Vault`: `encrypted-files/`, `preferences.json` và các liên kết/thiết lập backup cũ được đọc tại chỗ. Không sao chép, đổi định dạng hay xóa dữ liệu khi đổi runtime. Kho `.akpr`/`.vault` được chọn bên ngoài tiếp tục lưu về file đó, kiểm tra revision trước khi ghi; KDBX nguồn luôn chỉ đọc. Có thể đổi vị trí kho và chọn thêm thư mục backup bên ngoài trong Settings.

Vault và backup chứa dữ liệu mã hóa. Preferences và tên vault gần đây là metadata không mã hóa; tên mục, password và chỉ mục tìm kiếm không được ghi plaintext. Đổi mật khẩu chính không đổi mật khẩu của các backup đã tồn tại.

## Tài liệu và trạng thái

- [Audit và kết quả migration desktop](docs/DESKTOP-MIGRATION.md)
- [Cập nhật ứng dụng và ký bản phát hành](docs/AUTOUPDATE.md)
- [Kiến trúc](docs/ARCHITECTURE.md)
- [Định dạng vault và quy tắc tương thích](docs/VAULT-FORMAT.md)
- [Threat model và giới hạn bảo vệ](docs/THREAT-MODEL.md)
- [Lựa chọn thư viện và bản vá](docs/DEPENDENCIES.md)
- [Báo cáo kiểm thử, tính năng và compatibility matrix](docs/RELEASE-REPORT.md)

Touch ID trên macOS, KDBX export, CSV mapping và cloud sync chưa được cung cấp. Mobile có adapter nền tảng nhưng không thuộc bản build desktop này. Đây là bản chạy được để kiểm thử; chưa phải tuyên bố đã audit bảo mật hoặc sẵn sàng phân phối production.
