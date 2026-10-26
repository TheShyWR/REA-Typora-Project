import Foundation

final class WritingPreferences {
    static let initial: [String:Any] = ["theme":"light","fontFamily":"system","fontSize":16,"lineHeight":1.9,"contentWidth":900,"typewriter":false]
    private let defaults: UserDefaults
    private let key = "writingPreferences"
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    func load() -> [String:Any] {
        guard let saved = defaults.dictionary(forKey:key), Self.valid(saved) else { return Self.initial }
        return saved
    }
    func save(_ value: [String:Any]) throws -> [String:Any] {
        guard Self.valid(value) else {
            throw NSError(domain:"WritingPreferences",code:1,userInfo:[NSLocalizedDescriptionKey:"无效的写作设置，未保存。"])
        }
        defaults.set(value,forKey:key)
        return value
    }
    private static func valid(_ value: [String:Any]) -> Bool {
        guard Set(value.keys) == Set(initial.keys),
              let theme = value["theme"] as? String, ["light","dark","system"].contains(theme),
              let font = value["fontFamily"] as? String, ["system","serif","mono"].contains(font),
              let size = value["fontSize"] as? Int, [14,16,18,20,22].contains(size),
              let height = value["lineHeight"] as? Double, [1.6,1.9,2.2].contains(height),
              let width = value["contentWidth"] as? Int, [700,900,1100].contains(width),
              value["typewriter"] is Bool else { return false }
        return true
    }
}
