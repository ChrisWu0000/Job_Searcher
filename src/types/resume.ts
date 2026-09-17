import type { z } from "zod";
import type {
  bulletChoiceSchema,
  entryChoiceSchema,
  experienceBulletSchema,
  experienceEntrySchema,
  experienceKindSchema,
  latexSnippetsSchema,
  resumeSelectionSchema,
  resumeSettingsSchema,
  skillChoiceSchema,
  skillGroupSchema,
  tailoredResumeSchema,
  tailoringSourceSchema,
} from "./schemas";

export type ExperienceKind = z.infer<typeof experienceKindSchema>;
export type ExperienceBullet = z.infer<typeof experienceBulletSchema>;
export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;
export type SkillGroup = z.infer<typeof skillGroupSchema>;
export type LatexSnippets = z.infer<typeof latexSnippetsSchema>;
export type ResumeSettings = z.infer<typeof resumeSettingsSchema>;
export type BulletChoice = z.infer<typeof bulletChoiceSchema>;
export type EntryChoice = z.infer<typeof entryChoiceSchema>;
export type SkillChoice = z.infer<typeof skillChoiceSchema>;
export type ResumeSelection = z.infer<typeof resumeSelectionSchema>;
export type TailoringSource = z.infer<typeof tailoringSourceSchema>;
export type TailoredResume = z.infer<typeof tailoredResumeSchema>;

export const experienceKinds: ExperienceKind[] = [
  "education",
  "work",
  "project",
  "leadership",
  "award",
];

export const experienceKindLabels: Record<ExperienceKind, string> = {
  education: "Education",
  work: "Experience",
  project: "Projects",
  leadership: "Leadership",
  award: "Awards",
};

export const snippetPlaceholders = {
  document: ["body"],
  section: ["title", "entries"],
  entry: ["title", "organization", "location", "dates", "technologies", "link", "bullets"],
  project: ["title", "organization", "location", "dates", "technologies", "link", "bullets"],
  bullet: ["text"],
  skills: ["title", "groups"],
  skillGroup: ["name", "items"],
} as const satisfies Record<keyof LatexSnippets, readonly string[]>;

export const defaultLatexDocument = String.raw`\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\input{glyphtounicode}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\pdfgentounicode=1

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

\begin{document}

\begin{center}
    \textbf{\Huge \scshape Your Name} \\ \vspace{1pt}
    \small 123-456-7890 $|$ \href{mailto:you@example.com}{\underline{you@example.com}} $|$
    \href{https://linkedin.com/in/you}{\underline{linkedin.com/in/you}} $|$
    \href{https://github.com/you}{\underline{github.com/you}}
\end{center}

<<body>>

\end{document}
`;

export const defaultLatexSnippets: LatexSnippets = {
  document: defaultLatexDocument,
  section: String.raw`\section{<<title>>}
\resumeSubHeadingListStart
<<entries>>
\resumeSubHeadingListEnd
`,
  entry: String.raw`\resumeSubheading
  {<<title>>}{<<dates>>}
  {<<organization>>}{<<location>>}
\resumeItemListStart
<<bullets>>
\resumeItemListEnd
`,
  project: String.raw`\resumeProjectHeading
  {\textbf{<<title>>} $|$ \emph{<<technologies>>}}{<<dates>>}
\resumeItemListStart
<<bullets>>
\resumeItemListEnd
`,
  bullet: String.raw`\resumeItem{<<text>>}
`,
  skills: String.raw`\section{<<title>>}
\begin{itemize}[leftmargin=0.15in, label={}]
  \small{\item{
<<groups>>
  }}
\end{itemize}
`,
  skillGroup: String.raw`    \textbf{<<name>>}{: <<items>>} \\
`,
};

export const defaultResumeSettings: ResumeSettings = {
  id: "me",
  snippets: defaultLatexSnippets,
  sectionOrder: ["education", "work", "project", "leadership", "award"],
  sectionTitles: { ...experienceKindLabels },
  skillsTitle: "Technical Skills",
  skillGroups: [],
  maxBulletsPerEntry: 4,
  maxEntriesPerSection: 4,
  tailoringInstructions: "",
  version: "",
  updatedAt: "",
};
