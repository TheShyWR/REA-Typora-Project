import Foundation
import CryptoKit

/// Search saved UTF-8 source on a background queue, without changing the workspace tree.
enum WorkspaceSearch {
    static func normalized(_ text: String) -> String {
        text.replacingOccurrences(of:"\r\n",with:"\n").replacingOccurrences(of:"\r",with:"\n")
    }
    static func fingerprint(_ text: String) -> String {
        SHA256.hash(data:Data(normalized(text).utf8)).map { String(format:"%02x",$0) }.joined()
    }
    static func search(root: URL, query: String, caseSensitive: Bool) throws -> [String:Any] {
        guard !query.isEmpty, query.count <= 256, !query.contains("\n"), !query.contains("\r") else {
            throw NSError(domain:"WorkspaceSearch",code:1,userInfo:[NSLocalizedDescriptionKey:"请输入 1–256 个字符的单行搜索文本。"])
        }
        let fm = FileManager.default
        let keys: Set<URLResourceKey> = [.isDirectoryKey,.isRegularFileKey,.isSymbolicLinkKey,.isPackageKey,.fileSizeKey]
        let info = try root.resourceValues(forKeys:keys)
        guard info.isDirectory == true, info.isSymbolicLink != true else {
            throw NSError(domain:"WorkspaceSearch",code:2,userInfo:[NSLocalizedDescriptionKey:"工作空间目录已移动或无法读取。"])
        }
        let root = root.resolvingSymlinksInPath().standardizedFileURL
        var skipped = 0, scanned = 0, visited = 0, limit = ""
        guard let items = fm.enumerator(at:root,includingPropertiesForKeys:Array(keys),options:[.skipsHiddenFiles,.skipsPackageDescendants],errorHandler:{ _,_ in skipped += 1; return true }) else {
            throw NSError(domain:"WorkspaceSearch",code:3,userInfo:[NSLocalizedDescriptionKey:"无法读取工作空间。"])
        }
        var rows = [[String:Any]]()
        let prefix = root.path == "/" ? "/" : root.path + "/"
        let deadline = Date().addingTimeInterval(10)
        for case let url as URL in items {
            visited += 1
            if visited > 10000 || Date() > deadline { limit = "达到扫描范围或时间上限，请缩小工作空间后重试"; break }
            guard let item = try? url.resourceValues(forKeys:keys) else { skipped += 1; continue }
            if item.isSymbolicLink == true || item.isPackage == true { items.skipDescendants(); continue }
            guard item.isRegularFile == true, ["md","markdown","txt"].contains(url.pathExtension.lowercased()) else { continue }
            let resolved = url.resolvingSymlinksInPath().standardizedFileURL
            guard resolved.path.hasPrefix(prefix) else { skipped += 1; continue }
            if scanned >= 1000 { limit = "达到 1000 个文档上限，请缩小工作空间后重试"; break }
            // Bounded reads also protect against a file growing after its size was inspected.
            guard let size = item.fileSize, size <= 2 * 1024 * 1024 else { skipped += 1; continue }
            let data: Data
            do {
                let handle = try FileHandle(forReadingFrom:url)
                defer { try? handle.close() }
                data = try handle.read(upToCount:2 * 1024 * 1024 + 1) ?? Data()
            } catch { skipped += 1; continue }
            guard data.count <= 2 * 1024 * 1024, let decoded = try? DocumentStore.decode(data), !decoded.contains("\0") else { skipped += 1; continue }
            scanned += 1
            let text = normalized(decoded), hash = fingerprint(text)
            var offset = 0
            for (index,line) in text.components(separatedBy:"\n").enumerated() {
                let ns = line as NSString
                let match = ns.range(of:query,options:caseSensitive ? [.literal] : [.literal,.caseInsensitive])
                if match.location != NSNotFound, let range = Range(match,in:line) {
                    let before = line[..<range.lowerBound], after = line[range.upperBound...]
                    let preview = (before.count > 30 ? "…" : "") + before.suffix(30) + line[range] + after.prefix(70) + (after.count > 70 ? "…" : "")
                    rows.append(["path":resolved.path,"relative":String(resolved.path.dropFirst(prefix.count)),"line":index + 1,"from":offset + match.location,"to":offset + match.location + match.length,"preview":String(preview),"fingerprint":hash])
                    if rows.count >= 200 { limit = "已显示前 200 个匹配行，请细化关键词"; break }
                }
                offset += ns.length + 1
            }
            if !limit.isEmpty { break }
        }
        rows.sort { a,b in
            let left = a["relative"] as! String, right = b["relative"] as! String
            return left == right ? (a["line"] as! Int) < (b["line"] as! Int) : left.localizedStandardCompare(right) == .orderedAscending
        }
        return ["root":root.path,"rows":rows,"scanned":scanned,"skipped":skipped,"limit":limit]
    }
}
