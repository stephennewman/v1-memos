# Memos by Outcome View

Learn anything. 5 minutes a day.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Then add your Supabase credentials (same as V1 web platform).

3. **Add app icons**
   Place these images in `assets/images/`:
   - `icon.png` (1024x1024) - App icon
   - `adaptive-icon.png` (1024x1024) - Android adaptive icon
   - `splash-icon.png` (200x200) - Splash screen icon
   - `favicon.png` (48x48) - Web favicon

4. **Start development**
   ```bash
   npm start
   ```
   Then press `i` for iOS simulator or scan QR with Expo Go.

## Features

- **Apple Sign In** - Native iOS authentication
- **Topic Library** - Create up to 5 topics (free tier)
- **Keep/Kick Feed** - Swipe to save or dismiss memos
- **Saved Memos** - Review your kept memos
- **Add Manual Memos** - Create your own memos
- **Syncs with V1** - Same Supabase database

## Structure

```
app/
├── (auth)/
│   └── login.tsx       # Apple + Email sign-in
├── (tabs)/
│   ├── index.tsx       # Topic library
│   └── settings.tsx    # Settings + sign out
└── topic/
    └── [id]/
        ├── index.tsx   # Keep/Kick feed
        └── keeps.tsx   # Saved memos
```

## Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for iOS
eas build --platform ios

# Submit to App Store
eas submit --platform ios
```
Memos by OutcomeView - Mobile app for bite-sized learning
