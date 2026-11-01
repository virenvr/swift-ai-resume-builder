import { copyFile, rename, writeFile } from "fs/promises";
import {
  discoverResumeTypes,
  isValidResumeTypeSlug,
  masterBackupPathFor,
  masterPathFor,
  templatePathFor,
} from "@/lib/resume/resumeTypes";

// Tailoring only rewrites these sections. Without them a template compiles fine but
// comes out untailored, with no error, so refuse it up front.
const REQUIRED_SECTIONS = ["SKILLS", "EXPERIENCE"];

function checkTemplate(tex: string): void {
  if (!tex.includes("\\documentclass") || !tex.includes("\\begin{document}")) {
    throw new Error(
      "That isn't a complete LaTeX resume: it needs \\documentclass and \\begin{document}.",
    );
  }
  const missing = REQUIRED_SECTIONS.filter((section) => {
    const start = tex.indexOf(`% === ${section}_START ===`);
    const end = tex.indexOf(`% === ${section}_END ===`);
    return start === -1 || end < start;
  });
  if (missing.length) {
    throw new Error(
      `Your resume is missing the section markers for ${missing.join(" and ")}. Wrap each section in comments like "% === ${missing[0]}_START ===" and "% === ${missing[0]}_END ===" so Taylor knows what it may edit.`,
    );
  }
}

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Saves an uploaded template under a new type, or over an existing one when replaceType
 * is set. Returns the type. The master JSON still needs rebuilding afterwards.
 */
export async function saveUploadedResume(args: {
  texSource: string;
  name?: string;
  replaceType?: string;
}): Promise<string> {
  const { texSource, name, replaceType } = args;
  checkTemplate(texSource);

  const known = (await discoverResumeTypes()).map((t) => t.type);
  const type = replaceType ?? slugFromName(name ?? "");
  if (!isValidResumeTypeSlug(type)) throw new Error("Give this resume a name.");

  if (replaceType) {
    if (!known.includes(type)) throw new Error(`There's no resume type called ${type}.`);
    await copyFile(templatePathFor(type), templatePathFor(`${type}.backup`));
    // Moved rather than left in place: it describes the old resume, and tailoring from it
    // or rebuilding on top of it would put the old resume's content in this one.
    await rename(masterPathFor(type), masterBackupPathFor(type)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  } else if (known.includes(type)) {
    throw new Error(`A resume called ${type} already exists. Pick a new name, or choose it in the list to replace it.`);
  }

  const target = templatePathFor(type);
  await writeFile(`${target}.tmp`, texSource, "utf8");
  await rename(`${target}.tmp`, target);
  return type;
}
