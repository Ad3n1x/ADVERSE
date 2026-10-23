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
        private var canGoBackObservation: NSKeyValueObservation?
        private var canGoForwardObservation: NSKeyValueObservation?
        private weak var backButton: UIButton?
        private weak var forwardButton: UIButton?
        private var hasLoadedInitialPage = false

        func attach(to webView: WKWebView) {
            self.webView = webView
            webView.addObserver(self, forKeyPath: #keyPath(WKWebView.isLoading), options: [.new], context: nil)
            setupLoadingUI(in: webView)
            progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] view, _ in
                DispatchQueue.main.async {
                    self?.progressView?.progress = Float(view.estimatedProgress)
                    self?.progressView?.isHidden = view.estimatedProgress >= 1
                    self?.updateNavigationButtons()
                }
            }
            canGoBackObservation = webView.observe(\.canGoBack, options: [.initial, .new]) { [weak self] _, _ in
                DispatchQueue.main.async { self?.updateNavigationButtons() }
            }
            canGoForwardObservation = webView.observe(\.canGoForward, options: [.initial, .new]) { [weak self] _, _ in
                DispatchQueue.main.async { self?.updateNavigationButtons() }
            }
        }

        @objc private func refreshPage() {
            guard let webView else { return }
            if webView.isLoading {
                webView.stopLoading()
            }
            webView.load(URLRequest(url: webView.url ?? ADVERSEStyle.homeURL,
                                    cachePolicy: .reloadIgnoringLocalCacheData,
                                    timeoutInterval: 30))
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
            bar.accessibilityLabel = "Page loading progress"
            bar.accessibilityIdentifier = "adverse.pageProgress"
            progressView = bar

            let refreshControl = UIRefreshControl()
            refreshControl.tintColor = ADVERSEStyle.lime
            refreshControl.accessibilityLabel = "Refresh ADVERSE"
            refreshControl.addTarget(self, action: #selector(refreshPage), for: .valueChanged)
            webView.scrollView.refreshControl = refreshControl

            setupNavigationToolbar(in: webView)

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

        private func setupNavigationToolbar(in webView: WKWebView) {
            let toolbar = UIView()
            toolbar.backgroundColor = UIColor(red: 14 / 255, green: 18 / 255, blue: 22 / 255, alpha: 0.98)
            toolbar.translatesAutoresizingMaskIntoConstraints = false
            toolbar.accessibilityIdentifier = "adverse.nativeNavigationToolbar"
            webView.addSubview(toolbar)

            let back = makeToolbarButton(symbol: "chevron.left", label: "Go back", action: #selector(goBack))
            let forward = makeToolbarButton(symbol: "chevron.right", label: "Go forward", action: #selector(goForward))
            let home = makeToolbarButton(symbol: "house", label: "Open ADVERSE home", action: #selector(goHome))
            let share = makeToolbarButton(symbol: "square.and.arrow.up", label: "Share current page", action: #selector(sharePage))
            backButton = back
            forwardButton = forward

            let stack = UIStackView(arrangedSubviews: [back, forward, home, share])
            stack.axis = .horizontal
            stack.alignment = .center
            stack.distribution = .equalSpacing
            stack.translatesAutoresizingMaskIntoConstraints = false
            toolbar.addSubview(stack)

            NSLayoutConstraint.activate([
                toolbar.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
                toolbar.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
                toolbar.bottomAnchor.constraint(equalTo: webView.safeAreaLayoutGuide.bottomAnchor),
                toolbar.heightAnchor.constraint(equalToConstant: 56),
                stack.leadingAnchor.constraint(equalTo: toolbar.leadingAnchor, constant: 28),
                stack.trailingAnchor.constraint(equalTo: toolbar.trailingAnchor, constant: -28),
                stack.topAnchor.constraint(equalTo: toolbar.topAnchor, constant: 4),
                stack.bottomAnchor.constraint(equalTo: toolbar.bottomAnchor, constant: -4),
                back.widthAnchor.constraint(equalToConstant: 48),
                forward.widthAnchor.constraint(equalToConstant: 48),
                home.widthAnchor.constraint(equalToConstant: 48),
                share.widthAnchor.constraint(equalToConstant: 48)
            ])
            webView.scrollView.contentInset.bottom = 64
            webView.scrollView.verticalScrollIndicatorInsets.bottom = 64
            updateNavigationButtons()
        }

        private func makeToolbarButton(symbol: String, label: String, action: Selector) -> UIButton {
            let button = UIButton(type: .system)
            button.setImage(UIImage(systemName: symbol), for: .normal)
            button.tintColor = ADVERSEStyle.lime
            button.accessibilityLabel = label
            button.addTarget(self, action: action, for: .touchUpInside)
            return button
        }

        private func updateNavigationButtons() {
            backButton?.isEnabled = webView?.canGoBack ?? false
            forwardButton?.isEnabled = webView?.canGoForward ?? false
            backButton?.alpha = backButton?.isEnabled == true ? 1 : 0.35
            forwardButton?.alpha = forwardButton?.isEnabled == true ? 1 : 0.35
        }

        @objc private func goBack() {
            guard let webView, webView.canGoBack else { return }
            webView.goBack()
        }

        @objc private func goForward() {
            guard let webView, webView.canGoForward else { return }
            webView.goForward()
        }

        @objc private func goHome() {
            guard let webView else { return }
            webView.load(URLRequest(url: ADVERSEStyle.homeURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
        }

        @objc private func sharePage() {
            guard let webView, let url = webView.url else { return }
            let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let popover = activity.popoverPresentationController {
                popover.sourceView = webView
                popover.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.maxY - 80, width: 1, height: 1)
            }
            var responder: UIResponder? = webView
            while let current = responder, !(current is UIViewController) { responder = current.next }
            (responder as? UIViewController)?.present(activity, animated: true)
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
            webView.scrollView.refreshControl?.endRefreshing()
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
            webView.scrollView.refreshControl?.endRefreshing()
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
            canGoBackObservation?.invalidate()
            canGoForwardObservation?.invalidate()
            webView?.removeObserver(self, forKeyPath: #keyPath(WKWebView.isLoading))
        }
    }
}
