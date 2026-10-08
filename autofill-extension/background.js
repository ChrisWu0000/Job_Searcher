const LITELLM_URL = "http://127.0.0.1:4000";
const MODEL = "github_copilot/claude-haiku-5.5";

chrome.storage.local.remove("ai");

const getInstructions = async () => {
  const response = await fetch(chrome.runtime.getURL("instructions.md"));
  if (!response.ok) throw new Error(`Could not load instructions.md (${response.status}).`);
  const instructions = await response.text();
  if (!instructions.trim()) throw new Error("instructions.md is empty.");
  return instructions;
};

const getResumeText = async () => {
  const response = await fetch(chrome.runtime.getURL("resume.txt"));
  if (!response.ok) throw new Error(`Could not load resume.txt (${response.status}).`);
  const resumeText = await response.text();
  if (!resumeText.trim()) throw new Error("resume.txt is empty.");
  return resumeText;
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== "ai") return;
  (async () => {
    const messages = (Array.isArray(msg.messages) ? msg.messages : []).filter((item) => item?.role !== "system");
    const [instructions, resumeText] = await Promise.all([getInstructions(), getResumeText()]);
    messages.unshift({
      role: "system",
      content: `${instructions}\n\n## Applicant resume text\nUse this as the factual source for the applicant's experience, education, projects, skills, and certifications. Draw only on details relevant to the question; do not reproduce the resume wholesale.\n\n${resumeText}`,
    });
    const response = await fetch(`${LITELLM_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.7 }),
    });
    if (!response.ok) throw new Error(`LLM error ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response from the model.");
    return text;
  })().then(
    (text) => reply({ text }),
    (error) => reply({ error: error.message }),
  );
  return true;
});
