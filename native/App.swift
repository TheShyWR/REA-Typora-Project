import Cocoa
import WebKit

final class EditorApp: NSObject, NSApplicationDelegate, WKScriptMessageHandler, NSWindowDelegate, WKNavigationDelegate, WKURLSchemeHandler {
    var window: NSWindow!
    var web: WKWebView!
    let store = DocumentStore()
    let images = ImageAssets()
    var current: URL? { store.current }
    var dirty = false
    var ready = false
    var pending: URL?
    var folder: URL?
    let bridge = """
    (() => {
      let id = 0; const pending = new Map();
      window.__nativeReply = (id, value, error) => { const p = pending.get(id); if (!p) return; pending.delete(id); error ? p.reject(new Error(error)) : p.resolve(value); };
      const invoke = (method, ...args) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, {resolve, reject}); window.webkit.messageHandlers.desktop.postMessage({id:key,method,args}); });
      window.desktop = {
        new: () => invoke('new'), open: file => invoke('open', file || null),
        save: (text, saveAs) => invoke('save',text,!!saveAs), folder: () => invoke('folder'),
        dirty: (value, text) => invoke('dirty',value,text), find: text => invoke('find',text), pdf: () => invoke('pdf'),
        pickImage: () => invoke('pickImage'), importImages: (images, token) => invoke('importImages', images, token),
        ready: () => invoke('ready'), onAction: callback => window.__nativeAction = callback,
        onDocument: callback => window.__nativeDocument = callback
      };
    })();
    """
    func applicationDidFinishLaunching(_ notification: Notification) {
        if let icon = Bundle.main.url(forResource:"AppIcon",withExtension:"icns") { NSApp.applicationIconImage = NSImage(contentsOf:icon) }
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(self,forURLScheme:"rea-image")
        config.userContentController.add(self, name: "desktop")
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 820), styleMask: [.titled,.closable,.miniaturizable,.resizable], backing: .buffered, defer: false)
        window.title = "REA Markdown"; window.minSize = NSSize(width: 720, height: 500)
        window.contentView = web; window.delegate = self; window.center()
        let root = Bundle.main.resourceURL!.appendingPathComponent("web")
        web.loadFileURL(root.appendingPathComponent("index.html"), allowingReadAccessTo: root)
        setupMenu()
        window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let allowed = Bundle.main.resourceURL!.appendingPathComponent("web").path + "/"
        guard let url = action.request.url, url.isFileURL, url.standardizedFileURL.path.hasPrefix(allowed) else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        do {
            guard let url = urlSchemeTask.request.url,
                  let token = url.host,
                  let source = URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first(where: { $0.name == "src" })?.value else { throw ImageAssets.failure("无效图片请求") }
            let (data,mime) = try images.read(source,token:token)
            urlSchemeTask.didReceive(URLResponse(url:url,mimeType:mime,expectedContentLength:data.count,textEncodingName:nil))
            urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
        } catch { urlSchemeTask.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
    func setupMenu() {
        let menu = NSMenu()
        func section(_ name: String, _ entries: [(String,String,String)]) {
            let top = NSMenuItem(); let sub = NSMenu(title: name); top.submenu = sub; menu.addItem(top)
            for (title, action, key) in entries {
                let item = NSMenuItem(title: title, action: #selector(menuAction(_:)), keyEquivalent: key)
                item.representedObject = action; item.target = self; sub.addItem(item)
            }
        }
        section("REA Markdown", [("关于 REA Markdown","about",""),("退出 REA Markdown","quit","q")])
        section("文件", [("新建","new","n"),("打开…","open","o"),("保存","save","s"),("另存为…","saveAs",""),("打开文件夹…","folder",""),("插入图片…","image",""),("导出 PDF…","pdf","")])
        let edit = NSMenuItem(); let editMenu = NSMenu(title:"编辑"); edit.submenu = editMenu; menu.addItem(edit)
        for (title, selector, key) in [("撤销","undo:","z"),("重做","redo:","Z"),("剪切","cut:","x"),("复制","copy:","c"),("粘贴","paste:","v"),("全选","selectAll:","a")] {
            editMenu.addItem(withTitle:title, action:Selector(selector), keyEquivalent:key)
        }
        section("视图",[("源码模式","source","/"),("查找","find","f"),("专注模式","focus",""),("切换主题","theme","")])
        NSApp.mainMenu = menu
    }
    @objc func menuAction(_ sender: NSMenuItem) {
        let action = sender.representedObject as! String
        if action == "quit" { NSApp.terminate(nil); return }
        if action == "about" { NSApp.orderFrontStandardAboutPanel(options:[.applicationIcon:NSApp.applicationIconImage as Any]); return }
        web.evaluateJavaScript("window.__nativeAction?.(\(json(action)))")
    }
    func json(_ value: Any) -> String {
        String(data: try! JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed,.sortedKeys]), encoding: .utf8)!
    }
    func reply(_ id: Int, _ value: Any = NSNull(), error: String? = nil) {
        web.evaluateJavaScript("window.__nativeReply(\(id),\(json(value)),\(json(error as Any? ?? NSNull())))")
    }
    func mayDiscard() -> Bool {
        if !dirty { return true }
        let alert = NSAlert(); alert.messageText = "当前文档尚未保存"; alert.informativeText = "取消后可先保存；放弃修改将丢失未保存内容。"
        alert.addButton(withTitle:"取消"); alert.addButton(withTitle:"放弃修改")
        return alert.runModal() == .alertSecondButtonReturn
    }
    func payload(_ text: String) -> [String: String] {
        var result = ["name":current?.lastPathComponent ?? "未命名.md", "text":text, "savedText":store.savedText, "imageToken":images.token]
        if let current { result["path"] = current.path }
        return result
    }
    func document(_ url: URL) throws -> [String: String] {
        let text = try store.open(url)
        images.setDocument(url)
        dirty = false; window.isDocumentEdited = false; window.title = url.lastPathComponent
        return payload(text)
    }
    func restoreDrafts() {
        do {
            let drafts = try store.recoverable()
            if !store.damagedDrafts.isEmpty {
                let alert = NSAlert(); alert.messageText = "部分恢复草稿无法读取"
                alert.informativeText = "这些文件已保留，可手动检查：\n" + store.damagedDrafts.map(\.path).joined(separator:"\n")
                alert.runModal()
            }
            for (url, draft) in drafts {
                let alert = NSAlert(); alert.messageText = "发现未保存的恢复草稿"
                alert.informativeText = (draft.path ?? "未命名文档") + "\n恢复后不会改写原文件。保留将留待下次启动处理。"
                alert.addButton(withTitle:"恢复"); alert.addButton(withTitle:"保留，下次处理"); alert.addButton(withTitle:"丢弃草稿")
                let choice = alert.runModal()
                if choice == .alertFirstButtonReturn {
                    try store.restore(draft, from:url)
                    images.setDocument(current)
                    dirty = true; window.isDocumentEdited = true; window.title = current?.lastPathComponent ?? "恢复的未命名.md"
                    web.evaluateJavaScript("window.__nativeDocument(\(json(payload(draft.text))))")
                    break
                } else if choice == .alertThirdButtonReturn { try FileManager.default.removeItem(at:url) }
            }
        } catch { show(error) }
    }
    func mayClose() -> Bool {
        guard mayDiscard() else { return false }
        do { try store.clearRecovery(); dirty = false; return true }
        catch { show(error); return false }
    }
    func openExternal(_ url: URL) {
        if !ready { pending = url; return }
        guard mayDiscard() else { return }
        do { web.evaluateJavaScript("window.__nativeDocument(\(json(try document(url))))"); window.makeKeyAndOrderFront(nil) }
        catch { show(error) }
    }
    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        if let file = filenames.first { openExternal(URL(fileURLWithPath: file)) }
        sender.reply(toOpenOrPrint: .success)
    }
    func show(_ error: Error) { let alert = NSAlert(error:error); alert.runModal() }
    func windowShouldClose(_ sender: NSWindow) -> Bool { mayClose() }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply { mayClose() ? .terminateNow : .terminateCancel }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { dirty = false; return true }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        guard let body = message.body as? [String:Any], let id = body["id"] as? Int, let method = body["method"] as? String, let args = body["args"] as? [Any] else { return }
        do {
            switch method {
            case "ready": ready = true; reply(id); restoreDrafts(); if let url = pending { pending = nil; openExternal(url) }
            case "dirty":
                guard let value = args.first as? Bool, args.count > 1, let text = args[1] as? String else { reply(id,error:"缺少恢复草稿内容"); return }
                dirty = value; window.isDocumentEdited = dirty
                if dirty { try store.checkpoint(text) } else { try store.clearRecovery() }
                reply(id)
            case "new":
                guard mayDiscard() else { reply(id); return }; try store.new(); images.setDocument(nil); dirty = false; window.isDocumentEdited = false; window.title = "未命名.md"; reply(id,payload(""))
            case "open":
                guard mayDiscard() else { reply(id); return }
                var url: URL?
                if let file = args.first as? String, URL(fileURLWithPath:file).deletingLastPathComponent() == folder { url = URL(fileURLWithPath:file) }
                else { let panel = NSOpenPanel(); panel.allowedFileTypes = ["md","markdown","txt"]; panel.allowsMultipleSelection = false; if panel.runModal() == .OK { url = panel.url } }
                if let url { reply(id,try document(url)) } else { reply(id) }
            case "save":
                guard let text = args.first as? String else { reply(id,error:"无效内容"); return }
                var url = current
                if url == nil || (args.last as? Bool == true) { let panel = NSSavePanel(); panel.allowedFileTypes = ["md"]; panel.nameFieldStringValue = current?.lastPathComponent ?? "未命名.md"; if panel.runModal() == .OK { url = panel.url } else { reply(id); return } }
                guard let url else { reply(id); return }
                try store.save(text, to:url); if images.document != current { images.setDocument(current) }; dirty = false; window.isDocumentEdited = false; window.title = url.lastPathComponent; reply(id,payload(text))
            case "importImages":
                guard args.count == 2, let inputs = args[0] as? [[String:String]], let token = args[1] as? String else { throw ImageAssets.failure("无效图片请求") }
                reply(id,try images.importImages(inputs,token:token))
            case "pickImage":
                guard current != nil else { throw ImageAssets.failure("请先保存文档，再插入图片。") }
                let panel = NSOpenPanel(); panel.allowedFileTypes = ["png","jpg","jpeg","gif","webp"]; panel.allowsMultipleSelection = false
                guard panel.runModal() == .OK, let url = panel.url else { reply(id); return }
                reply(id,try images.importImage(url))
            case "folder":
                let panel = NSOpenPanel(); panel.canChooseDirectories = true; panel.canChooseFiles = false
                guard panel.runModal() == .OK, let url = panel.url else { reply(id); return }; folder = url
                let files = try FileManager.default.contentsOfDirectory(at:url,includingPropertiesForKeys:[.isRegularFileKey]).filter { ["md","markdown","txt"].contains($0.pathExtension.lowercased()) && ((try? $0.resourceValues(forKeys:[.isRegularFileKey]).isRegularFile) == true) }.sorted { $0.lastPathComponent < $1.lastPathComponent }.map { ["name":$0.lastPathComponent,"path":$0.path] }
                reply(id,["name":url.lastPathComponent,"files":files])
            case "find":
                let query = args.first as? String ?? ""; let options = WKFindConfiguration(); options.wraps = true
                web.find(query,configuration:options) { _ in }; reply(id)
            case "pdf":
                let panel = NSSavePanel(); panel.allowedFileTypes = ["pdf"]; panel.nameFieldStringValue = "document.pdf"
                guard panel.runModal() == .OK, let url = panel.url else { reply(id,false); return }
                web.createPDF(configuration: WKPDFConfiguration()) { result in
                    do { try result.get().write(to:url); self.reply(id,true) } catch { self.reply(id,error:error.localizedDescription) }
                }
            default: reply(id,error:"未知操作")
            }
        } catch { reply(id,error:error.localizedDescription) }
    }
}
let app = NSApplication.shared
let delegate = EditorApp()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
