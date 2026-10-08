# Autofill Extension: Requirements and Installation

## Requirements

- Google Chrome or a Chromium-based browser with Manifest V3 support
- The repository downloaded or cloned to your computer
- For AI-generated long answers only:
  - Python 3.12 recommended
  - A GitHub Copilot account with access to Claude Haiku 5.5
  - LiteLLM, installed as described below

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
`claude-haiku-5.5` model. To install and authorize the proxy, open PowerShell and run:

```powershell
python -m pip install "litellm[proxy]"
python -c "from litellm.llms.github_copilot.authenticator import Authenticator; Authenticator().get_access_token()"
```

When the sign-in command displays a code, visit <https://github.com/login/device> and authorize
LiteLLM with your GitHub account. Then start the proxy in PowerShell:

```powershell
$env:LITELLM_DANGEROUSLY_PERMIT_WEAK_OR_UNSET_MASTER_KEY = "true"
python -m litellm.proxy.proxy_cli --model github_copilot/claude-haiku-5.5 --host 127.0.0.1 --port 4000
```

Keep that PowerShell window open while using AI answers. The proxy is configured without an API
key, so keep it bound to `127.0.0.1`; do not change the host to `0.0.0.0` or expose it to your
network.

In the extension Options page, optionally add personal context in **About me**. The extension
includes the contact-redacted text in `autofill-extension/resume.txt` with each AI request; the
PDF itself is not sent. The question, profile, About me text, and a job-page excerpt are sent to
GitHub Copilot through the local proxy. Edit `autofill-extension/instructions.md` to change
answer-writing guidance. If you replace the resume PDF, update `resume.txt` as well.

After changing extension files, click **Reload** for the extension at `chrome://extensions` and
refresh any open application pages.
