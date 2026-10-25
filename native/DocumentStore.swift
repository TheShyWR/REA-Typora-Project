import Foundation
import Darwin

struct RecoveryDraft: Codable {
    let path: String?
    let baseline: Data?
    let text: String
    let ownerPID: Int32
    let updated: Date
}

/// Disk state is independent of the web editor; the baseline is exact saved bytes.
final class DocumentStore {
    private(set) var damagedDrafts: [URL] = []
    var current: URL?
    var baseline: Data?
    let recoveryDirectory: URL
    let recoveryFile: URL
    init(recoveryDirectory: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("local.rea.markdown/Recovery")) {
        self.recoveryDirectory = recoveryDirectory
        recoveryFile = recoveryDirectory.appendingPathComponent(UUID().uuidString + ".json")
    }
    static func decode(_ data: Data) throws -> String {
        let bytes = data.starts(with: [0xef, 0xbb, 0xbf]) ? data.dropFirst(3) : data[...]
        guard let text = String(data: bytes, encoding: .utf8) else {
            throw NSError(domain: "DocumentStore", code: 1, userInfo: [NSLocalizedDescriptionKey: "文件不是有效 UTF-8，未打开或修改文件。"])
        }
        return text
    }
    var savedText: String { (try? baseline.map(Self.decode)) ?? "" }
    func open(_ url: URL) throws -> String {
        let bytes = try Data(contentsOf: url)
        let text = try Self.decode(bytes)
        try clearRecovery()
        current = url; baseline = bytes
        return text
    }
    func new() throws { try clearRecovery(); current = nil; baseline = nil }
    func checkpoint(_ text: String) throws {
        try FileManager.default.createDirectory(at: recoveryDirectory, withIntermediateDirectories: true)
        let draft = RecoveryDraft(path: current?.path, baseline: baseline, text: text, ownerPID: getpid(), updated: Date())
        try JSONEncoder().encode(draft).write(to: recoveryFile, options: .atomic)
    }
    func clearRecovery() throws {
        if FileManager.default.fileExists(atPath: recoveryFile.path) { try FileManager.default.removeItem(at: recoveryFile) }
    }
    func recoverable() throws -> [(URL, RecoveryDraft)] {
        damagedDrafts = []
        guard FileManager.default.fileExists(atPath: recoveryDirectory.path) else { return [] }
        return try FileManager.default.contentsOfDirectory(at: recoveryDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" && $0 != recoveryFile }
            .compactMap { url in
                guard let draft = try? JSONDecoder().decode(RecoveryDraft.self, from: Data(contentsOf: url)) else {
                    damagedDrafts.append(url); return nil
                }
                guard draft.ownerPID != getpid(), kill(draft.ownerPID, 0) != 0, errno == ESRCH else { return nil }
                return (url, draft)
            }.sorted { $0.1.updated > $1.1.updated }
    }
    func restore(_ draft: RecoveryDraft, from url: URL) throws {
        // Commit a new copy before touching the previous session's draft.
        let copy = RecoveryDraft(path: draft.path, baseline: draft.baseline, text: draft.text, ownerPID: getpid(), updated: Date())
        try FileManager.default.createDirectory(at: recoveryDirectory, withIntermediateDirectories: true)
        try JSONEncoder().encode(copy).write(to: recoveryFile, options: .atomic)
        current = draft.path.map { URL(fileURLWithPath: $0) }; baseline = draft.baseline
        try? FileManager.default.removeItem(at: url)
    }
    func save(_ text: String, to url: URL) throws {
        if url.standardizedFileURL == current?.standardizedFileURL {
            guard let baseline, (try? Data(contentsOf: url)) == baseline else {
                throw NSError(domain: "DocumentStore", code: 2, userInfo: [NSLocalizedDescriptionKey: "文件已被其他程序修改或删除，请另存为以保留两个版本。"])
            }
        }
        var output = text
        if let baseline {
            let previous = try Self.decode(baseline)
            if previous.contains("\r\n"), !previous.replacingOccurrences(of: "\r\n", with: "").contains("\n") {
                output = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\n", with: "\r\n")
            }
        }
        var bytes = Data()
        if baseline?.starts(with: [0xef, 0xbb, 0xbf]) == true { bytes.append(contentsOf: [0xef, 0xbb, 0xbf]) }
        bytes.append(Data(output.utf8))
        try bytes.write(to: url, options: .atomic)
        current = url; baseline = bytes
        try clearRecovery()
    }
}
