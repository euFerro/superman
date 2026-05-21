import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { EventType, EventSeverity } from './superman-logger.types';
import { FullLog } from './log-sink';
import { config } from '../config/superman-config';
import { resolveEnvironment } from '../config/resolve-environment';

export const SERVER_INSTANCE_UID: string = randomUUID();

const HOSTNAME: string = os.hostname();

const resolveAppMetadata = (): { name: string; version: string } => {
  const fallback = { name: 'unknown-app', version: '0.0.0' };

  if (process.env.npm_package_name && process.env.npm_package_version) {
    return {
      name: process.env.npm_package_name,
      version: process.env.npm_package_version,
    };
  }

  try {
    let dir = process.cwd();
    for (let depth = 0; depth < 10; depth++) {
      const candidate = path.join(dir, 'package.json');
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
          name?: string;
          version?: string;
        };
        if (pkg.name) {
          return { name: pkg.name, version: pkg.version ?? fallback.version };
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // logger not yet ready â€” fall through to fallback
  }

  return fallback;
};

export const { name: APP_NAME, version: APP_VERSION } = resolveAppMetadata();

export interface InfraFields {
  '@timestamp': string;
  context: string;
  eventType: EventType;
  appName: string;
  appVersion: string;
  environment: string;
  serverInstanceUid: string;
  hostname: string;
  uptimeMs: number;
  memoryUsage: number;
  cpuUsage: number;
}

export const resolveInfraFields = (context: string, eventType: EventType): InfraFields => ({
  '@timestamp': new Date().toISOString(),
  context,
  eventType,
  appName: APP_NAME,
  appVersion: APP_VERSION,
  environment: config.isInitialized() ? config.environment : resolveEnvironment(),
  serverInstanceUid: SERVER_INSTANCE_UID,
  hostname: HOSTNAME,
  uptimeMs: Math.round(process.uptime() * 1000),
  memoryUsage: process.memoryUsage().heapUsed,
  cpuUsage: process.cpuUsage().user,
});

export const buildFullLog = (
  context: string,
  eventType: EventType,
  partial: Record<string, unknown>,
  defaultSeverity: EventSeverity,
): FullLog => {
  const infra = resolveInfraFields(context, eventType);
  return {
    ...infra,
    eventSeverity: defaultSeverity,
    ...partial,
  } as FullLog;
};

