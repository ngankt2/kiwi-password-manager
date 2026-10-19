import AppKit
import CryptoKit
import CryptoTokenKit
import Foundation
import LocalAuthentication

// The desktop host observes macOS lock/sleep and application activation through
// a separate, fixed-argument process. Clipboard requests below retain their ABI.
if CommandLine.arguments.dropFirst().first == "--watch" {
    let parent = getppid()
    func emit(_ event: String) { FileHandle.standardOutput.write(Data((event + "\n").utf8)) }
    let workspace = NSWorkspace.shared.notificationCenter
    let distributed = DistributedNotificationCenter.default()
    var observers: [NSObjectProtocol] = []
    for name in ["com.apple.screenIsLocked"] {
        observers.append(distributed.addObserver(forName: NSNotification.Name(name), object: nil, queue: .main) { _ in emit("deviceLocked") })
    }
    observers.append(distributed.addObserver(forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main) { _ in emit("deviceUnlocked") })
    observers.append(workspace.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { _ in emit("deviceLocked") })
    observers.append(workspace.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { _ in emit("deviceUnlocked") })
    observers.append(workspace.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { notification in
        if let active = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication { emit(active.processIdentifier == parent ? "foreground" : "background") }
    })
    emit(NSWorkspace.shared.frontmostApplication?.processIdentifier == parent ? "foreground" : "background")
    let timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in if getppid() != parent { exit(0) } }
    RunLoop.main.add(timer, forMode: .common)
    RunLoop.main.run()
    exit(0)
}

struct BiometricRecord: Codable { let version: Int; let enclaveKey: String; let ephemeral: String; let sealed: String }
struct Request: Decodable {
    let action: String; let value: String?; let token: Int?
    let id: String?; let binding: String?; let key: String?; let reason: String?; let record: BiometricRecord?
}
struct Reply: Encodable {
    var token: Int?; var cleared: Bool?; var error: String?
    var available: Bool?; var reason: String?; var method: String?; var record: BiometricRecord?; var key: String?
}

// Touch ID quick unlock. The vault key is sealed with AES-GCM under a key agreed between a
// Secure Enclave key that requires the current biometric set and a one-time ephemeral key.
// Recovering it needs that Secure Enclave key, so every unlock asks for Touch ID on this Mac,
// and enrolling or removing a fingerprint invalidates the record.
enum Biometrics {
    static let salt = Data("kiwi-password.touch-id.v1".utf8)
    static func context(_ id: String, _ binding: String) -> Data { Data("\(id)\u{0}\(binding)".utf8) }
    static func wrappingKey(_ secret: SharedSecret, _ info: Data) -> SymmetricKey {
        secret.hkdfDerivedSymmetricKey(using: SHA256.self, salt: salt, sharedInfo: info, outputByteCount: 32)
    }
    static func support(_ reply: inout Reply) {
        let context = LAContext()
        var failure: NSError?
        let ready = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &failure)
        reply.method = context.biometryType == .faceID ? "faceId" : context.biometryType == .touchID ? "touchId" : "biometric"
        reply.available = ready && SecureEnclave.isAvailable
        if reply.available != true {
            switch failure.map({ LAError.Code(rawValue: $0.code) }) {
            case .biometryNotEnrolled: reply.reason = "not-enrolled"
            case .passcodeNotSet: reply.reason = "insecure"
            default: reply.reason = "unsupported"
            }
        }
    }
    static func enroll(_ request: Request, _ reply: inout Reply) throws {
        guard let id = request.id, let binding = request.binding, let encoded = request.key,
              var secret = Data(base64Encoded: encoded), secret.count == 32 else { reply.error = "VALIDATION"; return }
        defer { secret.resetBytes(in: 0..<secret.count) }
        var failure: Unmanaged<CFError>?
        guard SecureEnclave.isAvailable, let access = SecAccessControlCreateWithFlags(
            nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, [.privateKeyUsage, .biometryCurrentSet], &failure
        ) else { reply.error = "QUICK_UNLOCK_UNSUPPORTED"; return }
        let enclave = try SecureEnclave.P256.KeyAgreement.PrivateKey(accessControl: access)
        let ephemeral = P256.KeyAgreement.PrivateKey()
        let info = context(id, binding)
        let sealed = try AES.GCM.seal(secret, using: wrappingKey(try ephemeral.sharedSecretFromKeyAgreement(with: enclave.publicKey), info), authenticating: info)
        guard let combined = sealed.combined else { reply.error = "QUICK_UNLOCK_UNAVAILABLE"; return }
        reply.record = BiometricRecord(version: 1, enclaveKey: enclave.dataRepresentation.base64EncodedString(),
                                       ephemeral: ephemeral.publicKey.x963Representation.base64EncodedString(), sealed: combined.base64EncodedString())
    }
    static func recover(_ request: Request, _ reply: inout Reply) {
        guard let id = request.id, let binding = request.binding, let record = request.record, record.version == 1,
              let blob = Data(base64Encoded: record.enclaveKey), let point = Data(base64Encoded: record.ephemeral),
              let combined = Data(base64Encoded: record.sealed) else { reply.error = "VALIDATION"; return }
        let authentication = LAContext()
        authentication.localizedReason = String((request.reason ?? "unlock your vault").prefix(200))
        authentication.localizedFallbackTitle = ""
        let info = context(id, binding)
        let enclave: SecureEnclave.P256.KeyAgreement.PrivateKey
        do { enclave = try SecureEnclave.P256.KeyAgreement.PrivateKey(dataRepresentation: blob, authenticationContext: authentication) }
        catch { reply.error = "QUICK_UNLOCK_INVALIDATED"; return }
        do {
            let secret = try enclave.sharedSecretFromKeyAgreement(with: try P256.KeyAgreement.PublicKey(x963Representation: point))
            var key = try AES.GCM.open(try AES.GCM.SealedBox(combined: combined), using: wrappingKey(secret, info), authenticating: info)
            defer { key.resetBytes(in: 0..<key.count) }
            guard key.count == 32 else { reply.error = "QUICK_UNLOCK_UNAVAILABLE"; return }
            reply.key = key.base64EncodedString()
        } catch {
            reply.error = cancelled(error as NSError) ? "CANCELLED" : "QUICK_UNLOCK_UNAVAILABLE"
        }
    }
    /// A dismissed prompt surfaces as LocalAuthentication or CryptoTokenKit cancellation, possibly nested.
    static func cancelled(_ error: NSError) -> Bool {
        let local: [LAError.Code] = [.userCancel, .appCancel, .systemCancel, .userFallback]
        if error.domain == LAErrorDomain, local.map(\.rawValue).contains(error.code) { return true }
        if error.domain == TKErrorDomain, error.code == TKError.Code.canceledByUser.rawValue { return true }
        let nested = (error.userInfo[NSUnderlyingErrorKey] as? NSError).map { [$0] } ?? []
        return (nested + error.underlyingErrors.map { $0 as NSError }).contains(where: cancelled)
    }
}

let input = FileHandle.standardInput.readDataToEndOfFile()
var reply = Reply()
if input.count <= 4_200_000, let request = try? JSONDecoder().decode(Request.self, from: input), request.action.hasPrefix("bio-") {
    switch request.action {
    case "bio-support": Biometrics.support(&reply)
    case "bio-enroll":
        do { try Biometrics.enroll(request, &reply) } catch { reply.error = "QUICK_UNLOCK_UNAVAILABLE" }
    case "bio-recover": Biometrics.recover(request, &reply)
    default: reply.error = "VALIDATION"
    }
} else if input.count <= 4_200_000, let request = try? JSONDecoder().decode(Request.self, from: input) {
    autoreleasepool {
        let pasteboard = NSPasteboard.general
        if request.action == "copy", let value = request.value {
            let item = NSPasteboardItem()
            item.setString(value, forType: .string)
            // Cooperative clipboard managers can honor the concealed marker.
            item.setData(Data(), forType: NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType"))
            pasteboard.clearContents()
            if pasteboard.writeObjects([item]) { reply.token = pasteboard.changeCount }
            else { reply.error = "PERMISSION" }
        } else if request.action == "clear", let token = request.token {
            if pasteboard.changeCount == token { pasteboard.clearContents(); reply.cleared = true }
            else { reply.cleared = false }
        } else { reply.error = "VALIDATION" }
    }
} else { reply.error = "VALIDATION" }
if let output = try? JSONEncoder().encode(reply) { FileHandle.standardOutput.write(output) }
