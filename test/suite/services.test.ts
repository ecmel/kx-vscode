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

import * as assert from "assert";
import axios from "axios";
import Path from "path";
import sinon from "sinon";
import {
  ExtensionContext,
  TreeItemCollapsibleState,
  Uri,
  WebviewPanel,
  commands,
  env,
  window,
  workspace,
  TreeItem,
} from "vscode";

import { InsightsConnection } from "../../src/classes/insightsConnection";
import { LocalConnection } from "../../src/classes/localConnection";
import { ext } from "../../src/extensionVariables";
import { InsightsApiConfig } from "../../src/models/config";
import {
  Insights,
  Server,
  ServerType,
} from "../../src/models/connectionsModels";
import { createDefaultDataSourceFile } from "../../src/models/dataSource";
import { ConnectionLabel, Labels } from "../../src/models/labels";
import { MetaInfoType, MetaObject } from "../../src/models/meta";
import { QueryHistory } from "../../src/models/queryHistory";
import { ServerObject } from "../../src/models/serverObject";
import { ChartEditorProvider } from "../../src/services/chartEditorProvider";
import { CompletionProvider } from "../../src/services/completionProvider";
import { ConnectionManagementService } from "../../src/services/connectionManagerService";
import { DataSourceEditorProvider } from "../../src/services/dataSourceEditorProvider";
import { HelpFeedbackProvider } from "../../src/services/helpFeedbackProvider";
import {
  getCurrentToken,
  refreshToken,
  signIn,
  signOut,
} from "../../src/services/kdbInsights/codeFlowLogin";
import {
  InsightsMetaNode,
  InsightsNode,
  KdbNode,
  KdbTreeProvider,
  LabelNode,
  MetaObjectPayloadNode,
  QCategoryNode,
  QNamespaceNode,
  QServerNode,
} from "../../src/services/kdbTreeProvider";
import { KdbTreeService } from "../../src/services/kdbTreeService";
import { MetaContentProvider } from "../../src/services/metaContentProvider";
import {
  QueryHistoryProvider,
  QueryHistoryTreeItem,
} from "../../src/services/queryHistoryProvider";
import { WorkspaceTreeProvider } from "../../src/services/workspaceTreeProvider";
import * as utils from "../../src/utils/getUri";
import * as loggers from "../../src/utils/loggers";
import AuthSettings from "../../src/utils/secretStorage";
import { Telemetry } from "../../src/utils/telemetryClient";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const codeFlow = require("../../src/services/kdbInsights/codeFlowLogin");

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

describe("kdbTreeProvider", () => {
  let servers: Server;
  let insights: Insights;
  let kdbNode: KdbNode;
  let insightNode: InsightsNode;
  const connMng = new ConnectionManagementService();
  let retrieveInsightsConnVersionStub,
    retrieveInsightsConnQEEnabledStub: sinon.SinonStub;

  beforeEach(() => {
    servers = {
      testServer: {
        serverAlias: "testServerAlias",
        serverName: "testServerName",
        serverPort: "5001",
        tls: false,
        auth: false,
        managed: false,
      },
    };
    insights = {
      testInsight: {
        alias: "testInsightsAlias",
        server: "testInsightsName",
        auth: false,
      },
    };
    kdbNode = new KdbNode(
      ["child1"],
      "testElement",
      servers["testServer"],
      TreeItemCollapsibleState.None,
    );
    insightNode = new InsightsNode(
      ["child1"],
      "testElement",
      insights["testInsight"],
      TreeItemCollapsibleState.None,
    );
    retrieveInsightsConnVersionStub = sinon.stub(
      connMng,
      "retrieveInsightsConnVersion",
    );
    retrieveInsightsConnQEEnabledStub = sinon.stub(
      connMng,
      "retrieveInsightsConnQEEnabled",
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it("Validate creation of KDB provider", () => {
    const kdbProvider = new KdbTreeProvider(servers, insights);
    assert.notStrictEqual(
      kdbProvider,
      undefined,
      "KdbTreeProvider should be created.",
    );
  });

  it("Validate reload of KDB provider", () => {
    const kdbProvider = new KdbTreeProvider(servers, insights);
    kdbProvider.reload();
    assert.notStrictEqual(
      kdbProvider,
      undefined,
      "KdbTreeProvider should be created.",
    );
  });

  it("Validate refreshing KDB provider with KDB instance", () => {
    const kdbProvider = new KdbTreeProvider(servers, insights);
    servers["testServer"] = {
      serverAlias: "testServer2Alias",
      serverName: "testServer2Name",
      serverPort: "5001",
      tls: false,
      auth: false,
      managed: false,
    };
    kdbProvider.refresh(servers);
    assert.notStrictEqual(
      kdbProvider,
      undefined,
      "KdbTreeProvider should be created.",
    );
  });

  it("Validate refreshing KDB provide with Insights instancer", () => {
    const kdbProvider = new KdbTreeProvider(servers, insights);
    insights["testInsight2"] = {
      alias: "testInsights2Alias",
      server: "testInsights2Name",
      auth: false,
    };
    kdbProvider.refreshInsights(insights);
    assert.notStrictEqual(
      kdbProvider,
      undefined,
      "KdbTreeProvider should be created.",
    );
  });

  it("Should return the KdbNode tree item element", () => {
    const kdbProvider = new KdbTreeProvider(servers, insights);
    const element = kdbProvider.getTreeItem(kdbNode);
    assert.strictEqual(
      element.label,
      kdbNode.label,
      "Get kdb node element is incorrect",
    );
  });

  it("Should return the Insights tree item element", () => {
    const kdbProvider = new KdbTreeProvider(servers, insights);
    const element = kdbProvider.getTreeItem(insightNode);
    assert.strictEqual(
      element.label,
      insightNode.label,
      "Get insights node element is incorrect",
    );
  });

  it("Should return no children for the tree when serverList is empty", async () => {
    const kdbProvider = new KdbTreeProvider({}, {});
    const result = await kdbProvider.getChildren();
    assert.strictEqual(result.length, 0, "Children should be empty");
  });

  it("Should return children for the tree when serverList has entries", async () => {
    retrieveInsightsConnVersionStub.returned(1);
    retrieveInsightsConnQEEnabledStub.returned("Enabled");
    const kdbProvider = new KdbTreeProvider(servers, insights);
    const result = await kdbProvider.getChildren();
    assert.strictEqual(result.length, 2, "Children count should be 2");
  });

  it("Should return merged elements for parent", async () => {
    const kdbProvider = new KdbTreeProvider(servers, insights);
    const kdbNode = new KdbNode(
      [],
      "testServer",
      {
        serverName: "testServername",
        serverAlias: "testServerAlias",
        serverPort: "5001",
        managed: false,
        auth: false,
        tls: false,
      },
      TreeItemCollapsibleState.None,
    );
    kdbNode.contextValue = "testServerAlias";
    kdbProvider.getChildren(kdbNode);
    const result = await kdbProvider.getChildren(kdbNode);
    assert.notStrictEqual(result, undefined);
  });

  it("Should return namespaces for parent", async () => {
    const kdbProvider = new KdbTreeProvider(servers, insights);
    const kdbNode = new KdbNode(
      [],
      "testServer",
      {
        serverName: "testServername",
        serverAlias: "testServerAlias",
        serverPort: "5001",
        managed: false,
        auth: false,
        tls: false,
      },
      TreeItemCollapsibleState.None,
    );
    kdbProvider.getChildren(kdbNode);
    const result = await kdbProvider.getChildren(kdbNode);
    assert.notStrictEqual(result, undefined);
  });

  it("Should return categories for parent", async () => {
    const kdbProvider = new KdbTreeProvider(servers, insights);
    const kdbNode = new KdbNode(
      [],
      "testServer",
      {
        serverName: "testServername",
        serverAlias: "testServerAlias",
        serverPort: "5001",
        managed: false,
        auth: false,
        tls: false,
      },
      TreeItemCollapsibleState.None,
    );
    kdbNode.contextValue = "ns";
    kdbProvider.getChildren(kdbNode);
    const result = await kdbProvider.getChildren(kdbNode);
    assert.notStrictEqual(result, undefined);
  });

  it("Should return a new KdbNode", () => {
    const kdbNode = new KdbNode(
      [],
      "",
      {
        serverName: "kdbservername",
        serverAlias: "",
        serverPort: "5001",
        managed: false,
        auth: false,
        tls: false,
      },
      TreeItemCollapsibleState.None,
    );
    assert.strictEqual(
      kdbNode.label,
      "[kdbservername:5001]",
      "KdbNode node creation failed",
    );
  });

  it("Should return a new KdbNode with no static alias", () => {
    const kdbNode = new KdbNode(
      [],
      "",
      {
        serverName: "kdbservername",
        serverAlias: "",
        serverPort: "5001",
        managed: false,
        auth: false,
        tls: false,
      },
      TreeItemCollapsibleState.None,
    );
    assert.strictEqual(
      kdbNode.label,
      "[kdbservername:5001]",
      "KdbNode node creation failed",
    );
  });

  it("Should return a new KdbNode with children", () => {
    const kdbNode = new KdbNode(
      ["node1", "node2", "node3", "node4"],
      "kdbserveralias",
      {
        serverName: "kdbservername",
        serverAlias: "kdbserveralias",
        serverPort: "5001",
        managed: false,
        auth: false,
        tls: false,
      },
      TreeItemCollapsibleState.None,
    );
    assert.strictEqual(
      kdbNode.label,
      "kdbserveralias [kdbservername:5001]",
      "KdbNode node creation failed",
    );
  });

  it("Should return a new KdbNode that is connected", () => {
    const kdbNode = new KdbNode(
      [],
      "kdbserveralias",
      {
        serverName: "kdbservername",
        serverAlias: "kdbserveralias",
        serverPort: "5001",
        managed: false,
        auth: false,
        tls: false,
      },
      TreeItemCollapsibleState.None,
    );

    ext.connectionNode = kdbNode;

    assert.strictEqual(
      kdbNode.label,
      "kdbserveralias [kdbservername:5001]",
      "KdbNode node creation failed",
    );
  });

  it("Should add node to no tls list", () => {
    ext.kdbNodesWithoutTls.length = 0;
    new KdbNode(
      [],
      "testServer",
      {
        serverName: "testServername",
        serverAlias: "testServerAlias",
        serverPort: "5001",
        managed: false,
        auth: false,
        tls: false,
      },
      TreeItemCollapsibleState.None,
    );
    assert.equal(ext.kdbNodesWithoutTls.length, 1);
  });

  it("Should remove node from no tls list", () => {
    ext.kdbNodesWithoutTls.length = 0;
    ext.kdbNodesWithoutTls.push("testServer [testServername:5001]");
    new KdbNode(
      [],
      "testServer",
      {
        serverName: "testServername",
        serverAlias: "testServerAlias",
        serverPort: "5001",
        managed: false,
        auth: false,
        tls: true,
      },
      TreeItemCollapsibleState.None,
    );
    assert.equal(ext.kdbNodesWithoutTls, 0);
  });

  it("Should add node to no auth list", () => {
    ext.kdbNodesWithoutAuth.length = 0;
    new KdbNode(
      [],
      "testServer",
      {
        serverName: "testServername",
        serverAlias: "testServerAlias",
        serverPort: "5001",
        managed: false,
        auth: false,
        tls: false,
      },
      TreeItemCollapsibleState.None,
    );
    assert.equal(ext.kdbNodesWithoutAuth.length, 1);
  });

  it("Should remove node from no auth list", () => {
    ext.kdbNodesWithoutAuth.length = 0;
    ext.kdbNodesWithoutAuth.push("testServer [testServername:5001]");
    new KdbNode(
      [],
      "testServer",
      {
        serverName: "testServername",
        serverAlias: "testServerAlias",
        serverPort: "5001",
        managed: false,
        auth: true,
        tls: false,
      },
      TreeItemCollapsibleState.None,
    );
    assert.equal(ext.kdbNodesWithoutAuth.length, 0);
  });

  it("Should retun a new InsightsNode", () => {
    const insightsNode = new InsightsNode(
      [],
      "insightsnode1",
      {
        server: "insightsservername",
        alias: "insightsserveralias",
        auth: true,
      },
      TreeItemCollapsibleState.None,
    );

    ext.kdbinsightsNodes.pop();

    assert.strictEqual(
      insightsNode.label,
      "insightsnode1",
      "InsightsNode node creation failed",
    );
  });

  it("Should return a new InsightsNode with children", () => {
    const insightsNode = new InsightsNode(
      ["child1", "child2", "child3", "child4"],
      "insightsnode1",
      {
        server: "insightsservername",
        alias: "insightsserveralias",
        auth: true,
      },
      TreeItemCollapsibleState.None,
    );

    ext.kdbinsightsNodes.pop();

    assert.strictEqual(
      insightsNode.label,
      "insightsnode1",
      "InsightsNode node creation failed",
    );
  });

  it("Should return a new InsightsNode that is connected", () => {
    const insightsNode = new InsightsNode(
      [],
      "insightsnode1",
      {
        server: "insightsservername",
        alias: "insightsserveralias",
        auth: true,
      },
      TreeItemCollapsibleState.None,
    );

    ext.connectionNode = insightsNode;

    const insightsNode1 = new InsightsNode(
      [],
      "insightsnode1",
      {
        server: "insightsservername",
        alias: "insightsserveralias",
        auth: true,
      },
      TreeItemCollapsibleState.None,
    );

    ext.kdbinsightsNodes.pop();

    assert.strictEqual(
      insightsNode1.label,
      "insightsnode1",
      "InsightsNode node creation failed",
    );
  });

  it("Should return a new QNamespaceNode", () => {
    const qNsNode = new QNamespaceNode(
      [],
      "nsnode1",
      "nsnodedetails1",
      TreeItemCollapsibleState.None,
      "nsfullname",
      "connLabel",
    );
    assert.strictEqual(
      qNsNode.label,
      "nsnode1",
      "QNamespaceNode node creation failed",
    );
  });

  it("should return a new QCategoryNode", () => {
    const qCategoryNode = new QCategoryNode(
      [],
      "categorynode1",
      "categorynodedetails1",
      "categoryns",
      TreeItemCollapsibleState.None,
      "connLabel",
    );
    assert.strictEqual(
      qCategoryNode.label,
      "categorynode1",
      "QCategoryNode node creation failed",
    );
  });

  it("Should return a new QServerNode", () => {
    const qServerNode = new QServerNode(
      [],
      "servernode1",
      "servernodedetails1",
      TreeItemCollapsibleState.None,
      "",
      "connLabel",
    );
    assert.strictEqual(
      qServerNode.label,
      "servernode1",
      "QServer node creation failed",
    );
  });

  it("Should return a new LabelNode", () => {
    const labelNode = new LabelNode({
      name: "White",
      color: { name: "White", colorHex: "#CCCCCC" },
    });
    assert.strictEqual(
      labelNode.label,
      "White",
      "LabelNode node creation failed",
    );
  });

  describe("InsightsMetaNode", () => {
    it("should initialize fields correctly", () => {
      const node = new InsightsMetaNode(
        ["child1", "child2"],
        "testLabel",
        "testDetails",
        TreeItemCollapsibleState.Collapsed,
        "testConnLabel",
      );

      assert.deepStrictEqual(node.children, ["child1", "child2"]);
      assert.strictEqual(node.label, "testLabel");
      assert.strictEqual(
        node.collapsibleState,
        TreeItemCollapsibleState.Collapsed,
      );
      assert.strictEqual(node.connLabel, "testConnLabel");
      assert.strictEqual(node.description, "");
      assert.strictEqual(node.contextValue, "meta");
    });

    it("should return empty string from getDescription", () => {
      const node = new InsightsMetaNode(
        [],
        "",
        "",
        TreeItemCollapsibleState.None,
        "",
      );

      assert.strictEqual(node.getDescription(), "");
    });
  });

  describe("MetaObjectPayloadNode", () => {
    it("should initialize fields correctly", () => {
      const node = new MetaObjectPayloadNode(
        ["child1", "child2"],
        "testLabel",
        "testDetails",
        TreeItemCollapsibleState.Collapsed,
        "testIcon",
        "testConnLabel",
      );

      assert.deepStrictEqual(node.children, ["child1", "child2"]);
      assert.strictEqual(node.label, "testLabel");
      assert.strictEqual(
        node.collapsibleState,
        TreeItemCollapsibleState.Collapsed,
      );
      assert.strictEqual(node.coreIcon, "testIcon");
      assert.strictEqual(node.connLabel, "testConnLabel");
      assert.strictEqual(node.description, "");
    });
  });

  describe("getChildren", () => {
    const kdbProvider = new KdbTreeProvider(servers, insights);
    insights = {
      testInsight: {
        alias: "testInsightsAlias",
        server: "testInsightsName",
        auth: false,
      },
    };
    insightNode = new InsightsNode(
      ["child1"],
      "testInsight",
      insights["testInsight"],
      TreeItemCollapsibleState.None,
    );
    insightNode.contextValue = "testInsight";

    afterEach(() => {
      ext.kdbinsightsNodes.length = 0;
      sinon.restore();
    });

    it("Should return categories for insights connection", async () => {
      ext.kdbinsightsNodes.push("testInsight");
      kdbProvider.getChildren(insightNode);
      const result = await kdbProvider.getChildren(insightNode);
      assert.notStrictEqual(result, undefined);
    });

    it("should return metaObjects for parent", async () => {
      const connMng = new ConnectionManagementService();
      const metaNode = new InsightsMetaNode(
        [],
        "testMeta",
        "",
        TreeItemCollapsibleState.None,
        "insightsConn",
      );
      const insightsConn = new InsightsConnection(
        insightNode.label,
        insightNode,
      );
      sinon.stub(connMng, "retrieveConnectedConnection").returns(insightsConn);
      insightsConn.meta = dummyMeta;
      const result = await kdbProvider.getChildren(metaNode);
      assert.notStrictEqual(result, undefined);
    });

    it("should return label node", async () => {
      const labels: Labels[] = [
        { name: "label1", color: { name: "red", colorHex: "#FF0000" } },
      ];
      const conns: ConnectionLabel[] = [
        {
          labelName: "label1",
          connections: ["testServerAlias", "testInsightsAlias"],
        },
      ];
      sinon.stub(workspace, "getConfiguration").value(() => ({
        get: (v: string) => (v === "kdb.connectionLabels" ? labels : conns),
      }));
      const provider = new KdbTreeProvider(servers, insights);
      const result = await provider.getChildren();
      assert.strictEqual(result.length, 1);
    });
  });

  describe("KdbTreeProvider private methods", () => {
    let provider: KdbTreeProvider;
    let servers: Server;
    let insights: Insights;
    let mockLocalConn: LocalConnection;
    let mockInsightsConn: InsightsConnection;
    let connMngStub: sinon.SinonStub;

    const createMockServerObject = (
      id: number,
      name: string,
      typeNum: number,
      namespace: string = ".",
      isNs: boolean = false,
    ): ServerObject => ({
      id,
      pid: id,
      name,
      fname: name,
      typeNum,
      namespace,
      context: {},
      isNs,
    });

    beforeEach(() => {
      servers = {
        testServer: {
          serverAlias: "testServerAlias",
          serverName: "testServerName",
          serverPort: "5001",
          tls: false,
          auth: false,
          managed: false,
        },
      };
      insights = {
        testInsight: {
          alias: "testInsightsAlias",
          server: "testInsightsName",
          auth: false,
        },
      };

      provider = new KdbTreeProvider(servers, insights);
      mockLocalConn = sinon.createStubInstance(LocalConnection);
      mockInsightsConn = sinon.createStubInstance(InsightsConnection);

      // Mock ConnectionManagementService
      connMngStub = sinon.stub(
        ConnectionManagementService.prototype,
        "retrieveConnectedConnection",
      );
    });

    afterEach(() => {
      sinon.restore();
    });

    describe("validateAndGetConnection", () => {
      it("should return null when connection is not found", () => {
        const serverType = new QCategoryNode(
          [],
          "test",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "testLabel",
        );
        connMngStub.returns(undefined);

        const result = (provider as any).validateAndGetConnection(serverType);

        assert.strictEqual(result, null);
      });

      it("should return null for InsightsConnection", () => {
        const serverType = new QCategoryNode(
          [],
          "test",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "testLabel",
        );
        connMngStub.returns(mockInsightsConn);

        const result = (provider as any).validateAndGetConnection(serverType);

        assert.strictEqual(result, null);
      });

      it("should return LocalConnection when valid", () => {
        const serverType = new QCategoryNode(
          [],
          "test",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "testLabel",
        );
        connMngStub.returns(mockLocalConn);

        const result = (provider as any).validateAndGetConnection(serverType);

        assert.strictEqual(result, mockLocalConn);
      });

      it("should extract connLabel from QCategoryNode", () => {
        const serverType = new QCategoryNode(
          [],
          "test",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "testConnLabel",
        );
        connMngStub.returns(mockLocalConn);

        (provider as any).validateAndGetConnection(serverType);

        sinon.assert.calledWith(connMngStub, "testConnLabel");
      });

      it("should handle non-QCategoryNode TreeItem", () => {
        const serverType = { contextValue: "test" } as any;
        connMngStub.returns(mockLocalConn);

        (provider as any).validateAndGetConnection(serverType);

        sinon.assert.calledWith(connMngStub, "");
      });
    });

    describe("getServerObjects", () => {
      it("should return empty array when serverType is undefined", async () => {
        const result = await (provider as any).getServerObjects(undefined);

        assert.deepStrictEqual(result, []);
      });

      it("should return empty array when connection validation fails", async () => {
        const serverType = new QCategoryNode(
          [],
          "test",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "",
        );
        connMngStub.returns(undefined);

        const result = await (provider as any).getServerObjects(serverType);

        assert.deepStrictEqual(result, []);
      });

      it("should call loadObjectsByCategory when connection is valid", async () => {
        const serverType = new QCategoryNode(
          [],
          "Dictionaries",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "testLabel",
        );
        connMngStub.returns(mockLocalConn);

        const loadObjectsByCategoryStub = sinon
          .stub(provider as any, "loadObjectsByCategory")
          .resolves([]);

        await (provider as any).getServerObjects(serverType);

        sinon.assert.calledOnce(loadObjectsByCategoryStub);
        sinon.assert.calledWith(
          loadObjectsByCategoryStub,
          serverType,
          mockLocalConn,
          ".",
          "testLabel",
        );
      });
    });

    describe("loadObjectsByCategory", () => {
      it("should load dictionaries for category index 0", async () => {
        const serverType = new QCategoryNode(
          [],
          "Dictionaries",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "testLabel",
        );
        const loadDictionariesStub = sinon
          .stub(provider as any, "loadDictionaries")
          .resolves([]);

        await (provider as any).loadObjectsByCategory(
          serverType,
          mockLocalConn,
          ".",
          "testLabel",
        );

        sinon.assert.calledOnce(loadDictionariesStub);
        sinon.assert.calledWith(
          loadDictionariesStub,
          mockLocalConn,
          ".",
          ".",
          "testLabel",
        );
      });

      it("should load functions for category index 1", async () => {
        const serverType = new QCategoryNode(
          [],
          "Functions",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "testLabel",
        );
        const loadFunctionsStub = sinon
          .stub(provider as any, "loadFunctions")
          .resolves([]);

        await (provider as any).loadObjectsByCategory(
          serverType,
          mockLocalConn,
          ".",
          "testLabel",
        );

        sinon.assert.calledOnce(loadFunctionsStub);
      });

      it("should load tables for category index 2", async () => {
        const serverType = new QCategoryNode(
          [],
          "Tables",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "testLabel",
        );
        const loadTablesStub = sinon
          .stub(provider as any, "loadTables")
          .resolves([]);

        await (provider as any).loadObjectsByCategory(
          serverType,
          mockLocalConn,
          ".",
          "testLabel",
        );

        sinon.assert.calledOnce(loadTablesStub);
      });

      it("should load variables for category index 3", async () => {
        const serverType = new QCategoryNode(
          [],
          "Variables",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "testLabel",
        );
        const loadVariablesStub = sinon
          .stub(provider as any, "loadVariables")
          .resolves([]);

        await (provider as any).loadObjectsByCategory(
          serverType,
          mockLocalConn,
          ".",
          "testLabel",
        );

        sinon.assert.calledOnce(loadVariablesStub);
      });

      it("should load views for category index 4", async () => {
        const serverType = new QCategoryNode(
          [],
          "Views",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "testLabel",
        );
        const loadViewsStub = sinon
          .stub(provider as any, "loadViews")
          .resolves([]);

        await (provider as any).loadObjectsByCategory(
          serverType,
          mockLocalConn,
          ".",
          "testLabel",
        );

        sinon.assert.calledOnce(loadViewsStub);
      });

      it("should return empty array for unknown category", async () => {
        const serverType = new QCategoryNode(
          [],
          "Unknown",
          "",
          ".",
          TreeItemCollapsibleState.None,
          "testLabel",
        );

        const result = await (provider as any).loadObjectsByCategory(
          serverType,
          mockLocalConn,
          ".",
          "testLabel",
        );

        assert.deepStrictEqual(result, []);
      });
    });

    describe("loadDictionaries", () => {
      it("should load dictionaries and create QServerNodes", async () => {
        const mockDicts = [
          createMockServerObject(1, "dict1", 99),
          createMockServerObject(2, "dict2", 99),
        ];

        const kdbTreeServiceStub = sinon
          .stub(KdbTreeService, "loadDictionaries")
          .resolves(mockDicts);
        const createQServerNodesStub = sinon
          .stub(provider as any, "createQServerNodes")
          .returns([]);

        await (provider as any).loadDictionaries(
          mockLocalConn,
          "namespace",
          ".",
          "connLabel",
        );

        sinon.assert.calledWith(kdbTreeServiceStub, mockLocalConn, "namespace");
        sinon.assert.calledWith(
          createQServerNodesStub,
          mockDicts,
          ".",
          "connLabel",
          "dictionaries",
        );
      });
    });

    describe("loadFunctions", () => {
      it("should load functions and create QServerNodes", async () => {
        const mockFuncs = [
          createMockServerObject(1, "func1", 100),
          createMockServerObject(2, "func2", 100),
        ];

        const kdbTreeServiceStub = sinon
          .stub(KdbTreeService, "loadFunctions")
          .resolves(mockFuncs);
        const createQServerNodesStub = sinon
          .stub(provider as any, "createQServerNodes")
          .returns([]);

        await (provider as any).loadFunctions(
          mockLocalConn,
          "namespace",
          ".",
          "connLabel",
        );

        sinon.assert.calledWith(kdbTreeServiceStub, mockLocalConn, "namespace");
        sinon.assert.calledWith(
          createQServerNodesStub,
          mockFuncs,
          ".",
          "connLabel",
          "functions",
        );
      });
    });

    describe("loadTables", () => {
      it("should load tables and create QServerNodes", async () => {
        const mockTables = [
          createMockServerObject(1, "table1", 98),
          createMockServerObject(2, "table2", 98),
        ];
        const kdbTreeServiceStub = sinon
          .stub(KdbTreeService, "loadTables")
          .resolves(mockTables);
        const createQServerNodesStub = sinon
          .stub(provider as any, "createQServerNodes")
          .returns([]);

        await (provider as any).loadTables(
          mockLocalConn,
          "namespace",
          ".",
          "connLabel",
        );

        sinon.assert.calledWith(kdbTreeServiceStub, mockLocalConn, "namespace");
        sinon.assert.calledWith(
          createQServerNodesStub,
          mockTables,
          ".",
          "connLabel",
          "tables",
        );
      });
    });

    describe("loadVariables", () => {
      it("should load variables and create QServerNodes", async () => {
        const mockVars = [
          createMockServerObject(1, "var1", -7),
          createMockServerObject(2, "var2", 11),
        ];
        const kdbTreeServiceStub = sinon
          .stub(KdbTreeService, "loadVariables")
          .resolves(mockVars);
        const createQServerNodesStub = sinon
          .stub(provider as any, "createQServerNodes")
          .returns([]);

        await (provider as any).loadVariables(
          mockLocalConn,
          "namespace",
          ".",
          "connLabel",
        );

        sinon.assert.calledWith(kdbTreeServiceStub, mockLocalConn, "namespace");
        sinon.assert.calledWith(
          createQServerNodesStub,
          mockVars,
          ".",
          "connLabel",
          "variables",
        );
      });
    });

    describe("loadViews", () => {
      it("should load views and create QServerNodes with correct labels for root namespace", async () => {
        const mockViews = ["view1", "view2"];
        const kdbTreeServiceStub = sinon
          .stub(KdbTreeService, "loadViews")
          .resolves(mockViews);

        const result = await (provider as any).loadViews(
          mockLocalConn,
          ".",
          "connLabel",
        );

        sinon.assert.calledWith(kdbTreeServiceStub, mockLocalConn);
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].label, "view1");
        assert.strictEqual(result[1].label, "view2");
        assert.strictEqual(result[0].coreIcon, "views");
      });

      it("should load views and create QServerNodes with dot prefix for non-root namespace", async () => {
        const mockViews = ["view1"];
        sinon.stub(KdbTreeService, "loadViews").resolves(mockViews);

        const result = await (provider as any).loadViews(
          mockLocalConn,
          "myns",
          "connLabel",
        );

        assert.strictEqual(result[0].label, ".view1");
      });
    });

    describe("createQServerNodes", () => {
      it("should create QServerNodes correctly for root namespace", () => {
        const objects = [{ name: "test1" }, { name: "test2" }];

        const result = (provider as any).createQServerNodes(
          objects,
          ".",
          "connLabel",
          "tables",
        );

        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].label, "test1");
        assert.strictEqual(result[1].label, "test2");
        assert.strictEqual(result[0].coreIcon, "tables");
        assert.strictEqual(result[0].connLabel, "connLabel");
      });

      it("should create QServerNodes with namespace prefix for non-root namespace", () => {
        const objects = [{ name: "test1" }];

        const result = (provider as any).createQServerNodes(
          objects,
          "myns",
          "connLabel",
          "functions",
        );

        assert.strictEqual(result[0].label, "myns.test1");
      });

      it("should handle empty objects array", () => {
        const result = (provider as any).createQServerNodes(
          [],
          ".",
          "connLabel",
          "variables",
        );

        assert.deepStrictEqual(result, []);
      });

      it("should set correct TreeItemCollapsibleState", () => {
        const objects = [{ name: "test1" }];

        const result = (provider as any).createQServerNodes(
          objects,
          ".",
          "connLabel",
          "dictionaries",
        );

        assert.strictEqual(
          result[0].collapsibleState,
          TreeItemCollapsibleState.None,
        );
      });
    });
  });
});

describe("Code flow login service tests", () => {
  const token = {
    access_token:
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Imk2bEdrM0ZaenhSY1ViMkMzbkVRN3N5SEpsWSJ9.eyJhdWQiOiI2ZTc0MTcyYi1iZTU2LTQ4NDMtOWZmNC1lNjZhMzliYjEyZTMiLCJpc3MiOiJodHRwczovL2xvZ2luLm1pY3Jvc29mdG9ubGluZS5jb20vNzJmOTg4YmYtODZmMS00MWFmLTkxYWItMmQ3Y2QwMTFkYjQ3L3YyLjAiLCJpYXQiOjE1MzcyMzEwNDgsIm5iZiI6MTUzNzIzMTA0OCwiZXhwIjoxNTM3MjM0OTQ4LCJhaW8iOiJBWFFBaS84SUFBQUF0QWFaTG8zQ2hNaWY2S09udHRSQjdlQnE0L0RjY1F6amNKR3hQWXkvQzNqRGFOR3hYZDZ3TklJVkdSZ2hOUm53SjFsT2NBbk5aY2p2a295ckZ4Q3R0djMzMTQwUmlvT0ZKNGJDQ0dWdW9DYWcxdU9UVDIyMjIyZ0h3TFBZUS91Zjc5UVgrMEtJaWpkcm1wNjlSY3R6bVE9PSIsImF6cCI6IjZlNzQxNzJiLWJlNTYtNDg0My05ZmY0LWU2NmEzOWJiMTJlMyIsImF6cGFjciI6IjAiLCJuYW1lIjoiQWJlIExpbmNvbG4iLCJvaWQiOiI2OTAyMjJiZS1mZjFhLTRkNTYtYWJkMS03ZTRmN2QzOGU0NzQiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJhYmVsaUBtaWNyb3NvZnQuY29tIiwicmgiOiJJIiwic2NwIjoiYWNjZXNzX2FzX3VzZXIiLCJzdWIiOiJIS1pwZmFIeVdhZGVPb3VZbGl0anJJLUtmZlRtMjIyWDVyclYzeERxZktRIiwidGlkIjoiNzJmOTg4YmYtODZmMS00MWFmLTkxYWItMmQ3Y2QwMTFkYjQ3IiwidXRpIjoiZnFpQnFYTFBqMGVRYTgyUy1JWUZBQSIsInZlciI6IjIuMCJ9.pj4N-w_3Us9DrBLfpCt",
    request_token:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTY4ODUwMjJ9.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ",
    expires_in: 0,
  };
  afterEach(() => {
    sinon.restore();
  });

  it("Should return a correct login", async () => {
    sinon.stub(codeFlow, "signIn").returns(token);
    const result = await signIn("http://localhost", "insights", false);
    assert.strictEqual(result, token, "Invalid token returned");
  });

  it("Should execute a correct logout", async () => {
    sinon.stub(axios, "post").resolves(Promise.resolve({ data: token }));
    const result = await signOut(
      "http://localhost",
      "insights",
      false,
      "token",
    );
    assert.strictEqual(result, undefined, "Invalid response from logout");
  });

  it("Should execute token refresh", async () => {
    sinon.stub(axios, "post").resolves(Promise.resolve({ data: token }));
    const result = await refreshToken(
      "http://localhost",
      "insights",
      false,
      JSON.stringify(token),
    );
    assert.strictEqual(
      result.accessToken,
      token.access_token,
      "Token has not refreshed correctly",
    );
  });

  it("Should not return token from secret store", async () => {
    const result = await getCurrentToken("", "testalias", "insights", false);
    assert.strictEqual(
      result,
      undefined,
      "Should return undefined when server name is empty.",
    );
  });

  it("Should not return token from secret store", async () => {
    const result = await getCurrentToken("testserver", "", "insights", false);
    assert.strictEqual(
      result,
      undefined,
      "Should return undefined when server alias is empty.",
    );
  });

  it("Should continue sign in if link is copied", async () => {
    sinon.stub(env, "openExternal").value(async () => {
      throw new Error();
    });
    await assert.rejects(() => signIn("http://127.0.0.1", "insights", false));
  });
});

describe("queryHistoryProvider", () => {
  const dummyDS = createDefaultDataSourceFile();
  const dummyQueryHistory: QueryHistory[] = [
    {
      executorName: "testExecutorName",
      connectionName: "testConnectionName",
      time: "testTime",
      query: `testQuery\n long test query line counter ${"a".repeat(80)}`,
      success: true,
      connectionType: ServerType.INSIGHTS,
    },
    {
      executorName: "testExecutorName2",
      connectionName: "testConnectionName2",
      time: "testTime2",
      query: `testQuery2 ${"a".repeat(80)} \n testQuery2 ${"a".repeat(80)}\n testQuery2 ${"a".repeat(80)}`,
      success: true,
      isWorkbook: true,
      connectionType: ServerType.KDB,
      duration: "500",
    },
    {
      executorName: "testExecutorName2",
      connectionName: "testConnectionName2",
      time: "testTime2",
      query: "testQuery2\n testQuery2\n testQuery2",
      success: true,
      isWorkbook: true,
      connectionType: ServerType.KDB,
      duration: "500",
    },
    {
      executorName: "testExecutorName3",
      connectionName: "testConnectionName3",
      time: "testTime3",
      query: dummyDS,
      success: false,
      connectionType: ServerType.KDB,
    },
    {
      executorName: "variables",
      connectionName: "testConnectionName2",
      time: "testTime2",
      query: `testQuery2 ${"a".repeat(80)}`,
      success: true,
      isFromConnTree: true,
      connectionType: ServerType.KDB,
      duration: "500",
    },
    {
      executorName: "variables",
      connectionName: "testConnectionName2",
      time: "testTime2",
      query: "testQuery2",
      success: true,
      isFromConnTree: true,
      connectionType: ServerType.KDB,
      duration: "500",
    },
  ];
  beforeEach(() => {
    ext.kdbQueryHistoryList.length = 0;
    ext.kdbQueryHistoryList.push(...dummyQueryHistory);
  });
  it("Should reload the provider", () => {
    const queryHistoryProvider = new QueryHistoryProvider();
    queryHistoryProvider.reload();
    assert.notStrictEqual(
      queryHistoryProvider,
      undefined,
      "queryHistoryProvider should be created.",
    );
  });
  it("Should refresh the provider", () => {
    const queryHistoryProvider = new QueryHistoryProvider();
    queryHistoryProvider.refresh();
    assert.notStrictEqual(
      queryHistoryProvider,
      undefined,
      "queryHistoryProvider should be created.",
    );
  });

  it("Should return the KdbNode tree item element", () => {
    const queryHistoryTreeItem = new QueryHistoryTreeItem(
      "testLabel",
      dummyQueryHistory[0],
      TreeItemCollapsibleState.None,
    );
    const queryHistoryProvider = new QueryHistoryProvider();
    const element = queryHistoryProvider.getTreeItem(queryHistoryTreeItem);
    assert.strictEqual(
      element.label,
      queryHistoryTreeItem.label,
      "Get query history item is incorrect",
    );
  });

  it("Should return the KdbNode tree item element", () => {
    const queryHistoryTreeItem = new QueryHistoryTreeItem(
      "testLabel",
      dummyQueryHistory[3],
      TreeItemCollapsibleState.None,
    );
    const queryHistoryProvider = new QueryHistoryProvider();
    const element = queryHistoryProvider.getTreeItem(queryHistoryTreeItem);
    assert.strictEqual(
      element.label,
      queryHistoryTreeItem.label,
      "Get query history item is incorrect",
    );
  });

  it("Should return children for the tree when queryHistory has entries", async () => {
    const queryHistoryProvider = new QueryHistoryProvider();
    const result = await queryHistoryProvider.getChildren();
    assert.strictEqual(result.length, 6, "Children count should be 6");
  });

  it("Should not return children for the tree when queryHistory has no entries", async () => {
    ext.kdbQueryHistoryList.length = 0;
    const queryHistoryProvider = new QueryHistoryProvider();
    const result = await queryHistoryProvider.getChildren();
    assert.strictEqual(result.length, 0, "Children count should be 0");
  });

  describe("QueryHistoryTreeItem", () => {
    const sucessIcon = "testing-passed-icon";
    const failIcon = "testing-error-icon";
    it("Should return a new QueryHistoryTreeItem", () => {
      const queryHistoryTreeItem = new QueryHistoryTreeItem(
        "testLabel",
        dummyQueryHistory[0],
        TreeItemCollapsibleState.None,
      );
      assert.strictEqual(
        queryHistoryTreeItem.label,
        "testLabel",
        "QueryHistoryTreeItem node creation failed",
      );
    });
    it("Should return a new QueryHistoryTreeItem with sucess icon", () => {
      const queryHistoryTreeItem = new QueryHistoryTreeItem(
        "testLabel",
        dummyQueryHistory[0],
        TreeItemCollapsibleState.None,
      );
      const result = queryHistoryTreeItem.defineQueryIcon(true);
      assert.strictEqual(
        result,
        sucessIcon,
        "QueryHistoryTreeItem defineQueryIcon failed",
      );
    });

    it("Should return a new QueryHistoryTreeItem with fail icon", () => {
      const queryHistoryTreeItem = new QueryHistoryTreeItem(
        "testLabel",
        dummyQueryHistory[2],
        TreeItemCollapsibleState.None,
      );
      const result = queryHistoryTreeItem.defineQueryIcon(false);
      assert.strictEqual(
        result,
        failIcon,
        "QueryHistoryTreeItem defineQueryIcon failed",
      );
    });

    it("Should return a new QueryHistoryTreeItem with sucess icon", () => {
      const queryHistoryTreeItem = new QueryHistoryTreeItem(
        "testLabel",
        dummyQueryHistory[3],
        TreeItemCollapsibleState.None,
      );
      const result = queryHistoryTreeItem.defineQueryIcon(true);
      assert.strictEqual(
        result,
        sucessIcon,
        "QueryHistoryTreeItem defineQueryIcon failed",
      );
    });
  });
});

describe("connectionManagerService", () => {
  const connectionManagerService = new ConnectionManagementService();
  const servers = {
    testServer: {
      serverAlias: "testLabel",
      serverName: "127.0.0.1",
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
  const kdbNode = new KdbNode(
    ["child1"],
    "testLabel",
    servers["testServer"],
    TreeItemCollapsibleState.None,
  );
  const insightNode = new InsightsNode(
    ["child1"],
    "testInsightsAlias",
    insights["testInsight"],
    TreeItemCollapsibleState.None,
  );
  ext.serverProvider = new KdbTreeProvider(servers, insights);

  const localConn = new LocalConnection("127.0.0.1:5001", "testLabel", []);

  const insightsConn = new InsightsConnection(insightNode.label, insightNode);
  describe("retrieveConnection", () => {
    afterEach(() => {
      ext.connectionsList.length = 0;
    });
    it("Should return undefined when connection is not found", () => {
      const result = connectionManagerService.retrieveConnection("testLabel");
      assert.strictEqual(result, undefined);
    });

    it("Should return the connection when found", () => {
      ext.connectionsList.push(kdbNode);
      const result = connectionManagerService.retrieveConnection(kdbNode.label);
      assert.strictEqual(result, kdbNode);
    });
  });

  describe("retrieveConnectedConnection", () => {
    afterEach(() => {
      ext.connectedConnectionList.length = 0;
    });
    it("Should return undefined when connection is not found", () => {
      const result =
        connectionManagerService.retrieveConnectedConnection("testLabel");
      assert.strictEqual(result, undefined);
    });

    it("Should return the connection when found", () => {
      ext.connectedConnectionList.push(localConn);
      const result =
        connectionManagerService.retrieveConnectedConnection("testLabel");
      assert.strictEqual(result, localConn);
    });
  });

  describe("isKdbConnection", () => {
    it("Should return true for KDB connection", () => {
      const result = connectionManagerService.isKdbConnection(kdbNode);
      assert.strictEqual(result, true);
    });

    it("Should return false for Insights connection", () => {
      const result = connectionManagerService.isKdbConnection(insightNode);
      assert.strictEqual(result, false);
    });
  });

  describe("retrieveLocalConnectionString", () => {
    it("Should return the connection string", () => {
      const result =
        connectionManagerService.retrieveLocalConnectionString(kdbNode);
      assert.strictEqual(result, "127.0.0.1:5001");
    });
  });

  describe("retrieveListOfConnectionsNames", () => {
    it("Should return the list of connection names", () => {
      ext.connectionsList.push(kdbNode, insightNode);
      const result = connectionManagerService.retrieveListOfConnectionsNames();
      assert.strictEqual(result.size, 2);
    });
  });

  describe("checkConnAlias", () => {
    it("Should return localInsights when connection is insights and alias equals local", () => {
      const result = connectionManagerService.checkConnAlias("local", true);
      assert.strictEqual(result, "localInsights");
    });

    it("Should note return localInsights when connection is insights and alias not equals local", () => {
      const result = connectionManagerService.checkConnAlias("notLocal", true);
      assert.strictEqual(result, "notLocal");
    });

    it("Should return local when connection is kdb and alias equals local and local conn not exist already", () => {
      const result = connectionManagerService.checkConnAlias(
        "local",
        false,
        false,
      );
      assert.strictEqual(result, "local");
    });

    it("Should return localKDB when connection is kdb and alias equals local and local conn exist already", () => {
      const result = connectionManagerService.checkConnAlias(
        "local",
        false,
        true,
      );
      assert.strictEqual(result, "localKDB");
    });
  });

  describe("removeConnectionFromContextString", () => {
    it("Should remove the connection from context string", () => {
      ext.connectedContextStrings.push("testLabel");
      connectionManagerService.removeConnectionFromContextString("testLabel");
      assert.strictEqual(ext.connectedContextStrings.length, 0);
      ext.connectedContextStrings.length = 0;
    });
  });

  describe("connect", () => {
    afterEach(() => {
      ext.connectedContextStrings.length = 0;
      ext.connectionNode = undefined;
      ext.connectedConnectionList.length = 0;
      sinon.restore();
    });
    it("Should not connect if connection does not exist", async () => {
      const result = await connectionManagerService.connect("testLabel");
      assert.strictEqual(result, undefined);
    });
  });

  describe("setActiveConnection", () => {
    beforeEach(() => {
      ext.activeConnection = undefined;
    });

    afterEach(() => {
      ext.connectionNode = undefined;
      sinon.restore();
    });
    it("Should not set active connection if connection does not exist", () => {
      connectionManagerService.setActiveConnection(kdbNode);
      assert.strictEqual(ext.activeConnection, undefined);
    });

    it("Should set active connection", () => {
      ext.serverProvider = new KdbTreeProvider(servers, insights);
      sinon
        .stub(connectionManagerService, "retrieveConnectedConnection")
        .returns(localConn);
      connectionManagerService.setActiveConnection(kdbNode);
      assert.strictEqual(ext.activeConnection, localConn);
    });
  });

  describe("disconnect", () => {
    let retrieveConnectionStub, retrieveConnectedConnectionStub;
    beforeEach(() => {
      retrieveConnectionStub = sinon.stub(
        connectionManagerService,
        "retrieveConnection",
      );
      retrieveConnectedConnectionStub = sinon.stub(
        connectionManagerService,
        "retrieveConnectedConnection",
      );
    });
    afterEach(() => {
      ext.connectedContextStrings.length = 0;
      ext.connectionNode = undefined;
      ext.connectedConnectionList.length = 0;
      sinon.restore();
    });
    it("Should not disconnect if connection does not exist", async () => {
      retrieveConnectedConnectionStub.returns(undefined);
      retrieveConnectionStub.returns(undefined);
      const result = await connectionManagerService.disconnect("testLabel");
      assert.strictEqual(result, undefined);
    });
  });

  describe("executeQuery", () => {
    const command = "testCommand";
    const context = "testContext";
    const stringfy = true;
    let executeQueryStub, getScratchpadQueryStub;
    beforeEach(() => {
      executeQueryStub = sinon.stub(localConn, "executeQuery");
      getScratchpadQueryStub = sinon.stub(insightsConn, "getScratchpadQuery");
    });
    afterEach(() => {
      ext.activeConnection = undefined;
      sinon.restore();
    });
    it("Should not execute query if connection does not exist", async () => {
      ext.activeConnection = undefined;
      const result = await connectionManagerService.executeQuery(
        command,
        "connTest",
        context,
        stringfy,
      );
      assert.strictEqual(result, undefined);
    });

    it("Should execute query from kdbNode", async () => {
      ext.activeConnection = localConn;
      executeQueryStub.returns("test results");
      const result = await connectionManagerService.executeQuery(
        command,
        undefined,
        context,
        stringfy,
      );
      assert.strictEqual(result, "test results");
    });

    it("Should execute query from InsightsNode", async () => {
      ext.activeConnection = insightsConn;
      getScratchpadQueryStub.returns("test query");
      const result = await connectionManagerService.executeQuery(
        command,
        undefined,
        context,
        stringfy,
      );
      assert.strictEqual(result, "test query");
    });
  });

  describe("behaviour methods", () => {
    beforeEach(() => {
      ext.serverProvider = new KdbTreeProvider(servers, insights);
    });
    afterEach(() => {
      sinon.restore();
      ext.connectedConnectionList.length = 0;
      ext.activeConnection = undefined;

      ext.serverProvider = undefined;
    });
    it("connectSuccessBehaviour", () => {
      const setActiveConnectionStub = sinon.stub(
        connectionManagerService,
        "setActiveConnection",
      );
      const executeCommandStub = sinon.stub(commands, "executeCommand");
      const reloadStub = sinon.stub(ext.serverProvider, "reload");

      connectionManagerService.connectSuccessBehaviour(insightNode);

      sinon.assert.calledOnce(setActiveConnectionStub);
      sinon.assert.calledOnce(reloadStub);
      sinon.assert.calledWith(
        executeCommandStub,
        "setContext",
        "kdb.connected",
        [insightNode.label],
      );
    });

    it("connectFailBehaviour", () => {
      const showErrorMessageStub = sinon.stub(window, "showErrorMessage");
      const sendEventStub = sinon.stub(Telemetry, "sendEvent");

      const testLabel = "testLabel";

      connectionManagerService.connectFailBehaviour(testLabel);

      sinon.assert.calledWith(
        showErrorMessageStub,
        `Connection failed to: ${testLabel}`,
      );
      sinon.assert.calledWith(sendEventStub, "Connection.Failed.KDB+");
    });

    it("disconnectBehaviour", () => {
      const testConnection = new LocalConnection(
        "localhost:5001",
        "server1",
        [],
      );
      ext.connectedConnectionList.push(testConnection);
      ext.activeConnection = testConnection;

      connectionManagerService.disconnectBehaviour(testConnection);
      assert.equal(ext.connectedConnectionList.length, 0);
      assert.equal(ext.activeConnection, undefined);
      assert.equal(ext.connectionNode, undefined);
    });

    it("disconnectBehaviour with IOnsights connection", () => {
      ext.connectedConnectionList.push(insightsConn);
      ext.activeConnection = insightsConn;

      connectionManagerService.disconnectBehaviour(insightsConn);
      assert.equal(ext.connectedConnectionList.length, 0);
      assert.equal(ext.activeConnection, undefined);
      assert.equal(ext.connectionNode, undefined);
    });

    it("disconnectBehaviour with no active connection", () => {
      ext.connectedConnectionList.push(insightsConn);

      connectionManagerService.disconnectBehaviour(insightsConn);
      assert.equal(ext.connectedConnectionList.length, 0);
      assert.equal(ext.activeConnection, undefined);
    });
  });

  describe("resetScratchpad", () => {
    let connMngService: ConnectionManagementService;
    let retrieveConnectedConnectionStub: sinon.SinonStub;
    let resetScratchpadStub: sinon.SinonStub;
    let kdbOutputLogStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let _showErrorMessageStub: sinon.SinonStub;

    beforeEach(() => {
      connMngService = new ConnectionManagementService();
      ext.activeConnection = insightsConn;
      resetScratchpadStub = sinon.stub(insightsConn, "resetScratchpad");
      retrieveConnectedConnectionStub = sinon.stub(
        connMngService,
        "retrieveConnectedConnection",
      );
      kdbOutputLogStub = sinon.stub(loggers, "kdbOutputLog");
      showInformationMessageStub = sinon.stub(window, "showInformationMessage");
      _showErrorMessageStub = sinon.stub(window, "showErrorMessage");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should log an error if there is no active connection", async () => {
      ext.activeConnection = null;
      await connMngService.resetScratchpad();
      sinon.assert.calledWith(
        kdbOutputLogStub,
        "[connectionManagerService] Please activate an Insights connection to use this feature.",
        "ERROR",
      );
    });

    it("should log an error if the active connection is not an InsightsConnection", async () => {
      ext.activeConnection = localConn;
      await connMngService.resetScratchpad();
      sinon.assert.calledWith(
        kdbOutputLogStub,
        "[connectionManagerService] Please activate an Insights connection to use this feature.",
        "ERROR",
      );
    });

    it("should reset the scratchpad if the active connection is an InsightsConnection", async () => {
      ext.activeConnection = insightsConn;
      ext.activeConnection.insightsVersion = 1.13;
      showInformationMessageStub.resolves("Yes");
      await connMngService.resetScratchpad();
      sinon.assert.calledOnce(resetScratchpadStub);
    });

    it("should retrieve insights connection and procced with resetScratchpad", async () => {
      insightsConn.insightsVersion = 1.13;
      retrieveConnectedConnectionStub.returns(insightsConn);
      showInformationMessageStub.resolves("Yes");
      await connMngService.resetScratchpad("test");
      sinon.assert.calledOnce(retrieveConnectedConnectionStub);
    });

    it("should retrieve insights connection and procced with resetScratchpad", async () => {
      insightsConn.insightsVersion = 1.13;
      retrieveConnectedConnectionStub.returns(insightsConn);
      showInformationMessageStub.resolves("No");
      await connMngService.resetScratchpad("test");
      sinon.assert.calledWith(
        kdbOutputLogStub,
        "[connectionManagerService] The user canceled the scratchpad reset.",
        "DEBUG",
      );
    });

    it("should retrieve kdb connection not proceed", async () => {
      retrieveConnectedConnectionStub.returns(localConn);
      await connMngService.resetScratchpad("test");
      sinon.assert.calledWith(
        kdbOutputLogStub,
        "[connectionManagerService] Please connect to an Insights connection to use this feature.",
        "ERROR",
      );
    });

    it("should log an error if insightsVersion is less than or equal to 1.11", async () => {
      ext.activeConnection = insightsConn;
      ext.activeConnection.insightsVersion = 1.11;
      await connMngService.resetScratchpad();
      sinon.assert.calledOnce(kdbOutputLogStub);
    });
  });

  describe("refreshAllGetMetas && refreshGetMeta", () => {
    let getMetaStub: sinon.SinonStub;
    beforeEach(() => {
      getMetaStub = sinon.stub(insightsConn, "getMeta");
    });
    afterEach(() => {
      sinon.restore();
      ext.connectedConnectionList.length = 0;
    });

    it("Should not refreshAllgetMetas if connection is not InsightsConnection", async () => {
      await connectionManagerService.refreshAllGetMetas();
      sinon.assert.notCalled(getMetaStub);
    });

    it("Should refreshAllgetMetas if connection is InsightsConnection", async () => {
      ext.connectedConnectionList.push(insightsConn);
      await connectionManagerService.refreshAllGetMetas();
      sinon.assert.calledOnce(getMetaStub);
    });
    it("Should not refreshGetMeta if connection is not InsightsConnection", async () => {
      await connectionManagerService.refreshGetMeta("test");
      sinon.assert.notCalled(getMetaStub);
    });

    it("Should refreshGetMeta if connection is InsightsConnection", async () => {
      ext.connectedConnectionList.push(insightsConn);
      await connectionManagerService.refreshGetMeta(insightsConn.connLabel);
      sinon.assert.calledOnce(getMetaStub);
    });
  });

  describe("getMetaInfoType", () => {
    it("should return correct MetaInfoType for valid input", () => {
      assert.strictEqual(
        connectionManagerService.getMetaInfoType("meta".toUpperCase()),
        MetaInfoType.META,
      );
      assert.strictEqual(
        connectionManagerService.getMetaInfoType("schema".toUpperCase()),
        MetaInfoType.SCHEMA,
      );
      assert.strictEqual(
        connectionManagerService.getMetaInfoType("api".toUpperCase()),
        MetaInfoType.API,
      );
      assert.strictEqual(
        connectionManagerService.getMetaInfoType("agg".toUpperCase()),
        MetaInfoType.AGG,
      );
      assert.strictEqual(
        connectionManagerService.getMetaInfoType("dap".toUpperCase()),
        MetaInfoType.DAP,
      );
      assert.strictEqual(
        connectionManagerService.getMetaInfoType("rc".toUpperCase()),
        MetaInfoType.RC,
      );
    });

    it("should return undefined for invalid input", () => {
      assert.strictEqual(
        connectionManagerService.getMetaInfoType("invalid"),
        undefined,
      );
    });
  });

  describe("retrieveMetaContent", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should return empty string for invalid meta info type", () => {
      sandbox
        .stub(connectionManagerService, "getMetaInfoType")
        .returns(undefined);
      assert.strictEqual(
        connectionManagerService.retrieveMetaContent("connLabel", "invalid"),
        "",
      );
    });

    it("should return empty string for not connected connection", () => {
      sandbox
        .stub(connectionManagerService, "getMetaInfoType")
        .returns(MetaInfoType.META);
      sandbox
        .stub(connectionManagerService, "retrieveConnectedConnection")
        .returns(undefined);
      assert.strictEqual(
        connectionManagerService.retrieveMetaContent("connLabel", "meta"),
        "",
      );
    });

    it("should return empty string for local connection", () => {
      sandbox
        .stub(connectionManagerService, "getMetaInfoType")
        .returns(MetaInfoType.META);
      sandbox
        .stub(connectionManagerService, "retrieveConnectedConnection")
        .returns(localConn);
      assert.strictEqual(
        connectionManagerService.retrieveMetaContent("connLabel", "meta"),
        "",
      );
    });

    it("should return meta object for valid input", () => {
      insightsConn.meta = dummyMeta;
      sandbox
        .stub(connectionManagerService, "getMetaInfoType")
        .returns(MetaInfoType.META);
      sandbox
        .stub(connectionManagerService, "retrieveConnectedConnection")
        .returns(insightsConn);
      assert.strictEqual(
        connectionManagerService.retrieveMetaContent(
          insightsConn.connLabel,
          "meta",
        ),
        JSON.stringify(dummyMeta.payload),
      );
    });
  });

  describe("retrieveUserPass", () => {
    let connectionManagerService: ConnectionManagementService;
    let connectionsListStub: sinon.SinonStub;
    let getAuthDataStub: sinon.SinonStub;
    let _kdbAuthMapStub: sinon.SinonStub;
    let _contextStub: sinon.SinonStub;
    ext.context = {} as ExtensionContext;

    beforeEach(() => {
      _contextStub = sinon.stub(ext, "context").value({
        globalStorageUri: {
          fsPath: "/temp/",
        },
      });
      AuthSettings.init(ext.context);
      ext.secretSettings = AuthSettings.instance;
      connectionManagerService = new ConnectionManagementService();
      connectionsListStub = sinon.stub(ext, "connectionsList").value([]);
      getAuthDataStub = sinon.stub(ext.secretSettings, "getAuthData");
      _kdbAuthMapStub = sinon.stub(ext, "kdbAuthMap").value([]);
    });

    afterEach(() => {
      sinon.restore();
      ext.connectionsList.length = 0;
    });

    it("should retrieve and store auth data for KdbNode connections", async () => {
      ext.connectionsList.push(kdbNode);
      getAuthDataStub.withArgs(kdbNode.children[0]).resolves("user1:pass1");

      await connectionManagerService.retrieveUserPass();

      assert.strictEqual(ext.kdbAuthMap.length, 1);
      assert.deepEqual(ext.kdbAuthMap[0], {
        child1: {
          username: "user1",
          password: "pass1",
        },
      });
    });

    it("should not store auth data if getAuthData returns null", async () => {
      connectionsListStub.value([kdbNode]);
      getAuthDataStub.withArgs("server1").resolves(null);

      await connectionManagerService.retrieveUserPass();

      assert.strictEqual(ext.kdbAuthMap.length, 0);
    });

    it("should not store auth data for non-KdbNode connections", async () => {
      const nonKdbNode = { children: ["server1"] };
      connectionsListStub.value([nonKdbNode]);

      await connectionManagerService.retrieveUserPass();

      assert.strictEqual(ext.kdbAuthMap.length, 0);
    });
  });

  describe("retrieveInsightsConnVersion", () => {
    let retrieveConnectionStub: sinon.SinonStub;
    let _connectionsListStub: sinon.SinonStub;
    beforeEach(() => {
      retrieveConnectionStub = sinon.stub(
        connectionManagerService,
        "retrieveConnectedConnection",
      );
      _connectionsListStub = sinon.stub(ext, "connectionsList").value([]);
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should return 0 in case of non-Insights connection", async () => {
      retrieveConnectionStub.withArgs("nonInsightsLabel").returns(kdbNode);

      const result =
        await connectionManagerService.retrieveInsightsConnVersion(
          "nonInsightsLabel",
        );

      assert.strictEqual(result, 0);
    });

    it("should return 1.11 in case of Insights connection with  version", async () => {
      retrieveConnectionStub.withArgs("insightsLabel").returns(insightsConn);

      const result =
        await connectionManagerService.retrieveInsightsConnVersion(
          "insightsLabel",
        );

      assert.strictEqual(result, 1.11);
    });

    it("should not return the version of undefined connection", async () => {
      retrieveConnectionStub.withArgs("nonInsightsLabel").returns(undefined);

      const result =
        await connectionManagerService.retrieveInsightsConnVersion(
          "nonInsightsLabel",
        );

      assert.strictEqual(result, 0);
    });

    it("should return  0 in case of Insights with no connection version", async () => {
      const insightsConn2 = new InsightsConnection(
        "insightsLabel",
        insightNode,
      );
      retrieveConnectionStub.withArgs("insightsLabel").returns(insightsConn2);

      const result =
        await connectionManagerService.retrieveInsightsConnVersion(
          "insightsLabel",
        );

      assert.strictEqual(result, 0);
    });
  });

  describe("retrieveInsightsConnQEEnabled", () => {
    let retrieveConnectedConnectionStub: sinon.SinonStub;
    const apiConfig: InsightsApiConfig = {
      version: "1.11",
      encryptionDatabase: false,
      encryptionInTransit: false,
      queryEnvironmentsEnabled: true,
    };

    beforeEach(() => {
      retrieveConnectedConnectionStub = sinon.stub(
        connectionManagerService,
        "retrieveConnectedConnection",
      );
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should return undefined if connection is not found", async () => {
      retrieveConnectedConnectionStub.returns(undefined);
      const result =
        await connectionManagerService.retrieveInsightsConnQEEnabled("test");
      assert.strictEqual(result, undefined);
    });

    it("should return enabled if connection if qe is on", async () => {
      insightsConn.apiConfig = apiConfig;
      retrieveConnectedConnectionStub.returns(insightsConn);
      const result =
        await connectionManagerService.retrieveInsightsConnQEEnabled("test");
      assert.strictEqual(result, "Enabled");
    });

    it("should return disabled if connection qe is off", async () => {
      apiConfig.queryEnvironmentsEnabled = false;
      insightsConn.apiConfig = apiConfig;
      retrieveConnectedConnectionStub.returns(insightsConn);
      const result =
        await connectionManagerService.retrieveInsightsConnQEEnabled("test");
      assert.strictEqual(result, "Disabled");
    });
  });

  describe("exportConnection", () => {
    let retrieveConnectionStub: sinon.SinonStub;
    let connectionsListStub: sinon.SinonStub;
    let kdbAuthMapStub: sinon.SinonStub;

    beforeEach(() => {
      retrieveConnectionStub = sinon.stub(
        connectionManagerService,
        "retrieveConnection",
      );
      connectionsListStub = sinon.stub(ext, "connectionsList").value([]);
      kdbAuthMapStub = sinon.stub(ext, "kdbAuthMap").value([]);
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should return empty string if connLabel is provided and connection is not found", () => {
      retrieveConnectionStub.withArgs("nonExistentLabel").returns(null);

      const result =
        connectionManagerService.exportConnection("nonExistentLabel");

      assert.strictEqual(result, "");
    });

    it("should export KDB connection when connLabel is provided and connection is an instance of KdbNode", () => {
      kdbNode.details.auth = true;
      retrieveConnectionStub.withArgs("kdbLabel").returns(kdbNode);

      const result = connectionManagerService.exportConnection("kdbLabel");

      const expectedOutput = {
        connections: {
          Insights: [],
          KDB: [kdbNode.details],
        },
      };

      assert.strictEqual(result, JSON.stringify(expectedOutput, null, 2));
    });

    it("should export Insights connection when connLabel is provided and connection is not an instance of KdbNode", () => {
      retrieveConnectionStub.withArgs("insightsLabel").returns(insightNode);

      const result = connectionManagerService.exportConnection("insightsLabel");

      const expectedOutput = {
        connections: {
          Insights: [insightNode.details],
          KDB: [],
        },
      };

      assert.strictEqual(result, JSON.stringify(expectedOutput, null, 2));
    });

    it("should return empty string if connLabel is not provided and connectionsList is empty", () => {
      connectionsListStub.value([]);

      const result = connectionManagerService.exportConnection();

      assert.strictEqual(result, "");
    });

    it("should export all connections when connLabel is not provided and connectionsList contains instances of KdbNode and other connections", () => {
      connectionsListStub.value([kdbNode, insightNode]);

      const result = connectionManagerService.exportConnection();

      const expectedOutput = {
        connections: {
          Insights: [insightNode.details],
          KDB: [kdbNode.details],
        },
      };

      assert.strictEqual(result, JSON.stringify(expectedOutput, null, 2));
    });

    it("should set auth to false and clear username and password if includeAuth is false", () => {
      connectionsListStub.value([kdbNode]);

      const result = connectionManagerService.exportConnection(
        undefined,
        false,
      );

      const expectedOutput = {
        connections: {
          Insights: [],
          KDB: [kdbNode.details],
        },
      };

      assert.strictEqual(result, JSON.stringify(expectedOutput, null, 2));
    });

    it("should set auth to true and populate username and password if includeAuth is true and auth is found", () => {
      const authData = {
        server1: {
          username: "user1",
          password: "pass1",
        },
      };
      connectionsListStub.value([kdbNode]);
      kdbAuthMapStub.value([authData]);

      const result = connectionManagerService.exportConnection(undefined, true);

      const expectedOutput = {
        connections: {
          Insights: [],
          KDB: [kdbNode.details],
        },
      };

      assert.strictEqual(result, JSON.stringify(expectedOutput, null, 2));
    });

    it("should not change auth, username, and password if includeAuth is true and auth is not found", () => {
      connectionsListStub.value([kdbNode]);
      kdbAuthMapStub.value([]);

      const result = connectionManagerService.exportConnection(undefined, true);

      const expectedOutput = {
        connections: {
          Insights: [],
          KDB: [kdbNode.details],
        },
      };

      assert.strictEqual(result, JSON.stringify(expectedOutput, null, 2));
    });

    it("should clear kdbAuthMap after processing", () => {
      const authData = {
        server1: {
          username: "user1",
          password: "pass1",
        },
      };
      connectionsListStub.value([kdbNode]);
      kdbAuthMapStub.value([authData]);

      connectionManagerService.exportConnection(undefined, true);

      assert.strictEqual(ext.kdbAuthMap.length, 0);
    });
  });
});

function createPanel() {
  const listeners = {
    onDidReceiveMessage: undefined,
    postMessage: undefined,
    onDidChangeViewState: undefined,
    onDidDispose: undefined,
  };
  const panel = <WebviewPanel>{
    webview: {
      onDidReceiveMessage(e) {
        listeners.onDidReceiveMessage = e;
      },
      postMessage(e) {
        listeners.postMessage = e;
      },
    },
    onDidChangeViewState(e) {
      listeners.onDidChangeViewState = e;
    },
    onDidDispose(e) {
      listeners.onDidDispose = e;
    },
  };
  return {
    panel,
    listeners,
  };
}

describe("dataSourceEditorProvider", () => {
  let context: ExtensionContext;

  beforeEach(() => {
    context = <ExtensionContext>{};
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("register", () => {
    it("should register the provider", () => {
      let result = undefined;
      sinon
        .stub(window, "registerCustomEditorProvider")
        .value(() => (result = true));
      DataSourceEditorProvider.register(context);
      assert.ok(result);
    });
  });

  describe("resolveCustomTextEditor", () => {
    it("should resolve ", async () => {
      const provider = new DataSourceEditorProvider(context);
      const document = await workspace.openTextDocument({
        language: "q",
        content: "{}",
      });
      sinon.stub(utils, "getUri").value(() => "");
      const panel = createPanel();
      await assert.doesNotReject(() =>
        provider.resolveCustomTextEditor(document, panel.panel),
      );
      panel.listeners.onDidReceiveMessage({});
      panel.listeners.onDidChangeViewState();
      panel.listeners.onDidDispose();
    });

    describe("getMeta", () => {
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

      const dummyMetaNoAssembly: MetaObject = {
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
          assembly: [],
          schema: [],
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
        TreeItemCollapsibleState.None,
      );
      const insightsConn = new InsightsConnection(
        insightsNode.label,
        insightsNode,
      );
      const localConn = new LocalConnection("127.0.0.1:5001", "testLabel", []);
      const connMngService = new ConnectionManagementService();
      let isConnetedStub, _retrieveConnectedConnectionStub: sinon.SinonStub;
      beforeEach(() => {
        isConnetedStub = sinon.stub(connMngService, "isConnected");
        _retrieveConnectedConnectionStub = sinon.stub(
          connMngService,
          "retrieveConnectedConnection",
        );
      });
      afterEach(() => {
        ext.connectedConnectionList.length = 0;
        ext.connectedContextStrings.length = 0;
      });

      it("Should return empty object if the connection selected is not connected", async () => {
        isConnetedStub.returns(false);
        const provider = new DataSourceEditorProvider(context);
        const result = await provider.getMeta(insightsConn.connLabel);
        assert.deepStrictEqual(result, {});
      });

      it("Should return empty object if the connection selected is undefined", async () => {
        ext.connectedContextStrings.push(insightsConn.connLabel);
        isConnetedStub.resolves(true);
        const provider = new DataSourceEditorProvider(context);
        const result = await provider.getMeta(insightsConn.connLabel);
        assert.deepStrictEqual(result, {});
      });

      it("Should return empty object if the connection selected is a LocalConnection", async () => {
        ext.connectedContextStrings.push(localConn.connLabel);
        ext.connectedConnectionList.push(localConn);
        isConnetedStub.resolves(true);
        const provider = new DataSourceEditorProvider(context);
        const result = await provider.getMeta(localConn.connLabel);
        assert.deepStrictEqual(result, {});
      });
      it("Should return empty object if the meta is undefined", async () => {
        ext.connectedContextStrings.push(insightsConn.connLabel);
        ext.connectedConnectionList.push(insightsConn);
        isConnetedStub.resolves(true);
        const provider = new DataSourceEditorProvider(context);
        const result = await provider.getMeta(insightsConn.connLabel);
        assert.deepStrictEqual(result, {});
      });
      it("Should return empty object if the meta has no assembly", async () => {
        ext.connectedContextStrings.push(insightsConn.connLabel);
        ext.connectedConnectionList.push(insightsConn);
        isConnetedStub.resolves(true);
        insightsConn.meta = dummyMetaNoAssembly;
        const provider = new DataSourceEditorProvider(context);
        const result = await provider.getMeta(insightsConn.connLabel);
        assert.deepStrictEqual(result, {});
      });
      it("Should return empty object if the meta has no assembly", async () => {
        ext.connectedContextStrings.push(insightsConn.connLabel);
        ext.connectedConnectionList.push(insightsConn);
        isConnetedStub.resolves(true);
        insightsConn.meta = dummyMeta;
        const provider = new DataSourceEditorProvider(context);
        const result = await provider.getMeta(insightsConn.connLabel);
        assert.deepStrictEqual(result, dummyMeta.payload);
      });
    });
  });
});

describe("ChartEditorProvider", () => {
  let context: ExtensionContext;

  beforeEach(() => {
    context = <ExtensionContext>{};
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("register", () => {
    it("should register the provider", () => {
      let result = undefined;
      sinon
        .stub(window, "registerCustomEditorProvider")
        .value(() => (result = true));
      ChartEditorProvider.register(context);
      assert.ok(result);
    });
  });

  describe("resolveCustomTextEditor", () => {
    it("should resolve", async () => {
      const provider = new ChartEditorProvider(context);
      const document = await workspace.openTextDocument({
        language: "kdbplot",
        content: "{}",
      });
      sinon.stub(utils, "getUri").value(() => "");
      const panel = createPanel();
      await assert.doesNotReject(
        provider.resolveCustomTextEditor(document, panel.panel),
      );
      panel.listeners.onDidReceiveMessage({});
      panel.listeners.onDidChangeViewState();
      panel.listeners.onDidDispose();
    });
  });
});

describe("workspaceTreeProvider", () => {
  let provider: WorkspaceTreeProvider;

  function stubWorkspaceFile(path: string) {
    const parsed = Path.parse(path);
    sinon
      .stub(workspace, "workspaceFolders")
      .value([{ uri: Uri.file(parsed.dir) }]);
    sinon
      .stub(workspace, "getWorkspaceFolder")
      .value(() => Uri.file(parsed.dir));
    sinon.stub(workspace, "findFiles").value(async () => [Uri.file(path)]);
    sinon.stub(workspace, "openTextDocument").value(async (uri: Uri) => uri);
  }

  beforeEach(() => {
    sinon.stub(ext, "serverProvider").value({ onDidChangeTreeData() {} });
    provider = new WorkspaceTreeProvider("**/*.kdb.q", "scratchpad");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("getChildren", () => {
    it("should return workspace scratchpad items", async () => {
      stubWorkspaceFile("/workspace/test.kdb.q");
      let result = await provider.getChildren();
      assert.strictEqual(result.length, 1);
      result = await provider.getChildren(provider.getTreeItem(result[0]));
      assert.strictEqual(result.length, 1);
    });

    it("should return workspace python items", async () => {
      stubWorkspaceFile("/workspace/test.kdb.py");
      let result = await provider.getChildren();
      assert.strictEqual(result.length, 1);
      result = await provider.getChildren(provider.getTreeItem(result[0]));
      assert.strictEqual(result.length, 1);
    });

    it("should return workspace datasource items", async () => {
      stubWorkspaceFile("/workspace/test.kdb.json");
      let result = await provider.getChildren();
      assert.strictEqual(result.length, 1);
      result = await provider.getChildren(provider.getTreeItem(result[0]));
      assert.strictEqual(result.length, 1);
    });
  });
});

describe("CompletionProvider", () => {
  it("should provide completion items", () => {
    sinon.stub(ext, "connectionNode").value(sinon.createStubInstance(KdbNode));
    sinon.stub(ext, "functions").value(["test"]);
    const provider = new CompletionProvider();
    const items = provider.provideCompletionItems();
    assert.ok(items);
  });
});

describe("MetaContentProvider", () => {
  let metaContentProvider: MetaContentProvider;
  let uri: Uri;

  beforeEach(() => {
    metaContentProvider = new MetaContentProvider();
    uri = Uri.parse("foo://example.com");
  });

  it("should update content and fire onDidChange event", () => {
    const content = "new content";
    const spy = sinon.spy();

    metaContentProvider.onDidChange(spy);

    metaContentProvider.update(uri, content);

    assert.strictEqual(
      metaContentProvider.provideTextDocumentContent(uri),
      content,
    );
    assert.ok(spy.calledOnceWith(uri));
  });

  it("should provide text document content", () => {
    const content = "content";
    metaContentProvider.update(uri, content);
    assert.strictEqual(
      metaContentProvider.provideTextDocumentContent(uri),
      content,
    );
  });
});

describe("kdbTreeService", () => {
  const localConn = new LocalConnection("localhost:5001", "server1", []);

  describe("loadNamespaces", () => {
    afterEach(() => {
      sinon.restore();
    });

    it("Should return empty ServerObjects array when none are loaded", async () => {
      sinon.stub(localConn, "loadServerObjects").resolves(undefined);
      const result = await KdbTreeService.loadNamespaces(localConn, "");
      assert.strictEqual(
        result.length,
        0,
        "Namespaces returned should be zero.",
      );
    });

    it("Should return a single server object that ia a namespace", async () => {
      const testObject: ServerObject[] = [
        {
          id: 1,
          pid: 1,
          name: "test",
          fname: "test1",
          typeNum: 1,
          namespace: ".",
          context: {},
          isNs: true,
        },
        {
          id: 2,
          pid: 2,
          name: "test",
          fname: "test2",
          typeNum: 1,
          namespace: ".",
          context: {},
          isNs: true,
        },
      ];
      sinon.stub(localConn, "loadServerObjects").resolves(testObject);
      const result = await KdbTreeService.loadNamespaces(localConn);
      assert.strictEqual(
        result[0],
        testObject[0],
        "Single server object that is a namespace should be returned.",
      );
    });

    it("Should return a single server object that ia a namespace (reverse sort)", async () => {
      const testObject0: ServerObject[] = [
        {
          id: 1,
          pid: 1,
          name: "test",
          fname: "test",
          typeNum: 1,
          namespace: ".",
          context: {},
          isNs: true,
        },
        {
          id: 0,
          pid: 0,
          name: "test",
          fname: "test0",
          typeNum: 1,
          namespace: ".",
          context: {},
          isNs: true,
        },
      ];
      sinon.stub(localConn, "loadServerObjects").resolves(testObject0);
      const result = await KdbTreeService.loadNamespaces(localConn);
      assert.strictEqual(
        result[0],
        testObject0[0],
        "Single server object that is a namespace should be returned.",
      );
      sinon.restore();
    });

    it("Should return a single server object that ia a namespace", async () => {
      const testObject2: ServerObject[] = [
        {
          id: 1,
          pid: 1,
          name: "test",
          fname: "test",
          typeNum: 1,
          namespace: ".",
          context: {},
          isNs: true,
        },
      ];
      sinon.stub(localConn, "loadServerObjects").resolves(testObject2);
      const result = await KdbTreeService.loadNamespaces(localConn, ".");
      assert.strictEqual(
        result[0],
        testObject2[0],
        `Single server object that is a namespace should be returned: ${JSON.stringify(
          result,
        )}`,
      );
      sinon.restore();
    });
  });

  describe("loadDictionaries", () => {
    afterEach(() => {
      sinon.restore();
    });

    it("Should return empty ServerObjects array when none are loaded", async () => {
      sinon.stub(localConn, "loadServerObjects").resolves(undefined);
      const result = await KdbTreeService.loadDictionaries(localConn, "");
      assert.strictEqual(
        result.length,
        0,
        "ServerObjects returned should be zero.",
      );
    });

    it("Should return a single server object that ia a dictionary", async () => {
      const testObject: ServerObject[] = [
        {
          id: 1,
          pid: 1,
          name: "test",
          fname: "test",
          typeNum: 99,
          namespace: ".",
          context: {},
          isNs: false,
        },
      ];
      sinon.stub(localConn, "loadServerObjects").resolves(testObject);
      const result = await KdbTreeService.loadDictionaries(localConn, ".");
      assert.strictEqual(
        result[0],
        testObject[0],
        "Single server object that is a namespace should be returned.",
      );
    });
  });

  describe("loadFunctions", () => {
    afterEach(() => {
      sinon.restore();
    });

    it("Should return empty ServerObjects array when none are loaded", async () => {
      sinon.stub(localConn, "loadServerObjects").resolves(undefined);
      const result = await KdbTreeService.loadFunctions(localConn, ".");
      assert.strictEqual(
        result.length,
        0,
        "ServerObjects returned should be zero.",
      );
    });

    it("Should return a single server object that ia a function", async () => {
      const testObject: ServerObject[] = [
        {
          id: 1,
          pid: 1,
          name: "test",
          fname: "test",
          typeNum: 100,
          namespace: ".",
          context: {},
          isNs: false,
        },
      ];
      sinon.stub(localConn, "loadServerObjects").resolves(testObject);
      const result = await KdbTreeService.loadFunctions(localConn, ".");
      assert.strictEqual(
        result[0],
        testObject[0],
        "Single server object that is a namespace should be returned.",
      );
    });
  });

  describe("loadTables", () => {
    afterEach(() => {
      sinon.restore();
    });

    it("Should return empty ServerObjects array when none are loaded", async () => {
      sinon.stub(localConn, "loadServerObjects").resolves(undefined);
      const result = await KdbTreeService.loadTables(localConn, ".");
      assert.strictEqual(
        result.length,
        0,
        "ServerObjects returned should be zero.",
      );
    });

    it("Should return a single server object that ia a table", async () => {
      const testObject: ServerObject[] = [
        {
          id: 1,
          pid: 1,
          name: "test",
          fname: "test",
          typeNum: 98,
          namespace: ".",
          context: {},
          isNs: false,
        },
      ];
      sinon.stub(localConn, "loadServerObjects").resolves(testObject);
      const result = await KdbTreeService.loadTables(localConn, ".");
      assert.strictEqual(
        result[0],
        testObject[0],
        "Single server object that is a namespace should be returned.",
      );
    });
  });

  describe("loadVariables", () => {
    afterEach(() => {
      sinon.restore();
    });

    it("Should return empty ServerObjects array when none are loaded", async () => {
      sinon.stub(localConn, "loadServerObjects").resolves(undefined);
      sinon.stub(KdbTreeService, "loadViews").resolves([]);
      const result = await KdbTreeService.loadVariables(localConn, ".");
      assert.strictEqual(
        result.length,
        0,
        "ServerObjects returned should be zero.",
      );
    });

    it("Should return a single server object that ia a variable", async () => {
      const testObject: ServerObject[] = [
        {
          id: 1,
          pid: 1,
          name: "test",
          fname: "test",
          typeNum: -7,
          namespace: ".",
          context: {},
          isNs: false,
        },
      ];
      sinon.stub(localConn, "loadServerObjects").resolves(testObject);
      sinon.stub(KdbTreeService, "loadViews").resolves([]);
      const result = await KdbTreeService.loadVariables(localConn, ".");
      assert.strictEqual(
        result[0],
        testObject[0],
        "Single server object that is a namespace should be returned.",
      );
    });
  });

  describe("loadViews", () => {
    afterEach(() => {
      sinon.restore();
    });

    it("Should return sorted views", async () => {
      ext.activeConnection = new LocalConnection(
        "localhost:5001",
        "server1",
        [],
      );
      sinon.stub(localConn, "executeQueryRaw").resolves(["vw1", "vw2"]);
      const result = await KdbTreeService.loadViews(localConn);
      assert.strictEqual(result[0], "vw1", "Should return the first view");
    });

    it("Should return sorted views (reverse order)", async () => {
      ext.activeConnection = new LocalConnection(
        "localhost:5001",
        "server1",
        [],
      );
      sinon.stub(localConn, "executeQueryRaw").resolves(["vw1", "vw2"]);
      const result = await KdbTreeService.loadViews(localConn);
      assert.strictEqual(result[0], "vw1", "Should return the first view");
    });
  });
});

describe("HelpFeedbackProvider", () => {
  let provider: HelpFeedbackProvider;

  beforeEach(() => {
    provider = new HelpFeedbackProvider();
  });

  it("should return all help items in getChildren", () => {
    const children = provider.getChildren();
    assert.strictEqual(children.length, 4);
    assert.ok(children[0] instanceof TreeItem);
    assert.strictEqual(children[0].label, "Extension Documentation");
    assert.strictEqual(children[1].label, "Suggest a Feature");
    assert.strictEqual(children[2].label, "Provide Feedback");
    assert.strictEqual(children[3].label, "Report a Bug");
  });

  it("should return the same item in getTreeItem", () => {
    const children = provider.getChildren();
    for (const item of children) {
      const treeItem = provider.getTreeItem(item);
      assert.strictEqual(treeItem, item);
    }
  });

  it("should set correct command and iconPath for each HelpItem", () => {
    const children = provider.getChildren();
    const expected = [
      {
        label: "Extension Documentation",
        command: "kdb.help.openDocumentation",
        icon: "help-doc.svg",
      },
      {
        label: "Suggest a Feature",
        command: "kdb.help.suggestFeature",
        icon: "feature.svg",
      },
      {
        label: "Provide Feedback",
        command: "kdb.help.provideFeedback",
        icon: "feedback.svg",
      },
      {
        label: "Report a Bug",
        command: "kdb.help.reportBug",
        icon: "bug.svg",
      },
    ];

    function normalizePath(p: string) {
      return p.replace(/\\/g, "/");
    }

    children.forEach((item, idx) => {
      assert.strictEqual(item.label, expected[idx].label);
      assert.deepStrictEqual(item.command, {
        command: expected[idx].command,
        title: expected[idx].label,
      });
      if (
        typeof item.iconPath === "object" &&
        item.iconPath !== null &&
        "light" in item.iconPath &&
        "dark" in item.iconPath
      ) {
        const actualLight = normalizePath(item.iconPath.light.toString());
        const expectedLight = normalizePath(
          Path.join("resources", "light", expected[idx].icon),
        );
        const actualDark = normalizePath(item.iconPath.dark.toString());
        const expectedDark = normalizePath(
          Path.join("resources", "dark", expected[idx].icon),
        );
        assert.ok(actualLight.endsWith(expectedLight));
        assert.ok(actualDark.endsWith(expectedDark));
      }
    });
  });

  it("should emit onDidChangeTreeData event", (done) => {
    const spy = sinon.spy();
    provider.onDidChangeTreeData(spy);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: Accessing private member for test
    provider._onDidChangeTreeData.fire();
    setTimeout(() => {
      assert.ok(spy.calledOnce);
      done();
    }, 10);
  });
});
