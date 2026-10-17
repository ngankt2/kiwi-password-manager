import type { Translations } from './locales';

export const about = {
  'Giới thiệu': ['About', 'Acerca de', 'À propos', '关于'],
  'Mật khẩu của bạn, an toàn trên thiết bị.': ['Your passwords, safe on your device.', 'Tus contraseñas, seguras en tu dispositivo.', 'Vos mots de passe, en sécurité sur votre appareil.', '你的密码，安全地保存在设备上。'],
  'Một nơi an toàn cho mật khẩu, ghi chú bảo mật, thẻ thanh toán, khoá SSH, API key và biến môi trường. Kho được mã hoá bằng AES-256-GCM và Argon2id, chỉ lưu trên thiết bị của bạn, không cần tài khoản và không theo dõi.': [
    'One safe place for passwords, secure notes, payment cards, SSH keys, API keys and environment variables. Your vault is encrypted with AES-256-GCM and Argon2id and stays on your device, with no account and no tracking.',
    'Un lugar seguro para contraseñas, notas seguras, tarjetas de pago, claves SSH, claves de API y variables de entorno. Tu bóveda se cifra con AES-256-GCM y Argon2id y permanece en tu dispositivo, sin cuenta y sin rastreo.',
    'Un endroit sûr pour vos mots de passe, notes sécurisées, cartes de paiement, clés SSH, clés d’API et variables d’environnement. Votre coffre est chiffré avec AES-256-GCM et Argon2id et reste sur votre appareil, sans compte ni suivi.',
    '集中安全保存密码、安全笔记、支付卡、SSH 密钥、API 密钥和环境变量。保险库使用 AES-256-GCM 和 Argon2id 加密，仅保存在你的设备上，无需账户，也没有跟踪。',
  ],
  'Nhật ký phát hành': ['Release log', 'Historial de versiones', 'Journal des versions', '版本日志'],
  'Theo dõi tính năng mới, cải tiến và cập nhật qua từng phiên bản.': ['Track new features, improvements and updates across versions.', 'Consulta las novedades, mejoras y actualizaciones de cada versión.', 'Suivez les nouveautés, améliorations et mises à jour de chaque version.', '查看各版本的新功能、改进和更新。'],
  'Mới nhất': ['Latest', 'Más reciente', 'Dernière', '最新'],
  'Phát triển bởi {name}': ['Built by {name}', 'Desarrollado por {name}', 'Développé par {name}', '由 {name} 开发'],
  'Giao diện mới theo phong cách macOS: thanh bên nổi dạng kính, danh sách gọn hơn và trang chi tiết với các trường được nhóm rõ ràng.': [
    'A new macOS-style design: a floating glass sidebar, a cleaner item list and a detail view with clearly grouped fields.',
    'Un nuevo diseño al estilo de macOS: barra lateral flotante de cristal, una lista más limpia y una vista de detalle con campos agrupados.',
    'Un nouveau design dans le style de macOS : barre latérale flottante en verre, liste plus épurée et vue détaillée aux champs regroupés.',
    '全新的 macOS 风格设计：悬浮玻璃侧边栏、更简洁的列表，以及字段分组清晰的详情视图。',
  ],
  'Hộp thoại, menu, thông báo và màn hình mở khoá được làm mới theo Apple Human Interface Guidelines, ở cả chế độ Sáng và Tối.': [
    'Dialogs, menus, notifications and the unlock screen follow the Apple Human Interface Guidelines in both Light and Dark appearance.',
    'Los diálogos, menús, notificaciones y la pantalla de desbloqueo siguen las Apple Human Interface Guidelines en modo claro y oscuro.',
    'Les boîtes de dialogue, menus, notifications et l’écran de déverrouillage suivent les Apple Human Interface Guidelines, en mode clair comme sombre.',
    '对话框、菜单、通知和解锁界面在浅色与深色外观下均遵循 Apple 人机界面指南。',
  ],
  'Ứng dụng di động dùng màu và phông chữ hệ thống của iOS.': ['The mobile app uses iOS system colors and fonts.', 'La aplicación móvil usa los colores y fuentes del sistema iOS.', 'L’application mobile utilise les couleurs et polices système d’iOS.', '移动应用采用 iOS 系统颜色和字体。'],
  'Thêm trang Giới thiệu với nhật ký phát hành.': ['A new About page with the release log.', 'Nueva página Acerca de con el historial de versiones.', 'Nouvelle page À propos avec le journal des versions.', '新增包含版本日志的“关于”页面。'],
} as const satisfies Record<string, Translations>;
