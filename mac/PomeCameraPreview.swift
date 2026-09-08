import AppKit

struct PomeCameraItem: Identifiable {
    let id: String, name: String, interval: Int
    init?(_ value: [String: Any]) {
        guard let id = value["id"] as? String, UUID(uuidString: id) != nil,
              let name = value["name"] as? String, let interval = value["interval"] as? Int else { return nil }
        self.id = id; self.name = name; self.interval = interval
    }
}

func decodePomeCameraPreview(_ value: [String: Any]) -> NSImage? {
    guard value["encoding"] as? String == "gcolor6", let width = value["width"] as? Int,
          let height = value["height"] as? Int, (1...2048).contains(width), (1...228).contains(height),
          let text = value["pixels"] as? String, text.count <= 150_000,
          let data = Data(base64Encoded: text), data.count == (width * height * 6 + 7) / 8,
          data.count <= 110_000,
          let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
              bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
              colorSpaceName: .deviceRGB, bytesPerRow: width * 4, bitsPerPixel: 32),
          let output = bitmap.bitmapData else { return nil }
    let packed = [UInt8](data)
    for index in 0..<(width * height) {
        let bit = index * 6, byte = bit / 8, shift = bit % 8
        let word = UInt16(packed[byte]) << 8 | (byte + 1 < packed.count ? UInt16(packed[byte + 1]) : 0)
        let color = UInt8((word >> (10 - shift)) & 63)
        output[index * 4] = ((color >> 4) & 3) * 85
        output[index * 4 + 1] = ((color >> 2) & 3) * 85
        output[index * 4 + 2] = (color & 3) * 85
        output[index * 4 + 3] = 255
    }
    let image = NSImage(size: NSSize(width: width, height: height)); image.addRepresentation(bitmap)
    return image
}
