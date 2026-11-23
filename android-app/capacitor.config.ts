// Alternative Capacitor configuration if hosting restricts /.well-known/assetlinks.json for TWA.
// Usage: npx cap add android && npx cap sync android && cd android && ./gradlew assembleDebug

const config = {
  appId: 'com.coffeenadu.admin',
  appName: 'CoffeeNadu Admin',
  webDir: '../dist',
  server: {
    url: 'https://coffeenad-news.ai.studio/admin',
    cleartext: false,
    allowNavigation: [
      'coffeenad-news.ai.studio',
      'accounts.google.com',
      '*.firebaseapp.com',
      '*.googleusercontent.com',
    ],
  },
  android: {
    backgroundColor: '#0B192C',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0B192C',
      androidSplashResourceName: 'splash_logo',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0B192C',
    },
  },
};

export default config;
