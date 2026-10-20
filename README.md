# Kiwi Password — Offline Password Manager for Mac

**Kiwi Password is an offline password manager for macOS that stores your passwords in an encrypted vault on your own device — no account, no cloud sync, no tracking.** It is built by [AppKiro](https://appkiro.com), encrypts every vault with AES-256-GCM and an Argon2id-derived key, unlocks with Touch ID, and imports KeePass (`.kdbx`) databases.

[**⬇ Download the latest version for Mac (.dmg)**](https://github.com/ngankt2/kiwi-password-manager/releases/latest) · [Release notes](https://github.com/ngankt2/kiwi-password-manager/releases) · [AppKiro](https://appkiro.com) · [Tiếng Việt](#tiếng-việt)

> This repository distributes signed macOS builds and in-app updates of Kiwi Password. It does not contain source code.

## At a glance

| | |
| --- | --- |
| **What it is** | A local-first password manager and authenticator for Mac |
| **Platform** | macOS 13 Ventura or later — separate builds for Apple Silicon and Intel Macs |
| **Code signing** | Signed with an Apple Developer ID and notarized by Apple |
| **Where data lives** | Only on your device, in encrypted `.akpr` vault files |
| **Encryption** | AES-256-GCM; key derived from your master password with Argon2id (64 MiB memory) |
| **Unlock** | Master password (12+ characters) or Touch ID |
| **Account required** | No — no sign-up, no email, no cloud |
| **Analytics / ads** | None |
| **Import** | KeePass `.kdbx`, Kiwi `.akpr` |
| **Languages** | English, Tiếng Việt, Español, Français, 简体中文 |
| **Updates** | Automatic in-app updates, signature-verified before installation |
| **Developer** | [AppKiro](https://appkiro.com) |

## Features

- **Offline encrypted vault** — passwords, logins, secure notes, custom fields and attachments are stored in one encrypted file on your Mac. Nothing is uploaded.
- **Touch ID unlock** — the vault key is sealed by the Mac's Secure Enclave; changing your fingerprints invalidates it automatically.
- **Built-in authenticator (TOTP)** — keep two-factor codes next to the login they protect.
- **KeePass import** — open a `.kdbx` database, preview it, and keep groups, custom fields, history, attachments, tags and OTP settings. The original file is never modified.
- **Secure attachments** — attach files such as `.env`, SSH keys or certificates (up to 8 MB), preview text files in the app, and download them when needed.
- **Version history** — every entry keeps its previous versions, and every save is verified before the previous copy is replaced.
- **Encrypted backups** — automatic and manual backups, plus copies in folders you choose, all encrypted.
- **Auto-lock** — the vault locks when you leave the app, after inactivity, when the screen locks or when the Mac sleeps.
- **Fast keyboard workflow** — `⌘K` search, `⌘N` new item, `⌘E` edit, `⌘S` save, `⌘L` lock.
- **Clipboard protection** — copied passwords are cleared automatically, and secrets are masked until you reveal them.

## Install on Mac

1. Check your Mac's chip: Apple menu  → **About This Mac**. A **Chip** line such as "Apple M1" means Apple Silicon; a **Processor** line with "Intel" means an Intel Mac.
2. From the [latest release](https://github.com/ngankt2/kiwi-password-manager/releases/latest), download the matching installer:
   - **Apple Silicon (M1, M2, M3, M4…):** `KiwiPassword_<version>_apple-silicon.dmg`
   - **Intel:** `KiwiPassword_<version>_intel.dmg`
3. Open the `.dmg` and drag **Kiwi Password** into **Applications**, then open it.

The app and installers are signed with an Apple Developer ID and notarized by Apple, so macOS opens them without security warnings.

After that, Kiwi Password checks for new versions on its own. When an update is available it shows the version and what changed, and installs only when you click **Download and install**. Every update is verified with the app's Minisign key before it is installed.

## FAQ

### What is Kiwi Password?
Kiwi Password is an offline password manager for Mac made by AppKiro. It keeps passwords, two-factor codes, notes and files in an encrypted vault stored only on your device.

### Is Kiwi Password free?
Yes. The macOS app can be downloaded from this page at no cost, with no account or subscription.

### Does Kiwi Password work without the internet?
Yes. Creating, opening, searching and editing your vault works fully offline. The app only goes online to check for updates and, optionally, to download website icons for your entries. Passwords and vault contents are never sent.

### Where are my passwords stored?
In an encrypted `.akpr` vault file on your Mac. AppKiro has no servers that hold your data, so it cannot see, reset or recover your vault.

### How does Kiwi Password encrypt my data?
Each vault is encrypted with AES-256-GCM. The key is derived from your master password with Argon2id (64 MiB of memory, at least three passes, a fresh salt per vault). Your master password is never stored.

### Can I import from KeePass?
Yes. Open a KeePass `.kdbx` file, preview the data, and import it into a new Kiwi vault. Groups, custom fields, history, attachments, tags and OTP settings are preserved, and the source file stays unchanged.

### Does it support Touch ID?
Yes. Turn on Touch ID in **Settings → Sign-in & unlock**. The master password is still required to enable it and after a password change.

### Does it work on Intel Macs?
Yes. Kiwi Password has a separate build for Intel Macs and for Apple Silicon (M-series) Macs, both for macOS 13 or later. Download `intel.dmg` for an Intel Mac and `apple-silicon.dmg` for an M-series Mac; in-app updates always install the build for your Mac.

### Is Kiwi Password safe to install?
The app and its installers are signed with AppKiro's Apple Developer ID and notarized by Apple, which scans them for malware before macOS allows them to open. Every in-app update is additionally verified with the app's own Minisign signature before installation.

### What happens if I forget my master password?
The vault cannot be recovered. Because encryption happens only on your device, there is no reset link. Keep your master password and an encrypted backup somewhere safe.

### Has Kiwi Password been security audited?
Not yet. Kiwi Password has not undergone an independent security audit.

---

## Tiếng Việt

**Kiwi Password là trình quản lý mật khẩu ngoại tuyến cho Mac, lưu mật khẩu trong kho mã hoá ngay trên máy của bạn — không cần tài khoản, không đồng bộ đám mây, không theo dõi.** Ứng dụng do [AppKiro](https://appkiro.com) phát triển, mã hoá kho bằng AES-256-GCM với khoá dẫn xuất từ mật khẩu chính qua Argon2id, mở khoá bằng Touch ID và nhập được cơ sở dữ liệu KeePass (`.kdbx`).

[**⬇ Tải Kiwi Password cho Mac (.dmg)**](https://github.com/ngankt2/kiwi-password-manager/releases/latest)

**Tính năng chính**
- Kho mật khẩu mã hoá lưu hoàn toàn trên máy, không tải dữ liệu lên đâu cả.
- Mở khoá bằng Touch ID, khoá được bảo vệ bởi Secure Enclave của Mac.
- Mã xác thực hai lớp (TOTP) ngay trong ứng dụng.
- Nhập dữ liệu từ KeePass, giữ nguyên thư mục, trường tuỳ chỉnh, lịch sử, tệp đính kèm và OTP.
- Đính kèm tệp như `.env`, SSH key, chứng chỉ (tối đa 8 MB), xem trực tiếp tệp văn bản.
- Lịch sử phiên bản cho từng mục, sao lưu mã hoá tự động và thủ công.
- Tự khoá khi rời ứng dụng, khi máy khoá màn hình hoặc ngủ; tự xoá mật khẩu đã sao chép.
- Hỗ trợ tiếng Việt, tiếng Anh, tiếng Tây Ban Nha, tiếng Pháp và tiếng Trung giản thể.
- Chạy trên macOS 13 trở lên, có bản riêng cho Mac chip Apple và Mac Intel.
- Được ký bằng Apple Developer ID và đã qua kiểm tra (notarize) của Apple.

**Cài đặt**
1. Xem loại chip của máy: menu Apple  → **About This Mac** (Giới thiệu về máy Mac này). Dòng **Chip** ghi "Apple M…" là Mac chip Apple; dòng **Processor** ghi "Intel" là Mac Intel.
2. Ở [bản phát hành mới nhất](https://github.com/ngankt2/kiwi-password-manager/releases/latest), tải đúng bộ cài:
   - **Mac chip Apple (M1, M2, M3, M4…):** `KiwiPassword_<version>_apple-silicon.dmg`
   - **Mac Intel:** `KiwiPassword_<version>_intel.dmg`
3. Mở tệp `.dmg`, kéo **Kiwi Password** vào thư mục **Applications** rồi mở ứng dụng.

Ứng dụng và bộ cài đã được ký bằng Apple Developer ID và notarize bởi Apple, nên macOS mở được ngay mà không cảnh báo.

Sau đó ứng dụng tự kiểm tra bản mới, hiển thị nội dung thay đổi và chỉ cài khi bạn bấm **Tải và cài đặt**. Mọi bản cập nhật đều được xác minh chữ ký trước khi cài.

**Câu hỏi thường gặp**

**Kiwi Password có miễn phí không?** Có. Ứng dụng macOS được tải miễn phí tại đây, không cần tài khoản hay gói thuê bao.

**Không có mạng có dùng được không?** Có. Mọi thao tác với kho đều chạy ngoại tuyến. Ứng dụng chỉ kết nối mạng để kiểm tra cập nhật và tải biểu tượng website nếu bạn dùng.

**Máy Mac Intel có dùng được không?** Có. Tải bộ cài `intel.dmg` cho Mac Intel và `apple-silicon.dmg` cho Mac chip Apple. Khi cập nhật trong ứng dụng, máy luôn nhận đúng bản của mình.

**Quên mật khẩu chính thì sao?** Không thể khôi phục kho. Dữ liệu chỉ được mã hoá trên máy bạn nên không có cách đặt lại mật khẩu. Hãy giữ mật khẩu chính và bản sao lưu mã hoá ở nơi an toàn.

---

Kiwi Password is made by [AppKiro](https://appkiro.com). Privacy questions: [appkiro.com/contact](https://appkiro.com/contact).

<!-- Keywords: offline password manager for Mac, local password manager macOS, KeePass alternative for Mac, password manager without cloud, Touch ID password manager, notarized password manager for Mac, password manager for Intel Mac, password manager for Apple Silicon, TOTP authenticator Mac, encrypted password vault, trình quản lý mật khẩu, quản lý mật khẩu offline cho Mac -->
