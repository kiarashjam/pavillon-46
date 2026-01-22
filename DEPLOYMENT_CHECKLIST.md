# ✅ Pre-Deployment Checklist

## Code Verification

- ✅ **Next.js Configuration**: `next.config.js` is properly configured
- ✅ **Package Dependencies**: All required packages in `package.json`
- ✅ **Pages**: All 3 pages created (index, waitlist, thank-you)
- ✅ **Components**: Header and Footer components created
- ✅ **Styles**: Global CSS with all styles
- ✅ **Fonts**: Google Fonts properly configured
- ✅ **Git**: Repository initialized and committed
- ✅ **Gitignore**: Properly configured to exclude unnecessary files

## Files Structure

```
✅ pages/
   ✅ _app.js (Font setup)
   ✅ _document.js (Document structure)
   ✅ index.js (Homepage)
   ✅ waitlist.js (Waitlist form)
   ✅ thank-you.js (Confirmation page)

✅ components/
   ✅ Header.js
   ✅ Footer.js

✅ public/
   ✅ images/ (Ready for your images)
   ✅ favicon.ico

✅ styles/
   ✅ globals.css (All styles)

✅ Configuration Files
   ✅ package.json
   ✅ next.config.js
   ✅ jsconfig.json
   ✅ .gitignore
   ✅ README.md
```

## Live site

**https://kind-hill-0e0617903.1.azurestaticapps.net/**

## Push to GitHub + deploy to Azure

Follow **`GITHUB_AND_AZURE_SETUP.md`** to:

1. Create a GitHub repo and add it as `origin` remote  
2. Push your code (including `.github/workflows`)  
3. Get the deployment token from Azure for the **kind-hill** Static Web App  
4. Add `AZURE_STATIC_WEB_APPS_API_TOKEN` in GitHub Secrets  
5. Push to `main` or `master` → **Publish to Azure Static Web App** workflow runs → site updates  

## After GitHub + Azure setup

1. **Test locally**:
   ```bash
   npm install
   npm run dev
   ```

2. **Build for production**:
   ```bash
   npm run build
   ```

3. **Deploy**: Push to `main`/`master` or run the workflow manually. Updates go to the URL above.

## Images to Add

Remember to add these images to `public/images/`:
- `homepage-left-image.jpg` - For homepage left section
- `aerial-background.jpg` - For waitlist/thank-you backgrounds
