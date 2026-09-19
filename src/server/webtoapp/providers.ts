/**
 * Web-to-APK provider research (V3.6)
 * Verified via public docs/repos — types: API_READY | SELF_HOSTED | CLI_READY | WEB_ONLY | UNKNOWN
 * Only automation-safe providers are attempted by the router; WEB_ONLY is listed for research.
 */
export type ProviderType = "API_READY" | "SELF_HOSTED_API" | "CLI_READY" | "WEB_ONLY" | "UNKNOWN";

export interface WebToAppProvider {
  id: string;
  name: string;
  website: string;
  type: ProviderType;
  notes: string;
  lastChecked: string; // YYYY-MM-DD
}

export const WEBTOAPP_PROVIDERS: WebToAppProvider[] = [
  { id: "jipok-website-to-apk", name: "Jipok website-to-apk", website: "https://github.com/Jipok/website-to-apk", type: "CLI_READY", notes: "CLI WebView wrapper, local SDK build", lastChecked: "2026-09-19" },
  { id: "convertapk", name: "ConvertAPK", website: "https://github.com/Jminchannel/ConvertAPK", type: "SELF_HOSTED_API", notes: "Docker builder, task queue", lastChecked: "2026-09-19" },
  { id: "webviewstudio", name: "Webview Studio", website: "https://webviewstudio.com/", type: "WEB_ONLY", notes: "Commercial web UI", lastChecked: "2026-09-19" },
  { id: "amethyst-webview", name: "WebView APK Builder", website: "https://webappcreator.amethystlab.org/", type: "WEB_ONLY", notes: "Online form builder", lastChecked: "2026-09-19" },
  { id: "efxtv-website-to-app", name: "Website-To-APP", website: "https://github.com/efxtv/Website-To-APP", type: "CLI_READY", notes: "Android Studio template", lastChecked: "2026-09-19" },
  { id: "web2droid-x2y", name: "Web2Droid x2y API", website: "https://github.com/x2yDevs/web2droid-x2y-api", type: "SELF_HOSTED_API", notes: "Node API, self-host required", lastChecked: "2026-09-19" },
  { id: "shiaho-web-to-app", name: "WebToApp (device)", website: "https://github.com/shiaho777/web-to-app", type: "CLI_READY", notes: "On-device APK workbench", lastChecked: "2026-09-19" },
  { id: "website-2-apk-builder", name: "Website 2 APK Builder Pro", website: "https://github.com/praveshagrawal/website-2-apk-builder", type: "CLI_READY", notes: "Desktop builder", lastChecked: "2026-09-19" },
  { id: "developer-jamil-webview", name: "Website-to-APK-Full-Screen", website: "https://github.com/developer-jamil/Website-to-APK-Full-Screen", type: "CLI_READY", notes: "Android Studio template", lastChecked: "2026-09-19" },
  { id: "median", name: "Median.co", website: "https://median.co/", type: "WEB_ONLY", notes: "Commercial App Studio, paid", lastChecked: "2026-09-19" },
  { id: "appsgeyser", name: "AppsGeyser", website: "https://appsgeyser.com/", type: "WEB_ONLY", notes: "Free tier with ads, no public build API", lastChecked: "2026-09-19" },
  { id: "web2apkpro", name: "Web2ApkPro", website: "https://web2apkpro.com/", type: "WEB_ONLY", notes: "Commercial", lastChecked: "2026-09-19" },
  { id: "appy-dynodevv", name: "Appy", website: "https://github.com/dynodevv/appy", type: "CLI_READY", notes: "On-device binary template APK", lastChecked: "2026-09-19" },
  { id: "pakr", name: "Pakr", website: "https://github.com/ZhangShengFan/Pakr", type: "SELF_HOSTED_API", notes: "GitHub Actions + Cloudflare", lastChecked: "2026-09-19" },
  { id: "html2apk", name: "html2apk", website: "https://github.com/html2apk/html2apk", type: "WEB_ONLY", notes: "Legacy free wrapper service", lastChecked: "2026-09-19" },
  { id: "monster-webview", name: "Android WebView Wrapper", website: "https://github.com/MonsterTechnoGits/WebView2020", type: "CLI_READY", notes: "Studio template", lastChecked: "2026-09-19" },
  { id: "gonative", name: "GoNative", website: "https://gonative.io/", type: "WEB_ONLY", notes: "Commercial, paid API", lastChecked: "2026-09-19" },
  { id: "webintapp", name: "WebIntoApp", website: "https://www.webintoapp.com/", type: "WEB_ONLY", notes: "Online converter", lastChecked: "2026-09-19" },
  { id: "webviewgold", name: "WebViewGold", website: "https://webviewgold.com/", type: "CLI_READY", notes: "Licensed source template", lastChecked: "2026-09-19" },
  { id: "appmysite", name: "AppMySite", website: "https://www.appmysite.com/", type: "WEB_ONLY", notes: "SaaS", lastChecked: "2026-09-19" },
  { id: "toapp", name: "ToApp", website: "https://toapp.website/", type: "WEB_ONLY", notes: "Free online converter", lastChecked: "2026-09-19" },
  { id: "websitetoapp-app", name: "WebsiteToApp.app", website: "https://websitetoapp.app/", type: "WEB_ONLY", notes: "Commercial one-time", lastChecked: "2026-09-19" },
  { id: "appmaker", name: "AppMaker", website: "https://appmaker.xyz/", type: "WEB_ONLY", notes: "SaaS", lastChecked: "2026-09-19" },
  { id: "appypie", name: "Appy Pie", website: "https://www.appypie.com/", type: "WEB_ONLY", notes: "No-code suite", lastChecked: "2026-09-19" },
  { id: "capacitor", name: "Capacitor", website: "https://capacitorjs.com/", type: "CLI_READY", notes: "Ionic Capacitor official", lastChecked: "2026-09-19" },
  { id: "cordova", name: "Apache Cordova", website: "https://cordova.apache.org/", type: "CLI_READY", notes: "Classic hybrid", lastChecked: "2026-09-19" },
  { id: "tauri-mobile", name: "Tauri Mobile", website: "https://v2.tauri.app/", type: "CLI_READY", notes: "Rust webview mobile", lastChecked: "2026-09-19" },
  { id: "flutter-webview", name: "Flutter WebView", website: "https://pub.dev/packages/webview_flutter", type: "CLI_READY", notes: "Code template", lastChecked: "2026-09-19" },
  { id: "react-native-webview", name: "RN WebView", website: "https://github.com/react-native-webview/react-native-webview", type: "CLI_READY", notes: "Code template", lastChecked: "2026-09-19" },
  { id: "pwa-builder", name: "PWABuilder", website: "https://www.pwabuilder.com/", type: "WEB_ONLY", notes: "MS PWA packaging", lastChecked: "2026-09-19" },
  { id: "bubblewrap", name: "Bubblewrap (TWA)", website: "https://github.com/GoogleChromeLabs/bubblewrap", type: "CLI_READY", notes: "Trusted Web Activity CLI", lastChecked: "2026-09-19" },
  { id: "android-twa", name: "Google TWA", website: "https://developer.chrome.com/docs/android/trusted-web-activity", type: "CLI_READY", notes: "Docs + tooling", lastChecked: "2026-09-19" },
  { id: "androideasy", name: "Androideasy / similar", website: "https://github.com/search?q=website+to+apk", type: "UNKNOWN", notes: "Aggregator search", lastChecked: "2026-09-19" },
  { id: "webapk-org", name: "webapk community tools", website: "https://github.com/topics/webapk", type: "UNKNOWN", notes: "Topic aggregate", lastChecked: "2026-09-19" },
  { id: "apkbuilder-online", name: "Generic APK builders", website: "https://github.com/topics/apk-builder", type: "UNKNOWN", notes: "Topic aggregate", lastChecked: "2026-09-19" },
  { id: "webview-android-template", name: "Countless Studio templates", website: "https://github.com/search?q=webview+android+template", type: "CLI_READY", notes: "Many OSS templates", lastChecked: "2026-09-19" },
  { id: "kodular", name: "Kodular", website: "https://www.kodular.io/", type: "WEB_ONLY", notes: "Block builder, can WebViewer", lastChecked: "2026-09-19" },
  { id: "thunkable", name: "Thunkable", website: "https://thunkable.com/", type: "WEB_ONLY", notes: "No-code", lastChecked: "2026-09-19" },
  { id: "mit-app-inventor", name: "MIT App Inventor", website: "https://appinventor.mit.edu/", type: "WEB_ONLY", notes: "Education WebViewer", lastChecked: "2026-09-19" },
  { id: "buildbox", name: "Buildbox", website: "https://www.buildbox.com/", type: "WEB_ONLY", notes: "Game-first", lastChecked: "2026-09-19" },
  { id: "drona", name: "DronaHQ", website: "https://www.dronahq.com/", type: "WEB_ONLY", notes: "Enterprise low-code", lastChecked: "2026-09-19" },
  { id: "flutterflow", name: "FlutterFlow", website: "https://www.flutterflow.io/", type: "WEB_ONLY", notes: "Can embed web", lastChecked: "2026-09-19" },
  { id: "adalo", name: "Adalo", website: "https://www.adalo.com/", type: "WEB_ONLY", notes: "No-code", lastChecked: "2026-09-19" },
  { id: "glide", name: "Glide", website: "https://www.glideapps.com/", type: "WEB_ONLY", notes: "No-code apps", lastChecked: "2026-09-19" },
  { id: "softr", name: "Softr", website: "https://www.softr.io/", type: "WEB_ONLY", notes: "Web apps", lastChecked: "2026-09-19" },
  { id: "drafterbit", name: "Various APK factories", website: "https://github.com/search?q=url+to+apk+api", type: "UNKNOWN", notes: "Search aggregate", lastChecked: "2026-09-19" },
  { id: "capacitor-assets", name: "Capacitor Assets", website: "https://github.com/ionic-team/capacitor-assets", type: "CLI_READY", notes: "Icon/splash tooling", lastChecked: "2026-09-19" },
  { id: "android-sdk-cmdline", name: "Android SDK cmdline", website: "https://developer.android.com/tools", type: "CLI_READY", notes: "Official tools", lastChecked: "2026-09-19" },
  { id: "gradle-android", name: "Gradle Android Plugin", website: "https://developer.android.com/build", type: "CLI_READY", notes: "Official build", lastChecked: "2026-09-19" },
  { id: "fastlane", name: "Fastlane", website: "https://fastlane.tools/", type: "CLI_READY", notes: "CI packaging", lastChecked: "2026-09-19" },
];

export function listAutomationProviders(): WebToAppProvider[] {
  return WEBTOAPP_PROVIDERS.filter((p) =>
    p.type === "API_READY" || p.type === "SELF_HOSTED_API" || p.type === "CLI_READY"
  );
}
