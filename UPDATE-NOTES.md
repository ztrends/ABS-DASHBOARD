ABS DASHBOARD UPDATE PACKAGE

Changes included:
- Added a public landing page with Login and Download Android APK actions; existing login and dashboard markup retained.
- Added mobile-friendly PDF Blob download helper for both statement PDF export buttons.
- Added optional advertisement start/end scheduling fields and safe SQLite migrations.
- Added an authenticated admin API endpoint for reading a user's saved Firestore private/data records, and an admin financial-details view.
- Updated APK workflow to publish the generated APK as a GitHub Release asset so the homepage download link has a public latest-release target.
- Updated PWA launcher icon reference to frontend/assets/abs-icon.png.

Important deployment notes:
1. Upload/replace repository files with this package and push to the main branch.
2. Backend changes require Render to redeploy. Verify Render has FIREBASE_SERVICE_ACCOUNT_JSON or its Secret File and that the service account can read/write Firestore and delete Firebase Auth users.
3. The APK download link will work after the updated Build ABS DASHBOARD APK workflow completes and publishes its first release. GitHub Actions needs repository contents: write permission enabled in repository Actions settings.
4. PDF behavior depends on the phone browser/WebView. This change uses a Blob download path; test on the actual phone after deployment.
5. Admin financial detail endpoint reads users/{uid}/private/data. Existing data stored only in a device's localStorage will not be visible from another device/admin; this package shows only records that have synced to Firestore.
6. This package has JavaScript syntax checks run locally, but was not deployed against the user's live Firebase/Render project. Test with a non-critical account before deleting any real user.
