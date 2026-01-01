import fs from 'fs';

export function tryReadRuntimeConfig(runtimeConfigPath, runtimeConfigFileName) {
  if (!fs.existsSync(runtimeConfigPath)) {
    return { config: null, url: null };
  }

  try {
    const raw = fs.readFileSync(runtimeConfigPath, 'utf8');
    const parsed = JSON.parse(raw);
    const httpPort = Number(parsed.httpPort);
    if (!Number.isFinite(httpPort) || httpPort <= 0) {
      if (typeof runtimeConfigFileName === 'string' && runtimeConfigFileName.length > 0) {
        throw new Error(`Invalid httpPort in ${runtimeConfigFileName} (${runtimeConfigPath})`);
      }
      throw new Error(`Invalid httpPort in ${runtimeConfigPath}`);
    }
    const url = `http://localhost:${httpPort}`;
    return { config: parsed, url };
  } catch (error) {
    return { config: null, url: null, error };
  }
}
