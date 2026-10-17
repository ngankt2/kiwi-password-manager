import type { Translations } from './locales';

export const privacy = {
  'Chính sách quyền riêng tư': ['Privacy Policy', 'Política de privacidad', 'Politique de confidentialité', '隐私政策'],
  'Liên hệ hỗ trợ': ['Contact support', 'Contactar con soporte', 'Contacter l’assistance', '联系支持'],
  'Cập nhật lần cuối: {date}': ['Last updated: {date}', 'Última actualización: {date}', 'Dernière mise à jour : {date}', '最后更新：{date}'],
  'Chính sách này giải thích cách Kiwi Password do AppKiro phát triển xử lý dữ liệu của bạn.': [
    'This policy explains how Kiwi Password, built by AppKiro, handles your data.',
    'Esta política explica cómo Kiwi Password, desarrollado por AppKiro, trata tus datos.',
    'Cette politique explique comment Kiwi Password, développé par AppKiro, traite vos données.',
    '本政策说明由 AppKiro 开发的 Kiwi Password 如何处理你的数据。',
  ],
  'Dữ liệu chúng tôi thu thập': ['Data we collect', 'Datos que recopilamos', 'Données que nous collectons', '我们收集的数据'],
  'AppKiro không thu thập, lưu trữ hay nhận bất kỳ dữ liệu nào bạn nhập vào ứng dụng. Ứng dụng không có tài khoản trực tuyến, không có phân tích sử dụng, quảng cáo hay theo dõi.': [
    'AppKiro does not collect, store or receive any data you enter in the app. The app has no online account, usage analytics, advertising or tracking.',
    'AppKiro no recopila, almacena ni recibe ningún dato que introduzcas en la aplicación. La aplicación no tiene cuenta en línea, análisis de uso, publicidad ni rastreo.',
    'AppKiro ne collecte, ne stocke et ne reçoit aucune donnée que vous saisissez dans l’application. L’application n’a ni compte en ligne, ni analyse d’utilisation, ni publicité, ni suivi.',
    'AppKiro 不会收集、存储或接收你在应用中输入的任何数据。应用没有在线账户，也没有使用分析、广告或跟踪。',
  ],
  'Dữ liệu trên thiết bị của bạn': ['Data on your device', 'Datos en tu dispositivo', 'Données sur votre appareil', '你设备上的数据'],
  'Kho mật khẩu được mã hoá bằng AES-256-GCM với khoá dẫn xuất từ mật khẩu chính bằng Argon2id và chỉ được lưu trên thiết bị của bạn. Mật khẩu chính không bao giờ được lưu lại hay gửi đi.': [
    'Your vault is encrypted with AES-256-GCM using a key derived from your master password with Argon2id, and it is stored only on your device. Your master password is never stored or sent anywhere.',
    'Tu bóveda se cifra con AES-256-GCM mediante una clave derivada de tu contraseña maestra con Argon2id y solo se guarda en tu dispositivo. Tu contraseña maestra nunca se guarda ni se envía.',
    'Votre coffre est chiffré avec AES-256-GCM à l’aide d’une clé dérivée de votre mot de passe principal avec Argon2id, et il n’est stocké que sur votre appareil. Votre mot de passe principal n’est jamais enregistré ni envoyé.',
    '保险库使用 AES-256-GCM 加密，密钥由主密码经 Argon2id 派生，并且只保存在你的设备上。主密码从不会被保存或发送。',
  ],
  'Tệp kho đã mã hoá có thể nằm trong bản sao lưu thiết bị nếu bạn bật tính năng sao lưu của hệ điều hành, ví dụ iCloud. Cài đặt ứng dụng như ngôn ngữ, giao diện và thời gian tự khoá được lưu cục bộ và không chứa mật khẩu.': [
    'Encrypted vault files may be included in device backups if you turn on your operating system’s backup, such as iCloud. App settings such as language, appearance and auto-lock times are stored locally and contain no passwords.',
    'Los archivos cifrados de la bóveda pueden incluirse en las copias de seguridad del dispositivo si activas la copia del sistema operativo, como iCloud. Los ajustes de la aplicación, como el idioma, la apariencia y el bloqueo automático, se guardan localmente y no contienen contraseñas.',
    'Les fichiers chiffrés du coffre peuvent être inclus dans les sauvegardes de l’appareil si vous activez la sauvegarde du système, comme iCloud. Les réglages de l’application, comme la langue, l’apparence et le verrouillage automatique, sont stockés localement et ne contiennent aucun mot de passe.',
    '如果你启用了操作系统的备份（例如 iCloud），加密的保险库文件可能会包含在设备备份中。语言、外观和自动锁定时间等应用设置保存在本地，不包含任何密码。',
  ],
  'Kết nối mạng': ['Network connections', 'Conexiones de red', 'Connexions réseau', '网络连接'],
  'Khi một mục có địa chỉ website, ứng dụng có thể tải biểu tượng hoặc favicon trực tiếp từ website đó. Website ấy có thể thấy địa chỉ IP của bạn giống như khi bạn truy cập bình thường. Mật khẩu và nội dung kho không bao giờ được gửi đi.': [
    'When an item has a website address, the app may download its icon or favicon directly from that website. The website can see your IP address, just as it would when you visit it. Passwords and vault contents are never sent.',
    'Cuando un elemento tiene una dirección web, la aplicación puede descargar su icono o favicon directamente desde ese sitio. El sitio puede ver tu dirección IP, igual que cuando lo visitas. Las contraseñas y el contenido de la bóveda nunca se envían.',
    'Lorsqu’un élément possède une adresse web, l’application peut télécharger son icône ou son favicon directement depuis ce site. Le site peut voir votre adresse IP, comme lors d’une visite normale. Les mots de passe et le contenu du coffre ne sont jamais envoyés.',
    '当条目带有网站地址时，应用可能会直接从该网站下载图标或网站图标。该网站可以看到你的 IP 地址，就像你正常访问时一样。密码和保险库内容从不会被发送。',
  ],
  'Ứng dụng máy tính kiểm tra bản cập nhật từ GitHub. Bản web tải biểu tượng qua máy chủ đang chạy trang web để vượt giới hạn trình duyệt; máy chủ đó chỉ nhận địa chỉ website cần tải biểu tượng.': [
    'The desktop app checks GitHub for updates. The web version downloads icons through the server hosting the page to work around browser limits; that server only receives the website address of the icon.',
    'La aplicación de escritorio busca actualizaciones en GitHub. La versión web descarga los iconos a través del servidor que aloja la página para sortear los límites del navegador; ese servidor solo recibe la dirección del sitio del icono.',
    'L’application de bureau vérifie les mises à jour sur GitHub. La version web télécharge les icônes via le serveur qui héberge la page afin de contourner les limites du navigateur ; ce serveur ne reçoit que l’adresse du site de l’icône.',
    '桌面应用会从 GitHub 检查更新。网页版通过托管页面的服务器下载图标以绕过浏览器限制；该服务器只会收到图标所属网站的地址。',
  ],
  'Xuất và chia sẻ': ['Export and sharing', 'Exportar y compartir', 'Exportation et partage', '导出与分享'],
  'Dữ liệu chỉ rời khỏi thiết bị khi bạn chủ động xuất hoặc chia sẻ tệp. Tệp .akpr luôn được mã hoá. Tệp JSON xuất ra ở dạng văn bản thường, nên hãy bảo vệ và xoá nó khi không còn cần.': [
    'Data leaves your device only when you choose to export or share a file. .akpr files are always encrypted. JSON exports are plain text, so protect them and delete them when you no longer need them.',
    'Los datos solo salen de tu dispositivo cuando decides exportar o compartir un archivo. Los archivos .akpr siempre están cifrados. Las exportaciones JSON son texto sin cifrar, así que protégelas y elimínalas cuando ya no las necesites.',
    'Les données ne quittent votre appareil que lorsque vous choisissez d’exporter ou de partager un fichier. Les fichiers .akpr sont toujours chiffrés. Les exports JSON sont en texte clair : protégez-les et supprimez-les lorsque vous n’en avez plus besoin.',
    '只有在你主动导出或分享文件时，数据才会离开设备。.akpr 文件始终是加密的。JSON 导出为明文，请妥善保护，并在不再需要时删除。',
  ],
  'Sinh trắc học': ['Biometrics', 'Biometría', 'Biométrie', '生物识别'],
  'Face ID, Touch ID và các phương thức sinh trắc học khác chỉ được dùng để mở khoá nhanh thông qua hệ điều hành. Ứng dụng không bao giờ nhận được dữ liệu sinh trắc học của bạn.': [
    'Face ID, Touch ID and other biometric methods are used only for quick unlock through the operating system. The app never receives your biometric data.',
    'Face ID, Touch ID y otros métodos biométricos solo se usan para el desbloqueo rápido a través del sistema operativo. La aplicación nunca recibe tus datos biométricos.',
    'Face ID, Touch ID et les autres méthodes biométriques servent uniquement au déverrouillage rapide via le système d’exploitation. L’application ne reçoit jamais vos données biométriques.',
    '面容 ID、触控 ID 和其他生物识别方式仅通过操作系统用于快速解锁。应用永远不会收到你的生物识别数据。',
  ],
  'Xoá dữ liệu': ['Deleting your data', 'Eliminar tus datos', 'Supprimer vos données', '删除数据'],
  'Bạn có thể xoá một kho trong phần cài đặt của kho, hoặc gỡ ứng dụng để xoá toàn bộ dữ liệu cục bộ. Vì chúng tôi không lưu dữ liệu của bạn, chúng tôi không thể khôi phục kho hay mật khẩu chính.': [
    'You can delete a vault in its vault settings, or uninstall the app to remove all local data. Because we do not store your data, we cannot recover your vault or master password.',
    'Puedes eliminar una bóveda desde sus ajustes o desinstalar la aplicación para borrar todos los datos locales. Como no guardamos tus datos, no podemos recuperar tu bóveda ni tu contraseña maestra.',
    'Vous pouvez supprimer un coffre depuis ses réglages, ou désinstaller l’application pour effacer toutes les données locales. Comme nous ne stockons pas vos données, nous ne pouvons pas récupérer votre coffre ni votre mot de passe principal.',
    '你可以在保险库设置中删除保险库，或卸载应用以清除所有本地数据。由于我们不保存你的数据，因此无法恢复你的保险库或主密码。',
  ],
  'Thay đổi và liên hệ': ['Changes and contact', 'Cambios y contacto', 'Modifications et contact', '变更与联系'],
  'Khi chính sách thay đổi, chúng tôi sẽ cập nhật ngày ở đầu trang này. Nếu bạn có câu hỏi về quyền riêng tư, hãy liên hệ AppKiro qua trang hỗ trợ.': [
    'When this policy changes, we will update the date at the top of this page. If you have a privacy question, contact AppKiro through the support page.',
    'Cuando esta política cambie, actualizaremos la fecha al principio de esta página. Si tienes alguna pregunta sobre privacidad, contacta con AppKiro desde la página de soporte.',
    'Lorsque cette politique change, nous mettons à jour la date en haut de cette page. Pour toute question sur la confidentialité, contactez AppKiro via la page d’assistance.',
    '本政策变更时，我们会更新本页顶部的日期。如有隐私方面的问题，请通过支持页面联系 AppKiro。',
  ],
} as const satisfies Record<string, Translations>;
