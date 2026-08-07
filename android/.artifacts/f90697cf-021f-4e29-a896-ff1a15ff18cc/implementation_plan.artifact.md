# Implementation Plan: Universal Barcode Scanner (PWA + iOS Support)

This plan enhances the **Rogue** barcode scanner to work across all platforms, including iOS Safari (PWA) and future iOS native apps. We will add a software-based scanning fallback using `@zxing/library` for browsers that do not support the native `BarcodeDetector` API.

## User Review Required

> [!IMPORTANT]
> **New Dependency**: I will add `@zxing/library` (approx. 500KB). This library performs scanning via software, which is necessary for iOS Safari because Apple has not yet enabled the native Web Barcode API by default.

## Proposed Changes

### Web Application Changes

#### [INSTALL] NPM Packages
- Install `@zxing/library` to handle software-based scanning in browsers like Safari.

#### [MODIFY] [barcode-scanner.tsx](file:///C:/Users/Grupo Hogares/Desktop/Josep/rogue/src/components/food/barcode-scanner.tsx)
- **Hierarchy of Scanning**:
    1.  **Native (Capacitor)**: Use ML Kit (Android/iOS Native) for maximum speed.
    2.  **Web Native (BarcodeDetector)**: Use Browser API if available (Chrome/Edge).
    3.  **Software Fallback (ZXing)**: Use `@zxing/library` for Safari/iOS PWA.
    4.  **Manual Entry**: Final fallback if camera fails.
- **Lazy Loading**: Import the ZXing library dynamically only when needed to keep the initial bundle size small.

## Verification Plan

### Automated Tests
- **NPM Install**: Verify the package is added.
- **Build**: Ensure the Next.js build passes.

### Manual Verification
- **iOS Safari (PWA)**: Open the app in Safari, tap the scanner, and verify it can now detect barcodes instead of just showing the manual form.
- **Desktop Chrome**: Verify the existing web scanning still works.
- **Android APK**: Verify the native ML Kit scanner still works at full speed.
