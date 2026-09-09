import Foundation
import HomeKit

// Native replacement for the small API consumed by Pome. Lives inside the
// existing entitled helper; no second Home manager, server, or installation.
final class HomeControl {
    typealias Reply = (Int, Any) -> Void
    var manager: () -> HMHomeManager?
    private var busy = Set<String>()
    init(manager: @escaping () -> HMHomeManager?) { self.manager = manager }

    struct Device {
        let home: HMHome
        let accessory: HMAccessory
        let service: HMService
        let type: String
        var id: String { service.uniqueIdentifier.uuidString }
        var name: String { service.name.isEmpty ? accessory.name : service.name }
        var room: String { accessory.room?.name ?? home.roomForEntireHome().name }
        func characteristic(_ type: String) -> HMCharacteristic? {
            service.characteristics.first { $0.characteristicType == type }
        }
    }
    static let types: [String: String] = [
        HMServiceTypeLightbulb: "light", HMServiceTypeFan: "fan", HMServiceTypeVentilationFan: "fan",
        HMServiceTypeSwitch: "switch", HMServiceTypeOutlet: "outlet",
        HMServiceTypeWindowCovering: "blinds", HMServiceTypeAirPurifier: "air-purifier",
        HMServiceTypeHumidifierDehumidifier: "humidifier", HMServiceTypeThermostat: "thermostat",
        HMServiceTypeHeaterCooler: "thermostat", HMServiceTypeLockMechanism: "lock",
        HMServiceTypeGarageDoorOpener: "garage-door", HMServiceTypeTemperatureSensor: "temperature-sensor",
        HMServiceTypeHumiditySensor: "humidity-sensor", HMServiceTypeLightSensor: "light-sensor",
        HMServiceTypeContactSensor: "contact-sensor", HMServiceTypeMotionSensor: "motion-sensor",
        HMServiceTypeOccupancySensor: "occupancy-sensor", HMServiceTypeLeakSensor: "leak-sensor",
        HMServiceTypeSmokeSensor: "smoke-sensor", HMServiceTypeCarbonMonoxideSensor: "carbon-monoxide-sensor",
        HMServiceTypeCarbonDioxideSensor: "carbon-dioxide-sensor", HMServiceTypeAirQualitySensor: "air-quality-sensor"
    ]
    static let fields: [String: String] = [
        HMCharacteristicTypePowerState: "on", HMCharacteristicTypeActive: "on",
        HMCharacteristicTypeBrightness: "brightness", HMCharacteristicTypeHue: "hue",
        HMCharacteristicTypeSaturation: "saturation", HMCharacteristicTypeRotationSpeed: "speed",
        HMCharacteristicTypeCurrentPosition: "position", HMCharacteristicTypeTargetPosition: "targetPosition",
        HMCharacteristicTypeCurrentTemperature: "temperature", HMCharacteristicTypeCurrentRelativeHumidity: "humidity",
        HMCharacteristicTypeCurrentLightLevel: "lightLevel", HMCharacteristicTypeCarbonDioxideLevel: "carbonDioxideLevel",
        HMCharacteristicTypeCarbonMonoxideLevel: "carbonMonoxideLevel", HMCharacteristicTypeContactState: "detected",
        HMCharacteristicTypeMotionDetected: "detected", HMCharacteristicTypeOccupancyDetected: "detected",
        HMCharacteristicTypeLeakDetected: "detected", HMCharacteristicTypeSmokeDetected: "detected",
        HMCharacteristicTypeCarbonMonoxideDetected: "detected", HMCharacteristicTypeCarbonDioxideDetected: "detected",
        HMCharacteristicTypeAirQuality: "value"
    ]
    private func devices(_ homes: [HMHome]) -> [Device] {
        homes.flatMap { home in home.accessories.flatMap { accessory in
            accessory.services.compactMap { service in
                Self.types[service.serviceType].map { Device(home: home, accessory: accessory, service: service, type: $0) }
            }
        }}.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
    private func item(_ d: Device) -> [String: Any] {
        var state: [String: Any] = [:]
        for c in d.service.characteristics {
            guard let key = Self.fields[c.characteristicType], let value = c.value else { continue }
            if key == "on" || key == "detected", let number = value as? NSNumber {
                state[key] = number.boolValue
            } else if c.characteristicType == HMCharacteristicTypeAirQuality, let number = value as? NSNumber {
                let names = ["Unknown", "Excellent", "Good", "Fair", "Inferior", "Poor"]
                state[key] = names.indices.contains(number.intValue) ? names[number.intValue] : "Unknown"
            } else { state[key] = value }
        }
        return ["name": d.name, "type": d.type, "room": d.room,
                "serviceId": d.id, "homeId": d.home.uniqueIdentifier.uuidString,
                "reachable": d.accessory.isReachable, "state": state]
    }
    // Refresh with bounded concurrency. Failed reads are explicitly unavailable,
    // never silently presented as a fresh successful sensor sample.
    private func refresh(_ ds: [Device], done: @escaping ([[String: Any]]) -> Void) {
        let jobs = ds.flatMap { d in d.service.characteristics.filter {
            Self.fields[$0.characteristicType] != nil && $0.properties.contains(HMCharacteristicPropertyReadable)
        }.map { (d.id, $0) } }
        var cursor = 0, pending = 0, ended = false, failed = Set<String>()
        func finish() {
            guard !ended else { return }; ended = true
            done(ds.map { d in var result = self.item(d)
                if failed.contains(d.id) { result["reachable"] = false; result["state"] = [String: Any]() }
                return result
            })
        }
        func next() {
            guard !ended else { return }
            while pending < 8 && cursor < jobs.count {
                let (id, c) = jobs[cursor]; cursor += 1; pending += 1
                c.readValue { error in
                    DispatchQueue.main.async {
                        guard !ended else { return }
                        if error != nil { failed.insert(id) }
                        pending -= 1; next()
                    }
                }
            }
            if cursor == jobs.count && pending == 0 { finish() }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
            guard !ended else { return }
            // At deadline we cannot certify which cached values are current.
            ds.forEach { failed.insert($0.id) }; finish()
        }
        next()
    }
    private func fail(_ reply: Reply, _ code: Int, _ message: String) {
        reply(code, ["status": "error", "error": message, "message": message])
    }
    private func scenes(_ home: HMHome) -> [HMActionSet] {
        home.actionSets.filter { $0.actionSetType != HMActionSetTypeTriggerOwned && !$0.actions.isEmpty }
    }
    private func sceneItem(_ scene: HMActionSet) -> [String: Any] {
        let actions = scene.actions.compactMap { $0 as? HMCharacteristicWriteAction<NSCopying> }
        var state: [String: Any] = [:]
        if !actions.isEmpty && actions.count == scene.actions.count && actions.allSatisfy({ $0.characteristic.value != nil }) {
            state["on"] = actions.allSatisfy { ($0.characteristic.value as? NSObject)?.isEqual($0.targetValue) == true }
        }
        return ["name": scene.name, "id": scene.uniqueIdentifier.uuidString, "kind": "scene", "state": state]
    }
    func route(_ method: String, _ raw: String, reply: @escaping Reply) {
        guard let manager = manager(), manager.authorizationStatus.contains(.authorized) else {
            fail(reply, 403, "Allow Home access in Organik Apps Connector."); return
        }
        let homes = manager.homes
        guard !homes.isEmpty else { fail(reply, 503, "HomeKit is loading or no homes are available."); return }
        // Split BEFORE percent decoding: room/device names can contain '/'.
        let encoded = raw.components(separatedBy: "?")[0].split(separator: "/", omittingEmptySubsequences: true)
        let parts = encoded.compactMap { String($0).removingPercentEncoding }
        guard parts.count == encoded.count, parts.first == "home", parts.count >= 2 else {
            fail(reply, 400, "Invalid HomeKit request"); return
        }
        let path = Array(parts.dropFirst()), action = path[0], ds = devices(homes)
        if action == "status", path.count == 1, method == "GET" {
            reply(200, ["status": "success", "backend": "homekit", "protocol": 1,
                        "devices": ds.count, "homes": homes.count]); return
        }
        if action == "list", path.count == 2, method == "GET" {
            switch path[1] {
            case "rooms":
                let rooms = homes.flatMap { home -> [[String: Any]] in
                    let rooms = home.rooms + (home.accessories.contains { $0.room == home.roomForEntireHome() } ? [home.roomForEntireHome()] : [])
                    return rooms.map { ["name": $0.name, "id": $0.uniqueIdentifier.uuidString] }
                }.sorted { ($0["name"] as! String).localizedStandardCompare($1["name"] as! String) == .orderedAscending }
                reply(200, rooms)
            case "devices": reply(200, ds.map(item))
            case "scenes":
                reply(200, homes.flatMap { self.scenes($0).map(self.sceneItem) }
                    .sorted { ($0["name"] as! String).localizedStandardCompare($1["name"] as! String) == .orderedAscending })
            default: fail(reply, 404, "Unknown list")
            }; return
        }
        if action == "debug", path.count == 2, method == "GET" {
            reply(200, ds.filter { $0.name == path[1] }.map {
                ["serviceId": $0.id, "serviceTypeLabel": $0.type, "room": $0.room]
            }); return
        }
        if action == "info", method == "GET" {
            let target = Array(path.dropFirst())
            if target.count == 1 {
                let rooms = homes.flatMap { $0.rooms + [$0.roomForEntireHome()] }.filter { $0.name == target[0] }
                if rooms.count > 1 { fail(reply, 409, "Room name is ambiguous across homes"); return }
                if rooms.count == 1 { refresh(ds.filter { $0.room == target[0] }) { reply(200, $0) }; return }
            }
            let matches = resolve(target, ds)
            guard matches.count == 1 else { fail(reply, matches.isEmpty ? 404 : 409, "Device missing or ambiguous"); return }
            refresh(matches) { reply(200, $0[0]) }; return
        }
        guard method == "POST" else { fail(reply, 405, "Controls require POST"); return }
        if action == "scene", path.count == 2 {
            let scenes = homes.flatMap { h in self.scenes(h).filter { $0.name == path[1] || $0.uniqueIdentifier.uuidString == path[1] }.map { (h, $0) } }
            guard scenes.count == 1 else { fail(reply, scenes.isEmpty ? 404 : 409, "Scene missing or ambiguous"); return }
            perform(key: scenes[0].1.uniqueIdentifier.uuidString, reply: reply) { finish in
                scenes[0].0.executeActionSet(scenes[0].1, completionHandler: finish)
            }; return
        }
        let counts = ["toggle": 0, "on": 0, "off": 0, "brightness": 1, "color": 2, "speed": 1, "position": 1]
        guard let count = counts[action], path.count > count + 1 else { fail(reply, 404, "Unknown control"); return }
        let values = path.dropFirst().prefix(count).compactMap(Double.init)
        guard values.count == count, values.allSatisfy({ $0.isFinite }) else { fail(reply, 400, "Invalid control value"); return }
        let matches = resolve(Array(path.dropFirst(count + 1)), ds)
        guard matches.count == 1 else { fail(reply, matches.isEmpty ? 404 : 409, "Device missing or ambiguous"); return }
        let d = matches[0]
        guard d.accessory.isReachable else { fail(reply, 503, "Device is unreachable"); return }
        let power = d.characteristic(HMCharacteristicTypePowerState) ?? d.characteristic(HMCharacteristicTypeActive)
        var writes: [(HMCharacteristic, Any)] = []
        func add(_ type: String, _ value: Double, _ range: ClosedRange<Double>) -> Bool {
            guard range.contains(value), let c = d.characteristic(type), c.properties.contains(HMCharacteristicPropertyWritable) else { return false }
            if let min = c.metadata?.minimumValue?.doubleValue, value < min { return false }
            if let max = c.metadata?.maximumValue?.doubleValue, value > max { return false }
            writes.append((c, NSNumber(value: value))); return true
        }
        var valid = false
        switch action {
        case "on", "off", "toggle":
            if ["light", "fan", "switch", "outlet", "humidifier", "dehumidifier", "air-purifier"].contains(d.type),
               let power, power.properties.contains(HMCharacteristicPropertyWritable) {
                valid = true
                if action != "toggle" { writes.append((power, NSNumber(value: action == "on" ? 1 : 0))) }
            }
        case "brightness": valid = d.type == "light" && add(HMCharacteristicTypeBrightness, values[0], 0...100)
        case "color": valid = d.type == "light" && add(HMCharacteristicTypeHue, values[0], 0...360) && add(HMCharacteristicTypeSaturation, values[1], 0...100)
        case "speed": valid = d.type == "fan" && add(HMCharacteristicTypeRotationSpeed, values[0], 0...100)
        case "position": valid = d.type == "blinds" && add(HMCharacteristicTypeTargetPosition, values[0], 0...100)
        default: break
        }
        guard valid else { fail(reply, 422, "This device does not support that control or value"); return }
        // Preserve Pome's existing brightness behavior: nonzero wakes a light;
        // zero turns it off. Color and fan speed do not implicitly power on.
        if action == "brightness", let power {
            guard power.properties.contains(HMCharacteristicPropertyWritable) else {
                fail(reply, 422, "Light power is read only"); return
            }
            writes.insert((power, NSNumber(value: values[0] > 0 ? 1 : 0)), at: 0)
        }
        let deadline = Date().addingTimeInterval(9)
        perform(key: d.id, reply: reply) { finish in
            if action == "toggle", let power {
                power.readValue { error in
                    guard Date() < deadline else { finish(self.expired()); return }
                    guard error == nil, let value = power.value as? NSNumber else {
                        finish(error ?? NSError(domain: "HomeKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot read power state"])); return
                    }
                    power.writeValue(NSNumber(value: value.boolValue ? 0 : 1), completionHandler: finish)
                }
            } else { self.write(writes, deadline: deadline, finish: finish) }
        }
    }
    private func resolve(_ target: [String], _ ds: [Device]) -> [Device] {
        if target.count == 1 { return ds.filter { $0.id.caseInsensitiveCompare(target[0]) == .orderedSame } }
        if target.count == 2 { return ds.filter { $0.room == target[0] && $0.name == target[1] } }
        return []
    }
    private func expired() -> Error {
        NSError(domain: "HomeKit", code: 504, userInfo: [NSLocalizedDescriptionKey: "Command expired; refresh before retrying."])
    }
    private func write(_ writes: [(HMCharacteristic, Any)], deadline: Date, finish: @escaping (Error?) -> Void) {
        guard let first = writes.first else { finish(nil); return }
        guard Date() < deadline else { finish(expired()); return }
        first.0.writeValue(first.1) { error in
            if let error { finish(error) } else { self.write(Array(writes.dropFirst()), deadline: deadline, finish: finish) }
        }
    }
    private func perform(key: String, reply: @escaping Reply, operation: (@escaping (Error?) -> Void) -> Void) {
        guard !busy.contains(key) else { fail(reply, 409, "Device command is still pending"); return }
        busy.insert(key)
        var replied = false
        // Timeout is an uncertain result, not permission to resend a toggle.
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
            guard !replied else { return }; replied = true
            self.fail(reply, 504, "HomeKit command timed out; result is unknown. Refresh before retrying.")
        }
        operation { error in DispatchQueue.main.async {
            self.busy.remove(key)
            guard !replied else { return }; replied = true
            if let error { self.fail(reply, 502, error.localizedDescription) }
            else { reply(200, ["status": "success"]) }
        }}
    }
}
