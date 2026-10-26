import Foundation
import Darwin

/// Preserve Markdown bytes by copying referenced images to the same relative paths.
final class ImageTransfer {
    private let target: URL
    private let root: URL
    private var entries: [(URL,Data)] = []
    private var reused = 0
    private var createdFiles: [URL] = []
    private var createdDirectories: [URL] = []
    private let fm = FileManager.default
    init(from original: URL, to target: URL, sources: [String]) throws {
        self.target = target
        root = target.deletingLastPathComponent().resolvingSymlinksInPath().standardizedFileURL
        let originalRoot = original.deletingLastPathComponent().resolvingSymlinksInPath().standardizedFileURL
        let images = ImageAssets()
        images.setDocument(originalRoot.appendingPathComponent(original.lastPathComponent))
        let prefix = originalRoot.path == "/" ? "/" : originalRoot.path + "/"
        var seen = Set<String>(), total = 0
        for source in sources {
            // Remote/data/absolute links retain their existing meaning and are not fetched.
            if source.hasPrefix("/") || URLComponents(string:source)?.scheme != nil { continue }
            let local = try images.resolve(source,token:images.token)
            let resolved = local.resolvingSymlinksInPath().standardizedFileURL
            guard resolved.path.hasPrefix(prefix) else { throw Self.failure("图片位于原文档目录之外，未复制：" + source) }
            // Reject symlink components instead of changing a relative link's meaning.
            let parts = URL(fileURLWithPath:local.path).standardizedFileURL.pathComponents
            let base = originalRoot.pathComponents
            guard parts.starts(with:base), parts.count > base.count else { throw Self.failure("无法安全解析相对图片：" + source) }
            let relative = parts.dropFirst(base.count)
            var origin = originalRoot, destination = root
            for part in relative {
                origin.appendPathComponent(part); destination.appendPathComponent(part)
                try rejectSymlink(origin); try rejectSymlink(destination)
            }
            guard destination.standardizedFileURL != target.resolvingSymlinksInPath().standardizedFileURL else { throw Self.failure("图片目标与文档文件同名，未保存。") }
            guard seen.insert(destination.path).inserted else { continue }
            let (data,_) = try ImageAssets.inspect(resolved)
            total += data.count
            guard total <= 100 * 1024 * 1024 else { throw Self.failure("一次另存为的本地图片总大小不能超过 100 MB。") }
            if fm.fileExists(atPath:destination.path) {
                guard (try? Data(contentsOf:destination)) == data else { throw Self.failure("目标存在同名但内容不同的图片，未覆盖：" + relative.joined(separator:"/")) }
                reused += 1
            } else { entries.append((destination,data)) }
        }
    }
    private static func failure(_ text: String) -> NSError { NSError(domain:"ImageTransfer",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
    private func rejectSymlink(_ url: URL) throws {
        if (try? url.resourceValues(forKeys:[.isSymbolicLinkKey]).isSymbolicLink) == true {
            throw Self.failure("图片路径包含符号链接，未复制：" + url.lastPathComponent)
        }
    }
    private func makeParents(_ directory: URL) throws {
        var current = root
        for part in directory.pathComponents.dropFirst(root.pathComponents.count) {
            current.appendPathComponent(part)
            try rejectSymlink(current)
            if !fm.fileExists(atPath:current.path) {
                try fm.createDirectory(at:current,withIntermediateDirectories:false)
                createdDirectories.append(current)
            }
        }
    }
    func save(_ text: String, store: DocumentStore) throws -> String {
        do {
            for (destination,data) in entries {
                try makeParents(destination.deletingLastPathComponent())
                let fd = Darwin.open(destination.path,O_WRONLY | O_CREAT | O_EXCL,0o644)
                guard fd >= 0 else { throw Self.failure("无法创建图片，未覆盖目标：" + destination.lastPathComponent) }
                createdFiles.append(destination)
                let handle = FileHandle(fileDescriptor:fd,closeOnDealloc:true)
                try handle.write(contentsOf:data); try handle.close()
            }
            let warning = try store.save(text,to:target)
            return warning ?? (entries.isEmpty && reused == 0 ? "已保存" : "已另存为，复制 \(entries.count) 张图片，复用 \(reused) 张同内容图片")
        } catch {
            var remaining = false
            for file in createdFiles.reversed() { do { try fm.removeItem(at:file) } catch { remaining = true } }
            for directory in createdDirectories.reversed() {
                do { if try fm.contentsOfDirectory(atPath:directory.path).isEmpty { try fm.removeItem(at:directory) } }
                catch { remaining = true }
            }
            if remaining { throw Self.failure(error.localizedDescription + "；部分新附件无法清理，请检查目标目录。") }
            throw error
        }
    }
}
