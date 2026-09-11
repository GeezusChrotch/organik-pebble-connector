import SwiftUI

struct SetupStep<Content: View>: View {
    let number: Int
    let title: String
    let detail: String
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(number). \(title)").font(.headline)
            Text(detail).font(.callout).foregroundStyle(.secondary)
            content()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
    }
}
