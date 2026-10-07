(() => {
  const RULES = [
    ["firstName", /first\s*name|given\s*name|legal first/i],
    ["lastName", /last\s*name|family\s*name|surname|legal last/i],
    ["preferredName", /preferred\s*(first\s*)?name/i],
    ["fullName", /^(full\s*)?name\b|your name|legal name/i],
    ["email", /e-?mail/i],
    ["phone", /phone|mobile|telephone/i],
    ["linkedin", /linked\s*in/i],
    ["github", /git\s*hub/i],
    ["twitter", /twitter|x\.com/i],
    ["portfolio", /portfolio|personal (web)?site|website|other url/i],
    ["location", /current location|city|where are you (located|based)|^location/i],
    ["school", /school|university|college|institution/i],
    ["degree", /degree/i],
    ["major", /major|field of study|discipline/i],
    ["gpa", /gpa/i],
    ["gradYear", /graduat.*(year|date)|expected graduation/i],
    ["company", /current company|current employer|employer/i],
    ["title", /current (job )?title|job title/i],
  ];

  const YES_NO_RULES = [
    ["authorized", /authori[sz]ed to work|legally (authori[sz]ed|eligible)|eligible to work|work authori[sz]ation|right to work/i],
    ["sponsorship", /sponsor/i],
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const loadProfile = () =>
    new Promise((resolve) => chrome.storage.local.get("profile", (d) => resolve(d.profile || {})));

  const textOf = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

  const labelFor = (el) => {
    const parts = [];
    if (el.labels) for (const l of el.labels) parts.push(textOf(l));
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) parts.push(textOf(document.getElementById(id)));
    }
    parts.push(el.getAttribute("aria-label") || "");
    if (!parts.join("").trim()) {
      const wrap = el.closest("label, .field, .application-field, [class*='field'], [class*='Field'], li, fieldset");
      if (wrap) {
        const lab = wrap.querySelector("label, legend, .application-label");
        parts.push(textOf(lab) || textOf(wrap).slice(0, 120));
      }
    }
    parts.push(el.placeholder || "", el.name || "", el.id || "");
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };

  const setValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };

  const matchKey = (label, rules) => {
    for (const [key, re] of rules) if (re.test(label)) return key;
    return null;
  };

  const valueFor = (key, p) => {
    if (key === "fullName") return [p.firstName, p.lastName].filter(Boolean).join(" ");
    if (key === "preferredName") return p.preferredName || p.firstName;
    return p[key];
  };

  const pickOption = (select, wanted) => {
    const w = String(wanted).toLowerCase();
    const opts = [...select.options].filter((o) => o.value !== "");
    const hit =
      opts.find((o) => o.textContent.trim().toLowerCase() === w) ||
      opts.find((o) => o.textContent.toLowerCase().includes(w));
    if (!hit) return false;
    select.value = hit.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const fillCombobox = async (input, wanted) => {
    input.focus();
    setValue(input, wanted);
    await sleep(500);
    const root = input.closest("[class*='select'], [class*='Select']") || document;
    const option = root.querySelector("[role='option']") || document.querySelector("[role='listbox'] [role='option']");
    if (option) {
      option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      option.click();
      return;
    }
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
  };

  const fillYesNoGroups = (profile) => {
    let count = 0;
    const groups = new Map();
    for (const radio of document.querySelectorAll("input[type='radio']")) {
      const key = radio.name || radio.closest("fieldset")?.id;
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(radio);
    }
    for (const radios of groups.values()) {
      const container = radios[0].closest("fieldset, [role='group'], [class*='field'], [class*='Field'], [class*='question']");
      const question = textOf(container?.querySelector("legend, label, [class*='label']")) || textOf(container).slice(0, 200);
      const key = matchKey(question, YES_NO_RULES);
      if (!key || !profile[key]) continue;
      const re = profile[key] === "yes" ? /^yes\b/i : /^no\b/i;
      const target = radios.find((r) => re.test(textOf(r.closest("label")) || r.value));
      if (target && !target.checked) {
        target.click();
        count++;
      }
    }
    return count;
  };

  const attachResume = (profile) => {
    if (!profile.resumeData) return 0;
    const inputs = [...document.querySelectorAll("input[type='file']")];
    const resumeInput = inputs.find((i) => /resume|cv/i.test(labelFor(i))) || inputs[0];
    if (!resumeInput) return 0;
    const bytes = Uint8Array.from(atob(profile.resumeData), (c) => c.charCodeAt(0));
    const file = new File([bytes], profile.resumeName || "resume.pdf", { type: "application/pdf" });
    const dt = new DataTransfer();
    dt.items.add(file);
    resumeInput.files = dt.files;
    resumeInput.dispatchEvent(new Event("input", { bubbles: true }));
    resumeInput.dispatchEvent(new Event("change", { bubbles: true }));
    return 1;
  };

  const autofill = async () => {
    const profile = await loadProfile();
    let filled = 0;
    const fields = document.querySelectorAll(
      "input:not([type]), input[type='text'], input[type='email'], input[type='tel'], input[type='url'], textarea, select, input[role='combobox']",
    );
    for (const el of fields) {
      if (el.disabled || el.readOnly || el.offsetParent === null) continue;
      const isCombo = el.getAttribute("role") === "combobox";
      if (el.value && el.tagName !== "SELECT" && !isCombo) continue;
      const label = labelFor(el);
      let key = matchKey(label, YES_NO_RULES);
      let value;
      if (key && (el.tagName === "SELECT" || isCombo)) {
        value = profile[key] === "yes" ? "Yes" : profile[key] === "no" ? "No" : undefined;
      } else {
        key = matchKey(label, RULES);
        value = key ? valueFor(key, profile) : undefined;
      }
      if (!value) continue;
      if (el.tagName === "SELECT") {
        if (pickOption(el, value)) filled++;
      } else if (isCombo) {
        await fillCombobox(el, value);
        filled++;
      } else {
        setValue(el, String(value));
        filled++;
      }
    }
    filled += fillYesNoGroups(profile);
    filled += attachResume(profile);
    return filled;
  };

  const mountPanel = () => {
    if (document.getElementById("qaf-panel")) return;
    const panel = document.createElement("div");
    panel.id = "qaf-panel";
    panel.innerHTML =
      '<button class="qaf-close" title="Close">×</button><div class="qaf-title">Quick Autofill</div><button class="qaf-run">Autofill this application</button><div class="qaf-status"></div>';
    document.body.appendChild(panel);
    const status = panel.querySelector(".qaf-status");
    const run = panel.querySelector(".qaf-run");
    panel.querySelector(".qaf-close").addEventListener("click", () => panel.remove());
    run.addEventListener("click", async () => {
      run.disabled = true;
      status.textContent = "Filling...";
      try {
        const n = await autofill();
        status.textContent = n
          ? `Filled ${n} field${n === 1 ? "" : "s"}. Review before submitting.`
          : "Nothing to fill. Save your profile in the extension options.";
      } catch (error) {
        status.textContent = `Error: ${error.message}`;
      }
      run.disabled = false;
    });
  };

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg === "autofill") {
      autofill().then((n) => reply(n));
      return true;
    }
  });

  const hasApplicationForm = () => document.querySelector("form input, form textarea");
  if (window.top === window || hasApplicationForm()) {
    if (hasApplicationForm()) mountPanel();
    else {
      new MutationObserver((_, obs) => {
        if (hasApplicationForm()) {
          obs.disconnect();
          mountPanel();
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }
})();
