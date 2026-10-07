const FIELDS = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["preferredName", "Preferred name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["location", "Current city / location"],
  ["linkedin", "LinkedIn URL"],
  ["github", "GitHub URL"],
  ["twitter", "Twitter / X URL"],
  ["portfolio", "Portfolio / website URL"],
  ["school", "School"],
  ["degree", "Degree"],
  ["major", "Major"],
  ["gpa", "GPA"],
  ["gradYear", "Graduation year"],
  ["company", "Current company"],
  ["title", "Current job title"],
];

const YES_NO = [
  ["authorized", "Authorized to work in the country?"],
  ["sponsorship", "Will you require sponsorship?"],
];

const form = document.getElementById("form");
const status = document.getElementById("status");
let resume = {};

const add = (html) => form.insertAdjacentHTML("beforeend", html);
for (const [key, label] of FIELDS) add(`<label for="${key}">${label}</label><input id="${key}" />`);
for (const [key, label] of YES_NO) {
  add(
    `<label for="${key}">${label}</label><select id="${key}"><option value="">Skip</option><option value="yes">Yes</option><option value="no">No</option></select>`,
  );
}
add('<label for="resume">Resume (PDF)</label><input id="resume" type="file" accept="application/pdf" /><div id="resumeName"></div>');

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

document.getElementById("resume").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  resume = { resumeData: await toBase64(file), resumeName: file.name };
  document.getElementById("resumeName").textContent = file.name;
});

chrome.storage.local.get("profile", ({ profile = {} }) => {
  for (const [key] of [...FIELDS, ...YES_NO]) document.getElementById(key).value = profile[key] || "";
  resume = { resumeData: profile.resumeData, resumeName: profile.resumeName };
  document.getElementById("resumeName").textContent = profile.resumeName || "";
});

document.getElementById("save").addEventListener("click", () => {
  const profile = { ...resume };
  for (const [key] of [...FIELDS, ...YES_NO]) profile[key] = document.getElementById(key).value.trim();
  chrome.storage.local.set({ profile }, () => {
    status.textContent = "Saved";
    setTimeout(() => (status.textContent = ""), 1500);
  });
});
