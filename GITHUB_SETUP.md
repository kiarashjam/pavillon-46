# GitHub Repository Setup Instructions

## ✅ Local Git Repository is Ready!

Your project has been initialized and committed locally. Now follow these steps to publish it to GitHub:

## Step 1: Create a New Repository on GitHub

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **"+"** icon in the top right corner
3. Select **"New repository"**
4. Fill in the details:
   - **Repository name:** `pavillon-46` (or your preferred name)
   - **Description:** "Pavillon 46 - Luxury resort website built with Next.js"
   - **Visibility:** Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click **"Create repository"**

## Step 2: Connect and Push to GitHub

After creating the repository, GitHub will show you commands. Use these commands in your terminal:

```bash
# Navigate to your project directory (if not already there)
cd "C:\Users\KiaJamishidi\OneDrive - BonApp Group\Documents\repo\New folder"

# Add the remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/pavillon-46.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

## Alternative: Using GitHub CLI

If you have GitHub CLI installed:

```bash
gh repo create pavillon-46 --public --source=. --remote=origin --push
```

## Step 3: Verify

1. Go to your GitHub repository page
2. You should see all your files there
3. The README.md will be displayed on the repository homepage

## Next Steps After Publishing

1. **Add images**: Place your images in `public/images/`:
   - `homepage-left-image.jpg`
   - `aerial-background.jpg`

2. **Deploy to Vercel** (Recommended for Next.js):
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel will automatically deploy your Next.js app

3. **Or deploy to other platforms**:
   - Netlify
   - AWS Amplify
   - Your own server

## Repository Structure

```
pavillon-46/
├── components/          # React components
├── pages/              # Next.js pages
├── public/             # Static assets
│   └── images/        # Your images go here
├── styles/            # Global CSS
├── package.json       # Dependencies
└── README.md          # Project documentation
```

## Need Help?

- [GitHub Docs](https://docs.github.com)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
