import Foundation
@main struct CameraHealthTests {
 static func main() {
  let good: [String:Any] = ["service":"org.organikapps.pome.cameras", "protocol":1, "homeAuthorized":true, "running":true, "captureSupported":true, "enabledCameras":1]
  let ready=PomeCameraHealth(good);assert(ready.valid && ready.home && ready.running && ready.capture && ready.cameras)
  for key in ["service","protocol"] {var value=good;value.removeValue(forKey:key);let h=PomeCameraHealth(value);assert(!h.valid && !h.home && !h.running && !h.capture && !h.cameras)}
  var revoked=good;revoked["homeAuthorized"]=false;assert(!PomeCameraHealth(revoked).home)
  var paused=good;paused["running"]=false;assert(!PomeCameraHealth(paused).running)
  var empty=good;empty["enabledCameras"]=0;assert(!PomeCameraHealth(empty).cameras)
  assert(!PomeCameraHealth([:]).valid)
  print("PASS: camera health rejects wrong service/protocol and reports permission, pause and empty camera states")
 }
}
