import Foundation
import Darwin

/// Lists only the expanded directory; document access stays inside the selected root.
final class Workspace {
    private(set) var root: URL?
    private(set) var observedDirectories = Set<URL>()
    private let keys: Set<URLResourceKey> = [.isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey, .isPackageKey]
    private static let extensions: Set<String> = ["md", "markdown", "txt"]
    private func failure(_ message: String) -> NSError {
        NSError(domain:"Workspace",code:1,userInfo:[NSLocalizedDescriptionKey:message])
    }
    func select(_ url: URL) throws -> [String:Any] {
        let selected = url.resolvingSymlinksInPath().standardizedFileURL
        let result = try listing(selected)
        root = selected; observedDirectories = [selected]
        return result
    }
    private func inside(_ path: String) throws -> URL {
        guard let root else { throw failure("请先打开工作空间文件夹。") }
        let url = URL(fileURLWithPath:path).standardizedFileURL
        let resolved = url.resolvingSymlinksInPath().standardizedFileURL
        let prefix = root.path == "/" ? "/" : root.path + "/"
        guard (url.path == root.path || url.path.hasPrefix(prefix)),
              (resolved.path == root.path || resolved.path.hasPrefix(prefix)), url.path == resolved.path else {
            throw failure("该路径不属于当前工作空间，或是符号链接。")
        }
        return url
    }
    func list(_ path: String) throws -> [String:Any] {
        let url = try inside(path)
        let result = try listing(url)
        observedDirectories.insert(url)
        return result
    }
    func document(_ path: String) throws -> URL {
        let url = try inside(path)
        let info = try url.resourceValues(forKeys:keys)
        guard info.isRegularFile == true, info.isSymbolicLink != true,
              Self.extensions.contains(url.pathExtension.lowercased()) else {
            throw failure("请选择当前工作空间中的 Markdown 或文本文件。")
        }
        return url
    }
    func create(in parentPath: String, name: String, directory: Bool) throws -> URL {
        let parent = try inside(parentPath)
        let info = try parent.resourceValues(forKeys:keys)
        guard info.isDirectory == true, info.isPackage != true else { throw failure("请选择普通工作空间目录。") }
        guard !name.isEmpty, !name.hasPrefix("."), !name.contains("/"), !name.contains("\\"), !name.contains(":"),
              name.rangeOfCharacter(from:.controlCharacters) == nil,
              name == name.trimmingCharacters(in:.whitespacesAndNewlines) else { throw failure("请输入有效名称，不包含路径、隐藏前缀或首尾空白。") }
        var filename = name
        if directory {
            guard !["app","bundle","framework","plugin"].contains((name as NSString).pathExtension.lowercased()) else { throw failure("不支持创建应用包目录。") }
        } else {
            if (name as NSString).pathExtension.isEmpty { filename += ".md" }
            guard Self.extensions.contains((filename as NSString).pathExtension.lowercased()) else { throw failure("文档扩展名须为 .md、.markdown 或 .txt。") }
        }
        let target = parent.appendingPathComponent(filename,isDirectory:directory)
        if directory {
            guard Darwin.mkdir(target.path,0o755) == 0 else { throw failure("无法创建文件夹，可能同名项目已存在或目录不可写。") }
        } else {
            try Data().write(to:target,options:.withoutOverwriting)
        }
        return target
    }
    private func listing(_ directory: URL) throws -> [String:Any] {
        let info = try directory.resourceValues(forKeys:keys)
        guard info.isDirectory == true, info.isPackage != true else { throw failure("无法展开该文件夹。") }
        let urls = try FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:Array(keys),options:[.skipsHiddenFiles])
        let entries: [(URL,Bool)] = urls.compactMap { url in
            guard let item = try? url.resourceValues(forKeys:keys), item.isSymbolicLink != true, item.isPackage != true else { return nil }
            if item.isDirectory == true { return (url,true) }
            if item.isRegularFile == true, Self.extensions.contains(url.pathExtension.lowercased()) { return (url,false) }
            return nil
        }.sorted { a,b in
            if a.1 != b.1 { return a.1 }
            return a.0.lastPathComponent.localizedStandardCompare(b.0.lastPathComponent) == .orderedAscending
        }
        return ["path":directory.path,"name":directory.lastPathComponent,"entries":entries.map { url,isDirectory in
            ["name":url.lastPathComponent,"path":url.path,"directory":isDirectory] as [String:Any]
        }]
    }
}
