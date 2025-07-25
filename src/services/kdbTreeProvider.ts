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

import * as vscode from "vscode";

import { ext } from "../extensionVariables";
import { ConnectionManagementService } from "./connectionManagerService";
import { KdbTreeService } from "./kdbTreeService";
import { InsightsConnection } from "../classes/insightsConnection";
import { LocalConnection } from "../classes/localConnection";
import {
  InsightDetails,
  Insights,
  Server,
  ServerDetails,
} from "../models/connectionsModels";
import { Labels } from "../models/labels";
import {
  clearWorkspaceLabels,
  isLabelContentChanged,
  isLabelEmpty,
  retrieveConnLabelsNames,
} from "../utils/connLabel";
import {
  getInsightsAlias,
  getServerAlias,
  getServerIconState,
  getServerName,
  getStatus,
} from "../utils/core";
import { getIconPath } from "../utils/iconsUtils";
import { MessageKind, notify } from "../utils/notifications";

export class KdbTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    KdbNode | InsightsNode | undefined | void
  > = new vscode.EventEmitter<KdbNode | InsightsNode | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    KdbNode | InsightsNode | undefined | void
  > = this._onDidChangeTreeData.event;

  constructor(
    private serverList: Server,
    private insightsList: Insights,
  ) {}

  reload(): void {
    this._onDidChangeTreeData.fire();
  }

  refresh(serverList: Server): void {
    ext.isBundleQCreated = false;
    this.serverList = serverList;
    vscode.commands.executeCommand(
      "setContext",
      "kdb.selectContentNodesContext",
      ext.selectContentNodesContext,
    );
    this._onDidChangeTreeData.fire();
  }

  refreshInsights(insightsList: Insights): void {
    this.insightsList = insightsList;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: KdbNode | InsightsNode): vscode.TreeItem {
    if (
      element instanceof KdbNode &&
      element.details.managed &&
      element.details.serverAlias === "local"
    ) {
      ext.isBundleQCreated = true;
    }
    if (
      element instanceof InsightsMetaNode ||
      element instanceof MetaObjectPayloadNode
    ) {
      element.command = {
        command: "kdb.connections.open.meta",
        title: "Open Meta Object",
        arguments: [element],
      };
    }
    if (element instanceof QServerNode) {
      element.contextValue = ext.selectContentNodesContext[0];
    }
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    clearWorkspaceLabels();
    if (!this.serverList || !this.insightsList) {
      return [];
    }

    if (!element) {
      const orphans: vscode.TreeItem[] = [];
      const nodes = ext.connLabelList.map((label) => new LabelNode(label));
      const items = this.getMergedElements(element);

      let orphan, found;
      for (const item of items) {
        orphan = true;
        if (item instanceof KdbNode || item instanceof InsightsNode) {
          const labels = retrieveConnLabelsNames(item);
          for (const label of labels) {
            found = nodes.find((node) => label === node.source.name);
            if (found) {
              found.children.push(item);
              orphan = false;
            }
          }
        }
        if (orphan) {
          orphans.push(item);
        }
      }
      return [...orphans, ...nodes];
    } else if (element instanceof LabelNode) {
      return element.children;
    } else if (
      element.contextValue !== undefined &&
      ext.kdbrootNodes.indexOf(element.contextValue) !== -1
    ) {
      return Promise.resolve(await this.getNamespaces(element.contextValue));
    } else if (
      element.contextValue !== undefined &&
      ext.kdbinsightsNodes.indexOf(element.contextValue) !== -1
    ) {
      return Promise.resolve(await this.getMetas(element.contextValue));
    } else if (element.contextValue === "ns") {
      return Promise.resolve(
        this.getCategories(
          (element as QNamespaceNode).details?.toString(),
          ext.qObjectCategories,
          (element as QNamespaceNode).connLabel,
        ),
      );
    } else if (
      element.contextValue === "meta" &&
      element instanceof InsightsMetaNode
    ) {
      return Promise.resolve(this.getMetaObjects(element.connLabel));
    } else {
      return Promise.resolve(this.getServerObjects(element));
    }
  }

  private getMergedElements(_element?: vscode.TreeItem): vscode.TreeItem[] {
    ext.connectionsList.length = 0;
    const servers = this.getChildElements(_element);
    const insights = this.getInsightsChildElements();
    ext.connectionsList.push(...servers, ...insights);
    ext.kdbConnectionAliasList.length = 0;
    getServerAlias(servers.map((x) => x.details));
    getInsightsAlias(insights.map((x) => x.details));
    return [...servers, ...insights];
  }

  private getChildElements(_element?: vscode.TreeItem): KdbNode[] {
    return this.createLeafItems(this.serverList);
  }

  private getInsightsChildElements(_element?: InsightsNode): InsightsNode[] {
    return this.createInsightLeafItems(this.insightsList);
  }

  /* c8 ignore next */
  private async getMetas(connLabel: string): Promise<InsightsMetaNode[]> {
    const connMng = new ConnectionManagementService();
    const conn = connMng.retrieveConnectedConnection(connLabel);
    if (conn) {
      return [
        new InsightsMetaNode(
          [],
          "meta",
          "",
          vscode.TreeItemCollapsibleState.Collapsed,
          connLabel,
        ),
      ];
    } else {
      return new Array<InsightsMetaNode>();
    }
  }

  /* c8 ignore next */
  private async getNamespaces(connLabel: string): Promise<QNamespaceNode[]> {
    const connMng = new ConnectionManagementService();
    const conn = connMng.retrieveConnectedConnection(connLabel);
    if (!conn) {
      return new Array<QNamespaceNode>();
    }
    if (conn instanceof InsightsConnection) {
      // For Insights connections, namespaces are not applicable for now
      notify(
        "Please connect to a KDB instance to view the objects",
        MessageKind.INFO,
      );
      return new Array<QNamespaceNode>();
    }
    const ns = await KdbTreeService.loadNamespaces(conn);
    const result = ns.map(
      (x) =>
        new QNamespaceNode(
          [],
          x.name,
          "",
          vscode.TreeItemCollapsibleState.Collapsed,
          x.fname,
          connLabel ?? "",
        ),
    );
    if (result !== undefined) {
      return result;
    } else {
      return new Array<QNamespaceNode>();
    }
  }

  /* c8 ignore next */
  private async getCategories(
    ns: string | undefined,
    objectCategories: string[],
    connLabel?: string,
  ): Promise<QCategoryNode[]> {
    // filter out views for non-default namespaces
    let filteredCategories;
    if (ns !== ".") {
      filteredCategories = objectCategories.filter((item) => {
        return item !== "Views";
      });
    } else {
      filteredCategories = objectCategories;
    }
    const result = filteredCategories.map(
      (x) =>
        new QCategoryNode(
          [],
          x,
          "",
          ns ?? "",
          vscode.TreeItemCollapsibleState.Collapsed,
          connLabel ?? "",
        ),
    );
    return result;
  }

  private async getServerObjects(
    serverType: QCategoryNode | vscode.TreeItem,
  ): Promise<QServerNode[] | QNamespaceNode[]> {
    if (serverType === undefined) return new Array<QServerNode>();

    const conn = this.validateAndGetConnection(serverType);
    if (!conn) {
      return new Array<QServerNode>();
    }

    const ns = serverType.contextValue ?? "";
    const connLabel =
      serverType instanceof QCategoryNode ? serverType.connLabel : "";

    return this.loadObjectsByCategory(serverType, conn, ns, connLabel);
  }

  private validateAndGetConnection(
    serverType: QCategoryNode | vscode.TreeItem,
  ): LocalConnection | null {
    const connLabel =
      serverType instanceof QCategoryNode ? serverType.connLabel : "";
    const connMng = new ConnectionManagementService();
    const conn = connMng.retrieveConnectedConnection(connLabel);

    if (!conn) {
      return null;
    }

    if (conn instanceof InsightsConnection) {
      // For Insights connections server objects are not applicable now
      notify(
        "Please connect to a KDB instance to view the objects",
        MessageKind.INFO,
      );
      return null;
    }

    return conn;
  }

  private async loadObjectsByCategory(
    serverType: QCategoryNode | vscode.TreeItem,
    conn: LocalConnection,
    ns: string,
    connLabel: string,
  ): Promise<QServerNode[]> {
    const categoryIndex = ext.qObjectCategories.indexOf(
      serverType.label as string,
    );

    switch (categoryIndex) {
      case 0: // dictionaries
        return this.loadDictionaries(
          conn,
          serverType.contextValue ?? "",
          ns,
          connLabel,
        );
      case 1: // functions
        return this.loadFunctions(
          conn,
          serverType.contextValue ?? "",
          ns,
          connLabel,
        );
      case 2: // tables
        return this.loadTables(
          conn,
          serverType.contextValue ?? "",
          ns,
          connLabel,
        );
      case 3: // variables
        return this.loadVariables(
          conn,
          serverType.contextValue ?? "",
          ns,
          connLabel,
        );
      case 4: // views
        return this.loadViews(conn, ns, connLabel);
      default:
        return new Array<QServerNode>();
    }
  }

  private async loadDictionaries(
    conn: LocalConnection,
    namespace: string,
    ns: string,
    connLabel: string,
  ): Promise<QServerNode[]> {
    const dicts = await KdbTreeService.loadDictionaries(conn, namespace);
    return this.createQServerNodes(dicts, ns, connLabel, "dictionaries");
  }

  private async loadFunctions(
    conn: LocalConnection,
    namespace: string,
    ns: string,
    connLabel: string,
  ): Promise<QServerNode[]> {
    const funcs = await KdbTreeService.loadFunctions(conn, namespace);
    return this.createQServerNodes(funcs, ns, connLabel, "functions");
  }

  private async loadTables(
    conn: LocalConnection,
    namespace: string,
    ns: string,
    connLabel: string,
  ): Promise<QServerNode[]> {
    const tables = await KdbTreeService.loadTables(conn, namespace);
    return this.createQServerNodes(tables, ns, connLabel, "tables");
  }

  private async loadVariables(
    conn: LocalConnection,
    namespace: string,
    ns: string,
    connLabel: string,
  ): Promise<QServerNode[]> {
    const vars = await KdbTreeService.loadVariables(conn, namespace);
    return this.createQServerNodes(vars, ns, connLabel, "variables");
  }

  private async loadViews(
    conn: LocalConnection,
    ns: string,
    connLabel: string,
  ): Promise<QServerNode[]> {
    const views = await KdbTreeService.loadViews(conn);
    return views.map(
      (x) =>
        new QServerNode(
          [],
          `${ns === "." ? "" : "."}${x}`,
          "",
          vscode.TreeItemCollapsibleState.None,
          "views",
          connLabel,
        ),
    );
  }

  // Nested namespaces are not currently supported in the tree view
  // private async loadNestedNamespaces(
  //   conn: LocalConnection,
  //   ns: string,
  //   connLabel: string,
  // ): Promise<QServerNode[]> {
  //   const nns = await KdbTreeService.loadNamespaces(conn);
  //   return this.createQServerNodes(nns, ns, connLabel, "namespaces");
  // }

  /* c8 ignore next */
  private createQServerNodes(
    objects: any[],
    ns: string,
    connLabel: string,
    iconType: string,
  ): QServerNode[] {
    return objects.map(
      (x) =>
        new QServerNode(
          [],
          `${ns === "." ? "" : ns + "."}${x.name}`,
          "",
          vscode.TreeItemCollapsibleState.None,
          iconType,
          connLabel,
        ),
    );
  }

  /* c8 ignore next */
  private async getMetaObjects(
    connLabel: string,
  ): Promise<MetaObjectPayloadNode[]> {
    const connMng = new ConnectionManagementService();
    const conn = connMng.retrieveConnectedConnection(connLabel);
    const isInsights = conn instanceof InsightsConnection;
    if (conn && isInsights) {
      const meta = conn.meta;
      if (!meta) {
        return new Array<MetaObjectPayloadNode>();
      }
      const objects: MetaObjectPayloadNode[] = [];
      if (meta.payload.schema) {
        objects.push(
          new MetaObjectPayloadNode(
            [],
            "schema",
            "",
            vscode.TreeItemCollapsibleState.None,
            "schemaicon",
            connLabel,
          ),
        );
      }
      if (meta.payload.api) {
        objects.push(
          new MetaObjectPayloadNode(
            [],
            "api",
            "",
            vscode.TreeItemCollapsibleState.None,
            "apiicon",
            connLabel,
          ),
        );
      }
      if (meta.payload.dap) {
        objects.push(
          new MetaObjectPayloadNode(
            [],
            "dap",
            "",
            vscode.TreeItemCollapsibleState.None,
            "dapicon",
            connLabel,
          ),
        );
      }
      if (meta.payload.rc) {
        objects.push(
          new MetaObjectPayloadNode(
            [],
            "rc",
            "",
            vscode.TreeItemCollapsibleState.None,
            "rcicon",
            connLabel,
          ),
        );
      }
      if (meta.payload.agg) {
        objects.push(
          new MetaObjectPayloadNode(
            [],
            "agg",
            "",
            vscode.TreeItemCollapsibleState.None,
            "aggicon",
            connLabel,
          ),
        );
      }

      return objects;
    } else {
      return new Array<MetaObjectPayloadNode>();
    }
  }

  private createLeafItems(servers: Server): KdbNode[] {
    const keys: string[] = Object.keys(servers);
    return keys.map(
      (x) =>
        new KdbNode(
          x.split(":"),
          x,
          servers[x],
          ext.connectionNode?.label === getServerName(servers[x])
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
        ),
    );
  }

  private createInsightLeafItems(insights: Insights): InsightsNode[] {
    const connMng = new ConnectionManagementService();
    const keys: string[] = Object.keys(insights);
    return keys.map((x) => {
      const isConnected = connMng.retrieveConnectedConnection(
        insights[x].alias,
      );
      return new InsightsNode(
        [],
        insights[x].alias,
        insights[x],
        isConnected
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
      );
    });
  }
}

export class KdbNode extends vscode.TreeItem {
  constructor(
    public readonly children: string[],
    public readonly label: string,
    public readonly details: ServerDetails,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    if (details.serverAlias != "") {
      label = label + ` `;
    }
    label = label + `[${details.serverName}:${details.serverPort}]`;

    // set context for root nodes
    if (ext.kdbrootNodes.indexOf(label) === -1) {
      ext.kdbrootNodes.push(label);
      vscode.commands.executeCommand(
        "setContext",
        "kdb.rootNodes",
        ext.kdbrootNodes,
      );
    }

    // set context for nodes without auth
    if (details.auth === false) {
      if (ext.kdbNodesWithoutAuth.indexOf(label) === -1) {
        ext.kdbNodesWithoutAuth.push(label);
        vscode.commands.executeCommand(
          "setContext",
          "kdb.kdbNodesWithoutAuth",
          ext.kdbNodesWithoutAuth,
        );
      }
    } else {
      const index = ext.kdbNodesWithoutAuth.indexOf(label);
      if (index !== -1) {
        ext.kdbNodesWithoutAuth.splice(index, 1);
        vscode.commands.executeCommand(
          "setContext",
          "kdb.kdbNodesWithoutAuth",
          ext.kdbNodesWithoutAuth,
        );
      }
    }

    // set context for nodes without tls
    if (details.tls === false) {
      if (ext.kdbNodesWithoutTls.indexOf(label) === -1) {
        ext.kdbNodesWithoutTls.push(label);
        vscode.commands.executeCommand(
          "setContext",
          "kdb.kdbNodesWithoutTls",
          ext.kdbNodesWithoutTls,
        );
      }
    } else {
      const index = ext.kdbNodesWithoutTls.indexOf(label);
      if (index !== -1) {
        ext.kdbNodesWithoutTls.splice(index, 1);
        vscode.commands.executeCommand(
          "setContext",
          "kdb.kdbNodesWithoutTls",
          ext.kdbNodesWithoutTls,
        );
      }
    }

    super(label, collapsibleState);
    this.description = this.getDescription();
    this.tooltip = this.getTooltip();
  }

  getTooltip(): vscode.MarkdownString {
    const tooltipMd = new vscode.MarkdownString();
    const title = `${this.details.serverAlias} ${getStatus(this.label)}`;
    tooltipMd.appendMarkdown(`### ${title}\n`);
    tooltipMd.appendMarkdown(
      `${this.details.serverName}:${this.details.serverPort}`,
    );
    return tooltipMd;
  }

  getDescription(): string {
    return this.collapsibleState === vscode.TreeItemCollapsibleState.None &&
      this.children.length > 2
      ? `${this.children[2]}:${"*".repeat(this.children[3].length)}`
      : "";
  }

  iconPath = getNamedIconPath("conn-kdb", this.label);

  contextValue = this.label; // "root";
}

export class InsightsNode extends vscode.TreeItem {
  constructor(
    public readonly children: string[],
    public readonly label: string,
    public readonly details: InsightDetails,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
    this.initializeNode();
  }

  async initializeNode() {
    // set context for root nodes
    if (ext.kdbinsightsNodes.indexOf(this.label) === -1) {
      const indexOriginalLabel = ext.kdbinsightsNodes.indexOf(this.label);
      if (indexOriginalLabel !== -1) {
        ext.kdbinsightsNodes.splice(indexOriginalLabel, 1);
      }
      ext.kdbinsightsNodes.push(this.label);
      vscode.commands.executeCommand(
        "setContext",
        "kdb.insightsNodes",
        ext.kdbinsightsNodes,
      );
    }

    this.tooltip = await this.getTooltip();
    this.description = this.getDescription();
  }

  async getTooltip(): Promise<vscode.MarkdownString> {
    const connService = new ConnectionManagementService();
    const tooltipMd = new vscode.MarkdownString();
    const title = `${this.label} ${getStatus(this.label)}`;
    tooltipMd.appendMarkdown(`### ${title} \n`);
    tooltipMd.appendMarkdown(
      `${this.details.server.replace(/:\/\//g, "&#65279;://")}`,
    );
    tooltipMd.appendMarkdown(`${this.details.alias} \n`);
    const version = await connService.retrieveInsightsConnVersion(this.label);
    const qeEnabled = await connService.retrieveInsightsConnQEEnabled(
      this.label,
    );
    if (version !== 0) {
      tooltipMd.appendMarkdown(`\nVersion: ${version}\n`);
    }
    if (qeEnabled !== undefined) {
      tooltipMd.appendMarkdown(`\nQuery Environment(s): ${qeEnabled}`);
    }
    return tooltipMd;
  }

  getDescription(): string {
    return this.collapsibleState === vscode.TreeItemCollapsibleState.None &&
      this.children.length > 2
      ? `${this.children[2]}:${"*".repeat(this.children[3].length)}`
      : "";
  }

  iconPath = getNamedIconPath("conn-insights", this.label);

  contextValue = this.label; // "root";
}

export class InsightsMetaNode extends vscode.TreeItem {
  constructor(
    public readonly children: string[],
    public readonly label: string,
    public readonly details: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly connLabel: string,
  ) {
    super(label, collapsibleState);
    this.description = this.getDescription();
  }

  getDescription(): string {
    return "";
  }

  iconPath = getOtherIconPath("metaicon");
  contextValue = "meta";
}

export class QNamespaceNode extends vscode.TreeItem {
  constructor(
    public readonly children: string[],
    public readonly label: string,
    public readonly details: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly fullName: string,
    public readonly connLabel: string,
  ) {
    details = fullName;
    super(label, collapsibleState);
    this.description = this.getDescription();
  }

  getDescription(): string {
    return "";
  }

  iconPath = getOtherIconPath("namespaces");
  contextValue = "ns";
}

export class QCategoryNode extends vscode.TreeItem {
  constructor(
    public readonly children: string[],
    public readonly label: string,
    public readonly details: string,
    public readonly ns: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly connLabel: string,
  ) {
    details = "";
    super(label, collapsibleState);
    this.description = this.getDescription();
  }

  getDescription(): string {
    return "";
  }

  iconPath = getOtherIconPath(this.label.toLowerCase());
  contextValue = this.ns; // "category";
}

export class MetaObjectPayloadNode extends vscode.TreeItem {
  constructor(
    public readonly children: string[],
    public readonly label: string,
    public readonly details: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly coreIcon: string,
    public readonly connLabel: string,
  ) {
    super(label, collapsibleState);
    this.description = "";
  }
  iconPath = getOtherIconPath(this.coreIcon);
}

export class QServerNode extends vscode.TreeItem {
  constructor(
    public readonly children: string[],
    public readonly label: string,
    public readonly details: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly coreIcon: string,
    public readonly connLabel: string,
  ) {
    details = "";
    super(label, collapsibleState);
    this.description = this.getDescription();
  }

  getDescription(): string {
    return "";
  }

  iconPath = getOtherIconPath(this.coreIcon);
  contextValue = this.label;
}

export class LabelNode extends vscode.TreeItem {
  readonly children: vscode.TreeItem[] = [];
  static id = 0;

  constructor(public readonly source: Labels) {
    super(source.name);
    this.id = "LabelNode" + LabelNode.id++;
    this.collapsibleState = this.getCollapsibleState(source.name);
    this.contextValue = "label";
  }

  iconPath = getIconPath(`label-${this.source.color.name.toLowerCase()}.svg`);

  getCollapsibleState(labelName: string): vscode.TreeItemCollapsibleState {
    if (isLabelEmpty(labelName)) {
      return vscode.TreeItemCollapsibleState.None;
    }
    if (isLabelContentChanged(labelName)) {
      return vscode.TreeItemCollapsibleState.Expanded;
    }
    return vscode.TreeItemCollapsibleState.Collapsed;
  }
}

function getNamedIconPath(name: string, label: string) {
  const iconFileName = name + getServerIconState(label) + ".svg";

  return getIconPath(iconFileName);
}

function getOtherIconPath(name: string) {
  return getIconPath(name + ".svg");
}
