/*
 * Copyright (c) 1998-2025 KX Systems Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 */

import { ChildProcess, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { ICommandResult, tryExecuteCommand } from "./cpUtils";
import { MessageKind, notify } from "./notifications";

const logger = "shell";

const isWin = process.platform === "win32";

export function log(childProcess: ChildProcess): void {
  notify(`Process ${childProcess.pid} killed`, MessageKind.DEBUG, {
    logger,
  });
}

export async function killPid(pid = NaN): Promise<void> {
  if (isNaN(pid)) {
    return;
  }

  let result: ICommandResult | undefined;
  if (isWin) {
    result = await tryExecuteCommand(undefined, killPidCommand(pid), log);
  } else if (process.platform === "darwin") {
    result = await tryExecuteCommand("/bin", killPidCommand(pid), log);
  }
  notify(`Destroying q process result: ${result}`, MessageKind.DEBUG, {
    logger,
  });
}

function killPidCommand(pid: number): string {
  return `kill ${pid}`;
  // return process.platform === 'win32' ? `taskkill /PID ${pid} /T /F` : `kill -9 ${pid}`;
}

/* c8 ignore next */
export function which(cmd: string): string[] {
  // This works on WSL, MacOS, Linux
  const res = execFileSync("/usr/bin/which", ["-a", cmd]);
  return new TextDecoder().decode(res).split(/(?:\r\n|[\r\n])/gs);
}

/* c8 ignore next */
export function stat(path: string): boolean {
  return existsSync(path);
}
