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

import {
  ColorThemeKind,
  Uri,
  WebviewView,
  WebviewViewProvider,
  window,
  workspace,
} from "vscode";
import { ext } from "../extensionVariables";
import * as utils from "../utils/execution";
import { getNonce } from "../utils/getNonce";
import { getUri } from "../utils/getUri";

export class KdbResultsViewProvider implements WebviewViewProvider {
  public static readonly viewType = "kdb-results";
  private _view?: WebviewView;
  public _colorTheme: any;
  private _results: string | string[] = "";

  constructor(private readonly _extensionUri: Uri) {
    this._colorTheme = window.activeColorTheme;
    window.onDidChangeActiveColorTheme(() => {
      this._colorTheme = window.activeColorTheme;
      this.updateResults(this._results);
    });
    // this.resolveWebviewView(webviewView);
  }

  public resolveWebviewView(webviewView: WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [Uri.joinPath(this._extensionUri, "out")],
    };

    webviewView.webview.html = this._getWebviewContent("");

    webviewView.webview.onDidReceiveMessage((data) => {
      webviewView.webview.html = this._getWebviewContent(data);
    });
  }

  public updateResults(queryResults: any, dataSourceType?: string) {
    if (this._view) {
      this._view.show?.(true);
      this._view.webview.postMessage(queryResults);
      this._view.webview.html = this._getWebviewContent(
        queryResults,
        dataSourceType
      );
    }
  }

  public removeEndCommaFromStrings(data: string[]): string[] {
    return data.map((element) => {
      if (element.endsWith(",")) {
        return element.slice(0, -1);
      }
      return element;
    });
  }

  convertToCsv(data: any[]): string[] {
    const keys = Object.keys(data[0]);
    const header = keys.join(",");
    const rows = data.map((obj) => {
      return keys
        .map((key) => {
          return obj[key];
        })
        .join(",");
    });
    return [header, ...rows];
  }

  exportToCsv() {
    if (ext.resultPanelCSV === "") {
      window.showErrorMessage("No results to export");
      return;
    }
    const workspaceFolders = workspace.workspaceFolders;
    if (!workspaceFolders) {
      window.showErrorMessage("Open a folder to export results");
      return;
    }
    const workspaceUri = workspaceFolders[0].uri;
    utils.exportToCsv(workspaceUri);
  }

  convertToGrid(queryResult: any[]): string {
    const columnDefs = Object.keys(queryResult[0]).map((key: string) => {
      const sanitizedKey = this.sanitizeString(key);
      return { field: sanitizedKey, headerName: sanitizedKey };
    });
    const rowData = queryResult.map((row: any) => {
      for (const key in row) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
          row[key] =
            row[key] !== undefined ? this.sanitizeString(row[key]) : "";
        }
      }
      return row;
    });
    ext.resultPanelCSV = this.convertToCsv(rowData).join("\n");
    return JSON.stringify({
      defaultColDef: {
        sortable: true,
        resizable: true,
        filter: true,
        flex: 1,
        minWidth: 100,
      },
      rowData,
      columnDefs,
      domLayout: "autoHeight",
      pagination: true,
      paginationPageSize: 100,
      cacheBlockSize: 100,
      enableCellTextSelection: true,
      ensureDomOrder: true,
      suppressContextMenu: true,
    });
  }

  isVisible(): boolean {
    return !!this._view?.visible;
  }

  sanitizeString(str: string | string[]): string {
    if (str instanceof Array) {
      str = str.join(" ");
    }
    str = str.toString();
    str = str.trim();
    str = str.replace(/['"`]/g, "");
    str = str.replace(/\$\{/g, "");
    return str;
  }

  defineAgGridTheme(): string {
    if (this._colorTheme.kind === ColorThemeKind.Dark) {
      return "ag-theme-alpine-dark";
    }
    return "ag-theme-alpine";
  }

  private _getLibUri(path: string) {
    return this._view
      ? getUri(this._view.webview, this._extensionUri, ["out", path])
      : "";
  }

  private _getWebviewContent(queryResult: any, _dataSourceType?: string) {
    ext.resultPanelCSV = "";
    this._results = queryResult;
    const agGridTheme = this.defineAgGridTheme();
    if (this._view) {
      const webviewUri = getUri(this._view.webview, this._extensionUri, [
        "out",
        "webview.js",
      ]);
      const nonce = getNonce();
      let result = "";
      let gridOptionsString = "";

      let isGrid = false;
      if (typeof queryResult === "string" || typeof queryResult === "number") {
        result =
          queryResult !== ""
            ? `<p>${queryResult}</p>`
            : "<p>No results to show</p>";
      } else if (
        typeof queryResult === "object" &&
        queryResult !== null &&
        queryResult instanceof Array
      ) {
        isGrid = true;
        gridOptionsString = this.convertToGrid(queryResult);
      }

      result =
        gridOptionsString === ""
          ? result !== ""
            ? result
            : "<p>No results to show</p>"
          : "";
      return /*html*/ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1.0" />
        <link rel="stylesheet" href="${this._getLibUri("reset.css")}" />
        <link rel="stylesheet" href="${this._getLibUri("vscode.css")}" />
        <link rel="stylesheet" href="${this._getLibUri("resultsPanel.css")}" />
        <link rel="stylesheet" href="${this._getLibUri("ag-grid.min.css")}" />
        <link rel="stylesheet" href="${this._getLibUri(
          "ag-theme-alpine.min.css"
        )}" />
        <title>Q Results</title>
        <script nonce="${nonce}" src="${this._getLibUri(
        "ag-grid-community.min.js"
      )}"></script>
      </head>
      <body>      
        <div class="results-view-container">
          <div class="content-wrapper">
              ${result}
            </div>
          </div>      
        <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
        <div id="grid" style="height: 100%;  width:100%;" class="${agGridTheme}"></div>
        <script nonce="${nonce}" >          
          document.addEventListener('DOMContentLoaded', () => {
            if(${isGrid}){
              const gridDiv = document.getElementById('grid');
              const obj = JSON.parse('${gridOptionsString}');
              const gridApi = new agGrid.Grid(gridDiv, obj);
            }
          });
          document.addEventListener('contextmenu', (e) => {
            e.stopImmediatePropagation()
          }, true);
        </script>
      </body>
    </html>
    `;
    } else {
      return "";
    }
  }
}
