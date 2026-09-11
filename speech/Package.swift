// swift-tools-version: 6.2
import PackageDescription
let package = Package(name: "OrganikSpeech", platforms: [.macOS(.v14)], products: [.executable(name: "organik-speech", targets: ["OrganikSpeech"])], dependencies: [.package(url: "https://github.com/FluidInference/FluidAudio.git", revision: "ec07aabfa6990133fee483705432b4cbd4dbe7d5", traits: [])], targets: [.executableTarget(name: "OrganikSpeech", dependencies: [.product(name: "FluidAudio", package: "FluidAudio")])])
