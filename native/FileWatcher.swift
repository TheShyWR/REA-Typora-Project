import Foundation
import Darwin

/// Watch directory entries and the current inode (including in-place writes).
final class FileWatcher {
    var onChange: (() -> Void)?
    private var sources: [DispatchSourceFileSystemObject] = []
    private var paths = Set<String>()
    private var generation = 0
    private var pending: DispatchWorkItem?
    func watch(_ urls: Set<URL>, force: Bool = false) {
        let next = Set(urls.map(\.path))
        if !force && next == paths { return }
        generation += 1
        let version = generation
        sources.forEach { $0.cancel() }; sources.removeAll(); paths = next
        for path in next {
            let fd = Darwin.open(path,O_EVTONLY)
            guard fd >= 0 else { continue }
            let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor:fd,eventMask:[.write,.delete,.rename,.attrib,.extend,.link,.revoke],queue:.main)
            source.setCancelHandler { Darwin.close(fd) }
            source.setEventHandler { [weak self] in
                guard let self, self.generation == version else { return }
                self.pending?.cancel()
                let task = DispatchWorkItem { [weak self] in self?.onChange?() }
                self.pending = task
                DispatchQueue.main.asyncAfter(deadline:.now() + 0.25,execute:task)
            }
            sources.append(source); source.resume()
        }
    }
    deinit { pending?.cancel(); sources.forEach { $0.cancel() } }
}
