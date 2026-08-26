# AISprints Setup Guide

This guide walks you through everything you need to get started with AISprints. Follow each section in order and check off items as you complete them.

---

## Section 1: Create Your Accounts

You will need two accounts before you begin.

### Cloudflare Account

Cloudflare is where your application will be deployed and hosted. It provides the serverless infrastructure, and later the database, for the app you build.

- [ ] Go to [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
- [ ] Sign up using your Gmail account
- [ ] Verify your email address if prompted
- [ ] Log in and confirm you can see the Cloudflare dashboard

### GitHub Account

GitHub is where your source code will live. You will create your own copy of the starter repository here.

- [ ] If you don't already have one, create a GitHub account at [https://github.com/join](https://github.com/join)
- [ ] Log in and confirm you can access [https://github.com/aisprints/aisprints-starter](https://github.com/aisprints/aisprints-starter)

---

## Section 2: Install Required Software

### Node.js

Node.js is the JavaScript runtime needed to run the application locally.

- [ ] Go to [https://nodejs.org](https://nodejs.org)
- [ ] Download and install the **LTS** (Long Term Support) version
- [ ] Verify the installation by opening a terminal and running:
  ```
  node --version
  ```
  You need **v22 or higher**. Node 20 reached end-of-life in April 2026 and no longer
  receives security patches, so upgrade if you see `v20.x.x` or lower.
- [ ] Verify npm (Node's package manager) is also installed:
  ```
  npm --version
  ```

### Git

Git is the version control tool used to manage your code.

- [ ] Check if Git is already installed by opening a terminal and running:
  ```
  git --version
  ```
- [ ] If not installed:
  - **Mac**: Install Xcode Command Line Tools by running `xcode-select --install` in Terminal
  - **Windows**: Download from [https://git-scm.com/download/win](https://git-scm.com/download/win)
  - **Linux**: Run `sudo apt install git` (Ubuntu/Debian) or `sudo dnf install git` (Fedora)

### Cursor IDE

Cursor is the AI-powered code editor you will use for all sprint work. It looks and works like VS Code but has built-in AI capabilities that you will use to collaborate with an AI agent.

- [ ] Go to [https://www.cursor.com](https://www.cursor.com)
- [ ] Download Cursor for your operating system (Mac, Windows, or Linux)
- [ ] Install it by following the prompts
- [ ] Open Cursor to confirm it launches successfully
- [ ] If prompted, sign in or create a Cursor account

### Superwhisper (Recommended)

Superwhisper is a voice-to-text tool that lets you talk to Cursor's AI agent instead of typing. It works offline and integrates directly with Cursor -- you press a shortcut, speak your intent, and polished text appears in the AI chat. This dramatically speeds up your workflow and makes it easier to give the AI agent detailed instructions.

- [ ] Go to [https://superwhisper.com](https://superwhisper.com)
- [ ] Download and install for your operating system (Mac, Windows, or iOS)
- [ ] Open Superwhisper and follow the initial setup prompts
- [ ] Set your activation shortcut (default is `Option + Space` on Mac)
- [ ] Test it by pressing the shortcut and speaking a sentence
- [ ] Try it inside Cursor: click into the AI chat input, press your Superwhisper shortcut, and speak a request

---

## Section 3: Create Your Repository from the Template

You will create your own personal copy of the starter repository. This gives you a clean starting point that is fully yours to modify.

- [ ] Go to [https://github.com/aisprints/aisprints-starter](https://github.com/aisprints/aisprints-starter)
- [ ] Click the green **"Use this template"** button (located above the file list)
- [ ] Select **"Create a new repository"**
- [ ] On the next screen:
  - [ ] Use the **Owner** dropdown to select your personal GitHub account
  - [ ] Enter a repository name (e.g., `quizmaker` or `aisprints-quizmaker`)
  - [ ] Optionally add a description (e.g., "My AISprints QuizMaker project")
  - [ ] Leave visibility as **Public** (or set to Private if you prefer)
- [ ] Click **"Create repository from template"**
- [ ] Wait for GitHub to finish creating your repository
- [ ] Confirm you can see your new repository page with all the starter files

---

## Section 4: Clone Your Repository and Open in Cursor

Now you will download your repository to your computer and open it in Cursor.

### Clone the Repository

- [ ] On your new repository page in GitHub, click the green **"Code"** button
- [ ] Copy the HTTPS URL (it will look like `https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git`)
- [ ] Open a terminal (Terminal on Mac, Command Prompt or PowerShell on Windows)
- [ ] Navigate to where you want to store your project. For example:
  ```
  cd ~/Documents
  ```
- [ ] Clone the repository:
  ```
  git clone https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
  ```
  Replace the URL with the one you copied.
- [ ] Enter the project folder:
  ```
  cd YOUR-REPO-NAME
  ```

### Open in Cursor

- [ ] Open Cursor IDE
- [ ] Go to **File > Open Folder** (or **File > Open** on Mac)
- [ ] Navigate to and select the folder you just cloned
- [ ] Cursor should now show all the project files in the left sidebar

### Make the Project Yours

The template ships with placeholder names and no local environment file. Fix both now,
before you start building.

- [ ] Open `package.json` and change `"name": "next"` to your project name, for example
      `"name": "quizmaker"`
- [ ] Open `wrangler.jsonc` and change `"name": "aisprints-starter"` to the same name.
      This is the name your app will be deployed under on Cloudflare.
- [ ] Create your local environment file by copying the example:
  ```
  cp .dev.vars.example .dev.vars
  ```
  On Windows PowerShell, use `Copy-Item .dev.vars.example .dev.vars`
- [ ] Confirm `.dev.vars` is **not** tracked by git. It holds secrets and is
      intentionally gitignored. Only `.dev.vars.example` should ever be committed.

---

## Section 5: Install Project Dependencies

The project needs several packages to run. These are all listed in `package.json` and will be installed automatically.

- [ ] Open the built-in terminal in Cursor: go to **Terminal > New Terminal** from the menu bar (or press `` Ctrl+` `` / `` Cmd+` ``)
- [ ] In the terminal, run:
  ```
  npm install
  ```
- [ ] Wait for the installation to complete (this may take a minute or two)
- [ ] Verify there are no errors in the output. Warnings are normal and can be ignored.

---

## Section 6: Verify Local Development Works

Before starting any sprint work, confirm the application runs on your machine.

- [ ] In the Cursor terminal, run:
  ```
  npm run dev
  ```
- [ ] Wait for the output to show something like:
  ```
  ▲ Next.js 16.x.x (Turbopack)
  - Local: http://localhost:3000
  ```
- [ ] Open your web browser and go to [http://localhost:3000](http://localhost:3000)
- [ ] Confirm you see the default starter page
- [ ] Go back to the terminal and press `Ctrl+C` to stop the development server

---

## Section 7: Understanding Cursor IDE for AISprints

Cursor's AI features are central to how you will complete your sprint work. Here is what you need to know.

### Opening an AI Chat Tab

- [ ] Look for the AI chat panel on the right side of the Cursor window. If it is not visible, click the chat icon in the sidebar or press `Cmd+L` (Mac) / `Ctrl+L` (Windows/Linux).
- [ ] You should see a text input where you can type messages to the AI agent.

### Creating a New Tab for Each Week

You should create a **separate AI chat tab for each week of sprint work**. This keeps your conversations organized and makes it easy to export them for submission.

- [ ] To start a new chat, click the **"+"** button at the top of the AI panel, or press `Cmd+N` (Mac) / `Ctrl+N` (Windows/Linux) while the AI panel is focused.
- [ ] Give yourself a mental note of which tab corresponds to which week (e.g., "Week 1 - Authentication").

### Exporting Your Chat for Submission

At the end of each week, you are required to export and submit your AI chat.

- [ ] In the AI chat tab for the week you are submitting, click the **dropdown menu** (the "..." or gear icon at the top of the chat panel)
- [ ] Select **"Export Chat"**
- [ ] Save the exported file to a location you can find for submission

### Working with the AI Agent

When collaborating with the AI agent in Cursor:

- Be specific about what you want to accomplish
- Reference files by name when asking about your code
- Ask the agent to explain anything you do not understand
- Review the code the agent writes before accepting changes

---

## Section 8: Connect Cloudflare (For Deployment Later)

You will not deploy to Cloudflare until later in the sprints, but it helps to verify the connection works.

- [ ] In the Cursor terminal, run:
  ```
  npx wrangler login
  ```
- [ ] A browser window will open asking you to authorize Wrangler
- [ ] Click **"Allow"** to grant access
- [ ] Return to the terminal and confirm you see a success message
- [ ] Verify the connection by running:
  ```
  npx wrangler whoami
  ```
  You should see your Cloudflare account name and ID.

---

## Section 9: Understand the Project Structure

Take a moment to familiarize yourself with what is in the starter repository.

| Folder/File | Purpose |
|---|---|
| `ai-workspace/` | PRDs and feature specs that guide each sprint |
| `AGENTS.md` | Always-on agent instructions: stack, layout, and working agreements |
| `.cursor/rules/` | Conventions that load when you touch matching files |
| `.cursor/skills/` | Deeper guidance the agent pulls in when a task calls for it |
| `.cursor/BUGBOT.md` | Checklist used when Bugbot reviews a pull request |
| `src/app/` | Your routes and pages (Next.js App Router) |
| `src/components/ui/` | shadcn/ui components, already installed |
| `src/lib/` | Shared utilities and services |
| `package.json` | Project dependencies and available scripts |
| `wrangler.jsonc` | Cloudflare deployment configuration |
| `.dev.vars` | Your local secrets (never committed) |

### Available Commands

| Command | What it Does |
|---|---|
| `npm run dev` | Start the app locally for development |
| `npm run build` | Build the app for production |
| `npm run lint` | Check code for problems |
| `npm run preview` | Run the app on the local Cloudflare Workers runtime |
| `npm run deploy` | Deploy the app to Cloudflare |

`npm run dev` runs on Node, which is fast but does not behave exactly like Cloudflare.
Use `npm run preview` to catch problems that only appear on the real runtime.

---

## Checklist Summary

Before starting Sprint 1, confirm all of the following:

- [ ] Cloudflare account created and accessible
- [ ] GitHub account ready with your personal copy of the starter repo
- [ ] Node.js v22 or higher, and npm, installed
- [ ] Git installed
- [ ] Project renamed in `package.json` and `wrangler.jsonc`
- [ ] `.dev.vars` created from `.dev.vars.example`
- [ ] Cursor IDE installed and opens successfully
- [ ] Superwhisper installed and working with Cursor
- [ ] Repository cloned and opened in Cursor
- [ ] `npm install` completed without errors
- [ ] `npm run dev` starts the app and you can see it at localhost:3000
- [ ] You know how to open an AI chat tab in Cursor
- [ ] You know how to export a chat for submission
- [ ] Wrangler is authenticated with your Cloudflare account

---

## Troubleshooting

### `npm install` fails with permission errors

Do not run `sudo npm install`. It creates root-owned files inside your project and
usually causes worse failures later.

The usual cause is a Node installation owned by root. The reliable fix is to manage Node
with a version manager instead:

- **Mac/Linux**: install [nvm](https://github.com/nvm-sh/nvm), then run `nvm install --lts`
  and `nvm use --lts`
- **Windows**: reinstall Node from [nodejs.org](https://nodejs.org) using the official
  installer

Then delete `node_modules` and run `npm install` again.

### `npm run dev` shows "port already in use"

Another process is using port 3000. Either close it or run on a different port:
```
npm run dev -- --port 3001
```

### `npx wrangler login` does not open a browser

Copy the URL shown in the terminal and paste it into your browser manually.

### Git clone asks for a password

GitHub no longer supports password authentication. You need to either:
- Use the GitHub CLI (`gh auth login`) to authenticate
- Set up a personal access token: [https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)

### Cursor does not show the AI chat panel

Go to **View > AI Chat** in the menu bar, or press `Cmd+L` (Mac) / `Ctrl+L` (Windows/Linux).

---

## You are ready for Sprint 1

Once all items above are checked off, you have everything you need to begin. Open a new AI chat tab in Cursor, label it for Week 1, and start your first sprint.
