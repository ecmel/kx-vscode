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

import { UDA } from "./uda";

export enum DataSourceTypes {
  API = "API",
  QSQL = "QSQL",
  SQL = "SQL",
  UDA = "UDA",
}

//TODO: make the optional params required in 1.10 or superior
export interface DataSourceFiles {
  name?: string;
  originalName?: string;
  insightsNode?: string;
  dataSource: {
    selectedType: DataSourceTypes;
    api: {
      selectedApi: string;
      table: string;
      startTS: string;
      endTS: string;
      fill: string;
      temporality: string;
      rowCountLimit?: string;
      isRowLimitLast?: boolean;
      filter: string[];
      groupBy: string[];
      agg: string[];
      sortCols: string[];
      slice: string[];
      labels: string[];
      optional?: {
        filled: boolean;
        temporal: boolean;
        filters: Filter[];
        labels: Label[];
        sorts: Sort[];
        aggs: Agg[];
        groups: Group[];
        rowLimit?: boolean;
      };
    };
    qsql: {
      query: string;
      selectedTarget: string;
    };
    sql: {
      query: string;
    };
    uda?: UDA;
  };
}

export function createDefaultDataSourceFile(): DataSourceFiles {
  return {
    name: "DataSource",
    dataSource: {
      selectedType: DataSourceTypes.API,
      api: {
        selectedApi: "",
        table: "",
        startTS: "",
        endTS: "",
        fill: "zero",
        temporality: "snapshot",
        rowCountLimit: "100000",
        isRowLimitLast: true,
        filter: [],
        groupBy: [],
        agg: [],
        sortCols: [],
        slice: [],
        labels: [],
      },
      qsql: {
        query: "",
        selectedTarget: "",
      },
      sql: {
        query: "",
      },
    },
  };
}

export const filterOperators = [
  "in",
  "within",
  "<",
  ">",
  "<=",
  ">=",
  "=",
  "<>",
  "like",
];

export const aggOperators = [
  "all",
  "any",
  "avg",
  "count",
  "dev",
  "distinct",
  "first",
  "last",
  "max",
  "min",
  "prd",
  "sdev",
  "scov",
  "sum",
  "svar",
  "var",
];

export type Filter = {
  active: boolean;
  column: string;
  operator: string;
  values: string;
};

export function createFilter(): Filter {
  return {
    active: false,
    column: "",
    operator: "in",
    values: "",
  };
}

export type Label = {
  active: boolean;
  key: string;
  value: string;
};

export function createLabel(): Label {
  return {
    active: false,
    key: "",
    value: "",
  };
}

export type Sort = {
  active: boolean;
  column: string;
};

export function createSort(): Sort {
  return {
    active: false,
    column: "",
  };
}

export type Agg = {
  active: boolean;
  key: string;
  operator: string;
  column: string;
};

export function createAgg(): Agg {
  return {
    active: false,
    key: "",
    operator: "all",
    column: "",
  };
}

export type Group = {
  active: boolean;
  column: string;
};

export function createGroup(): Group {
  return createSort();
}

export interface ColumnProvider {
  column: string;
}
