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

import assert from "assert";
import mock from "mock-fs";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

import { InsightsConnection } from "../../src/classes/insightsConnection";
import { LocalConnection } from "../../src/classes/localConnection";
import { ReplConnection } from "../../src/classes/replConnection";
import * as clientCommand from "../../src/commands/clientCommands";
import * as dataSourceCommand from "../../src/commands/dataSourceCommand";
import * as installTools from "../../src/commands/installTools";
import * as serverCommand from "../../src/commands/serverCommand";
import * as walkthroughCommand from "../../src/commands/walkthroughCommand";
import * as workspaceCommand from "../../src/commands/workspaceCommand";
import { ext } from "../../src/extensionVariables";
import { InsightsApiConfig } from "../../src/models/config";
import {
  ExportedConnections,
  InsightDetails,
  ServerDetails,
  ServerType,
} from "../../src/models/connectionsModels";
import { GetDataError } from "../../src/models/data";
import {
  DataSourceFiles,
  DataSourceTypes,
  createDefaultDataSourceFile,
} from "../../src/models/dataSource";
import { ExecutionTypes } from "../../src/models/execution";
import { MetaObject } from "../../src/models/meta";
import { QueryHistory } from "../../src/models/queryHistory";
import { ScratchpadResult } from "../../src/models/scratchpadResult";
import { NewConnectionPannel } from "../../src/panels/newConnection";
import { ConnectionManagementService } from "../../src/services/connectionManagerService";
import {
  InsightsNode,
  KdbNode,
  KdbTreeProvider,
  MetaObjectPayloadNode,
} from "../../src/services/kdbTreeProvider";
import { KdbResultsViewProvider } from "../../src/services/resultsPanelProvider";
import { WorkspaceTreeProvider } from "../../src/services/workspaceTreeProvider";
import * as coreUtils from "../../src/utils/core";
import * as dsUtils from "../../src/utils/dataSource";
import * as dataSourceUtils from "../../src/utils/dataSource";
import { ExecutionConsole } from "../../src/utils/executionConsole";
import * as loggers from "../../src/utils/loggers";
import * as notifications from "../../src/utils/notifications";
import * as queryUtils from "../../src/utils/queryUtils";
import * as kdbValidators from "../../src/validators/kdbValidator";

describe("dataSourceCommand", () => {
  afterEach(() => {
    sinon.restore();
    mock.restore();
  });

  it.skip("should add a data source", async () => {
    mock({
      "/temp": {
        ".kdb-datasources": {
          "datasource-0.ds": '{"name": "datasource-0"}',
        },
      },
    });

    ext.context = {} as vscode.ExtensionContext;
    sinon.stub(ext, "context").value({
      globalStorageUri: {
        fsPath: "/temp/",
      },
    });

    await assert.doesNotReject(dataSourceCommand.addDataSource());
  });
});

describe("dataSourceCommand2", () => {
  let dummyDataSourceFiles: DataSourceFiles;
  const localConn = new LocalConnection("localhost:5001", "test", []);
  const insightsNode = new InsightsNode(
    [],
    "insightsnode1",
    {
      server: "https://insightsservername.com/",
      alias: "insightsserveralias",
      auth: true,
    },
    vscode.TreeItemCollapsibleState.None,
  );
  const insightsConn = new InsightsConnection(insightsNode.label, insightsNode);
  const uriTest: vscode.Uri = vscode.Uri.parse("test");
  let _resultsPanel: KdbResultsViewProvider;
  ext.outputChannel = vscode.window.createOutputChannel("kdb");
  const _view: vscode.WebviewView = {
    visible: true,

    show: (): void => {},
    viewType: "kdb-results",
    webview: {
      options: {},
      html: "",
      cspSource: "",
      asWebviewUri: (uri: vscode.Uri) => uri,
      onDidReceiveMessage: new vscode.EventEmitter<any>().event,
      postMessage: (): Thenable<boolean> => {
        return Promise.resolve(true);
      },
    },
    onDidDispose: new vscode.EventEmitter<void>().event,
    onDidChangeVisibility: new vscode.EventEmitter<null>().event,
  };

  beforeEach(() => {
    dummyDataSourceFiles = {
      name: "dummy ds",
      insightsNode: "dummy insights",
      dataSource: {
        selectedType: DataSourceTypes.API,
        api: {
          selectedApi: "getData",
          table: "dummy_table",
          startTS: "2023-09-10T09:30",
          endTS: "2023-09-19T12:30",
          fill: "",
          filter: [],
          groupBy: [],
          labels: [],
          slice: [],
          sortCols: [],
          temporality: "",
          agg: [],
        },
        qsql: {
          selectedTarget: "dummy_table rdb",
          query: "dummy QSQL query",
        },
        sql: {
          query: "dummy SQL query",
        },
        uda: {
          name: "test query",
          description: "test description",
          params: [],
        },
      },
    };
    _resultsPanel = new KdbResultsViewProvider(uriTest);
  });
  describe("getSelectedType", () => {
    it("should return selectedType if it is API", () => {
      const result = dataSourceCommand.getSelectedType(dummyDataSourceFiles);
      sinon.assert.match(result, "API");
    });

    it("should return selectedType if it is QSQL", () => {
      dummyDataSourceFiles.dataSource.selectedType = DataSourceTypes.QSQL;
      const result2 = dataSourceCommand.getSelectedType(dummyDataSourceFiles);
      sinon.assert.match(result2, "QSQL");
    });

    it("should return selectedType if it is SQL", () => {
      dummyDataSourceFiles.dataSource.selectedType = DataSourceTypes.SQL;
      const result3 = dataSourceCommand.getSelectedType(dummyDataSourceFiles);
      sinon.assert.match(result3, "SQL");
    });
  });

  describe("getQuery", () => {
    it("should return the correct query for API data sources", () => {
      const query = dataSourceCommand.getQuery(dummyDataSourceFiles, "API");
      assert.strictEqual(query, "GetData - table: dummy_table");
    });

    it("should return the correct query for QSQL data sources", () => {
      const query = dataSourceCommand.getQuery(dummyDataSourceFiles, "QSQL");
      assert.strictEqual(query, "dummy QSQL query");
    });

    it("should return the correct query for SQL data sources", () => {
      const query = dataSourceCommand.getQuery(dummyDataSourceFiles, "SQL");
      assert.strictEqual(query, "dummy SQL query");
    });
  });

  describe("getApiBody", () => {
    it("should return the correct API body for an old data source with all fields", () => {
      const api = dummyDataSourceFiles.dataSource.api;

      api.startTS = "2022-01-01T00:00:00Z";
      api.endTS = "2022-01-02T00:00:00Z";
      api.fill = "none";
      api.temporality = "1h";
      api.filter = ["col1=val1;col2=val2", "col3=val3"];
      api.groupBy = ["col1", "col2"];
      api.agg = ["sum(col3)", "avg(col4)"];
      api.sortCols = ["col1 ASC", "col2 DESC"];
      api.slice = ["10", "20"];
      api.labels = ["label1", "label2"];
      api.table = "myTable";
      const apiBody = dataSourceCommand.getApiBody(dummyDataSourceFiles);

      assert.deepStrictEqual(apiBody, {
        table: "myTable",
        startTS: "2022-01-01T00:00:00.000000000",
        endTS: "2022-01-02T00:00:00.000000000",
      });
    });

    it("should return the correct API body for a new data source with some fields", () => {
      const api = dummyDataSourceFiles.dataSource.api;

      api.startTS = "2022-01-01T00:00:00Z";
      api.endTS = "2022-01-02T00:00:00Z";
      api.fill = "zero";
      api.rowCountLimit = "20";
      api.isRowLimitLast = true;
      api.temporality = "snapshot";
      api.filter = ["col1=val1;col2=val2", "col3=val3"];
      api.groupBy = ["col1", "col2"];
      api.agg = ["sum(col3)", "avg(col4)"];
      api.sortCols = ["col1 ASC", "col2 DESC"];
      api.slice = ["10", "20"];
      api.labels = ["label1", "label2"];
      api.table = "myTable";
      api.optional = {
        filled: true,
        temporal: true,
        rowLimit: true,
        filters: [],
        sorts: [],
        groups: [],
        aggs: [],
        labels: [],
      };
      const apiBody = dataSourceCommand.getApiBody(dummyDataSourceFiles);

      assert.deepStrictEqual(apiBody, {
        table: "myTable",
        startTS: "2022-01-01T00:00:00.000000000",
        endTS: "2022-01-02T00:00:00.000000000",
        fill: "zero",
        limit: -20,
        labels: {},
        temporality: "snapshot",
      });
    });

    it("should return the correct API body for a new data source with slice", () => {
      const api = dummyDataSourceFiles.dataSource.api;

      api.startTS = "2022-01-01T00:00:00Z";
      api.endTS = "2022-01-02T00:00:00Z";
      api.fill = "zero";
      api.rowCountLimit = "20";
      api.isRowLimitLast = false;
      api.temporality = "slice";
      api.filter = [];
      api.groupBy = [];
      api.agg = [];
      api.sortCols = [];
      api.slice = [];
      api.labels = [];
      api.table = "myTable";
      api.optional = {
        rowLimit: true,
        filled: false,
        temporal: true,
        filters: [],
        sorts: [],
        groups: [],
        aggs: [],
        labels: [],
      };
      const apiBody = dataSourceCommand.getApiBody(dummyDataSourceFiles);
      assert.strictEqual(apiBody.temporality, "slice");
    });

    it("should return the correct API body for a new data source with all fields", () => {
      const api = dummyDataSourceFiles.dataSource.api;

      api.startTS = "2022-01-01T00:00:00Z";
      api.endTS = "2022-01-02T00:00:00Z";
      api.fill = "zero";
      api.temporality = "snapshot";
      api.rowCountLimit = "20";
      api.isRowLimitLast = false;
      api.filter = [];
      api.groupBy = [];
      api.agg = [];
      api.sortCols = [];
      api.slice = [];
      api.labels = [];
      api.table = "myTable";
      api.optional = {
        rowLimit: false,
        filled: true,
        temporal: true,
        filters: [
          { active: true, column: "bid", operator: ">", values: "100" },
        ],
        sorts: [{ active: true, column: "sym" }],
        groups: [{ active: true, column: "bid" }],
        aggs: [{ active: true, column: "ask", operator: "sum", key: "sumC" }],
        labels: [{ active: true, key: "key", value: "value" }],
      };
      const apiBody = dataSourceCommand.getApiBody(dummyDataSourceFiles);

      assert.deepStrictEqual(apiBody, {
        table: "myTable",
        startTS: "2022-01-01T00:00:00.000000000",
        endTS: "2022-01-02T00:00:00.000000000",
        fill: "zero",
        temporality: "snapshot",
        labels: {
          key: "value",
        },
        sortCols: ["sym"],
        groupBy: ["bid"],
        agg: [["sumC", "sum", "ask"]],
        filter: [[">", "bid", 100]],
      });
    });

    it("should return the correct API body for a data source with only required fields", () => {
      dummyDataSourceFiles.dataSource.api.startTS = "2022-01-01T00:00:00Z";
      dummyDataSourceFiles.dataSource.api.endTS = "2022-01-02T00:00:00Z";
      dummyDataSourceFiles.dataSource.api.fill = "";
      dummyDataSourceFiles.dataSource.api.temporality = "";
      dummyDataSourceFiles.dataSource.api.filter = [];
      dummyDataSourceFiles.dataSource.api.groupBy = [];
      dummyDataSourceFiles.dataSource.api.agg = [];
      dummyDataSourceFiles.dataSource.api.sortCols = [];
      dummyDataSourceFiles.dataSource.api.slice = [];
      dummyDataSourceFiles.dataSource.api.labels = [];
      dummyDataSourceFiles.dataSource.api.table = "myTable";
      const apiBody = dataSourceCommand.getApiBody(dummyDataSourceFiles);
      assert.deepStrictEqual(apiBody, {
        table: "myTable",
        startTS: "2022-01-01T00:00:00.000000000",
        endTS: "2022-01-02T00:00:00.000000000",
      });
    });
  });

  describe("runApiDataSource", () => {
    let _windowMock: sinon.SinonMock;
    let getApiBodyStub: sinon.SinonStub;
    let checkIfTimeParamIsCorrectStub: sinon.SinonStub;
    let getDataInsightsStub: sinon.SinonStub;
    let handleWSResultsStub: sinon.SinonStub;
    let handleScratchpadTableRes: sinon.SinonStub;

    beforeEach(() => {
      _windowMock = sinon.mock(vscode.window);
      getApiBodyStub = sinon.stub(dataSourceCommand, "getApiBody");
      checkIfTimeParamIsCorrectStub = sinon.stub(
        dataSourceUtils,
        "checkIfTimeParamIsCorrect",
      );
      getDataInsightsStub = sinon.stub(insightsConn, "getDatasourceQuery");
      handleWSResultsStub = sinon.stub(queryUtils, "handleWSResults");
      handleScratchpadTableRes = sinon.stub(
        queryUtils,
        "handleScratchpadTableRes",
      );
    });

    afterEach(() => {
      ext.activeConnection = undefined;
      sinon.restore();
    });

    it("should show an error message if the time parameters are incorrect", async () => {
      const windowMock = sinon.mock(vscode.window);
      checkIfTimeParamIsCorrectStub.returns(false);

      await dataSourceCommand.runApiDataSource(
        dummyDataSourceFiles,
        insightsConn,
      );
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs(
          "The time parameters(startTS and endTS) are not correct, please check the format or if the startTS is before the endTS",
        );
      sinon.assert.notCalled(getApiBodyStub);
      sinon.assert.notCalled(getDataInsightsStub);
      sinon.assert.notCalled(handleWSResultsStub);
    });

    it("should call the API and handle the results if the time parameters are correct", async () => {
      checkIfTimeParamIsCorrectStub.returns(true);
      getApiBodyStub.returns({ table: "myTable" });
      getDataInsightsStub.resolves({ arrayBuffer: true });
      handleWSResultsStub.resolves([
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);
      handleScratchpadTableRes.resolves([
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);

      const result = await dataSourceCommand.runApiDataSource(
        dummyDataSourceFiles,
        insightsConn,
      );

      sinon.assert.calledOnce(getDataInsightsStub);
      sinon.assert.calledOnce(handleWSResultsStub);
      assert.deepStrictEqual(result, [
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);
    });
  });

  describe("runQsqlDataSource", () => {
    let _windowMock: sinon.SinonMock;
    let getDataInsightsStub: sinon.SinonStub;
    let handleWSResultsStub: sinon.SinonStub;
    let handleScratchpadTableRes: sinon.SinonStub;

    beforeEach(() => {
      _windowMock = sinon.mock(vscode.window);
      getDataInsightsStub = sinon.stub(insightsConn, "getDatasourceQuery");
      handleWSResultsStub = sinon.stub(queryUtils, "handleWSResults");
      handleScratchpadTableRes = sinon.stub(
        queryUtils,
        "handleScratchpadTableRes",
      );
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should call the API and handle the results", async () => {
      getDataInsightsStub.resolves({ arrayBuffer: true });
      handleWSResultsStub.resolves([
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);
      handleScratchpadTableRes.resolves([
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);

      const result = await dataSourceCommand.runQsqlDataSource(
        dummyDataSourceFiles,
        insightsConn,
      );

      sinon.assert.calledOnce(getDataInsightsStub);
      sinon.assert.calledOnce(handleWSResultsStub);
      assert.deepStrictEqual(result, [
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);
    });
  });

  describe("runSqlDataSource", () => {
    let _windowMock: sinon.SinonMock;
    let getDataInsightsStub: sinon.SinonStub;
    let handleWSResultsStub: sinon.SinonStub;
    let handleScratchpadTableRes: sinon.SinonStub;

    beforeEach(() => {
      _windowMock = sinon.mock(vscode.window);
      getDataInsightsStub = sinon.stub(insightsConn, "getDatasourceQuery");
      handleWSResultsStub = sinon.stub(queryUtils, "handleWSResults");
      handleScratchpadTableRes = sinon.stub(
        queryUtils,
        "handleScratchpadTableRes",
      );
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should call the API and handle the results", async () => {
      getDataInsightsStub.resolves({ arrayBuffer: true });
      handleWSResultsStub.resolves([
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);
      handleScratchpadTableRes.resolves([
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);

      const result = await dataSourceCommand.runSqlDataSource(
        dummyDataSourceFiles,
        insightsConn,
      );

      sinon.assert.calledOnce(getDataInsightsStub);
      sinon.assert.calledOnce(handleWSResultsStub);
      assert.deepStrictEqual(result, [
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);
    });
  });

  describe("runUDADataSource", () => {
    let getDataInsightsStub,
      handleWSResultsStub,
      handleScratchpadTableRes,
      isUDAAvailableStub,
      parseErrorStub: sinon.SinonStub;

    beforeEach(() => {
      getDataInsightsStub = sinon.stub(insightsConn, "getDatasourceQuery");
      handleWSResultsStub = sinon.stub(queryUtils, "handleWSResults");
      parseErrorStub = sinon.stub(dataSourceCommand, "parseError");
      isUDAAvailableStub = sinon.stub(insightsConn, "isUDAAvailable");
      handleScratchpadTableRes = sinon.stub(
        queryUtils,
        "handleScratchpadTableRes",
      );
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should call the API and handle the results", async () => {
      isUDAAvailableStub.resolves(true);
      getDataInsightsStub.resolves({ arrayBuffer: true });
      handleWSResultsStub.resolves([
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);
      handleScratchpadTableRes.resolves([
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);

      const result = await dataSourceCommand.runUDADataSource(
        dummyDataSourceFiles,
        insightsConn,
      );

      sinon.assert.calledOnce(getDataInsightsStub);
      sinon.assert.calledOnce(handleWSResultsStub);
      assert.deepStrictEqual(result, [
        { a: "2", b: "3" },
        { a: "4", b: "6" },
        { a: "6", b: "9" },
      ]);
    });

    it("should call the API and handle the error results", async () => {
      isUDAAvailableStub.resolves(true);
      getDataInsightsStub.resolves({ error: "error test" });
      parseErrorStub.resolves({ error: "error test" });

      const result = await dataSourceCommand.runUDADataSource(
        dummyDataSourceFiles,
        insightsConn,
      );

      assert.deepStrictEqual(result, { error: "error test" });
    });

    it("should call the API and handle undefined response ", async () => {
      isUDAAvailableStub.resolves(true);
      getDataInsightsStub.resolves(undefined);

      const result = await dataSourceCommand.runUDADataSource(
        dummyDataSourceFiles,
        insightsConn,
      );

      assert.deepStrictEqual(result, { error: "UDA call failed" });
    });

    it("should handle if the UDA doesn't exist in the connection", async () => {
      isUDAAvailableStub.resolves(false);
      getDataInsightsStub.resolves(undefined);

      const result = await dataSourceCommand.runUDADataSource(
        dummyDataSourceFiles,
        insightsConn,
      );

      assert.deepStrictEqual(result, {
        error: "UDA test query is not available in this connection",
      });
    });

    it("should handle if a required param is empty", async () => {
      isUDAAvailableStub.resolves(true);
      getDataInsightsStub.resolves(undefined);

      const dummyDSFiles2 = dummyDataSourceFiles;
      dummyDSFiles2.dataSource.uda.params = [
        {
          name: "param1",
          description: "test param",
          default: "",
          isReq: true,
          type: [0],
          value: "",
        },
      ];

      const result = await dataSourceCommand.runUDADataSource(
        dummyDSFiles2,
        insightsConn,
      );

      assert.deepStrictEqual(result, {
        error: "The UDA: test query requires the parameter: param1.",
      });
    });

    it("should handle if have invalid parameter type", async () => {
      isUDAAvailableStub.resolves(true);
      getDataInsightsStub.resolves(undefined);

      const dummyDSFiles2 = dummyDataSourceFiles;
      dummyDSFiles2.dataSource.uda.incompatibleError = "test error";

      const result = await dataSourceCommand.runUDADataSource(
        dummyDSFiles2,
        insightsConn,
      );

      assert.deepStrictEqual(result, {
        error:
          "The UDA you have selected cannot be queried because it has required fields with types that are not supported.",
      });
    });

    it("should handle undefined UDA ", async () => {
      dummyDataSourceFiles.dataSource.uda = undefined;

      const result = await dataSourceCommand.runUDADataSource(
        dummyDataSourceFiles,
        insightsConn,
      );

      assert.deepStrictEqual(result, { error: "UDA is undefined" });
    });

    it("should handle UDA without name", async () => {
      dummyDataSourceFiles.dataSource.uda.name = "";

      const result = await dataSourceCommand.runUDADataSource(
        dummyDataSourceFiles,
        insightsConn,
      );

      assert.deepStrictEqual(result, { error: "UDA name not found" });
    });
  });

  describe("runDataSource", () => {
    const dummyMeta: MetaObject = {
      header: {
        ac: "0",
        agg: ":127.0.0.1:5070",
        ai: "",
        api: ".kxi.getMeta",
        client: ":127.0.0.1:5050",
        corr: "CorrHash",
        http: "json",
        logCorr: "logCorrHash",
        protocol: "gw",
        rc: "0",
        rcvTS: "2099-05-22T11:06:33.650000000",
        retryCount: "0",
        to: "2099-05-22T11:07:33.650000000",
        userID: "dummyID",
        userName: "testUser",
      },
      payload: {
        rc: [
          {
            api: 3,
            agg: 1,
            assembly: 1,
            schema: 1,
            rc: "dummy-rc",
            labels: [{ kxname: "dummy-assembly" }],
            started: "2023-10-04T17:20:57.659088747",
          },
        ],
        dap: [],
        api: [],
        agg: [
          {
            aggFn: ".sgagg.aggFnDflt",
            custom: false,
            full: true,
            metadata: {
              description: "dummy desc.",
              params: [{ description: "dummy desc." }],
              return: { description: "dummy desc." },
              misc: {},
            },
            procs: [],
          },
        ],
        assembly: [
          {
            assembly: "dummy-assembly",
            kxname: "dummy-assembly",
            tbls: ["dummyTbl"],
          },
        ],
        schema: [],
      },
    };
    const dummyFileContent: DataSourceFiles = {
      name: "dummy-DS",
      dataSource: {
        selectedType: DataSourceTypes.QSQL,
        api: {
          selectedApi: "getData",
          table: "dummyTbl",
          startTS: "2023-09-10T09:30",
          endTS: "2023-09-19T12:30",
          fill: "",
          temporality: "",
          filter: [],
          groupBy: [],
          agg: [],
          sortCols: [],
          slice: [],
          labels: [],
        },
        qsql: {
          query:
            "n:10;\n([] date:n?(reverse .z.d-1+til 10); instance:n?`inst1`inst2`inst3`inst4; sym:n?`USD`EUR`GBP`JPY; cnt:n?10; lists:{x?10}@/:1+n?10)\n",
          selectedTarget: "dummy-target",
        },
        sql: { query: "test query" },
        uda: {
          name: "test query",
          description: "test description",
          params: [],
        },
      },
      insightsNode: "dummyNode",
    };
    const dummyError = {
      error: "error message",
    };
    const connMngService = new ConnectionManagementService();
    const uriTest: vscode.Uri = vscode.Uri.parse("test");
    const ab = new ArrayBuffer(26);

    ext.resultsViewProvider = new KdbResultsViewProvider(uriTest);
    let isVisibleStub,
      getMetaStub,
      _handleWSResultsStub,
      _handleScratchpadTableRes,
      retrieveConnStub,
      getDataInsightsStub,
      writeQueryResultsToViewStub,
      writeQueryResultsToConsoleStub: sinon.SinonStub;
    let windowMock: sinon.SinonMock;

    ext.outputChannel = vscode.window.createOutputChannel("kdb");

    beforeEach(() => {
      retrieveConnStub = sinon.stub(
        connMngService,
        "retrieveConnectedConnection",
      );
      windowMock = sinon.mock(vscode.window);
      getMetaStub = sinon.stub(insightsConn, "getMeta");
      isVisibleStub = sinon.stub(ext.resultsViewProvider, "isVisible");
      _handleWSResultsStub = sinon
        .stub(queryUtils, "handleWSResults")
        .returns("dummy results");
      _handleScratchpadTableRes = sinon
        .stub(queryUtils, "handleScratchpadTableRes")
        .returns("dummy results");
      getDataInsightsStub = sinon.stub(insightsConn, "getDatasourceQuery");
      writeQueryResultsToViewStub = sinon.stub(
        serverCommand,
        "writeQueryResultsToView",
      );
      writeQueryResultsToConsoleStub = sinon.stub(
        serverCommand,
        "writeQueryResultsToConsole",
      );
    });

    afterEach(() => {
      sinon.restore();
      ext.isResultsTabVisible = false;
    });

    it("should not proceed there is no connection selected", async () => {
      ext.activeConnection = undefined;
      await dataSourceCommand.runDataSource(
        {} as DataSourceFiles,
        "",
        "test-file.kdb.json",
      );
      windowMock
        .expects("showInformationMessage")
        .once()
        .withArgs(
          "You didn't selected any existing connection to execute this action, please select a connection and try again.",
        );
    });

    it("should show an error message if not connected to an Insights server", async () => {
      ext.activeConnection = undefined;
      getMetaStub.resolves({});
      await dataSourceCommand.runDataSource(
        {} as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("No Insights active connection found");
    });

    it("should show an error message if not active to an Insights server", async () => {
      ext.activeConnection = localConn;
      getMetaStub.resolves({});
      await dataSourceCommand.runDataSource(
        {} as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("No Insights active connection found");
    });

    it("should return error for visible results panel", async () => {
      ext.connectedConnectionList.push(insightsConn);
      retrieveConnStub.resolves(insightsConn);
      insightsConn.meta = dummyMeta;
      getMetaStub.resolves(dummyMeta);
      sinon.stub(dataSourceCommand, "runQsqlDataSource").resolves(dummyError);

      ext.isResultsTabVisible = true;
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToConsoleStub);
      sinon.assert.calledOnce(writeQueryResultsToViewStub);

      ext.connectedConnectionList.length = 0;
    });

    it("should return error for console panel", async () => {
      ext.connectedConnectionList.push(insightsConn);
      retrieveConnStub.resolves(insightsConn);
      insightsConn.meta = dummyMeta;
      getMetaStub.resolves(dummyMeta);
      sinon.stub(dataSourceCommand, "runQsqlDataSource").resolves(dummyError);

      ext.isResultsTabVisible = false;
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToViewStub);
      sinon.assert.calledOnce(writeQueryResultsToConsoleStub);

      ext.connectedConnectionList.length = 0;
    });

    it("should return QSQL results", async () => {
      ext.connectedConnectionList.push(insightsConn);
      retrieveConnStub.resolves(insightsConn);
      insightsConn.meta = dummyMeta;
      getMetaStub.resolves(dummyMeta);
      getDataInsightsStub.resolves({ arrayBuffer: ab, error: "" });
      ext.isResultsTabVisible = true;
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToConsoleStub);
      sinon.assert.calledOnce(writeQueryResultsToViewStub);

      ext.connectedConnectionList.length = 0;
    });

    it.skip("should fail run QSQL if qe is off", async () => {
      const apiConfig: InsightsApiConfig = {
        encryptionDatabase: false,
        encryptionInTransit: false,
        queryEnvironmentsEnabled: false,
        version: "1.0",
      };
      insightsConn.apiConfig = apiConfig;
      ext.connectedConnectionList.push(insightsConn);
      retrieveConnStub.resolves(insightsConn);
      insightsConn.meta = dummyMeta;
      getMetaStub.resolves(dummyMeta);
      ext.isResultsTabVisible = true;
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToConsoleStub);
      sinon.assert.neverCalledWith(writeQueryResultsToViewStub);
      insightsConn.apiConfig.queryEnvironmentsEnabled = true;
      ext.connectedConnectionList.length = 0;
    });

    it("should return API results", async () => {
      ext.connectedConnectionList.push(insightsConn);
      retrieveConnStub.resolves(insightsConn);
      insightsConn.meta = dummyMeta;
      dummyFileContent.dataSource.selectedType = DataSourceTypes.API;
      getMetaStub.resolves(dummyMeta);
      getDataInsightsStub.resolves({ arrayBuffer: ab, error: "" });
      ext.isResultsTabVisible = false;
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToViewStub);
      sinon.assert.calledOnce(writeQueryResultsToConsoleStub);

      ext.connectedConnectionList.length = 0;
    });

    it("should return SQL results", async () => {
      ext.connectedConnectionList.push(insightsConn);
      retrieveConnStub.resolves(insightsConn);
      insightsConn.meta = dummyMeta;
      dummyFileContent.dataSource.selectedType = DataSourceTypes.SQL;
      getMetaStub.resolves(dummyMeta);
      getDataInsightsStub.resolves({ arrayBuffer: ab, error: "" });
      ext.isResultsTabVisible = false;
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToViewStub);
      sinon.assert.calledOnce(writeQueryResultsToConsoleStub);

      ext.connectedConnectionList.length = 0;
    });

    it("should return UDA results", async () => {
      ext.connectedConnectionList.push(insightsConn);
      retrieveConnStub.resolves(insightsConn);
      insightsConn.meta = dummyMeta;
      dummyFileContent.dataSource.selectedType = DataSourceTypes.UDA;
      getMetaStub.resolves(dummyMeta);
      getDataInsightsStub.resolves({ arrayBuffer: ab, error: "" });
      ext.isResultsTabVisible = false;
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToViewStub);
      sinon.assert.calledOnce(writeQueryResultsToConsoleStub);

      ext.connectedConnectionList.length = 0;
    });

    it("should return error message QSQL", async () => {
      dummyFileContent.dataSource.selectedType = DataSourceTypes.QSQL;
      getMetaStub.resolves(dummyMeta);
      getDataInsightsStub.resolves({ arrayBuffer: ab, error: "error" });
      isVisibleStub.returns(false);
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToViewStub);
      sinon.assert.neverCalledWith(writeQueryResultsToConsoleStub);
    });

    it("should return error message API", async () => {
      dummyFileContent.dataSource.selectedType = DataSourceTypes.API;
      getMetaStub.resolves(dummyMeta);
      getDataInsightsStub.resolves({ arrayBuffer: ab, error: "error" });
      isVisibleStub.returns(false);
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToViewStub);
      sinon.assert.neverCalledWith(writeQueryResultsToConsoleStub);
    });

    it("should return error message SQL", async () => {
      dummyFileContent.dataSource.selectedType = DataSourceTypes.SQL;
      getMetaStub.resolves(dummyMeta);
      getDataInsightsStub.resolves({ arrayBuffer: ab, error: "error" });
      isVisibleStub.returns(false);
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToViewStub);
      sinon.assert.neverCalledWith(writeQueryResultsToConsoleStub);
    });

    it("should return error message QSQL", async () => {
      dummyFileContent.dataSource.selectedType = DataSourceTypes.QSQL;
      getMetaStub.resolves(dummyMeta);
      getDataInsightsStub.resolves(undefined);
      isVisibleStub.returns(false);
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToViewStub);
      sinon.assert.neverCalledWith(writeQueryResultsToConsoleStub);
    });

    it("should return error message API", async () => {
      dummyFileContent.dataSource.selectedType = DataSourceTypes.API;
      getMetaStub.resolves(dummyMeta);
      getDataInsightsStub.resolves(undefined);
      isVisibleStub.returns(false);
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToViewStub);
      sinon.assert.neverCalledWith(writeQueryResultsToConsoleStub);
    });

    it("should return error message SQL", async () => {
      dummyFileContent.dataSource.selectedType = DataSourceTypes.SQL;
      getMetaStub.resolves(dummyMeta);
      getDataInsightsStub.resolves(undefined);
      isVisibleStub.returns(false);
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      sinon.assert.neverCalledWith(writeQueryResultsToViewStub);
      sinon.assert.neverCalledWith(writeQueryResultsToConsoleStub);
    });

    it("should handle errors correctly", async () => {
      retrieveConnStub.throws(new Error("Test error"));
      await dataSourceCommand.runDataSource(
        dummyFileContent as DataSourceFiles,
        insightsConn.connLabel,
        "test-file.kdb.json",
      );
      windowMock.expects("showErrorMessage").once().withArgs("Test error");
    });
  });

  describe("populateScratchpad", async () => {
    const dummyFileContent: DataSourceFiles = {
      name: "dummy-DS",
      dataSource: {
        selectedType: DataSourceTypes.QSQL,
        api: {
          selectedApi: "getData",
          table: "dummyTbl",
          startTS: "2023-09-10T09:30",
          endTS: "2023-09-19T12:30",
          fill: "",
          temporality: "",
          filter: [],
          groupBy: [],
          agg: [],
          sortCols: [],
          slice: [],
          labels: [],
        },
        qsql: {
          query:
            "n:10;\n([] date:n?(reverse .z.d-1+til 10); instance:n?`inst1`inst2`inst3`inst4; sym:n?`USD`EUR`GBP`JPY; cnt:n?10; lists:{x?10}@/:1+n?10)\n",
          selectedTarget: "dummy-target",
        },
        sql: { query: "test query" },
        uda: {
          name: "test query",
          description: "test description",
          params: [],
        },
      },
      insightsNode: "dummyNode",
    };
    let windowMock: sinon.SinonMock;
    let connMngService: ConnectionManagementService;
    let qeStatusStub: sinon.SinonStub;

    beforeEach(() => {
      ext.activeConnection = insightsConn;
      windowMock = sinon.mock(vscode.window);
      connMngService = new ConnectionManagementService();
      qeStatusStub = sinon.stub(
        connMngService,
        "retrieveInsightsConnQEEnabled",
      );
    });
    afterEach(() => {
      ext.activeConnection = undefined;
      sinon.restore();
    });
    it("should show error msg", async () => {
      await dataSourceCommand.populateScratchpad(
        dummyFileContent,
        localConn.connLabel,
      );
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("Please connect to an Insights server");
    });

    it.skip("should show error msg if qe is off", async () => {
      qeStatusStub.returns("disabled");
      await dataSourceCommand.populateScratchpad(
        dummyFileContent,
        insightsConn.connLabel,
      );
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("The query enviroment(s) are disabled for this connection");
    });
  });

  describe("parseError", () => {
    let kdbOutputLogStub: sinon.SinonStub;

    beforeEach(() => {
      kdbOutputLogStub = sinon.stub(loggers, "kdbOutputLog");
    });
    afterEach(() => {
      sinon.restore();
    });

    it("should call kdbOutputLog and return error if error does not have buffer", () => {
      const error: GetDataError = "test error";

      const result = dataSourceCommand.parseError(error);

      assert(kdbOutputLogStub.calledOnce);
      assert.deepEqual(result, { error });
    });
  });
});

describe("installTools", () => {
  //write tests for src/commands/installTools.ts
  //function to be deleted after write the tests
  installTools.installTools();
});
describe("serverCommand", () => {
  const servers = {
    testServer: {
      serverAlias: "testServerAlias",
      serverName: "testServerName",
      serverPort: "5001",
      tls: false,
      auth: false,
      managed: false,
    },
  };
  const insightsNode = new InsightsNode(
    [],
    "insightsnode1",
    {
      server: "https://insightsservername.com/",
      alias: "insightsserveralias",
      auth: true,
    },
    vscode.TreeItemCollapsibleState.None,
  );

  const kdbNode = new KdbNode(
    ["child1"],
    "testElement",
    servers["testServer"],
    vscode.TreeItemCollapsibleState.None,
  );
  const insights = {
    testInsight: {
      alias: "testInsightsAlias",
      server: "testInsightsName",
      auth: false,
    },
  };
  ext.serverProvider = new KdbTreeProvider(servers, insights);

  after(() => {
    ext.serverProvider = undefined;
  });

  it("should call the New Connection Panel Renderer", async () => {
    const newConnectionPanelStub = sinon.stub(NewConnectionPannel, "render");
    ext.context = <vscode.ExtensionContext>{};
    await serverCommand.addNewConnection();
    sinon.assert.calledOnce(newConnectionPanelStub);
    sinon.restore();
  });

  it("should call the Edit Connection Panel Renderer", async () => {
    const newConnectionPanelStub = sinon.stub(NewConnectionPannel, "render");
    ext.context = <vscode.ExtensionContext>{};
    await serverCommand.editConnection(kdbNode);
    sinon.assert.calledOnce(newConnectionPanelStub);
    sinon.restore();
  });

  describe("isConnected", () => {
    let connMngServiceMock: sinon.SinonStubbedInstance<ConnectionManagementService>;

    beforeEach(() => {
      connMngServiceMock = sinon.createStubInstance(
        ConnectionManagementService,
      );
    });

    it("deve retornar false quando isConnected do ConnectionManagementService retornar false", () => {
      connMngServiceMock.isConnected.returns(false);
      const result = serverCommand.isConnected("127.0.0.1:6812 [CONNLABEL]");
      assert.deepStrictEqual(result, false);
    });
  });

  describe("addInsightsConnection", () => {
    let insightsData: InsightDetails;
    let updateInsightsStub, getInsightsStub: sinon.SinonStub;
    let windowMock: sinon.SinonMock;

    beforeEach(() => {
      insightsData = {
        server: "https://insightsservername.com/",
        alias: "insightsserveralias",
        auth: true,
      };
      windowMock = sinon.mock(vscode.window);
      updateInsightsStub = sinon.stub(coreUtils, "updateInsights");
      getInsightsStub = sinon.stub(coreUtils, "getInsights");
      ext.serverProvider = new KdbTreeProvider(servers, insights);
    });

    afterEach(() => {
      sinon.restore();
      windowMock.restore();
    });

    it("should add new Insights connection", async () => {
      getInsightsStub.returns({});
      await serverCommand.addInsightsConnection(insightsData, ["lblTest"]);
      sinon.assert.calledOnce(updateInsightsStub);
      windowMock
        .expects("showInformationMessage")
        .once()
        .withArgs("Insights connection added successfully");
    });

    it("should show error message if Insights connection already exists", async () => {
      getInsightsStub.returns(insights);
      await serverCommand.addInsightsConnection(insightsData);
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("Insights connection already exists");
    });

    it("should show error message if Insights connection is invalid", async () => {
      insightsData.server = "invalid";
      await serverCommand.addInsightsConnection(insightsData);
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("Invalid Insights connection");
    });
  });

  describe("addKdbConnection", () => {
    let kdbData: ServerDetails;
    let windowMock: sinon.SinonMock;
    let updateServersStub,
      getServersStub,
      validationServerAliasStub,
      validationHostnameStub,
      validationPortStub: sinon.SinonStub;
    beforeEach(() => {
      kdbData = {
        serverName: "testServer",
        serverAlias: "testServerAlias",
        auth: false,
        managed: false,
        serverPort: "5001",
        tls: false,
      };
      windowMock = sinon.mock(vscode.window);
      updateServersStub = sinon.stub(coreUtils, "updateServers");
      getServersStub = sinon.stub(coreUtils, "getServers");
      validationServerAliasStub = sinon.stub(
        kdbValidators,
        "validateServerAlias",
      );
      validationHostnameStub = sinon.stub(kdbValidators, "validateServerName");
      validationPortStub = sinon.stub(kdbValidators, "validateServerPort");
    });

    afterEach(() => {
      sinon.restore();
      windowMock.restore();
    });

    it("should add new Kdb connection", async () => {
      getServersStub.returns({});
      validationServerAliasStub.returns(false);
      validationHostnameStub.returns(false);
      validationPortStub.returns(false);
      await serverCommand.addKdbConnection(kdbData, false, ["lblTest"]);
      sinon.assert.calledOnce(updateServersStub);
      windowMock
        .expects("showInformationMessage")
        .once()
        .withArgs("Kdb connection added successfully");
    });

    it("should show error message if Kdb connection already exists", async () => {
      getServersStub.returns(servers);
      await serverCommand.addKdbConnection(kdbData);
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("Kdb connection already exists");
    });

    it("should show error message if Kdb connection is invalid", async () => {
      kdbData.serverPort = "invalid";
      await serverCommand.addKdbConnection(kdbData);
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("Invalid Kdb connection");
    });

    it("should show error message if connection where alias is not provided", async () => {
      kdbData.serverAlias = "";
      await serverCommand.addKdbConnection(kdbData);
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("Server Name is required");
    });

    it("should give error if alias is local and isLocal is false", async () => {
      validationServerAliasStub.returns(
        "The server name “local” is reserved for connections to the Bundled q process",
      );
      kdbData.serverAlias = "local";
      kdbData.managed = true;
      await serverCommand.addKdbConnection(kdbData);
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("Invalid Kdb connection");
    });

    it("should add authentication to the connection", async () => {
      kdbData.auth = true;
      kdbData.password = "password";
      kdbData.username = "username";
      getServersStub.returns({});
      await serverCommand.addKdbConnection(kdbData);
      sinon.assert.called(updateServersStub);
      windowMock
        .expects("showInformationMessage")
        .once()
        .withArgs("Kdb connection added successfully");
    });

    it("should return error when the servername with an invalid length", async () => {
      kdbData.serverName = "";
      await serverCommand.addKdbConnection(kdbData);
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("Invalid Kdb connection");
    });

    it("should return error when the servername with an invalid length", async () => {
      kdbData.serverName = "a".repeat(kdbValidators.MAX_STR_LEN + 1);
      await serverCommand.addKdbConnection(kdbData);
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs("Invalid Kdb connection");
    });
  });

  describe("importConnections", () => {
    let showOpenDialogStub: sinon.SinonStub;
    let kdbOutputLogStub: sinon.SinonStub;
    let _addImportedConnectionsStub: sinon.SinonStub;

    beforeEach(() => {
      showOpenDialogStub = sinon.stub(vscode.window, "showOpenDialog");
      kdbOutputLogStub = sinon.stub(loggers, "kdbOutputLog");
      _addImportedConnectionsStub = sinon.stub(
        serverCommand,
        "addImportedConnections",
      );
    });

    afterEach(() => {
      sinon.restore();
      mock.restore();
    });

    it("should log an error if no file is selected", async () => {
      showOpenDialogStub.resolves(undefined);

      await serverCommand.importConnections();

      assert(
        kdbOutputLogStub.calledWith(
          "[serverCommand] No file selected.",
          "ERROR",
          true,
        ),
      );
    });
  });

  describe("addImportedConnections", async () => {
    let addInsightsConnectionStub: sinon.SinonStub;
    let addKdbConnectionStub: sinon.SinonStub;
    let kdbOutputLogStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let _getInsightsStub: sinon.SinonStub;
    let _getServersStub: sinon.SinonStub;
    let retrieveVersionStub: sinon.SinonStub;
    const kdbNodeImport1: KdbNode = {
      label: "local",
      details: {
        serverName: "testKdb",
        serverAlias: "local",
        serverPort: "1818",
        auth: false,
        managed: false,
        tls: false,
      },
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: "kdbNode",
      children: [],
      getTooltip: function (): vscode.MarkdownString {
        throw new Error("Function not implemented.");
      },
      getDescription: function (): string {
        throw new Error("Function not implemented.");
      },
      iconPath: undefined,
    };
    const insightsNodeImport1: InsightsNode = {
      label: "testInsight",
      details: {
        server: "testInsight",
        alias: "testInsight",
        auth: false,
      },
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: "insightsNode",
      children: [],
      getTooltip(): Promise<vscode.MarkdownString> {
        return Promise.resolve(new vscode.MarkdownString(""));
      },
      getDescription(): string {
        return "";
      },
      iconPath: undefined,
      initializeNode(): Promise<void> {
        return Promise.resolve();
      },
    };

    beforeEach(() => {
      addInsightsConnectionStub = sinon.stub(
        serverCommand,
        "addInsightsConnection",
      );
      addKdbConnectionStub = sinon.stub(serverCommand, "addKdbConnection");
      kdbOutputLogStub = sinon.stub(loggers, "kdbOutputLog");
      _getInsightsStub = sinon
        .stub(coreUtils, "getInsights")
        .returns(undefined);
      _getServersStub = sinon.stub(coreUtils, "getServers").returns(undefined);
      showInformationMessageStub = sinon.stub(
        vscode.window,
        "showInformationMessage",
      );
      retrieveVersionStub = sinon.stub(
        ConnectionManagementService.prototype,
        "retrieveInsightsConnVersion",
      );
      ext.connectionsList.length = 0;
    });

    afterEach(() => {
      sinon.restore();
      ext.connectionsList.length = 0;
    });

    it("should add insights connections with unique aliases", async () => {
      ext.connectionsList.push(insightsNodeImport1, kdbNodeImport1);
      const importedConnections: ExportedConnections = {
        connections: {
          Insights: [
            {
              alias: "testImportInsights1",
              server: "testInsight",
              auth: false,
            },
            {
              alias: "testImportInsights1",
              server: "testInsight2",
              auth: false,
            },
          ],
          KDB: [],
        },
      };

      retrieveVersionStub.resolves("1.0");

      await serverCommand.addImportedConnections(importedConnections);

      sinon.assert.notCalled(addKdbConnectionStub);
    });

    it("should log success message and show information message", async () => {
      const importedConnections: ExportedConnections = {
        connections: {
          Insights: [],
          KDB: [],
        },
      };

      await serverCommand.addImportedConnections(importedConnections);

      assert(
        kdbOutputLogStub.calledWith(
          "[serverCommand] Connections imported successfully.",
          "INFO",
        ),
      );
      assert(
        showInformationMessageStub.calledWith(
          "Connections imported successfully.",
        ),
      );
    });

    it("should add kdb connections", () => {
      ext.connectionsList.push(insightsNodeImport1, kdbNodeImport1);
      const importedConnections: ExportedConnections = {
        connections: {
          Insights: [],
          KDB: [
            {
              serverName: "testKdb",
              serverAlias: "testKdb",
              serverPort: "1818",
              auth: false,
              managed: false,
              tls: false,
            },
          ],
        },
      };

      serverCommand.addImportedConnections(importedConnections);

      sinon.assert.notCalled(addInsightsConnectionStub);
    });

    it("should overwrite connections", async () => {
      ext.connectionsList.push(insightsNodeImport1, kdbNodeImport1);
      const importedConnections: ExportedConnections = {
        connections: {
          Insights: [
            {
              alias: "testInsight",
              server: "testInsight",
              auth: false,
            },
          ],
          KDB: [
            {
              serverName: "testKdb",
              serverAlias: "testKdb",
              serverPort: "1818",
              auth: false,
              managed: false,
              tls: false,
            },
          ],
        },
      };

      retrieveVersionStub.resolves("0");

      showInformationMessageStub.returns("Overwrite");
      await serverCommand.addImportedConnections(importedConnections);
      sinon.assert.notCalled(addInsightsConnectionStub);
    });
  });

  describe("writeQueryResultsToView", () => {
    it("should call executeCommand with correct arguments", () => {
      const result = { data: [1, 2, 3] };
      const executeCommandStub = sinon.stub(vscode.commands, "executeCommand");

      serverCommand.writeQueryResultsToView(
        result,
        "",
        "testConn",
        "testFile.kdb.q",
        false,
        "WORKBOOK",
        false,
        "2",
      );

      sinon.assert.calledWith(
        executeCommandStub.firstCall,
        "kdb.resultsPanel.update",
        result,
        false,
      );

      executeCommandStub.restore();
    });

    it("should call executeCommand with correct arguments for an error", () => {
      const result = "Error: test error";
      const executeCommandStub = sinon.stub(vscode.commands, "executeCommand");

      serverCommand.writeQueryResultsToView(
        result,
        "",
        "testConn",
        "testFile.kdb.q",
        false,
        "WORKBOOK",
        false,
        "2",
      );

      sinon.assert.calledWith(
        executeCommandStub.firstCall,
        "kdb.resultsPanel.update",
        result,
        false,
      );

      executeCommandStub.restore();
    });
  });

  describe("enableTLS", () => {
    let getServersStub: sinon.SinonStub;
    let updateServersStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;

    beforeEach(() => {
      getServersStub = sinon.stub(coreUtils, "getServers");
      updateServersStub = sinon.stub(coreUtils, "updateServers");
      showErrorMessageStub = sinon.stub(vscode.window, "showErrorMessage");
    });

    afterEach(() => {
      getServersStub.restore();
      updateServersStub.restore();
      showErrorMessageStub.restore();
    });

    it("should show error message when OpenSSL is not found", async () => {
      ext.openSslVersion = null;
      showErrorMessageStub.resolves("More Info");

      await serverCommand.enableTLS("test");

      sinon.assert.calledOnce(showErrorMessageStub);
      sinon.assert.calledWith(
        showErrorMessageStub,
        "OpenSSL not found, please ensure this is installed",
        "More Info",
        "Cancel",
      );
      sinon.assert.notCalled(updateServersStub);
    });

    it("should show error message when server is not found", async () => {
      ext.openSslVersion = "1.0.2";
      getServersStub.returns({});

      await serverCommand.enableTLS("test");

      sinon.assert.calledOnce(showErrorMessageStub);
      sinon.assert.calledWith(
        showErrorMessageStub,
        "Server not found, please ensure this is a correct server",
        "Cancel",
      );
      sinon.assert.calledOnce(getServersStub);
      sinon.assert.notCalled(updateServersStub);
    });

    it("should update server with correct arguments", async () => {
      const servers = {
        testServer: {
          serverAlias: "testServerAlias",
          serverName: "testServerName",
          serverPort: "5001",
          tls: false,
          auth: false,
          managed: false,
        },
      };
      const insights = {
        testInsight: {
          alias: "testInsightsAlias",
          server: "testInsightsName",
          auth: false,
        },
      };
      ext.serverProvider = new KdbTreeProvider(servers, insights);
      ext.openSslVersion = "1.0.2";
      getServersStub.returns({
        test: {
          auth: true,
          tls: false,
          serverName: "test",
          serverPort: "1001",
          serverAlias: "testando",
          managed: false,
        },
      });
      await serverCommand.enableTLS("test");
      sinon.assert.calledOnce(updateServersStub);
    });
  });

  describe("writeScratchpadResult", () => {
    const _console = vscode.window.createOutputChannel("q Console Output");
    const executionConsole = new ExecutionConsole(_console);
    const uriTest: vscode.Uri = vscode.Uri.parse("test");
    ext.resultsViewProvider = new KdbResultsViewProvider(uriTest);
    let _executionConsoleStub: sinon.SinonStub;
    let scratchpadResult: ScratchpadResult;
    let queryConsoleErrorStub: sinon.SinonStub;
    let writeQueryResultsToViewStub: sinon.SinonStub;
    let writeQueryResultsToConsoleStub: sinon.SinonStub;
    let isVisibleStub: sinon.SinonStub;

    beforeEach(() => {
      _executionConsoleStub = sinon
        .stub(ExecutionConsole, "start")
        .returns(executionConsole);
      scratchpadResult = {
        data: "1234",
        error: false,
        errorMsg: "",
        sessionID: "123",
      };
      queryConsoleErrorStub = sinon.stub(
        ExecutionConsole.prototype,
        "appendQueryError",
      );
      writeQueryResultsToViewStub = sinon.stub(
        serverCommand,
        "writeQueryResultsToView",
      );
      writeQueryResultsToConsoleStub = sinon.stub(
        serverCommand,
        "writeQueryResultsToConsole",
      );
      isVisibleStub = sinon.stub(ext.resultsViewProvider, "isVisible");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should write appendQueryError", () => {
      scratchpadResult.error = true;
      scratchpadResult.errorMsg = "error";
      serverCommand.writeScratchpadResult(
        scratchpadResult,
        "dummy query",
        "connLabel",
        "testFile.kdb.q",
        false,
        true,
        "2",
        0,
      );
      sinon.assert.notCalled(writeQueryResultsToViewStub);
      sinon.assert.notCalled(writeQueryResultsToConsoleStub);
    });

    it("should write to view", () => {
      scratchpadResult.data = "data";
      isVisibleStub.returns(true);
      serverCommand.writeScratchpadResult(
        scratchpadResult,
        "dummy query",
        "connLabel",
        "testFile.kdb.py",
        true,
        true,
        "2",
        0,
      );
      sinon.assert.notCalled(writeQueryResultsToConsoleStub);
      sinon.assert.notCalled(queryConsoleErrorStub);
    });

    it("should write to console", () => {
      scratchpadResult.data = "data";
      isVisibleStub.returns(false);
      serverCommand.writeScratchpadResult(
        scratchpadResult,
        "dummy query",
        "connLabel",
        "testFile.kdb.py",
        true,
        true,
        "2",
        0,
      );
      sinon.assert.notCalled(writeQueryResultsToViewStub);
    });
  });

  describe("resetScratchPad", () => {
    it("should call reset scratchpad", async () => {
      const resetScratchpadStub = sinon.stub(
        ConnectionManagementService.prototype,
        "resetScratchpad",
      );
      await serverCommand.resetScratchpad();
      sinon.assert.calledOnce(resetScratchpadStub);
      sinon.restore();
    });
  });

  describe("runQuery", () => {
    const editor = <vscode.TextEditor>(<unknown>{
      selection: {
        isEmpty: false,
        active: { line: 5 },
        end: sinon.stub().returns({ line: 10 }),
      },
      document: {
        lineAt: sinon.stub().returns({ text: "SELECT * FROM table" }),
        getText: sinon.stub().returns("SELECT * FROM table"),
      },
    });

    let getQueryContextStub, executeQueryStub: sinon.SinonStub;

    beforeEach(() => {
      ext.activeTextEditor = editor;
      getQueryContextStub = sinon
        .stub(serverCommand, "getQueryContext")
        .returns(".");
      executeQueryStub = sinon
        .stub(serverCommand, "executeQuery")
        .resolves(undefined);
      ext.kdbinsightsNodes.push("insightsserveralias (connected)");
    });

    afterEach(() => {
      ext.activeTextEditor = undefined;
      getQueryContextStub.restore();
      executeQueryStub.restore();
      ext.kdbinsightsNodes.pop();
    });

    it("runQuery with undefined editor ", async () => {
      ext.activeTextEditor = undefined;
      const result = await serverCommand.runQuery(
        ExecutionTypes.PythonQueryFile,
        "",
        "",
        false,
      );
      assert.equal(result, false);
    });

    it("runQuery with QuerySelection", async () => {
      ext.connectionNode = undefined;
      const result = await serverCommand.runQuery(
        ExecutionTypes.QuerySelection,
        "",
        "",
        false,
      );
      assert.equal(result, undefined);
    });

    it("runQuery with PythonQueryFile not connected to inisghts node", async () => {
      ext.connectionNode = undefined;
      const result = await serverCommand.runQuery(
        ExecutionTypes.PythonQuerySelection,
        "",
        "",
        false,
      );
      assert.equal(result, undefined);
    });

    it("runQuery with PythonQueryFile connected to inisghts node", async () => {
      ext.connectionNode = insightsNode;
      const result = await serverCommand.runQuery(
        ExecutionTypes.PythonQuerySelection,
        "",
        "",
        false,
      );
      assert.equal(result, undefined);
    });

    it("runQuery with QueryFile", async () => {
      ext.connectionNode = undefined;
      const result = await serverCommand.runQuery(
        ExecutionTypes.QueryFile,
        "",
        "",
        false,
      );
      assert.equal(result, undefined);
    });

    it("runQuery with ReRunQuery", async () => {
      ext.connectionNode = undefined;
      const result = await serverCommand.runQuery(
        ExecutionTypes.ReRunQuery,
        "",
        "",
        false,
        "rerun query",
      );
      assert.equal(result, undefined);
    });

    it("runQuery with PythonQueryFile", async () => {
      ext.connectionNode = undefined;
      const result = await serverCommand.runQuery(
        ExecutionTypes.PythonQueryFile,
        "",
        "",
        false,
      );
      assert.equal(result, undefined);
    });

    it("runQuery with PythonQueryFile", async () => {
      ext.connectionNode = insightsNode;
      const result = await serverCommand.runQuery(
        ExecutionTypes.PythonQueryFile,
        "",
        "",
        false,
      );
      assert.equal(result, undefined);
    });
  });

  describe("executeQuery", () => {
    let isVisibleStub,
      executeQueryStub,
      writeResultsViewStub,
      writeResultsConsoleStub,
      writeScratchpadResultStub: sinon.SinonStub;
    const connMangService = new ConnectionManagementService();
    const insightsConn = new InsightsConnection(
      insightsNode.label,
      insightsNode,
    );
    const localConn = new LocalConnection("localhost:5001", "server1", []);
    beforeEach(() => {
      isVisibleStub = sinon.stub(ext.resultsViewProvider, "isVisible");
      executeQueryStub = sinon.stub(connMangService, "executeQuery");
      writeResultsViewStub = sinon.stub(
        serverCommand,
        "writeQueryResultsToView",
      );
      writeResultsConsoleStub = sinon.stub(
        serverCommand,
        "writeQueryResultsToConsole",
      );
      writeScratchpadResultStub = sinon.stub(
        serverCommand,
        "writeScratchpadResult",
      );
    });
    afterEach(() => {
      ext.activeConnection = undefined;
      ext.connectedConnectionList.length = 0;
      ext.connectedContextStrings.length = 0;
      sinon.restore();
    });
    it("should fail if connLabel is empty and activeConnection is undefined", async () => {
      serverCommand.executeQuery(
        "SELECT * FROM table",
        "",
        "testFile.kdb.q",
        ".",
        true,
        true,
      );
      sinon.assert.notCalled(writeResultsConsoleStub);
      sinon.assert.notCalled(writeResultsViewStub);
      sinon.assert.notCalled(writeScratchpadResultStub);
    });

    it("should proceed if connLabel is empty and activeConnection is not undefined", async () => {
      ext.activeConnection = localConn;
      ext.connectedConnectionList.push(localConn);
      ext.connectedContextStrings.push(localConn.connLabel);
      isVisibleStub.returns(true);
      executeQueryStub.resolves({ data: "data" });
      serverCommand.executeQuery(
        "SELECT * FROM table",
        "",
        "testFile.kdb.q",
        ".",
        true,
        true,
      );
      sinon.assert.notCalled(writeResultsConsoleStub);
      sinon.assert.notCalled(writeScratchpadResultStub);
    });
    it("should fail if the connection selected is not connected", async () => {
      ext.connectedConnectionList.push(localConn);
      isVisibleStub.returns(true);
      executeQueryStub.resolves({ data: "data" });
      serverCommand.executeQuery(
        "SELECT * FROM table",
        localConn.connLabel,
        "testFile.kdb.q",
        ".",
        true,
        true,
      );
      sinon.assert.notCalled(writeResultsConsoleStub);
      sinon.assert.notCalled(writeResultsViewStub);
      sinon.assert.notCalled(writeScratchpadResultStub);
    });
    it("should execute query and write results to view", async () => {
      ext.connectedConnectionList.push(localConn);
      ext.connectedContextStrings.push(localConn.connLabel);
      isVisibleStub.returns(true);
      executeQueryStub.resolves({ data: "data" });
      serverCommand.executeQuery(
        "SELECT * FROM table",
        localConn.connLabel,
        "testFile.kdb.q",
        ".",
        true,
        true,
      );
      sinon.assert.notCalled(writeResultsConsoleStub);
      sinon.assert.notCalled(writeScratchpadResultStub);
    });
    it("should execute query and write results to console", async () => {
      ext.connectedConnectionList.push(localConn);
      ext.connectedContextStrings.push(localConn.connLabel);
      isVisibleStub.returns(false);
      executeQueryStub.resolves("dummy test");
      serverCommand.executeQuery(
        "SELECT * FROM table",
        localConn.connLabel,
        "testFile.kdb.q",
        ".",
        true,
        true,
      );
      sinon.assert.notCalled(writeResultsViewStub);
      sinon.assert.notCalled(writeScratchpadResultStub);
    });
    it("should execute query and write error to console", async () => {
      ext.connectedConnectionList.push(insightsConn);
      ext.connectedContextStrings.push(insightsConn.connLabel);
      isVisibleStub.returns(true);
      executeQueryStub.resolves("dummy test");
      serverCommand.executeQuery(
        "SELECT * FROM table",
        insightsConn.connLabel,
        "testFile.kdb.q",
        ".",
        true,
        true,
      );
      sinon.assert.notCalled(writeResultsConsoleStub);
    });

    it("should get error", async () => {
      ext.activeConnection = localConn;
      ext.connectionNode = kdbNode;
      const res = await serverCommand.executeQuery(
        "",
        "testeConn",
        "testFile.kdb.q",
        ".",
        true,
        true,
      );
      assert.equal(res, undefined);
    });
  });

  describe("getConextForRerunQuery", function () {
    it("should return correct context for given input", function () {
      assert.equal(serverCommand.getConextForRerunQuery("\\d .foo"), ".foo");
      assert.equal(
        serverCommand.getConextForRerunQuery('system "d .bar'),
        ".bar",
      );
    });

    it("should return default context for input without context", function () {
      assert.equal(
        serverCommand.getConextForRerunQuery("no context here"),
        ".",
      );
    });

    it("should return last context for input with multiple contexts", function () {
      assert.equal(
        serverCommand.getConextForRerunQuery("\\d .foo\n\\d .bar"),
        ".foo",
      );
    });
  });

  describe("rerunQuery", function () {
    let executeQueryStub, runDataSourceStub: sinon.SinonStub;
    beforeEach(() => {
      runDataSourceStub = sinon
        .stub(dataSourceCommand, "runDataSource")
        .resolves();

      executeQueryStub = sinon.stub(serverCommand, "executeQuery").resolves();
    });
    this.afterEach(() => {
      sinon.restore();
    });
    it("should execute query for non-datasource query", async function () {
      const rerunQueryElement: QueryHistory = {
        executorName: "test",
        isDatasource: false,
        query: "SELECT * FROM table",
        language: "q",
        time: "",
        success: true,
        connectionName: "",
        connectionType: ServerType.KDB,
      };

      serverCommand.rerunQuery(rerunQueryElement);
      sinon.assert.notCalled(runDataSourceStub);
    });

    it("should run datasource for datasource query", async function () {
      const ds = createDefaultDataSourceFile();
      const rerunQueryElement: QueryHistory = {
        executorName: "test",
        isDatasource: true,
        datasourceType: DataSourceTypes.QSQL,
        query: ds,
        connectionName: "",
        connectionType: ServerType.INSIGHTS,
        time: "",
        success: false,
      };

      await serverCommand.rerunQuery(rerunQueryElement);

      sinon.assert.notCalled(executeQueryStub);
    });
  });

  describe("activeConnection", () => {
    let setActiveConnectionStub,
      refreshDataSourcesPanelStub,
      reloadStub: sinon.SinonStub;

    beforeEach(() => {
      setActiveConnectionStub = sinon.stub(
        ConnectionManagementService.prototype,
        "setActiveConnection",
      );
      refreshDataSourcesPanelStub = sinon.stub(
        dsUtils,
        "refreshDataSourcesPanel",
      );
      reloadStub = sinon.stub(ext.serverProvider, "reload");
    });
    afterEach(() => {
      sinon.restore();
    });

    it("should set active connection and refresh panel", () => {
      serverCommand.activeConnection(kdbNode);

      assert.ok(setActiveConnectionStub.calledWith(kdbNode));
      assert.ok(refreshDataSourcesPanelStub.calledOnce);
      assert.ok(reloadStub.calledOnce);
    });
  });

  describe("disconnect", () => {
    let findStub: sinon.SinonStub;
    let disconnectStub: sinon.SinonStub;

    beforeEach(() => {
      findStub = sinon.stub(ext.kdbinsightsNodes, "find");
      disconnectStub = sinon.stub(
        ConnectionManagementService.prototype,
        "disconnect",
      );
    });

    afterEach(() => {
      findStub.restore();
      disconnectStub.restore();
    });

    it("should disconnect when ext.connectionNode", async () => {
      findStub.returns(undefined);

      await serverCommand.disconnect("testLabel");

      assert.ok(disconnectStub.calledWith("testLabel"));
    });
  });

  describe("removeConnection", () => {
    let indexOfStub,
      _disconnectStub,
      getServersStub,
      getHashStub,
      getKeyStub,
      getInsightsStub,
      removeLocalConnectionContextStub,
      updateServersStub,
      refreshStub,
      notifyStub: sinon.SinonStub;

    beforeEach(() => {
      indexOfStub = sinon.stub(ext.connectedContextStrings, "indexOf");
      _disconnectStub = sinon.stub(serverCommand, "disconnect");
      getServersStub = sinon.stub(coreUtils, "getServers");
      getInsightsStub = sinon.stub(coreUtils, "getInsights");
      getHashStub = sinon.stub(coreUtils, "getHash");
      getKeyStub = sinon.stub(coreUtils, "getKeyForServerName");
      removeLocalConnectionContextStub = sinon.stub(
        coreUtils,
        "removeLocalConnectionContext",
      );
      updateServersStub = sinon.stub(coreUtils, "updateServers");
      refreshStub = sinon.stub(ext.serverProvider, "refresh");

      notifyStub = sinon.stub(notifications, "notify");
    });

    afterEach(() => {
      ext.activeConnection = undefined;
      ext.connectionNode = undefined;
      sinon.restore();
      ext.connectedContextStrings.length = 0;
    });

    it("should remove connection and refresh server provider when user clicks Proceed", async () => {
      notifyStub.resolves("Proceed");

      indexOfStub.returns(1);
      getServersStub.returns({ testKey: {} });
      getKeyStub.returns("testKey");

      await serverCommand.removeConnection(kdbNode);

      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.ok(
        removeLocalConnectionContextStub.calledWith(
          coreUtils.getServerName(kdbNode.details),
        ),
      );
      assert.ok(updateServersStub.calledOnce);
      assert.ok(refreshStub.calledOnce);
    });

    it("should remove connection, but disconnect it before when user clicks Proceed", async () => {
      notifyStub.resolves("Proceed");

      ext.connectedContextStrings.push(kdbNode.label);
      indexOfStub.returns(1);
      getServersStub.returns({ testKey: {} });
      getKeyStub.returns("testKey");

      await serverCommand.removeConnection(kdbNode);

      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.ok(updateServersStub.calledOnce);
    });

    it("should remove connection Insights, but disconnect it before when user clicks Proceed", async () => {
      notifyStub.resolves("Proceed");

      ext.connectedContextStrings.push(insightsNode.label);
      indexOfStub.returns(1);
      getInsightsStub.returns({ testKey: {} });
      getHashStub.returns("testKey");

      await serverCommand.removeConnection(insightsNode);

      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.ok(updateServersStub.notCalled);
    }).timeout(5000);

    it("should not remove connection when user clicks Cancel", async () => {
      notifyStub.resolves("Cancel");

      getServersStub.returns({ testKey: {} });
      getKeyStub.returns("testKey");

      await serverCommand.removeConnection(kdbNode);

      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.ok(removeLocalConnectionContextStub.notCalled);
      assert.ok(updateServersStub.notCalled);
      assert.ok(refreshStub.notCalled);
    });

    it("should not remove connection when user dismisses dialog", async () => {
      notifyStub.resolves(undefined);

      getServersStub.returns({ testKey: {} });
      getKeyStub.returns("testKey");

      await serverCommand.removeConnection(kdbNode);

      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.ok(removeLocalConnectionContextStub.notCalled);
      assert.ok(updateServersStub.notCalled);
      assert.ok(refreshStub.notCalled);
    });
  });

  describe("connect", () => {
    const connService = new ConnectionManagementService();
    const _console = vscode.window.createOutputChannel("q Console Output");
    const _executionConsole = new ExecutionConsole(_console);
    let windowErrorStub, retrieveConnectionStub: sinon.SinonStub;

    beforeEach(() => {
      windowErrorStub = sinon.stub(vscode.window, "showErrorMessage");
      retrieveConnectionStub = sinon.stub(connService, "retrieveConnection");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should show error message if connection not found", async () => {
      retrieveConnectionStub.returns(undefined);
      await serverCommand.connect("test");
      assert.strictEqual(windowErrorStub.calledOnce, true);
    });
  });

  describe("refreshGetMeta", () => {
    let refreshGetMetaStub, refreshAllGetMetasStub: sinon.SinonStub;
    beforeEach(() => {
      refreshGetMetaStub = sinon.stub(
        ConnectionManagementService.prototype,
        "refreshGetMeta",
      );
      refreshAllGetMetasStub = sinon.stub(
        ConnectionManagementService.prototype,
        "refreshAllGetMetas",
      );
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should call refreshGetMeta if connLabel is provided", async () => {
      await serverCommand.refreshGetMeta("test");

      sinon.assert.calledOnce(refreshGetMetaStub);
      sinon.assert.calledWith(refreshGetMetaStub, "test");
      sinon.assert.notCalled(refreshAllGetMetasStub);
    });

    it("should call refreshAllGetMetas if connLabel is not provided", async () => {
      await serverCommand.refreshGetMeta();

      sinon.assert.notCalled(refreshGetMetaStub);
      sinon.assert.calledOnce(refreshAllGetMetasStub);
    });
  });

  describe("openMeta", () => {
    let sandbox: sinon.SinonSandbox;
    const node = new MetaObjectPayloadNode(
      [],
      "meta",
      "",
      vscode.TreeItemCollapsibleState.None,
      "meta",
      "connLabel",
    );
    const connService = new ConnectionManagementService();

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      sandbox.spy(vscode.workspace, "registerTextDocumentContentProvider");
      sandbox.spy(vscode.workspace, "openTextDocument");
      sandbox.spy(vscode.window, "showTextDocument");
    });

    afterEach(() => {
      sandbox.restore();
      sinon.restore();
    });

    it("should call functions once for valid meta content", async () => {
      sinon
        .stub(ConnectionManagementService.prototype, "retrieveMetaContent")
        .returns('{"test": []}');
      await serverCommand.openMeta(node);
      sinon.assert.calledOnce(
        vscode.workspace.registerTextDocumentContentProvider as sinon.SinonSpy,
      );
      sinon.assert.calledOnce(
        vscode.workspace.openTextDocument as sinon.SinonSpy,
      );
      sinon.assert.calledOnce(vscode.window.showTextDocument as sinon.SinonSpy);
    });

    it("should not call some functions for invalid meta content", async () => {
      sinon.stub(connService, "retrieveMetaContent").returns("");
      await serverCommand.openMeta(node);
      sinon.assert.calledOnce(
        vscode.workspace.registerTextDocumentContentProvider as sinon.SinonSpy,
      );
      sinon.assert.notCalled(
        vscode.workspace.openTextDocument as sinon.SinonSpy,
      );
      sinon.assert.notCalled(vscode.window.showTextDocument as sinon.SinonSpy);
    });
  });

  describe("exportConnections", () => {
    let sandbox: sinon.SinonSandbox;
    let kdbOutputLogStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      kdbOutputLogStub = sinon.stub(loggers, "kdbOutputLog");
    });

    afterEach(() => {
      sandbox.restore();
      sinon.restore();
      mock.restore();
    });

    it("should log an error when no connections are found", async () => {
      const exportConnectionStub = sandbox
        .stub(ConnectionManagementService.prototype, "exportConnection")
        .returns("");
      const showQuickPickStub = sandbox
        .stub(vscode.window, "showQuickPick")
        .resolves({ label: "No" });

      await serverCommand.exportConnections();

      sinon.assert.calledOnce(kdbOutputLogStub);
      sinon.assert.calledWith(
        kdbOutputLogStub,
        "[serverCommand] No connections found to be exported.",
        "ERROR",
      );

      exportConnectionStub.restore();
      showQuickPickStub.restore();
    });

    it("should log info when save operation is cancelled by the user", async () => {
      const exportConnectionStub = sandbox
        .stub(ConnectionManagementService.prototype, "exportConnection")
        .returns("{}");
      const showSaveDialogStub = sandbox
        .stub(vscode.window, "showSaveDialog")
        .resolves(undefined);
      const showQuickPickStub = sandbox
        .stub(vscode.window, "showQuickPick")
        .resolves({ label: "Yes" });

      await serverCommand.exportConnections();

      sinon.assert.calledOnce(kdbOutputLogStub);
      sinon.assert.calledWith(
        kdbOutputLogStub,
        "[serverCommand] Save operation was cancelled by the user.",
        "DEBUG",
      );

      exportConnectionStub.restore();
      showSaveDialogStub.restore();
      showQuickPickStub.restore();
    });
  });

  describe("copyQuery", () => {
    let showInfoStub: sinon.SinonStub;

    beforeEach(() => {
      showInfoStub = sinon.stub(vscode.window, "showInformationMessage");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should copy query to clipboard", async () => {
      const queryHistory: QueryHistory = {
        executorName: "test",
        connectionName: "conn",
        connectionType: ServerType.KDB,
        query: "select from table",
        time: "now",
        success: true,
      };

      serverCommand.copyQuery(queryHistory);
      sinon.assert.calledOnceWithExactly(
        showInfoStub,
        "Query copied to clipboard.",
        "Dismiss",
      );
    });

    it("should not copy query to clipboard if query is not string", async () => {
      const dummyDsFiles = createDefaultDataSourceFile();
      const queryHistory: QueryHistory = {
        executorName: "test",
        connectionName: "conn",
        connectionType: ServerType.KDB,
        query: dummyDsFiles,
        time: "now",
        success: true,
      };
      await serverCommand.copyQuery(queryHistory);
      sinon.assert.notCalled(showInfoStub);
    });

    it("should not copy query to clipboard if is DS", async () => {
      const queryHistory: QueryHistory = {
        executorName: "test",
        connectionName: "conn",
        connectionType: ServerType.KDB,
        query: "select from table",
        time: "now",
        success: true,
        isDatasource: true,
      };
      await serverCommand.copyQuery(queryHistory);
      sinon.assert.notCalled(showInfoStub);
    });
  });
});

describe("walkthroughCommand", () => {
  //write tests for src/commands/walkthroughCommand.ts
  //function to be deleted after write the tests
  walkthroughCommand.showInstallationDetails();
});

describe("workspaceCommand", () => {
  const kdbUri = vscode.Uri.file("test-kdb.q");
  const insightsUri = vscode.Uri.file("test-insights.q");
  const pythonUri = vscode.Uri.file("test-python.q");

  beforeEach(() => {
    const insightNode = new InsightsNode(
      [],
      "remote",
      { alias: "connection1", auth: false, server: "" },
      vscode.TreeItemCollapsibleState.None,
    );
    const kdbNode = new KdbNode(
      [],
      "local",
      {
        auth: false,
        managed: false,
        serverAlias: "connection2",
        serverName: "",
        serverPort: "1",
        tls: false,
      },
      vscode.TreeItemCollapsibleState.None,
    );
    ext.serverProvider = <any>{
      async getChildren() {
        return [kdbNode, insightNode];
      },
    };
    ext.connectionsList.push(kdbNode);
    ext.connectionsList.push(insightNode);

    ext.activeTextEditor = <any>{
      document: {
        uri: insightsUri,
        fileName: "test-insights.q",
        getText() {
          return "";
        },
      },
    };

    sinon
      .stub(ConnectionManagementService.prototype, "isConnected")
      .returns(true);
    sinon
      .stub(ConnectionManagementService.prototype, "retrieveMetaContent")
      .returns(JSON.stringify([{ assembly: "assembly", target: "target" }]));
    sinon.stub(vscode.workspace, "getConfiguration").value(() => {
      return {
        get(key: string) {
          switch (key) {
            case "servers":
              return [{ serverAlias: "connection2" }];
            case "insightsEnterpriseConnections":
              return [{ alias: "connection1" }];
            case "connectionMap":
              return {
                [kdbUri.path]: "connection2",
                [pythonUri.path]: "connection1",
                [insightsUri.path]: "connection1",
              };
            case "targetMap":
              return {
                [insightsUri.path]: "assembly target",
              };
          }
          return {};
        },
        update() {},
      };
    });
  });
  afterEach(() => {
    sinon.restore();
    ext.serverProvider = <any>{};
    ext.connectionsList.length = 0;
    ext.activeTextEditor = undefined;
  });
  describe("connectWorkspaceCommands", () => {
    it("should update views on delete and create", () => {
      let cb1, cb2, dsTree, wbTree;
      sinon.stub(vscode.workspace, "createFileSystemWatcher").value(() => ({
        onDidCreate: (cb) => (cb1 = cb),
        onDidDelete: (cb) => (cb2 = cb),
      }));
      ext.dataSourceTreeProvider = <WorkspaceTreeProvider>{
        reload() {
          dsTree = true;
        },
      };
      ext.scratchpadTreeProvider = <WorkspaceTreeProvider>{
        reload() {
          wbTree = true;
        },
      };
      workspaceCommand.connectWorkspaceCommands();
      cb1(vscode.Uri.file("test.kdb.json"));
      assert.strictEqual(dsTree, true);
      cb2(vscode.Uri.file("test.kdb.q"));
      assert.strictEqual(wbTree, true);
    });
  });
  describe("getInsightsServers", () => {
    it("should return insights server aliases as array", () => {
      const result = workspaceCommand.getInsightsServers();
      assert.strictEqual(result[0], "connection1");
    });
  });
  describe("setServerForUri", () => {
    it("should associate a server with an uri", async () => {
      await assert.doesNotReject(() =>
        workspaceCommand.setServerForUri(
          vscode.Uri.file("test.kdb.q"),
          "connection1",
        ),
      );
    });
  });
  describe("pickConnection", () => {
    it("should pick from available servers", async () => {
      sinon.stub(vscode.window, "showQuickPick").value(async () => "test");
      const result = await workspaceCommand.pickConnection(
        vscode.Uri.file("test.kdb.q"),
      );
      assert.strictEqual(result, "test");
    });
    it("should return undefined from (none)", async () => {
      sinon.stub(vscode.window, "showQuickPick").value(async () => "(none)");
      const result = await workspaceCommand.pickConnection(
        vscode.Uri.file("test.kdb.q"),
      );
      assert.strictEqual(result, undefined);
    });
  });
  describe("pickTarget", () => {
    it("should pick from available targets", async () => {
      sinon
        .stub(vscode.window, "showQuickPick")
        .value(async () => "scratchpad");
      let res = await workspaceCommand.pickTarget(insightsUri);
      assert.strictEqual(res, undefined);
      res = await workspaceCommand.pickTarget(kdbUri);
      assert.strictEqual(res, undefined);
    });
    it("should only show scratchpad for .py files", async () => {
      sinon
        .stub(vscode.window, "showQuickPick")
        .value(async () => "scratchpad");
      const res = await workspaceCommand.pickTarget(pythonUri);
      assert.strictEqual(res, undefined);
    });
  });
  describe("getConnectionForUri", () => {
    it("should return node", async () => {
      workspaceCommand.getConnectionForUri(insightsUri);
      workspaceCommand.getConnectionForUri(kdbUri);
    });
    it("should return undefined", async () => {
      ext.connectionsList.length = 0;
      const node = workspaceCommand.getConnectionForUri(insightsUri);
      assert.strictEqual(node, undefined);
    });
  });
  describe("runActiveEditor", () => {
    it("should run query", async () => {
      await workspaceCommand.runActiveEditor();
    });
  });
  describe("ConnectionLensProvider", () => {
    describe("provideCodeLenses", () => {
      it("should return lenses", async () => {
        const document: vscode.TextDocument = <any>{
          uri: kdbUri,
        };
        const provider = new workspaceCommand.ConnectionLensProvider();
        const result = await provider.provideCodeLenses(document);
        assert.ok(result.length >= 1);
      });
      it("should return 2 lenses", async () => {
        const document: vscode.TextDocument = <any>{
          uri: insightsUri,
        };
        const provider = new workspaceCommand.ConnectionLensProvider();
        const result = await provider.provideCodeLenses(document);
        assert.ok(result.length >= 1);
      });
    });
  });
  describe("checkOldDatasourceFiles", () => {
    let oldFilesExistsStub: sinon.SinonStub;
    beforeEach(() => {
      oldFilesExistsStub = sinon.stub(dataSourceUtils, "oldFilesExists");
    });
    afterEach(() => {
      oldFilesExistsStub.restore();
    });
    it("should check for old datasource files", async () => {
      oldFilesExistsStub.returns(true);
      await workspaceCommand.checkOldDatasourceFiles();
      sinon.assert.calledOnce(oldFilesExistsStub);
    });
  });
  describe("importOldDSFiles", () => {
    let windowErrorStub,
      windowWithProgressStub,
      windowShowInfo,
      workspaceFolderStub,
      tokenOnCancellationRequestedStub,
      kdbOutputLogStub: sinon.SinonStub;
    beforeEach(() => {
      windowErrorStub = sinon.stub(vscode.window, "showErrorMessage");
      windowWithProgressStub = sinon.stub(vscode.window, "withProgress");
      windowShowInfo = sinon.stub(vscode.window, "showInformationMessage");
      workspaceFolderStub = sinon.stub(vscode.workspace, "workspaceFolders");
      tokenOnCancellationRequestedStub = sinon.stub();
      windowWithProgressStub.callsFake((options, task) => {
        const token = {
          onCancellationRequested: tokenOnCancellationRequestedStub,
        };
        task({}, token);
      });

      kdbOutputLogStub = sinon.stub(loggers, "kdbOutputLog");
    });
    afterEach(() => {
      sinon.restore();
    });
    it("should show info message if old files do not exist", async () => {
      ext.oldDSformatExists = false;
      await workspaceCommand.importOldDSFiles();
      sinon.assert.calledOnce(windowShowInfo);
    });
    it("should show error message if workspace do not exist", async () => {
      ext.oldDSformatExists = true;
      await workspaceCommand.importOldDSFiles();
      sinon.assert.calledOnce(windowErrorStub);
    });
    it.skip("should show not show error or info message if workspace do exist", async () => {
      ext.oldDSformatExists = true;
      workspaceFolderStub.get(() => [
        {
          uri: { fsPath: "path/to/workspace" },
          name: "workspace",
          index: 0,
        },
      ]);
      await workspaceCommand.importOldDSFiles();
      sinon.assert.notCalled(windowErrorStub);
      sinon.assert.notCalled(windowShowInfo);
    });

    it.skip("should log cancellation if user cancels the request", async () => {
      ext.oldDSformatExists = true;
      workspaceFolderStub.get(() => [
        {
          uri: { fsPath: "path/to/workspace" },
          name: "workspace",
          index: 0,
        },
      ]);

      tokenOnCancellationRequestedStub.callsFake((callback) => callback());

      await workspaceCommand.importOldDSFiles();

      sinon.assert.calledOnce(kdbOutputLogStub);
      sinon.assert.calledWith(
        kdbOutputLogStub,
        "[workspaceCommand] User cancelled the old DS files import.",
        "DEBUG",
      );
    });
    describe("runOnRepl", () => {
      const editor = <vscode.TextEditor>{
        document: <any>{
          uri: kdbUri,
          lineAt() {
            return "a:1;a";
          },
          getText() {
            return "a:1;a";
          },
        },
        selection: { active: { line: 0 } },
      };
      let notifyStub: sinon.SinonStub;
      let executeStub: sinon.SinonStub;
      beforeEach(() => {
        notifyStub = sinon.stub(notifications, "notify");
        executeStub = sinon.stub(notifications.Runner.prototype, "execute");
      });
      it("should execute q file", async () => {
        await workspaceCommand.runOnRepl(editor, ExecutionTypes.QueryFile);
        sinon.assert.calledOnce(executeStub);
      });
      it("should execute q selection", async () => {
        await workspaceCommand.runOnRepl(editor, ExecutionTypes.QuerySelection);
        sinon.assert.calledOnce(executeStub);
      });
      it("should notify for other execution types", async () => {
        await workspaceCommand.runOnRepl(
          editor,
          ExecutionTypes.PopulateScratchpad,
        );
        sinon.assert.calledOnce(notifyStub);
      });
      it("should notify execution error", async () => {
        executeStub.rejects(new Error("Test"));
        await workspaceCommand.runOnRepl(editor, ExecutionTypes.QueryFile);
        sinon.assert.calledOnce(notifyStub);
      });
      describe("startRepl", () => {
        const conn = <ReplConnection>{ start() {} };
        beforeEach(() => {
          sinon.stub(ReplConnection, "getOrCreateInstance").returns(conn);
        });
        it("should notify error", async () => {
          sinon.stub(conn, "start").throws(new Error("Test"));
          await workspaceCommand.startRepl();
          sinon.assert.calledOnce(notifyStub);
        });
      });
    });
  });

  describe("resetScratchpadFromEditor", () => {
    let getServerForUriStub: sinon.SinonStub;
    let pickConnectionStub: sinon.SinonStub;
    let _getConnectionForServerStub: sinon.SinonStub;
    let resetScratchpadStub: sinon.SinonStub;

    const insightsNode = new InsightsNode(
      [],
      "insightsnode1",
      {
        server: "https://insightsservername.com/",
        alias: "insightsserveralias",
        auth: true,
      },
      vscode.TreeItemCollapsibleState.None,
    );

    beforeEach(() => {
      ext.activeTextEditor = <vscode.TextEditor>{
        options: { insertSpaces: true, indentSize: 4 },
        selection: { active: new vscode.Position(0, 0) },
        document: {
          uri: vscode.Uri.file("/tmp/some.q"),
          getText: () => "",
        },
      };

      getServerForUriStub = sinon.stub(workspaceCommand, "getServerForUri");
      pickConnectionStub = sinon.stub(workspaceCommand, "pickConnection");
      _getConnectionForServerStub = sinon
        .stub(workspaceCommand, "getConnectionForServer")
        .resolves(insightsNode);
      resetScratchpadStub = sinon
        .stub(serverCommand, "resetScratchpad")
        .resolves();
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should call resetScratchpad with empty server label", async () => {
      getServerForUriStub.returns("");
      await workspaceCommand.resetScratchpadFromEditor();
      assert.strictEqual(resetScratchpadStub.calledWith(""), true);
    });

    it("should set server to an empty string if no server is found", async () => {
      getServerForUriStub.returns(undefined);
      pickConnectionStub.resolves(undefined);
      await workspaceCommand.resetScratchpadFromEditor();
      assert.strictEqual(resetScratchpadStub.calledWith(""), true);
    });

    it("should not call resetScratchpad if activeTextEditor is not set", async () => {
      ext.activeTextEditor = undefined;
      await workspaceCommand.resetScratchpadFromEditor();
      assert.strictEqual(resetScratchpadStub.called, false);
    });
  });
});

describe("clientCommands", () => {
  const client = sinon.createStubInstance(LanguageClient);
  let executeBlock;
  let toggleParameterCache;

  beforeEach(() => {
    const context = <vscode.ExtensionContext>{ subscriptions: [] };
    sinon.stub(vscode.commands, "registerCommand").value((a, b) => b);
    clientCommand.connectClientCommands(context, client);
    executeBlock = context.subscriptions[0];
    toggleParameterCache = context.subscriptions[1];
    ext.activeTextEditor = <vscode.TextEditor>{
      options: { insertSpaces: true, indentSize: 4 },
      selection: { active: new vscode.Position(0, 0) },
      document: {
        uri: vscode.Uri.file("/tmp/some.q"),
        getText: () => "",
      },
    };
  });
  afterEach(() => {
    sinon.restore();
    ext.activeTextEditor = undefined;
  });
  describe("executeBlock", () => {
    it("should execute current block", async () => {
      sinon
        .stub(client, "sendRequest")
        .value(async () => new vscode.Range(0, 0, 1, 1));
      sinon.stub(workspaceCommand, "runActiveEditor").value(() => {});
      await executeBlock(client);
      assert.deepEqual(
        ext.activeTextEditor.selection,
        new vscode.Selection(0, 0, 1, 1),
      );
    });
  });
  describe("kdb.toggleParameterCache", () => {
    it("should add parameter cache for single line functions", async () => {
      let edit: vscode.WorkspaceEdit;
      sinon.stub(client, "sendRequest").value(async () => ({
        params: ["a"],
        start: new vscode.Position(0, 0),
        end: new vscode.Position(0, 10),
      }));
      sinon.stub(vscode.workspace, "applyEdit").value(async (a) => (edit = a));
      await toggleParameterCache(client);
      assert.strictEqual(edit.size, 1);
    });
    it("should add parameter cache for multi line functions", async () => {
      let edit: vscode.WorkspaceEdit;
      sinon.stub(client, "sendRequest").value(async () => ({
        params: ["a"],
        start: new vscode.Position(0, 0),
        end: new vscode.Position(1, 10),
      }));
      sinon.stub(vscode.workspace, "applyEdit").value(async (a) => (edit = a));
      await toggleParameterCache(client);
      assert.strictEqual(edit.size, 1);
    });
  });

  describe("getPartialDatasourceFile", () => {
    it("should return qsql datatsource", () => {
      const res = dataSourceCommand.getPartialDatasourceFile("query");
      assert.strictEqual(res.dataSource.selectedType, "QSQL");
    });
    it("should return sql datatsource", () => {
      const res = dataSourceCommand.getPartialDatasourceFile(
        "query",
        "dap",
        true,
      );
      assert.strictEqual(res.dataSource.selectedType, "SQL");
    });
  });
});
