import Foundation
import ImageIO
import UniformTypeIdentifiers

final class ImageAssets {
    private(set) var document: URL?
    private(set) var token = UUID().uuidString.lowercased()
    static let formats = ["public.png": ("png","image/png"), "public.jpeg": ("jpg","image/jpeg"), "com.compuserve.gif": ("gif","image/gif"), "org.webmproject.webp": ("webp","image/webp")]
    static let maxBytes = 20 * 1024 * 1024
    func setDocument(_ url: URL?) { document = url; token = UUID().uuidString.lowercased() }
    static func failure(_ message: String) -> NSError {
        NSError(domain:"ImageAssets",code:1,userInfo:[NSLocalizedDescriptionKey:message])
    }
    static func inspect(_ url: URL) throws -> (Data, UTType) {
        let info = try url.resourceValues(forKeys:[.fileSizeKey,.isRegularFileKey])
        guard info.isRegularFile == true, let size = info.fileSize, size <= maxBytes else {
            throw failure("图片必须是小于 20 MB 的普通文件。")
        }
        let data = try Data(contentsOf:url)
        return (data,try inspect(data))
    }
    static func inspect(_ data: Data) throws -> UTType {
        guard data.count <= maxBytes,
              let source = CGImageSourceCreateWithData(data as CFData,nil),
              let typeID = CGImageSourceGetType(source),
              let type = UTType(typeID as String),
              formats[type.identifier] != nil,
              CGImageSourceGetCount(source) > 0 else {
            throw failure("暂支持 PNG、JPEG、GIF 和 WebP 图片。")
        }
        return type
    }
    func resolve(_ source: String, token requestedToken: String) throws -> URL {
        guard requestedToken == token, let document else { throw Self.failure("文档已切换或尚未保存。") }
        let encoded = source.addingPercentEncoding(withAllowedCharacters:CharacterSet.urlFragmentAllowed.union(CharacterSet(charactersIn:"%#")))
        guard !source.hasPrefix("//"), let encoded, let url = URL(string:encoded,relativeTo:document.deletingLastPathComponent().appendingPathComponent("",isDirectory:true))?.absoluteURL,
              url.isFileURL, url.host == nil || url.host == "" || url.host == "localhost" else {
            throw Self.failure("无效的本地图片路径。")
        }
        return url.standardizedFileURL
    }
    func read(_ source: String, token: String) throws -> (Data,String) {
        let (data,type) = try Self.inspect(resolve(source,token:token))
        return (data,Self.formats[type.identifier]!.1)
    }
    func importImage(_ source: URL) throws -> [String:String] {
        let (data,type) = try Self.inspect(source)
        return try write(data,type:type,name:source.deletingPathExtension().lastPathComponent)
    }
    func importImages(_ inputs: [[String:String]], token requestedToken: String) throws -> [[String:String]] {
        guard requestedToken == token, document != nil else { throw Self.failure("文档已切换或尚未保存，请先保存文档。") }
        var total = 0
        let images = try inputs.map { input -> (Data,UTType,String) in
            guard let encoded = input["data"], encoded.utf8.count <= ((Self.maxBytes + 2) / 3) * 4,
                  let data = Data(base64Encoded:encoded) else { throw Self.failure("无效或过大的图片数据。") }
            total += data.count
            guard total <= Self.maxBytes else { throw Self.failure("一次导入的图片总大小不能超过 20 MB。") }
            let name = ((input["name"] ?? "图片") as NSString).deletingPathExtension
            return (data,try Self.inspect(data),name)
        }
        var results = [[String:String]]()
        do {
            for (data,type,name) in images { results.append(try write(data,type:type,name:name)) }
            return results
        } catch {
            for result in results {
                if let url = try? resolve(result["src"]!,token:requestedToken) { try? FileManager.default.removeItem(at:url) }
            }
            throw error
        }
    }
    private func write(_ data: Data, type: UTType, name: String) throws -> [String:String] {
        guard let document else { throw Self.failure("请先保存文档，再插入图片。") }
        let directoryName = document.deletingPathExtension().lastPathComponent + ".assets"
        let directory = document.deletingLastPathComponent().appendingPathComponent(directoryName,isDirectory:true)
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        let filename = UUID().uuidString.lowercased() + "." + Self.formats[type.identifier]!.0
        try data.write(to:directory.appendingPathComponent(filename),options:.withoutOverwriting)
        let encoded = [directoryName,filename].map { $0.addingPercentEncoding(withAllowedCharacters:CharacterSet.alphanumerics.union(CharacterSet(charactersIn:"-._~")))! }.joined(separator:"/")
        return ["src":"./" + encoded,"alt":name]
    }
}
