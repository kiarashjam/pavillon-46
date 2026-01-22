# GitHub + Azure Static Web App — push, Actions, and publish

Your site is live at: **https://kind-hill-0e0617903.1.azurestaticapps.net/**

To have **every push to GitHub** run the workflow and **publish to that URL**, follow these steps.

---

## 1. Create a GitHub repository (if you don't have one)

1. Go to [github.com](https://github.com) → **New repository**.
2. Choose a name (e.g. `pavillon-46`), leave it empty (no README, no .gitignore).
3. Copy the repo URL, e.g. `https://github.com/YOUR_USERNAME/pavillon-46.git`.

---

## 2. Connect this folder to GitHub and push

In your project folder, run:

```bash
# Add GitHub as remote (use YOUR repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Stage everything (including .github workflow)
git add .
git commit -m "Add site + Azure deploy workflow"

# Push (workflow runs on 'master' or 'main')
git push -u origin master
```

If your default branch on GitHub is `main` instead of `master`:

```bash
git branch -M main
git push -u origin main
```

**Important:** The workflow runs on push to **`main`** or **`master`**. Use whichever branch you push to.

---

## 3. Get the deployment token from Azure (for your live site)

The token must come from the **same** Azure Static Web App that serves **https://kind-hill-0e0617903.1.azurestaticapps.net/**.

**Option A — Azure Portal**

1. Go to [portal.azure.com](https://portal.azure.com) → **Static Web Apps**.
2. Open the app whose URL is `kind-hill-0e0617903.1.azurestaticapps.net` (may appear as "kind-hill-0e0617903" or similar).
3. In the left menu, click **Manage deployment token**.
4. Click **Copy** and save it somewhere safe (you'll use it in the next step).

**Option B — Azure CLI**

If you know the resource group and app name for that SWA:

```bash
az staticwebapp secrets list \
  --name <static-web-app-name> \
  --resource-group <resource-group-name> \
  --query properties.apiKey -o tsv
```

Use the **resource group and name** of the "kind-hill" app, not necessarily `pavillon46-swa`.

---

## 4. Add the token as a GitHub secret

1. Open your repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**.
3. **Name:** `AZURE_STATIC_WEB_APPS_API_TOKEN`  
   **Value:** paste the token from step 3.
4. Save.

---

## 5. Run the workflow and publish

- **Automatic:** Push to `main` or `master` → the **"Publish to Azure Static Web App"** workflow runs → builds the Next.js app → deploys to Azure.
- **Manual:** Repo → **Actions** → **Publish to Azure Static Web App** → **Run workflow**.

After a successful run, the site at **https://kind-hill-0e0617903.1.azurestaticapps.net/** will show your latest changes.

---

## Quick checklist

| Step | Action |
|------|--------|
| 1 | GitHub repo created (or use existing) |
| 2 | `git remote add origin <repo-url>` and `git push` |
| 3 | Deployment token copied from Azure (for kind-hill SWA) |
| 4 | `AZURE_STATIC_WEB_APPS_API_TOKEN` added in GitHub Secrets |
| 5 | Push to `main`/`master` or run workflow manually → site updates |

---

## Troubleshooting

- **Workflow fails on "Azure Static Web App" step**  
  → Token is wrong or from a different SWA. Create a new token from the **kind-hill** Static Web App and update the secret.

- **Site doesn't update after push**  
  → Check **Actions** tab for errors. Ensure you pushed to `main` or `master` and that the workflow run succeeded.

- **"Repository not found" or push refused**  
  → Remote URL is wrong or you don't have access. Check `git remote -v` and repo URL/permissions.
