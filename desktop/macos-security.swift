import AppKit
import Foundation

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

struct Request: Decodable { let action: String; let value: String?; let token: Int? }
struct Reply: Encodable { var token: Int?; var cleared: Bool?; var error: String? }
let input = FileHandle.standardInput.readDataToEndOfFile()
var reply = Reply()
if input.count <= 4_200_000, let request = try? JSONDecoder().decode(Request.self, from: input) {
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
