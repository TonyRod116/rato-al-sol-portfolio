import Foundation

@main
struct ShadowScanlineTests {
  static func rectangle(_ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double,
                        reversed: Bool = false) -> [ShadowPoint] {
    let points = [ShadowPoint(x: x0, y: y0), ShadowPoint(x: x1, y: y0),
                  ShadowPoint(x: x1, y: y1), ShadowPoint(x: x0, y: y1)]
    return reversed ? Array(points.reversed()) : points
  }

  static func polygon(_ rings: [[ShadowPoint]]) -> ShadowPolygon {
    let points = rings.flatMap { $0 }
    return ShadowPolygon(rings: rings, minX: points.map(\.x).min()!, minY: points.map(\.y).min()!,
                         maxX: points.map(\.x).max()!, maxY: points.map(\.y).max()!)
  }

  static func main() throws {
    let width = 20, height = 20, scale = 2
    var mask = [UInt8](repeating: 0, count: width * height)
    let shaded = polygon([rectangle(-5, -5, 15, 15), rectangle(2, 2, 4, 4, reversed: true)])
    let overlap = polygon([rectangle(3, 3, 8, 8)])
    let roof = polygon([rectangle(6, 4, 9, 6), rectangle(7, 4.5, 8, 5.5, reversed: true)])
    scanShadowPolygons([shaded, overlap], into: &mask, width: width, height: height,
                       stride: width, scale: scale, value: 255, check: {})
    scanShadowPolygons([roof], into: &mask, width: width, height: height,
                       stride: width, scale: scale, value: 0, check: {})
    func pixel(_ x: Double, _ y: Double) -> UInt8 { mask[Int(y * 2) * width + Int(x * 2)] }
    precondition(pixel(1, 1) == 255, "shadow crossing the viewport")
    precondition(pixel(2.5, 2.5) == 0, "courtyard stays open")
    precondition(pixel(3.5, 3.5) == 255, "another shadow fills courtyard")
    precondition(pixel(6.5, 5) == 0, "roof clears shadow")
    precondition(pixel(7.5, 5) == 255, "courtyard in roof remains shaded")

    var shapes = [UInt8](repeating: 0, count: width * height)
    let concave = polygon([[ShadowPoint(x: 1, y: 1), ShadowPoint(x: 5, y: 1),
                            ShadowPoint(x: 5, y: 3), ShadowPoint(x: 3, y: 3),
                            ShadowPoint(x: 3, y: 5), ShadowPoint(x: 1, y: 5)]])
    scanShadowPolygons([concave], into: &shapes, width: width, height: height,
                       stride: width, scale: scale, value: 255, check: {})
    precondition(shapes[3 * width + 9] == 255, "upper concave arm")
    precondition(shapes[9 * width + 3] == 255, "lower concave arm")
    precondition(shapes[9 * width + 9] == 0, "empty concave corner")
    shapes = [UInt8](repeating: 0, count: width * height)
    let diagonal = polygon([[ShadowPoint(x: 0, y: 0), ShadowPoint(x: 8, y: 0), ShadowPoint(x: 0, y: 8)]])
    scanShadowPolygons([diagonal], into: &shapes, width: width, height: height,
                       stride: width, scale: scale, value: 255, check: {})
    precondition(shapes[2 * width + 2] == 255, "diagonal triangle interior")
    precondition(shapes[12 * width + 12] == 0, "diagonal triangle exterior")

    // Dense, long shadows must still consult the cancellation callback.
    let longShadow = polygon([rectangle(-200, 0, 210, 10)])
    let dense = Array(repeating: longShadow, count: 10_000)
    enum Cancelled: Error { case requested }
    var checks = 0
    do {
      try scanShadowPolygons(dense, into: &mask, width: width, height: height,
                             stride: width, scale: scale, value: 255) {
        checks += 1
        if checks == 5 { throw Cancelled.requested }
      }
      fatalError("scan should stop when cancelled")
    } catch Cancelled.requested {
      precondition(checks == 5)
    }
    // Complete a dense synthetic low-sun scene, with long overlapping
    // polygons. Report timing for the test machine without asserting it
    // predicts the performance of an iPhone.
    let benchWidth = 512, benchHeight = 512
    var benchMask = [UInt8](repeating: 0, count: benchWidth * benchHeight)
    let strips = (0..<5000).map { i in
      let y = Double(i % 220)
      return polygon([rectangle(-100, y, 400, y + 30)])
    }
    let started = Date()
    scanShadowPolygons(strips, into: &benchMask, width: benchWidth, height: benchHeight,
                       stride: benchWidth, scale: 2, value: 255, check: {})
    precondition(benchMask.contains(255), "dense scene produces visible shadow")
    let elapsed = Date().timeIntervalSince(started)
    print("Synthetic low-sun scene: \(strips.count) polygons in \(elapsed)s")
    print("Shadow scanline geometry and cancellation tests passed")
  }
}
