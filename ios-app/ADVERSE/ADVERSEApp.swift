import SwiftUI
import UIKit
import WebKit

private enum ADVERSEStyle {
    static let background = UIColor(red: 8 / 255, green: 11 / 255, blue: 14 / 255, alpha: 1)
    static let lime = UIColor(red: 185 / 255, green: 255 / 255, blue: 75 / 255, alpha: 1)
    static let homeURL = URL(string: "https://adverse-web.onrender.com/")!
}

@main
struct ADVERSEApp: App {
    var body: some Scene {
        WindowGroup {
            ADVERSERootView()
                .preferredColorScheme(.dark)
        }
    }
}

private struct ADVERSERootView: View {
    var body: some View {
        ADVERSEBrowser()
            .background(Color(red: 8 / 255, green: 11 / 255, blue: 14 / 255))
            .ignoresSafeArea(edges: .bottom)
    }
}

private struct ADVERSEBrowser: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.backgroundColor = ADVERSEStyle.background
        webView.isOpaque = false
        webView.scrollView.backgroundColor = ADVERSEStyle.background
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = true
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        context.coordinator.attach(to: webView)
        context.coordinator.loadHomeIfNeeded()
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private weak var webView: WKWebView?
        private var errorOverlay: UIView?
        private var spinner: UIActivityIndicatorView?
        private var progressView: UIProgressView?
        private var progressObservation: NSKeyValueObservation?
        private var hasLoadedInitialPage = false

        func attach(to webView: WKWebView) {
            self.webView = webView
            webView.addObserver(self, forKeyPath: #keyPath(WKWebView.isLoading), options: [.new], context: nil)
            setupLoadingUI(in: webView)
            progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] view, _ in
                DispatchQueue.main.async {
                    self?.progressView?.progress = Float(view.estimatedProgress)
                    self?.progressView?.isHidden = view.estimatedProgress >= 1
                }
            }
        }

        func loadHomeIfNeeded() {
            guard !hasLoadedInitialPage, let webView else { return }
            hasLoadedInitialPage = true
            webView.load(URLRequest(url: ADVERSEStyle.homeURL, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
        }

        private func setupLoadingUI(in webView: WKWebView) {
            let bar = UIProgressView(progressViewStyle: .bar)
            bar.progressTintColor = ADVERSEStyle.lime
            bar.trackTintColor = .clear
            bar.translatesAutoresizingMaskIntoConstraints = false
            webView.addSubview(bar)
            NSLayoutConstraint.activate([
                bar.topAnchor.constraint(equalTo: webView.safeAreaLayoutGuide.topAnchor),
                bar.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
                bar.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
                bar.heightAnchor.constraint(equalToConstant: 2)
            ])
            progressView = bar

            let activity = UIActivityIndicatorView(style: .large)
            activity.color = ADVERSEStyle.lime
            activity.translatesAutoresizingMaskIntoConstraints = false
            webView.addSubview(activity)
            NSLayoutConstraint.activate([
                activity.centerXAnchor.constraint(equalTo: webView.centerXAnchor),
                activity.centerYAnchor.constraint(equalTo: webView.centerYAnchor)
            ])
            spinner = activity
        }

        override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
            guard keyPath == #keyPath(WKWebView.isLoading), let webView else { return }
            DispatchQueue.main.async { [weak self] in
                if webView.isLoading {
                    self?.spinner?.startAnimating()
                } else {
                    self?.spinner?.stopAnimating()
                }
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            spinner?.stopAnimating()
            errorOverlay?.removeFromSuperview()
            errorOverlay = nil
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            showErrorIfNeeded(in: webView, error: error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            showErrorIfNeeded(in: webView, error: error)
        }

        private func showErrorIfNeeded(in webView: WKWebView, error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            spinner?.stopAnimating()
            guard errorOverlay == nil else { return }

            let overlay = UIView()
            overlay.backgroundColor = ADVERSEStyle.background
            overlay.translatesAutoresizingMaskIntoConstraints = false
            let icon = UIImageView(image: UIImage(systemName: "fingerprint"))
            icon.tintColor = ADVERSEStyle.lime
            icon.contentMode = .scaleAspectFit
            icon.translatesAutoresizingMaskIntoConstraints = false

            let title = UILabel()
            title.text = "Can’t connect to ADVERSE"
            title.textColor = .white
            title.font = .systemFont(ofSize: 22, weight: .bold)
            title.textAlignment = .center
            title.numberOfLines = 0

            let message = UILabel()
            message.text = "Check your internet connection, then try again."
            message.textColor = .secondaryLabel
            message.font = .systemFont(ofSize: 15)
            message.textAlignment = .center
            message.numberOfLines = 0

            let retry = UIButton(type: .system)
            var config = UIButton.Configuration.filled()
            config.title = "Try again"
            config.image = UIImage(systemName: "arrow.clockwise")
            config.imagePadding = 8
            config.baseBackgroundColor = ADVERSEStyle.lime
            config.baseForegroundColor = .black
            retry.configuration = config
            retry.addAction(UIAction { [weak self] _ in
                self?.errorOverlay?.removeFromSuperview()
                self?.errorOverlay = nil
                webView.load(URLRequest(url: ADVERSEStyle.homeURL, timeoutInterval: 30))
            }, for: .touchUpInside)

            let stack = UIStackView(arrangedSubviews: [icon, title, message, retry])
            stack.axis = .vertical
            stack.alignment = .center
            stack.spacing = 18
            stack.translatesAutoresizingMaskIntoConstraints = false
            overlay.addSubview(stack)
            webView.addSubview(overlay)
            NSLayoutConstraint.activate([
                overlay.topAnchor.constraint(equalTo: webView.topAnchor),
                overlay.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
                overlay.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
                overlay.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
                icon.widthAnchor.constraint(equalToConstant: 58),
                icon.heightAnchor.constraint(equalToConstant: 58),
                retry.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
                retry.widthAnchor.constraint(greaterThanOrEqualToConstant: 150),
                stack.leadingAnchor.constraint(greaterThanOrEqualTo: overlay.leadingAnchor, constant: 28),
                stack.trailingAnchor.constraint(lessThanOrEqualTo: overlay.trailingAnchor, constant: -28),
                stack.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
                stack.centerYAnchor.constraint(equalTo: overlay.centerYAnchor)
            ])
            errorOverlay = overlay
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url,
                  let scheme = url.scheme?.lowercased() else {
                decisionHandler(.cancel)
                return
            }

            if scheme == "http" || scheme == "https" {
                // Keep ADVERSE pages in-app. Open links to unrelated sites in Safari.
                let host = url.host?.lowercased() ?? ""
                let isAdverseHost = host == "adverse-web.onrender.com" || host == "www.adverse-web.onrender.com"
                if navigationAction.targetFrame == nil {
                    if isAdverseHost {
                        webView.load(navigationAction.request)
                    } else {
                        UIApplication.shared.open(url)
                    }
                    decisionHandler(.cancel)
                    return
                }
                if isAdverseHost {
                    decisionHandler(.allow)
                } else if navigationAction.navigationType == .linkActivated {
                    UIApplication.shared.open(url)
                    decisionHandler(.cancel)
                } else {
                    decisionHandler(.allow)
                }
            } else if ["mailto", "tel", "sms"].contains(scheme) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.cancel)
            }
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard let url = navigationAction.request.url else { return nil }
            if url.host?.lowercased() == "adverse-web.onrender.com" {
                webView.load(navigationAction.request)
            } else {
                UIApplication.shared.open(url)
            }
            return nil
        }

        deinit {
            progressObservation?.invalidate()
            webView?.removeObserver(self, forKeyPath: #keyPath(WKWebView.isLoading))
        }
    }
}
