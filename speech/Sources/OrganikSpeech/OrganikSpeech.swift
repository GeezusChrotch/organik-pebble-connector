import Foundation
import FluidAudio

@main struct OrganikSpeech {
    static func main() async {
        do {
            let args = CommandLine.arguments
            guard args.count >= 3 else {throw NSError(domain:"OrganikSpeech",code:1)}
            let directory = URL(fileURLWithPath:args[2],isDirectory:true)
            if args[1] == "prepare" {
                _ = try await AsrModels.downloadAndLoad(to:directory,version:.v3)
                print("READY")
            } else if args[1] == "transcribe", args.count == 4 {
                let models = try await AsrModels.load(from:directory,version:.v3)
                let manager = AsrManager()
                try await manager.loadModels(models)
                var state = try TdtDecoderState(decoderLayers: 2)
                let result = try await manager.transcribe(URL(fileURLWithPath:args[3]),decoderState:&state)
                let data = try JSONSerialization.data(withJSONObject:["text":result.text])
                FileHandle.standardOutput.write(data)
            } else {throw NSError(domain:"OrganikSpeech",code:2)}
        } catch {
            // Never print recordings, transcripts, private paths or provider credentials.
            FileHandle.standardError.write(Data("Local dictation failed. Retry model setup in the Connector.\n".utf8))
            exit(1)
        }
    }
}
