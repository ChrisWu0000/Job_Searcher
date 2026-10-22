# Autofill Extension: Requirements and Installation

## Requirements

- Google Chrome or a Chromium-based browser with Manifest V3 support
- The repository downloaded or cloned to your computer
- For AI-generated long answers only:
  - Python 3.12 recommended
  - A GitHub Copilot account with access to GPT-6 Luna
  - Bash (Git Bash on Windows, or Bash on macOS/Linux)
  - LiteLLM, installed automatically by the launcher below

The extension supports Greenhouse, Lever, Ashby, and Workday application pages. Loading the
extension does not require Bun, Node.js, or a build step.

## Install in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose the repository's `autofill-extension` folder.
5. Pin the extension from Chrome's extensions menu if you want quick access to its Options page.

Open **Options** to enter your profile and, if desired, upload your resume PDF. Your profile and
saved answers are stored in Chrome. The floating autofill panel appears on supported application
pages.

## Optional: enable AI answers

The extension sends requests to a local LiteLLM proxy configured for GitHub Copilot's
`gpt-6-luna` model. From the repository root, open **Git Bash** on Windows (not
PowerShell), or a Bash terminal on macOS/Linux, and run:

```bash
bash run.sh
```

The launcher creates an isolated `.venv-litellm` environment in the repository, installs missing
LiteLLM proxy dependencies, checks GitHub authorization, and starts the proxy. Subsequent runs
reuse the environment and saved authorization. On first sign-in, follow the displayed device
code instructions at <https://github.com/login/device> to authorize LiteLLM with your account.
Chrome's **Load unpacked** installation above still needs to be done manually.

To select a specific Python installation when creating the environment:

```bash
PYTHON="/path/to/python" bash run.sh
```

Keep that terminal open while using AI answers; press **Ctrl+C** to stop the proxy. Run
`bash run.sh` again whenever you need AI answers after closing the terminal or restarting.
The proxy is configured without an API
key, so keep it bound to `127.0.0.1`; do not change the host to `0.0.0.0` or expose it to your
network.

In the extension Options page, optionally add personal context in **About me**. The extension
includes the contact-redacted text in `autofill-extension/resume.txt` with each AI request; the
PDF itself is not sent. The question, profile, About me text, and a job-page excerpt are sent to
GitHub Copilot through the local proxy. Edit `autofill-extension/instructions.md` to change
answer-writing guidance. If you replace the resume PDF, update `resume.txt` as well.

After changing extension files, click **Reload** for the extension at `chrome://extensions` and
refresh any open application pages.
