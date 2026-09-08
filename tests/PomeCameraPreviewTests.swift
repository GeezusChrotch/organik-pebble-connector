import AppKit
@main struct CameraPreviewTests {
    static func main() {
        let value: [String: Any] = ["encoding": "gcolor6", "width": 4, "height": 1, "pixels": Data([0xc0, 0xc0, 0xff]).base64EncodedString()]
        let image = decodePomeCameraPreview(value)!
        let bitmap = image.representations.first as! NSBitmapImageRep
        let pixels = bitmap.bitmapData!
        assert(Array(UnsafeBufferPointer(start: pixels, count: 16)) == [255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,255,255])
        var invalid = value; invalid["width"] = 2049; assert(decodePomeCameraPreview(invalid) == nil)
        invalid = value; invalid["pixels"] = "AA=="; assert(decodePomeCameraPreview(invalid) == nil)
        invalid = value; invalid["encoding"] = "unknown"; assert(decodePomeCameraPreview(invalid) == nil)
        print("PASS: packed camera pixels decode accurately; invalid dimensions, payload length and encoding rejected")
    }
}
