<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e996cd04-9f2f-4b46-b226-2e0a1223cc13

## Run as Web App

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Run as Desktop App (Tauri)

**Prerequisites:** 
- [Node.js](https://nodejs.org/en/)
- [Rust & Cargo](https://rustup.rs/) (Required for Tauri)
- C++ Build Tools (See [Tauri Windows Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites#windows) or [macOS/Linux equivalents](https://tauri.app/v1/guides/getting-started/prerequisites))

1. Install dependencies:
   `npm install`
2. Run the Tauri dev server:
   `npm run tauri dev`
3. Build the standalone executable:
   `npm run tauri build`
