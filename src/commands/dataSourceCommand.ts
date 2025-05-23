/*
 * Copyright (c) 1998-2025 Kx Systems Inc.
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

import * as fs from "fs";
import path from "path";
import { InputBoxOptions, window } from "vscode";

import { ext } from "../extensionVariables";
import {
  writeQueryResultsToConsole,
  writeQueryResultsToView,
} from "./serverCommand";
import { InsightsConnection } from "../classes/insightsConnection";
import { LocalConnection } from "../classes/localConnection";
import { ServerType } from "../models/connectionsModels";
import { GetDataError, getDataBodyPayload } from "../models/data";
import {
  DataSourceFiles,
  DataSourceTypes,
  createDefaultDataSourceFile,
} from "../models/dataSource";
import { scratchpadVariableInput } from "../models/items/server";
import { UDARequestBody } from "../models/uda";
import { DataSourcesPanel } from "../panels/datasource";
import { ConnectionManagementService } from "../services/connectionManagerService";
import {
  kdbOutputLog,
  noSelectedConnectionAction,
  offerConnectAction,
} from "../utils/core";
import {
  checkIfTimeParamIsCorrect,
  convertTimeToTimestamp,
  createKdbDataSourcesFolder,
  getConnectedInsightsNode,
} from "../utils/dataSource";
import {
  addQueryHistory,
  handleScratchpadTableRes,
  handleWSError,
  handleWSResults,
} from "../utils/queryUtils";
import { Telemetry } from "../utils/telemetryClient";
import { retrieveUDAtoCreateReqBody } from "../utils/uda";
import { validateScratchpadOutputVariableName } from "../validators/interfaceValidator";

export async function addDataSource(): Promise<void> {
  const kdbDataSourcesFolderPath = createKdbDataSourcesFolder();

  let length = 0;
  let fileName = `datasource-${length}${ext.kdbDataSourceFileExtension}`;
  let filePath = path.join(kdbDataSourcesFolderPath, fileName);

  while (fs.existsSync(filePath)) {
    length++;
    fileName = `datasource-${length}${ext.kdbDataSourceFileExtension}`;
    filePath = path.join(kdbDataSourcesFolderPath, fileName);
  }
  const dataSourceName = fileName.replace(ext.kdbDataSourceFileExtension, "");
  const defaultDataSourceContent = createDefaultDataSourceFile();
  const insightsNode = getConnectedInsightsNode();
  defaultDataSourceContent.name = dataSourceName;
  defaultDataSourceContent.insightsNode = insightsNode;

  fs.writeFileSync(filePath, JSON.stringify(defaultDataSourceContent));
  window.showInformationMessage(
    `Created ${fileName} in ${kdbDataSourcesFolderPath}.`,
  );
  Telemetry.sendEvent("Datasource.Created");
}

export async function populateScratchpad(
  dataSourceForm: DataSourceFiles,
  connLabel: string,
): Promise<void> {
  const connMngService = new ConnectionManagementService();
  const qenvEnabled =
    (await connMngService.retrieveInsightsConnQEEnabled(connLabel)) ?? "";
  if (
    dataSourceForm.dataSource.selectedType === DataSourceTypes.QSQL &&
    qenvEnabled === "disabled"
  ) {
    window.showErrorMessage(
      "The query enviroment(s) are disabled for this connection",
    );
    kdbOutputLog(
      `[DATASOURCE]  The query enviroment(s) are disabled for this connection`,
      "ERROR",
      true,
    );
    return;
  }
  const scratchpadVariable: InputBoxOptions = {
    prompt: scratchpadVariableInput.prompt,
    placeHolder: scratchpadVariableInput.placeholder,
    validateInput: (value: string | undefined) =>
      validateScratchpadOutputVariableName(value),
  };
  /* istanbul ignore next */
  window.showInputBox(scratchpadVariable).then(async (outputVariable) => {
    if (outputVariable !== undefined && outputVariable !== "") {
      const selectedConnection =
        connMngService.retrieveConnectedConnection(connLabel);

      if (
        selectedConnection instanceof LocalConnection ||
        !selectedConnection
      ) {
        offerConnectAction(connLabel);
        DataSourcesPanel.running = false;
        return;
      }
      await selectedConnection.importScratchpad(
        outputVariable!,
        dataSourceForm!,
      );
    } else {
      kdbOutputLog(
        `[DATASOURCE] Invalid scratchpad output variable name: ${outputVariable}`,
        "ERROR",
      );
    }
  });
}

export async function runDataSource(
  dataSourceForm: DataSourceFiles,
  connLabel: string,
  executorName: string,
): Promise<void> {
  if (DataSourcesPanel.running) {
    return;
  }

  if (connLabel === "") {
    noSelectedConnectionAction();
    return;
  }

  DataSourcesPanel.running = true;
  const connMngService = new ConnectionManagementService();
  const selectedConnection =
    connMngService.retrieveConnectedConnection(connLabel);

  try {
    if (selectedConnection instanceof LocalConnection || !selectedConnection) {
      offerConnectAction(connLabel);
      return;
    }
    selectedConnection.getMeta();
    if (!selectedConnection?.meta?.payload.assembly) {
      throw new Error("No database running in the Insights connection");
    }

    dataSourceForm.insightsNode = getConnectedInsightsNode();
    const fileContent = dataSourceForm;

    kdbOutputLog(
      `[DATASOURCE] Running ${fileContent.name} datasource...`,
      "INFO",
    );
    let res: any;
    const selectedType = getSelectedType(fileContent);
    ext.isDatasourceExecution = true;
    Telemetry.sendEvent("Datasource." + selectedType + ".Run");
    switch (selectedType) {
      case "API":
        res = await runApiDataSource(fileContent, selectedConnection);
        break;
      case "QSQL":
        if (selectedConnection.apiConfig?.queryEnvironmentsEnabled === false) {
          window.showErrorMessage(
            "The query enviroment(s) are disabled for this connection",
          );
          kdbOutputLog(
            `[DATASOURCE]  The query enviroment(s) are disabled for this connection`,
            "ERROR",
            true,
          );
          return;
        }
        res = await runQsqlDataSource(fileContent, selectedConnection);
        break;
      case "UDA":
        res = await runUDADataSource(fileContent, selectedConnection);
        break;
      case "SQL":
      default:
        res = await runSqlDataSource(fileContent, selectedConnection);
        break;
    }

    ext.isDatasourceExecution = false;
    if (res) {
      const success = !res.error;
      const query = getQuery(fileContent, selectedType);

      if (!success) {
        window.showErrorMessage(res.error);
      }
      if (ext.isResultsTabVisible) {
        if (success) {
          const resultCount = typeof res === "string" ? "0" : res.rows.length;
          kdbOutputLog(`[DATASOURCE] Results: ${resultCount} rows`, "INFO");
        } else if (!success) {
          res = res.errorMsg ? res.errorMsg : res.error;
        }
        await writeQueryResultsToView(
          res,
          query,
          connLabel,
          executorName,
          true,
          selectedType,
        );
      } else {
        if (success) {
          kdbOutputLog(
            `[DATASOURCE] Results is a string with length: ${res.length}`,
            "INFO",
          );
        } else if (res.error) {
          res = res.errorMsg ? res.errorMsg : res.error;
        }

        await writeQueryResultsToConsole(
          res,
          query,
          connLabel,
          executorName,
          true,
          selectedType,
        );
      }
      addDStoQueryHistory(dataSourceForm, success, connLabel, executorName);
    }
  } catch (error) {
    window.showErrorMessage((error as Error).message);
    kdbOutputLog(`[DATASOURCE]  ${(error as Error).message}`, "ERROR", true);
    DataSourcesPanel.running = false;
  } finally {
    DataSourcesPanel.running = false;
  }
}

export function addDStoQueryHistory(
  dataSourceForm: DataSourceFiles,
  success: boolean,
  connLabel: string,
  executrorName: string,
) {
  addQueryHistory(
    dataSourceForm,
    executrorName,
    connLabel,
    ServerType.INSIGHTS,
    success,
    false,
    false,
    true,
    dataSourceForm.dataSource.selectedType,
  );
}

export function getSelectedType(fileContent: DataSourceFiles): string {
  const selectedType = fileContent.dataSource.selectedType;
  switch (selectedType) {
    case DataSourceTypes.API:
      return "API";
    case DataSourceTypes.QSQL:
      return "QSQL";
    case DataSourceTypes.SQL:
      return "SQL";
    case DataSourceTypes.UDA:
      return "UDA";
    default:
      throw new Error(`Invalid selectedType: ${selectedType}`);
  }
}

export async function runApiDataSource(
  fileContent: DataSourceFiles,
  selectedConn: InsightsConnection,
): Promise<any> {
  const isTimeCorrect = checkIfTimeParamIsCorrect(
    fileContent.dataSource.api.startTS,
    fileContent.dataSource.api.endTS,
  );
  if (!isTimeCorrect) {
    window.showErrorMessage(
      "The time parameters(startTS and endTS) are not correct, please check the format or if the startTS is before the endTS",
    );
    return;
  }
  const apiBody = getApiBody(fileContent);
  const apiCall = await selectedConn.getDatasourceQuery(
    DataSourceTypes.API,
    JSON.stringify(apiBody),
  );

  if (apiCall?.error) {
    return parseError(apiCall.error);
  } else if (apiCall?.arrayBuffer) {
    const results = handleWSResults(apiCall.arrayBuffer);
    return handleScratchpadTableRes(results);
  } else {
    return { error: "Datasource API call failed" };
  }
}

export function getApiBody(
  fileContent: DataSourceFiles,
): Partial<getDataBodyPayload> {
  const api = fileContent.dataSource.api;

  const apiBody: getDataBodyPayload = {
    table: fileContent.dataSource.api.table,
    startTS: convertTimeToTimestamp(api.startTS),
    endTS: convertTimeToTimestamp(api.endTS),
  };

  const optional = api.optional;

  if (optional) {
    if (optional.filled) {
      apiBody.fill = api.fill;
    }
    if (optional.temporal) {
      apiBody.temporality = api.temporality;
    }
    if (optional.rowLimit && api.rowCountLimit) {
      if (api.isRowLimitLast) {
        apiBody.limit = -parseInt(api.rowCountLimit);
      } else {
        apiBody.limit = parseInt(api.rowCountLimit);
      }
    }

    const labels = optional.labels.filter((label) => label.active);

    if (labels.length > 0) {
      apiBody.labels = Object.assign(
        {},
        ...labels.map((label) => ({ [label.key]: label.value })),
      );
    } else {
      apiBody.labels = {};
    }

    const filters = optional.filters
      .filter((filter) => filter.active)
      .map((filter) => [
        filter.operator,
        filter.column,
        ((values: string) => {
          const tokens = values.split(/[;\s]+/).map((token) => {
            const number = parseFloat(token);
            return isNaN(number) ? token : number;
          });
          return tokens.length === 1 ? tokens[0] : tokens;
        })(filter.values),
      ]);

    if (filters.length > 0) {
      apiBody.filter = filters;
    }

    const sorts = optional.sorts
      .filter((sort) => sort.active)
      .map((sort) => sort.column);

    if (sorts.length > 0) {
      apiBody.sortCols = sorts;
    }

    const aggs = optional.aggs
      .filter((agg) => agg.active)
      .map((agg) => [agg.key, agg.operator, agg.column]);

    if (aggs.length > 0) {
      apiBody.agg = aggs;
    }

    const groups = optional.groups
      .filter((group) => group.active)
      .map((group) => group.column);

    if (groups.length > 0) {
      apiBody.groupBy = groups;
    }
  }

  return apiBody;
}

export async function runQsqlDataSource(
  fileContent: DataSourceFiles,
  selectedConn: InsightsConnection,
): Promise<any> {
  const assembly = fileContent.dataSource.qsql.selectedTarget.slice(0, -4);
  const target = fileContent.dataSource.qsql.selectedTarget.slice(-3);
  const qsqlBody = {
    assembly: assembly,
    target: target,
    query: fileContent.dataSource.qsql.query,
  };
  const qsqlCall = await selectedConn.getDatasourceQuery(
    DataSourceTypes.QSQL,
    JSON.stringify(qsqlBody),
  );

  if (qsqlCall?.error) {
    return parseError(qsqlCall.error);
  } else if (qsqlCall?.arrayBuffer) {
    const results = handleWSResults(qsqlCall.arrayBuffer);
    return handleScratchpadTableRes(results);
  } else {
    return { error: "Datasource QSQL call failed" };
  }
}

export async function runSqlDataSource(
  fileContent: DataSourceFiles,
  selectedConn: InsightsConnection,
): Promise<any> {
  const sqlBody = {
    query: fileContent.dataSource.sql.query,
  };
  const sqlCall = await selectedConn.getDatasourceQuery(
    DataSourceTypes.SQL,
    JSON.stringify(sqlBody),
  );

  if (sqlCall?.error) {
    return parseError(sqlCall.error);
  } else if (sqlCall?.arrayBuffer) {
    const results = handleWSResults(sqlCall.arrayBuffer);
    return handleScratchpadTableRes(results);
  } else {
    return { error: "Datasource SQL call failed" };
  }
}

export async function runUDADataSource(
  fileContent: DataSourceFiles,
  selectedConn: InsightsConnection,
): Promise<any> {
  const uda = fileContent.dataSource.uda;

  const udaReqBody = await retrieveUDAtoCreateReqBody(uda, selectedConn);

  if (udaReqBody.error) {
    kdbOutputLog(`[DATASOURCE] Error: ${udaReqBody.error}`, "ERROR", true);
    return udaReqBody;
  }

  return await executeUDARequest(selectedConn, udaReqBody);
}

export async function executeUDARequest(
  selectedConn: InsightsConnection,
  udaReqBody: UDARequestBody,
): Promise<any> {
  const udaCall = await selectedConn.getDatasourceQuery(
    DataSourceTypes.UDA,
    udaReqBody,
  );

  if (udaCall?.error) {
    return parseError(udaCall.error);
  } else if (udaCall?.arrayBuffer) {
    const results = handleWSResults(udaCall.arrayBuffer);
    return handleScratchpadTableRes(results);
  } else {
    return { error: "UDA call failed" };
  }
}

export function getQuery(
  fileContent: DataSourceFiles,
  selectedType: string,
): string {
  switch (selectedType) {
    case "API":
      return `GetData - table: ${fileContent.dataSource.api.table}`;
    case "QSQL":
      return fileContent.dataSource.qsql.query;
    case "UDA":
      return `Executed UDA: ${fileContent.dataSource.uda?.name}`;
    case "SQL":
    default:
      return fileContent.dataSource.sql.query;
  }
}

export function parseError(error: GetDataError) {
  if (error instanceof Object && error.buffer) {
    return handleWSError(error.buffer);
  } else {
    kdbOutputLog(
      `[DATASOURCE] Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
      "ERROR",
      true,
    );
    return {
      error,
    };
  }
}
