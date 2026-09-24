import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

public class KiroSecurityModule: Module {
  private var ownedToken: String?
  private var ownedChangeCount: Int = -1
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("KiroSecurity")
    Events("deviceLocked")

    OnCreate {
      self.observer = NotificationCenter.default.addObserver(
        forName: UIApplication.protectedDataWillBecomeUnavailableNotification,
        object: nil, queue: .main
      ) { [weak self] _ in self?.sendEvent("deviceLocked", [:]) }
    }
    OnDestroy {
      if let observer = self.observer { NotificationCenter.default.removeObserver(observer) }
    }

    AsyncFunction("copy") { (content: String, seconds: Double) -> String in
      let token = UUID().uuidString
      var options: [UIPasteboard.OptionsKey: Any] = [.localOnly: true]
      if seconds > 0 { options[.expirationDate] = Date().addingTimeInterval(seconds) }
      let pasteboard = UIPasteboard.general
      pasteboard.setItems([[UTType.utf8PlainText.identifier: content]], options: options)
      self.ownedToken = token
      self.ownedChangeCount = pasteboard.changeCount
      return token
    }.runOnQueue(.main)

    AsyncFunction("clearIfOwned") { (token: String) -> Bool in
      let pasteboard = UIPasteboard.general
      guard self.ownedToken == token, pasteboard.changeCount == self.ownedChangeCount else { return false }
      pasteboard.items = []
      self.ownedToken = nil
      self.ownedChangeCount = -1
      return true
    }.runOnQueue(.main)

    AsyncFunction("isDeviceLocked") { () -> Bool in
      return !UIApplication.shared.isProtectedDataAvailable
    }.runOnQueue(.main)
  }
}
