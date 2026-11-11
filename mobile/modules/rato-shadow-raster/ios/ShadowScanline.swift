import Foundation

struct ShadowPoint {
  let x: Double
  let y: Double
}

struct ShadowPolygon {
  let rings: [[ShadowPoint]]
  let minX: Double
  let minY: Double
  let maxX: Double
  let maxY: Double
}

private struct ShadowCrossing {
  let x: Double
  let winding: Int
}

// Each polygon is filled into the same binary mask using nonzero winding;
// successive polygons form a union and the roof pass clears the same mask.
// Work and cancellation checks are bounded to one polygon or sixteen rows.
func scanShadowPolygons(_ polygons: [ShadowPolygon], into mask: inout [UInt8],
  width: Int, height: Int, stride: Int, scale: Int, value: UInt8,
  check: () throws -> Void) rethrows {
  try mask.withUnsafeMutableBytes { buffer in
    guard let base = buffer.baseAddress else { return }
    for (index, polygon) in polygons.enumerated() {
      if index % 16 == 0 { try check() }
      if polygon.maxX <= 0 || polygon.minX >= Double(width) / Double(scale) ||
         polygon.maxY <= 0 || polygon.minY >= Double(height) / Double(scale) { continue }
      let firstRow = max(0, Int(ceil(polygon.minY * Double(scale) - 0.5)))
      let lastRow = min(height, Int(ceil(polygon.maxY * Double(scale) - 0.5)))
      if firstRow >= lastRow { continue }
      for row in firstRow..<lastRow {
        if row % 16 == 0 { try check() }
        let y = (Double(row) + 0.5) / Double(scale)
        var crossings: [ShadowCrossing] = []
        for ring in polygon.rings {
          for i in 0..<ring.count {
            let a = ring[i], b = ring[(i + 1) % ring.count]
            if (a.y <= y && b.y > y) || (b.y <= y && a.y > y) {
              let x = a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)
              crossings.append(ShadowCrossing(x: x, winding: b.y > a.y ? 1 : -1))
            }
          }
        }
        crossings.sort { $0.x < $1.x }
        var winding = 0, previousX = 0.0
        for crossing in crossings {
          if winding != 0 {
            let first = max(0, min(width, Int(ceil(previousX * Double(scale) - 0.5))))
            let end = max(0, min(width, Int(ceil(crossing.x * Double(scale) - 0.5))))
            if first < end {
              base.advanced(by: row * stride + first).assumingMemoryBound(to: UInt8.self)
                .update(repeating: value, count: end - first)
            }
          }
          winding += crossing.winding
          previousX = crossing.x
        }
      }
    }
  }
}
