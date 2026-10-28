import Foundation

final class RecentDocuments {
    private(set) var urls: [URL] = []
    private let file: URL
    init(file: URL = FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("local.rea.markdown/recent-documents.json")) {
        self.file = file
        if let data = try? Data(contentsOf:file), let paths = try? JSONDecoder().decode([String].self,from:data) { urls = Self.clean(paths) }
    }
    private static func clean(_ paths: [String]) -> [URL] {
        var result: [URL] = [], seen = Set<String>()
        for path in paths where path.hasPrefix("/") && path.rangeOfCharacter(from:.controlCharacters) == nil {
            let url = URL(fileURLWithPath:path).standardizedFileURL
            guard ["md","markdown","txt"].contains(url.pathExtension.lowercased()), seen.insert(url.path).inserted else { continue }
            result.append(url); if result.count == 10 { break }
        }
        return result
    }
    func contains(_ path: String) -> Bool { urls.contains { $0.path == path } }
    func record(_ url: URL, replacing old: URL? = nil) throws {
        guard url.isFileURL, Self.clean([url.path]).count == 1 else { return }
        let oldPath = old?.standardizedFileURL.path
        let paths: [String] = [url.standardizedFileURL.path] + urls.map { $0.path }.filter { $0 != oldPath }
        try persist(Self.clean(paths))
    }
    func clear() throws { try persist([]) }
    private func persist(_ next: [URL]) throws {
        try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
        try JSONEncoder().encode(next.map(\.path)).write(to:file,options:.atomic)
        urls = next
    }
}
