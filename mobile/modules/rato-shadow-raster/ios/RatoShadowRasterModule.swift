import Foundation
import CoreGraphics
import ImageIO
import ExpoModulesCore

private enum ShadowRasterError: Error {
  case invalidInput, invalidPath, cancelled, complexity, storage, unavailable
}

public final class RatoShadowRasterModule: Module {
  private let jobsLock = NSLock()
  private var jobs: [String: Bool] = [:] // Present while the unique job is active.
  private let renderQueue = DispatchQueue(label: "rato.shadow.raster", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("RatoShadowRaster")

    // Registration happens before queuing the async job. Cancellation is
    // synchronous and can mark a queued or running job without waiting for
    // the background rendering queue.
    Function("register") { (id: String) -> Bool in
      guard !id.isEmpty, id.utf8.count <= 128 else { return false }
      self.jobsLock.lock()
      defer { self.jobsLock.unlock() }
      guard self.jobs[id] == nil, self.jobs.count < 64 else { return false }
      self.jobs[id] = false
      return true
    }

    Function("cancel") { (id: String) in
      self.jobsLock.lock()
      self.jobs.removeValue(forKey: id)
      self.jobsLock.unlock()
    }

    AsyncFunction("render") { (id: String, shadow: String, roof: String, width: Int, height: Int, destination: String) -> String in
      defer {
        self.jobsLock.lock()
        self.jobs.removeValue(forKey: id)
        self.jobsLock.unlock()
      }
      let deadline = ProcessInfo.processInfo.systemUptime + 6
      do {
        try self.checkActive(id, deadline: deadline)
        guard width > 0, height > 0, width <= 768, height <= 768 else { throw ShadowRasterError.invalidInput }
        guard shadow.utf8.count <= 4_000_000, roof.utf8.count <= 4_000_000,
          shadow.utf8.count + roof.utf8.count <= 6_000_000 else { throw ShadowRasterError.complexity }
        let target = try self.cacheTarget(destination)
        let shadowPaths = try self.parsePaths(shadow, id: id, deadline: deadline)
        let roofPaths = try self.parsePaths(roof, id: id, deadline: deadline)
        try self.checkActive(id, deadline: deadline)

        // Scan-convert each polygon into the opaque mask. Unlike a native
        // vector fill, every row is bounded and can check cancellation; long,
        // overlapping sunrise shadows cannot trap a single drawing call.
        let scale = 2
        let pixelWidth = width * scale, pixelHeight = height * scale
        let maskStride = (pixelWidth + 15) & ~15
        var mask = [UInt8](repeating: 0, count: maskStride * pixelHeight)
        try scanShadowPolygons(shadowPaths, into: &mask, width: pixelWidth, height: pixelHeight,
          stride: maskStride, scale: scale, value: 255) { try self.checkActive(id, deadline: deadline) }
        try scanShadowPolygons(roofPaths, into: &mask, width: pixelWidth, height: pixelHeight,
          stride: maskStride, scale: scale, value: 0) { try self.checkActive(id, deadline: deadline) }
        try self.checkActive(id, deadline: deadline)
        var rgba = [UInt8](repeating: 0, count: pixelWidth * pixelHeight * 4)
        for row in 0..<pixelHeight {
          if row % 16 == 0 { try self.checkActive(id, deadline: deadline) }
          for column in 0..<pixelWidth {
            let alpha = (Int(mask[row * maskStride + column]) * 66 + 127) / 255
            let index = (row * pixelWidth + column) * 4
            rgba[index] = UInt8((48 * alpha + 127) / 255)
            rgba[index + 1] = UInt8((67 * alpha + 127) / 255)
            rgba[index + 2] = UInt8((73 * alpha + 127) / 255)
            rgba[index + 3] = UInt8(alpha)
          }
        }
        guard let provider = CGDataProvider(data: Data(rgba) as CFData),
          let image = CGImage(width: pixelWidth, height: pixelHeight, bitsPerComponent: 8, bitsPerPixel: 32,
            bytesPerRow: pixelWidth * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue),
            provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
        else { throw ShadowRasterError.unavailable }
        let png = NSMutableData()
        guard let writer = CGImageDestinationCreateWithData(png as CFMutableData, "public.png" as CFString, 1, nil)
        else { throw ShadowRasterError.unavailable }
        CGImageDestinationAddImage(writer, image, nil)
        guard CGImageDestinationFinalize(writer) else { throw ShadowRasterError.storage }
        try self.checkActive(id, deadline: deadline)
        do {
          try Data(referencing: png).write(to: target, options: .atomic)
          try self.checkActive(id, deadline: deadline)
        } catch {
          try? FileManager.default.removeItem(at: target)
          throw error
        }
        return target.absoluteString
      } catch ShadowRasterError.complexity {
        // Explicitly distinguish an exhausted work budget from an ordinary
        // renderer failure, so JS does not start an equally expensive retry.
        return "rato-shadow-complexity"
      } catch ShadowRasterError.invalidPath {
        return "rato-shadow-geometry"
      }
    }.runOnQueue(renderQueue)
  }

  private func checkActive(_ id: String, deadline: TimeInterval) throws {
    jobsLock.lock()
    let active = jobs[id] == false
    jobsLock.unlock()
    if !active { throw ShadowRasterError.cancelled }
    if ProcessInfo.processInfo.systemUptime > deadline { throw ShadowRasterError.complexity }
  }

  // Native output is limited to uniquely named files in the app cache.
  private func cacheTarget(_ value: String) throws -> URL {
    guard let url = URL(string: value), url.isFileURL,
      url.lastPathComponent.hasPrefix("rato-native-shadow-"), url.pathExtension == "png",
      let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
      throw ShadowRasterError.invalidInput
    }
    let parent = url.deletingLastPathComponent().standardizedFileURL.resolvingSymlinksInPath().path
    let cache = root.standardizedFileURL.resolvingSymlinksInPath().path
    guard parent == cache || parent.hasPrefix(cache + "/") else { throw ShadowRasterError.invalidInput }
    return URL(fileURLWithPath: parent, isDirectory: true).appendingPathComponent(url.lastPathComponent)
  }

  // Each | separates complete polygons; holes remain in their parent path.
  // Never evaluate arbitrary SVG. Parsing also checks cancellation regularly.
  private func parsePaths(_ input: String, id: String, deadline: TimeInterval) throws -> [ShadowPolygon] {
    let bytes = Array(input.utf8)
    var paths: [ShadowPolygon] = [], rings: [[ShadowPoint]] = [], points: [ShadowPoint] = []
    var index = 0, count = 0, open = false, groupCommands = 0
    var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
    func appendPolygon() {
      paths.append(ShadowPolygon(rings: rings, minX: minX, minY: minY, maxX: maxX, maxY: maxY))
      rings = []
      minX = .infinity; minY = .infinity; maxX = -.infinity; maxY = -.infinity
    }
    func number(untilComma: Bool) throws -> Double {
      let start = index
      while index < bytes.count {
        let c = bytes[index]
        if untilComma ? c == 44 : (c == 77 || c == 76 || c == 90) { break }
        index += 1
      }
      guard index > start, index - start <= 32,
        let value = Double(String(decoding: bytes[start..<index], as: UTF8.self)),
        value.isFinite else { throw ShadowRasterError.invalidPath }
      // Implausibly large projected coordinates may make native clipping
      // disproportionately expensive. They cannot be safely simplified here.
      guard abs(value) <= 65_536 else { throw ShadowRasterError.complexity }
      return value
    }
    while index < bytes.count {
      if count % 1024 == 0 { try checkActive(id, deadline: deadline) }
      count += 1
      guard count <= 300_000 else { throw ShadowRasterError.complexity }
      let command = bytes[index]
      index += 1
      if command != 124 {
        groupCommands += 1
        guard groupCommands <= 1_024 else { throw ShadowRasterError.complexity }
      }
      if command == 90 {
        guard open, points.count >= 3 else { throw ShadowRasterError.invalidPath }
        rings.append(points); points = []; open = false
      } else if command == 124 {
        guard !open, !rings.isEmpty, index < bytes.count else { throw ShadowRasterError.invalidPath }
        appendPolygon(); groupCommands = 0
      } else if command == 77 || command == 76 {
        if command == 77 { guard !open else { throw ShadowRasterError.invalidPath } }
        else { guard open else { throw ShadowRasterError.invalidPath } }
        let x = try number(untilComma: true)
        guard index < bytes.count, bytes[index] == 44 else { throw ShadowRasterError.invalidPath }
        index += 1
        let y = try number(untilComma: false)
        points.append(ShadowPoint(x: x, y: y))
        minX = min(minX, x); minY = min(minY, y); maxX = max(maxX, x); maxY = max(maxY, y)
        if command == 77 { open = true }
      } else { throw ShadowRasterError.invalidPath }
    }
    guard !open else { throw ShadowRasterError.invalidPath }
    if !rings.isEmpty { appendPolygon() }
    return paths
  }
}
