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

import extract from "extract-zip";
import { copy, ensureDir, existsSync, pathExists } from "fs-extra";
import fetch from "node-fetch";
import { writeFile } from "node:fs/promises";
import { env, exit } from "node:process";
import { join } from "path";
import {
  ConfigurationTarget,
  InputBoxOptions,
  QuickPickItem,
  Uri,
  commands,
  window,
  workspace,
} from "vscode";

import { ext } from "../extensionVariables";
import { Server } from "../models/connectionsModels";
import {
  licenseAquire,
  licenseFileInput,
  licenseItems,
  licensePlaceholder,
  licenseString,
  licenseStringInput,
  licenseTypePlaceholder,
  licenseTypes,
  licenseWorkflow,
} from "../models/items/license";
import {
  onboardingInput,
  onboardingWorkflow,
} from "../models/items/onboarding";
import { KdbNode } from "../services/kdbTreeProvider";
import {
  addLocalConnectionContexts,
  addLocalConnectionStatus,
  convertBase64License,
  delay,
  getKeyForServerName,
  getOsFile,
  getServerName,
  getServers,
  getWorkspaceFolder,
  removeLocalConnectionStatus,
  saveLocalProcessObj,
  updateServers,
} from "../utils/core";
import { executeCommand } from "../utils/cpUtils";
import { MessageKind, Runner, notify } from "../utils/notifications";
import { openUrl } from "../utils/openUrl";
import { validateServerPort } from "../validators/kdbValidator";

const logger = "install";

export async function installTools(): Promise<void> {
  let file: Uri[] | undefined;

  await commands.executeCommand("notifications.clearAll");
  await commands.executeCommand("welcome.goBack");

  const licenseTypeResult: QuickPickItem | undefined =
    await window.showQuickPick(licenseItems, {
      placeHolder: licensePlaceholder,
      ignoreFocusOut: true,
    });

  if (licenseTypeResult?.label === licenseAquire) {
    let licenseCancel;
    await openUrl(ext.kdbInstallUrl);
    await notify(
      licenseWorkflow.prompt,
      MessageKind.INFO,
      {},
      licenseWorkflow.option1,
      licenseWorkflow.option2,
    ).then(async (res) => {
      if (res === licenseWorkflow.option2) {
        licenseCancel = true;
      }
    });
    if (licenseCancel) return;
  }

  const licenseResult: QuickPickItem | undefined = await window.showQuickPick(
    licenseTypes,
    {
      placeHolder: licenseTypePlaceholder,
      ignoreFocusOut: true,
    },
  );

  if (licenseResult === undefined) {
    return;
  } else if (licenseResult.label == licenseString) {
    const licenseInput: InputBoxOptions = {
      prompt: licenseStringInput.prompt,
      placeHolder: licenseStringInput.placeholder,
      ignoreFocusOut: true,
    };

    await window.showInputBox(licenseInput).then(async (encodedLicense) => {
      if (encodedLicense !== undefined) {
        file = [await convertBase64License(encodedLicense)];
      }
    });
  } else {
    file = await window.showOpenDialog({
      canSelectFiles: licenseFileInput.canSelectFiles,
      canSelectFolders: licenseFileInput.canSelectFolders,
      canSelectMany: licenseFileInput.canSelectMany,
      openLabel: licenseFileInput.openLabel,
    });
  }

  if (!file) {
    throw new Error();
  }

  const runner = Runner.create(async (progress, token) => {
    token.onCancellationRequested(() => {
      notify("User cancelled the installation.", MessageKind.DEBUG, {
        logger,
      });
    });

    progress.report({ increment: 0 });

    // download the binaries
    progress.report({ increment: 20, message: "Getting the binaries..." });
    const osFile = getOsFile();
    if (osFile === undefined) {
      notify(
        "Unsupported operating system, unable to download binaries.",
        MessageKind.ERROR,
        { logger, telemetry: true },
      );
    } else {
      const gpath = join(ext.context.globalStorageUri.fsPath, osFile);
      if (!existsSync(gpath)) {
        const runtimeUrl = `${ext.kdbDownloadPrefixUrl}${osFile}`;
        const response = await fetch(runtimeUrl);
        if (response.status > 200) {
          notify("Invalid or unavailable download url.", MessageKind.ERROR, {
            logger,
            params: runtimeUrl,
            telemetry: true,
          });
          exit(1);
        }
        await ensureDir(ext.context.globalStorageUri.fsPath);
        await writeFile(gpath, Buffer.from(await response.arrayBuffer()));
      }
      await extract(gpath, { dir: ext.context.globalStorageUri.fsPath });
    }

    // move the license file
    progress.report({ increment: 30, message: "Moving license file..." });
    await delay(500);
    await ensureDir(ext.context.globalStorageUri.fsPath);
    await copy(
      file![0].fsPath,
      join(ext.context.globalStorageUri.fsPath, ext.kdbLicName),
    );

    // add the env var for the process
    progress.report({
      increment: 60,
      message: "Setting up environment...",
    });
    await delay(500);
    // TODO 1: This is wrong, env vars should be read only.
    env.QHOME = ext.context.globalStorageUri.fsPath;

    // persist the QHOME to global settings
    await workspace
      .getConfiguration()
      .update("kdb.qHomeDirectory", env.QHOME, ConfigurationTarget.Global);

    // update walkthrough
    const QHOME = workspace
      .getConfiguration()
      .get<string>("kdb.qHomeDirectory");
    if (QHOME) {
      // TODO 1: This is wrong, env vars should be read only.
      env.QHOME = QHOME;
      if (!pathExists(env.QHOME)) {
        notify("QHOME path stored is empty", MessageKind.ERROR, {
          logger,
        });
      }
      await writeFile(
        join(__dirname, "qinstall.md"),
        `# q runtime installed location: \n### ${QHOME}`,
      );
      notify(`Installation of q found here: ${QHOME}`, MessageKind.DEBUG, {
        logger,
      });
    }
  });
  runner.title = "Installing q.";
  runner.execute().then(async () => {
    notify(
      onboardingWorkflow.prompt(ext.context.globalStorageUri.fsPath),
      MessageKind.INFO,
      {},
      onboardingWorkflow.option1,
      onboardingWorkflow.option2,
    ).then(async (startResult) => {
      if (startResult === onboardingWorkflow.option1) {
        const portInput: InputBoxOptions = {
          prompt: onboardingInput.prompt,
          placeHolder: onboardingInput.placeholder,
          ignoreFocusOut: true,
          validateInput: (value: string | undefined) =>
            validateServerPort(value),
        };
        window.showInputBox(portInput).then(async (port) => {
          if (port) {
            let servers: Server | undefined = getServers();
            if (servers != undefined && servers[getKeyForServerName("local")]) {
              notify(
                `Server localhost:${port} already exists in configuration store`,
                MessageKind.ERROR,
                { logger, telemetry: true },
              );
            } else {
              const key = "local";
              if (servers === undefined) {
                servers = {
                  key: {
                    auth: false,
                    serverName: "localhost",
                    serverPort: port,
                    serverAlias: "local",
                    managed: true,
                    tls: false,
                  },
                };
                await addLocalConnectionContexts(getServerName(servers[0]));
              } else {
                servers[key] = {
                  auth: false,
                  serverName: "localhost",
                  serverPort: port,
                  serverAlias: "local",
                  managed: true,
                  tls: false,
                };
                await addLocalConnectionContexts(getServerName(servers[key]));
              }
              await updateServers(servers);
              const newServers = getServers();
              if (newServers != undefined) {
                ext.serverProvider.refresh(newServers);
              }
            }
          }
          await startLocalProcessByServerName(
            `localhost:${port} [local]`,
            getKeyForServerName("local"),
            Number(port),
          );
        });
      }
    });
  });
}

export async function startLocalProcessByServerName(
  serverName: string,
  index: string,
  port: number,
): Promise<void> {
  const workingDirectory = await getWorkspaceFolder(
    workspace.getConfiguration().get<string>("kdb.qHomeDirectory")!,
  );

  try {
    await addLocalConnectionStatus(serverName);
    await executeCommand(
      workingDirectory,
      "q",
      saveLocalProcessObj,
      "-p",
      port.toString(),
      index,
    );
  } catch {
    await removeLocalConnectionStatus(serverName);
    notify("Error starting q process.", MessageKind.ERROR, { logger });
  }
}

export async function startLocalProcess(viewItem: KdbNode): Promise<void> {
  await startLocalProcessByServerName(
    `${getServerName(viewItem.details)}`,
    viewItem.children[0],
    parseInt(viewItem.details.serverPort),
  );
}

export async function stopLocalProcess(viewItem: KdbNode): Promise<void> {
  ext.localProcessObjects[viewItem.children[0]].kill();
  notify(
    `Child process id ${ext.localProcessObjects[viewItem.children[0]]
      .pid!} removed in cache.`,
    MessageKind.DEBUG,
    { logger },
  );
  await removeLocalConnectionStatus(`${getServerName(viewItem.details)}`);
}

export async function stopLocalProcessByServerName(
  serverName: string,
): Promise<void> {
  ext.localProcessObjects[serverName].kill();
  notify(
    `Child process id ${ext.localProcessObjects[serverName].pid!} removed in cache.`,
    MessageKind.DEBUG,
    { logger },
  );
}
