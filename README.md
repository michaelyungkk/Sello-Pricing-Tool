<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1vTmVLJKGqKaElhGnH7P85A5C-slc0Clw

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set your API Key:
   Create a `.env.local` file and add:
   `API_KEY=your_gemini_api_key_here`
3. Run the app:
   ```bash
   npm run dev
   ```

## Deployment

### GitHub
**Important**: Do NOT upload the `node_modules` folder to GitHub. The project already includes a `.gitignore` file that handles this for you automatically.

### Netlify (Ready to Deploy)
This project is pre-configured for Netlify deployment using the included `netlify.toml`.

1. **Push to GitHub**: Upload your code to a GitHub repository (excluding `node_modules`).
2. **Connect to Netlify**: Link your GitHub repo to a new site on Netlify.
3. **Environment Variables**: In the Netlify UI, go to **Site Settings > Build & deploy > Environment variables** and add:
   - `API_KEY`: Your Gemini API Key.
4. **Deploy**: Netlify will use the `npm run build` command and the `dist` folder to serve your site.
