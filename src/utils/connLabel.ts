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

import { workspace } from "vscode";

import { ext } from "../extensionVariables";
import { MessageKind, notify } from "./notifications";
import { ConnectionLabel, Labels } from "../models/labels";
import { NewConnectionPannel } from "../panels/newConnection";
import { InsightsNode, KdbNode } from "../services/kdbTreeProvider";

const logger = "connLabel";

export function getWorkspaceLabels() {
  const existingConnLbls = workspace
    .getConfiguration()
    .get<Labels[]>("kdb.connectionLabels");
  ext.connLabelList.length = 0;
  if (existingConnLbls && existingConnLbls.length > 0) {
    const sortedLabels = existingConnLbls.sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    sortedLabels.forEach((label: Labels) => {
      ext.connLabelList.push(label);
    });
  }
}

export function clearWorkspaceLabels() {
  getWorkspaceLabels();
  getWorkspaceLabelsConnMap();

  if (ext.connLabelList.length === 0) {
    notify(
      "Cleaning connection mappings for nonexistent labels.",
      MessageKind.DEBUG,
      {
        logger,
        telemetry: "Label.Cleanup.NoLabels",
      },
    );
    workspace.getConfiguration().update("kdb.labelsConnectionMap", [], true);
    return;
  }

  const validLabelNames = new Set(ext.connLabelList.map((label) => label.name));
  const initialLength = ext.labelConnMapList.length;

  for (let i = ext.labelConnMapList.length - 1; i >= 0; i--) {
    if (!validLabelNames.has(ext.labelConnMapList[i].labelName)) {
      ext.labelConnMapList.splice(i, 1);
    }
  }

  const removedCount = initialLength - ext.labelConnMapList.length;
  if (removedCount > 0) {
    workspace
      .getConfiguration()
      .update("kdb.labelsConnectionMap", ext.labelConnMapList, true);

    notify(
      `Removed ${removedCount} orphaned label connection mapping${removedCount > 1 ? "s" : ""}.`,
      MessageKind.DEBUG,
      {
        logger,
        telemetry: "Label.Cleanup.OrphanedMappings",
        measurements: { removedMappings: removedCount },
      },
    );
  }
}

export function createNewLabel(name: string, colorName: string) {
  getWorkspaceLabels();
  const color = ext.labelColors.find(
    (color) => color.name.toLowerCase() === colorName.toLowerCase(),
  );
  if (name === "") {
    notify("Label name can't be empty.", MessageKind.ERROR, { logger });
  }
  if (color && name !== "") {
    const newLbl: Labels = {
      name: name,
      color: color,
    };

    ext.connLabelList.push(newLbl);
    ext.connLabelList.sort((a, b) => a.name.localeCompare(b.name));

    workspace
      .getConfiguration()
      .update("kdb.connectionLabels", ext.connLabelList, true);

    notify("Connection label created.", MessageKind.DEBUG, {
      logger,
      telemetry: "Label.Create",
      measurements: getLabelStatistics(),
    });
  } else {
    notify("No Color selected for the label.", MessageKind.ERROR, {
      logger,
    });
  }
}

export function getWorkspaceLabelsConnMap() {
  const existingLabelConnMaps = workspace
    .getConfiguration()
    .get<ConnectionLabel[]>("kdb.labelsConnectionMap");
  ext.labelConnMapList.length = 0;
  if (existingLabelConnMaps && existingLabelConnMaps.length > 0) {
    existingLabelConnMaps.forEach((labelConnMap: ConnectionLabel) => {
      const sortedLabelConnMap: ConnectionLabel = {
        labelName: labelConnMap.labelName,
        connections: labelConnMap.connections.sort((a, b) =>
          a.localeCompare(b),
        ),
      };

      ext.labelConnMapList.push(sortedLabelConnMap);
    });
  }
}

export function addConnToLabel(labelName: string, connName: string) {
  const label = ext.connLabelList.find(
    (lbl) => lbl.name.toLowerCase() === labelName.toLowerCase(),
  );
  if (label) {
    if (ext.labelConnMapList.length > 0) {
      const labelConnMap = ext.labelConnMapList.find(
        (lbl) => lbl.labelName === labelName,
      );
      if (labelConnMap) {
        if (!labelConnMap.connections.includes(connName)) {
          labelConnMap.connections.push(connName);
        }
      } else {
        ext.labelConnMapList.push({
          labelName: labelName,
          connections: [connName],
        });
      }
    } else {
      ext.labelConnMapList.push({
        labelName: labelName,
        connections: [connName],
      });
    }
    notify("Connection assigned to label.", MessageKind.DEBUG, {
      logger,
      telemetry: "Label.Assign.Connection",
      measurements: getConnectionLabelStatistics(connName),
    });
  }
}

export function removeConnFromLabels(connName: string) {
  ext.labelConnMapList.forEach((labelConnMap) => {
    if (labelConnMap.connections.includes(connName)) {
      labelConnMap.connections = labelConnMap.connections.filter(
        (conn: string) => conn !== connName,
      );
    }
  });
  workspace
    .getConfiguration()
    .update("kdb.labelsConnectionMap", ext.labelConnMapList, true);

  notify("Connection removed from label.", MessageKind.DEBUG, {
    logger,
    telemetry: "Label.Remove.Connection",
    measurements: getConnectionLabelStatistics(connName),
  });
}

export async function handleLabelsConnMap(labels: string[], connName: string) {
  removeConnFromLabels(connName);
  labels.forEach((label) => {
    addConnToLabel(label, connName);
  });
  await workspace
    .getConfiguration()
    .update("kdb.labelsConnectionMap", ext.labelConnMapList, true);
}

export function retrieveConnLabelsNames(
  conn: KdbNode | InsightsNode,
): string[] {
  const connName =
    conn instanceof KdbNode ? conn.details.serverAlias : conn.details.alias;
  const labels: string[] = [];
  ext.labelConnMapList.forEach((labelConnMap) => {
    if (labelConnMap.connections.includes(connName)) {
      labels.push(labelConnMap.labelName);
    }
  });
  return labels;
}

export function renameLabel(name: string, newName: string) {
  getWorkspaceLabels();
  const found = ext.connLabelList.find((item) => item.name === name);
  if (found) {
    found.name = newName;
  }
  getWorkspaceLabelsConnMap();
  const target = ext.labelConnMapList.find((item) => item.labelName === name);
  if (target) {
    target.labelName = newName;
  }
  workspace
    .getConfiguration()
    .update("kdb.labelsConnectionMap", ext.labelConnMapList, true)
    .then(() =>
      workspace
        .getConfiguration()
        .update("kdb.connectionLabels", ext.connLabelList, true),
    );
  NewConnectionPannel.refreshLabels();
}

export function setLabelColor(name: string, color: string) {
  getWorkspaceLabels();
  const found = ext.connLabelList.find((item) => item.name === name);
  if (found) {
    const target = ext.labelColors.find((value) => value.name === color);
    if (target) {
      found.color = target;
    }
  }
  workspace
    .getConfiguration()
    .update("kdb.connectionLabels", ext.connLabelList, true);
  NewConnectionPannel.refreshLabels();
}

export function deleteLabel(name: string) {
  getWorkspaceLabels();
  const found = ext.connLabelList.find((item) => item.name === name);
  if (found) {
    ext.connLabelList.splice(ext.connLabelList.indexOf(found), 1);
  }
  workspace
    .getConfiguration()
    .update("kdb.connectionLabels", ext.connLabelList, true);

  notify("Connection label deleted.", MessageKind.DEBUG, {
    logger,
    telemetry: "Label.Delete",
    measurements: getLabelStatistics(),
  });

  NewConnectionPannel.refreshLabels();
}

export function isLabelEmpty(name: string) {
  const found = ext.labelConnMapList.find((item) => item.labelName === name);
  if (found) {
    return found.connections.length === 0;
  }
  return true;
}

export function isLabelContentChanged(name: string) {
  const found = ext.latestLblsChanged.find((item) => item === name);
  if (found) {
    return true;
  }
  return false;
}

export function getLabelStatistics(): Record<string, number> {
  const statistics: Record<string, number> = {
    count: ext.connLabelList.length,
  };

  ext.labelColors.forEach((color) => {
    statistics[color.name] = 0;
  });

  ext.connLabelList.forEach((label) => {
    if (label.color && label.color.name in statistics) {
      statistics[label.color.name]++;
    }
  });

  return statistics;
}

export function getConnectionLabelStatistics(
  connName: string,
): Record<string, number> {
  const statistics: Record<string, number> = { count: 0 };

  ext.labelColors.forEach((color) => {
    statistics[color.name] = 0;
  });

  const linkedLabels = ext.labelConnMapList
    .filter((connectionLabel) => connectionLabel.connections.includes(connName))
    .map((connectionLabel) => connectionLabel.labelName);

  ext.connLabelList.forEach((label) => {
    if (linkedLabels.includes(label.name)) {
      statistics.count++;
      if (label.color && label.color.name in statistics) {
        statistics[label.color.name]++;
      }
    }
  });

  return statistics;
}
