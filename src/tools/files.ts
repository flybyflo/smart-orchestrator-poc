import { readdir } from "node:fs/promises";
import path from "node:path";
import { resolveWorkspacePath, throwIfAborted } from "./paths.js";

export async function findFilesByExtension(
  directory: string,
  extension: string,
  options: {
    signal?: AbortSignal;
  } = {},
): Promise<string[]> {
  const root = await resolveWorkspacePath(directory, { directory: true });
  return findFilesByExtensionAbsolute(root.absolutePath, extension, {
    rootDirectory: root.absolutePath,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

async function findFilesByExtensionAbsolute(
  directory: string,
  extension: string,
  options: {
    rootDirectory: string;
    signal?: AbortSignal;
  },
): Promise<string[]> {
  throwIfAborted(options.signal);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    throwIfAborted(options.signal);
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(
        ...(await findFilesByExtensionAbsolute(entryPath, extension, options)),
      );
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(path.relative(process.cwd(), entryPath));
    }
  }

  return files.sort();
}
