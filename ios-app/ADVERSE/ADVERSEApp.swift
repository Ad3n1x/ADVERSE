import SwiftUI
import WebKit

@main
struct ADVERSEApp: App {
    var body: some Scene {
        WindowGroup {
            ADVERSEWebView()
                .preferredColorScheme(.dark)
        }
    }
}

struct ADVERSEWebView: View {
    var body: some View {
        WebView()
            .ignoresSafeArea(edges: [.bottom])
            .background(Color(red: 11 / 255, green: 13 / 255, blue: 16 / 255))
    }
}

private struct WebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.backgroundColor = UIColor(red: 11 / 255, green: 13 / 255, blue: 16 / 255, alpha: 1)
        webView.isOpaque = false
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: URL(string: "https://adverse-web.onrender.com/")!))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            }
        }
    }
}
