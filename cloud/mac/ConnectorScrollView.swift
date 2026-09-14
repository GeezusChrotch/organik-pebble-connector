import SwiftUI

/// Constrain the content to the detail viewport before asking text to wrap.
/// A ScrollView otherwise permits wide ideal sizes from nested GroupBoxes.
struct ConnectorScrollView<Content: View>: View {
    var embedded = false
    @ViewBuilder var content: () -> Content
    var body: some View {
        if embedded { content() } else { GeometryReader { geometry in
            ScrollView {
                content()
                    .frame(width: max(0, min(850, geometry.size.width - 48)), alignment: .leading)
                    .padding(24)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
        }
        // Clip at the detail viewport, including its top safe-area boundary.
        // Scrolled content must never paint behind the window toolbar.
        .clipped()
        }
    }
}
