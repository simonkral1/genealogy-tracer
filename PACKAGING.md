re# Chrome Extension Packaging Guide

## What is a Private Key File (.pem)?

A **private key file** (`.pem`) is a cryptographic key used to:
- **Sign your extension** - Creates a unique, consistent extension ID
- **Maintain ownership** - Only you can update extensions signed with your private key
- **Enable updates** - Chrome uses the key to verify update authenticity

## Packaging Methods

### Method 1: Chrome Developer Mode (Recommended for Development)

1. **Open Chrome Extensions page:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)

2. **Pack Extension:**
   - Click "Pack extension"
   - **Extension root directory:** Select the `dist/` folder
   - **Private key file:** Leave empty for first-time packaging (Chrome will generate one)
   - Click "Pack Extension"

3. **Result:**
   - Chrome creates two files:
     - `genealogy-tracer.crx` - The packaged extension
     - `genealogy-tracer.pem` - Your private key (**KEEP THIS SAFE!**)

### Method 2: Command Line (Advanced)

```bash
# Install Chrome command line tools (if not already installed)
# Then pack the extension
google-chrome --pack-extension=./dist --pack-extension-key=./genealogy-tracer.pem
```

## Important Notes About Private Keys

### 🔒 **SECURITY - CRITICAL**
- **NEVER share your .pem file** - Anyone with it can impersonate your extension
- **BACKUP your .pem file** - Store it securely (password manager, encrypted drive)
- **NEVER commit .pem files to git** - Add `*.pem` to your `.gitignore`

### 🔄 **For Updates**
- **Always use the same .pem file** for updates
- **Without the original .pem** - You cannot update your extension
- **Lost .pem file** - You'll need to publish as a new extension with a new ID

### 📦 **Extension ID**
- Generated from your .pem file
- Remains consistent across updates
- Format: `abcdefghijklmnopqrstuvwxyzabcdef` (32 characters)

## Distribution Options

### 1. Chrome Web Store (Recommended for Public Release)
- Upload the `.crx` file to Chrome Web Store
- Requires developer account ($5 one-time fee)
- Automatic updates for users
- Better security and trust

### 2. Direct Distribution
- Share the `.crx` file directly
- Users must manually install
- May trigger security warnings
- Updates require manual redistribution

### 3. Enterprise/Internal Distribution
- Use Chrome Enterprise policies
- Deploy via Group Policy or MDM
- Suitable for corporate environments

## Quick Start

1. **First time packaging:**
   ```bash
   # Your extension files are ready in dist/
   # Go to chrome://extensions/
   # Enable Developer mode
   # Click "Pack extension"
   # Select the dist/ folder
   # Chrome generates .crx and .pem files
   ```

2. **For updates:**
   ```bash
   # Update your code
   # Copy updated files to dist/
   # Pack again using the SAME .pem file
   ```

## Files in Your Extension

- `manifest.json` - Extension configuration
- `background.js` - Service worker
- `content.js` - Content script
- `popup.html` - Extension popup UI
- `popup.js` - Popup functionality
- `icons/` - Extension icons (16px, 48px, 128px)

## Version Management

Current version: `1.0` (in manifest.json)

To update:
1. Increment version in `manifest.json`
2. Copy updated files to `dist/`
3. Pack with your existing `.pem` file
4. Distribute the new `.crx` file 