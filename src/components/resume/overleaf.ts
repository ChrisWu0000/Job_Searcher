export const overleafDocsUrl = "https://www.overleaf.com/docs";

function hiddenInput(name: string, value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  return input;
}

export function openInOverleaf(latex: string): void {
  const form = document.createElement("form");
  form.method = "post";
  form.action = overleafDocsUrl;
  form.target = "_blank";
  form.style.display = "none";
  form.append(hiddenInput("encoded_snip", encodeURIComponent(latex)));
  form.append(hiddenInput("snip_name", "resume.tex"));
  document.body.append(form);
  form.submit();
  form.remove();
}
