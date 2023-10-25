/*
 * Copyright (c) 1998-2023 Kx Systems Inc.
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
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as dataSourceCommand from "../../src/commands/dataSourceCommand";
import * as installTools from "../../src/commands/installTools";
import * as serverCommand from "../../src/commands/serverCommand";
import * as walkthroughCommand from "../../src/commands/walkthroughCommand";
import { ext } from "../../src/extensionVariables";
import { DataSourceFiles, DataSourceTypes } from "../../src/models/dataSource";
import { KdbTreeProvider } from "../../src/services/kdbTreeProvider";
import { KdbResultsViewProvider } from "../../src/services/resultsPanelProvider";
import * as coreUtils from "../../src/utils/core";
import * as dataSourceUtils from "../../src/utils/dataSource";
import * as queryUtils from "../../src/utils/queryUtils";

describe("dataSourceCommand", () => {
  let dummyDataSourceFiles: DataSourceFiles;
  const uriTest: vscode.Uri = vscode.Uri.parse("test");
  let resultsPanel: KdbResultsViewProvider;
  const view: vscode.WebviewView = {
    visible: true,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
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
      },
    };
    resultsPanel = new KdbResultsViewProvider(uriTest);
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
    it("should return the correct API body for a data source with all fields", () => {
      dummyDataSourceFiles.dataSource.api.startTS = "2022-01-01T00:00:00Z";
      dummyDataSourceFiles.dataSource.api.endTS = "2022-01-02T00:00:00Z";
      dummyDataSourceFiles.dataSource.api.fill = "none";
      dummyDataSourceFiles.dataSource.api.temporality = "1h";
      dummyDataSourceFiles.dataSource.api.filter = [
        "col1=val1;col2=val2",
        "col3=val3",
      ];
      dummyDataSourceFiles.dataSource.api.groupBy = ["col1", "col2"];
      dummyDataSourceFiles.dataSource.api.agg = ["sum(col3)", "avg(col4)"];
      dummyDataSourceFiles.dataSource.api.sortCols = ["col1 ASC", "col2 DESC"];
      dummyDataSourceFiles.dataSource.api.slice = ["10", "20"];
      dummyDataSourceFiles.dataSource.api.labels = ["label1", "label2"];
      dummyDataSourceFiles.dataSource.api.table = "myTable";
      const apiBody = dataSourceCommand.getApiBody(dummyDataSourceFiles);
      assert.deepStrictEqual(apiBody, {
        table: "myTable",
        startTS: "2022-01-01T00:00:00.000000000",
        endTS: "2022-01-02T00:00:00.000000000",
        fill: "none",
        temporality: "1h",
        filter: [["col1=val1", "col2=val2"], ["col3=val3"]],
        groupBy: ["col1", "col2"],
        agg: ["sum(col3)", "avg(col4)"],
        sortCols: ["col1 ASC", "col2 DESC"],
        slice: ["10", "20"],
        labels: ["label1", "label2"],
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
    let getApiBodyStub: sinon.SinonStub;
    let checkIfTimeParamIsCorrectStub: sinon.SinonStub;
    let getDataInsightsStub: sinon.SinonStub;
    let handleWSResultsStub: sinon.SinonStub;

    beforeEach(() => {
      getApiBodyStub = sinon.stub(dataSourceCommand, "getApiBody");
      checkIfTimeParamIsCorrectStub = sinon.stub(
        dataSourceUtils,
        "checkIfTimeParamIsCorrect"
      );
      getDataInsightsStub = sinon.stub(serverCommand, "getDataInsights");
      handleWSResultsStub = sinon.stub(queryUtils, "handleWSResults");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should show an error message if the time parameters are incorrect", async () => {
      const windowMock = sinon.mock(vscode.window);
      checkIfTimeParamIsCorrectStub.returns(false);

      await dataSourceCommand.runApiDataSource(dummyDataSourceFiles);
      windowMock
        .expects("showErrorMessage")
        .once()
        .withArgs(
          "The time parameters(startTS and endTS) are not correct, please check the format or if the startTS is before the endTS"
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

      const result = await dataSourceCommand.runApiDataSource(
        dummyDataSourceFiles
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
    let getDataInsightsStub: sinon.SinonStub;
    let handleWSResultsStub: sinon.SinonStub;

    beforeEach(() => {
      getDataInsightsStub = sinon.stub(serverCommand, "getDataInsights");
      handleWSResultsStub = sinon.stub(queryUtils, "handleWSResults");
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

      const result = await dataSourceCommand.runQsqlDataSource(
        dummyDataSourceFiles
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
    let getDataInsightsStub: sinon.SinonStub;
    let handleWSResultsStub: sinon.SinonStub;

    beforeEach(() => {
      getDataInsightsStub = sinon.stub(serverCommand, "getDataInsights");
      handleWSResultsStub = sinon.stub(queryUtils, "handleWSResults");
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

      const result = await dataSourceCommand.runSqlDataSource(
        dummyDataSourceFiles
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
});

describe("installTools", () => {
  //write tests for src/commands/installTools.ts
  //function to be deleted after write the tests
  installTools.installTools();
});
describe("serverCommand", () => {
  //write tests for src/commands/serverCommand.ts
  //function to be deleted after write the tests
  serverCommand.addNewConnection();
  describe("writeQueryResultsToView", () => {
    it("should call executeCommand with correct arguments", () => {
      const result = { data: [1, 2, 3] };
      const dataSourceType = "test";
      const executeCommandStub = sinon.stub(vscode.commands, "executeCommand");

      serverCommand.writeQueryResultsToView(result, dataSourceType);

      sinon.assert.calledWith(
        executeCommandStub.firstCall,
        "kdb-results.focus"
      );
      sinon.assert.calledWith(
        executeCommandStub.secondCall,
        "kdb.resultsPanel.update",
        result,
        dataSourceType
      );

      executeCommandStub.restore();
    });

    it("should call executeCommand with correct arguments", () => {
      const result = { data: [1, 2, 3] };
      const executeCommandStub = sinon.stub(vscode.commands, "executeCommand");

      serverCommand.writeQueryResultsToView(result);

      sinon.assert.calledWith(
        executeCommandStub.firstCall,
        "kdb.resultsPanel.update",
        result,
        undefined
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
        "Cancel"
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
        "Cancel"
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
});

describe("walkthroughCommand", () => {
  //write tests for src/commands/walkthroughCommand.ts
  //function to be deleted after write the tests
  walkthroughCommand.showInstallationDetails();
});
