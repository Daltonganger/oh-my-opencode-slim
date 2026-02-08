const OPENCODE_PATHS = [
  'opencode',
  `${process.env.HOME}/.local/bin/opencode`,
  `${process.env.HOME}/.opencode/bin/opencode`,
  '/usr/local/bin/opencode',
  '/opt/opencode/bin/opencode',
  `${process.env.HOME}/bin/opencode`,
];

let cachedOpenCodePath: string | null = null;

export function resolveOpenCodePath(): string {
  if (cachedOpenCodePath) {
    return cachedOpenCodePath;
  }

  for (const opencodePath of OPENCODE_PATHS) {
    try {
      // Check if we can execute it
      const proc = Bun.spawn([opencodePath, '--version'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      // Don't wait for exit here, just check if spawn worked
      cachedOpenCodePath = opencodePath;
      return opencodePath;
    } catch {
      // Try next path
    }
  }

  // Fallback to 'opencode' and hope it's in PATH
  return 'opencode';
}

export async function isOpenCodeInstalled(): Promise<boolean> {
  for (const opencodePath of OPENCODE_PATHS) {
    try {
      const proc = Bun.spawn([opencodePath, '--version'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      await proc.exited;
      if (proc.exitCode === 0) {
        cachedOpenCodePath = opencodePath;
        return true;
      }
    } catch {
      // Try next path
    }
  }
  return false;
}

export async function isTmuxInstalled(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['tmux', '-V'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export async function getOpenCodeVersion(): Promise<string | null> {
  const opencodePath = resolveOpenCodePath();
  try {
    const proc = Bun.spawn([opencodePath, '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode === 0) {
      return output.trim();
    }
  } catch {
    // Failed
  }
  return null;
}

export function getOpenCodePath(): string | null {
  const path = resolveOpenCodePath();
  return path === 'opencode' ? null : path;
}

export async function fetchLatestVersion(
  packageName: string,
): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
    if (!res.ok) return null;
    const data = (await res.json()) as { version: string };
    return data.version;
  } catch {
    return null;
  }
}
